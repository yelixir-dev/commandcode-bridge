import { spawn } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import { CommandCodeAuthError, CommandCodeClient, CommandCodeHttpError } from "./commandcode.js";
import {
  loadBridgeConfig,
  ModelNotAllowedError,
  normalizeModelName,
  publicModelList,
  publicModelObject,
  resolveModel,
  type ResolvedModel,
} from "./config.js";
import {
  defaultModelCatalog,
  fetchProviderModelCatalog,
  isClaudeModelId,
  mergeProviderModelCatalog,
} from "./model-catalog.js";
import {
  isAdminRequest,
  isDashboardAdminWrite,
  isLoopbackBootstrapRequest,
  isPublicAdminRequest,
  sameHostnameOrigin,
  shouldRequireAuth,
} from "./http-guards.js";
import { handleProviderChat } from "./provider-chat.js";
import { CommandCodeProviderClient, probeProviderAccess } from "./provider.js";
import {
  DEFAULT_ROUTING_CONFIG,
  redactedCredentials,
  writeDashboardConfigFile,
  type DashboardConfigUpdate,
} from "./dashboard-config.js";
import {
  compatibilityProbeNotFoundBody,
  isCompatibilityProbePath,
  isQuietRequestLogObject,
} from "./compatibility-probes.js";
import { dashboardHtml } from "./dashboard.js";
import {
  collectOpenAICompletionWithEmptyVisibleRetry,
  requestedMaxTokens,
} from "./empty-visible.js";
import {
  type CommandCodeCredentialDiagnostic,
  NoAvailableCommandCodeCredentialError,
} from "./credential-router.js";
import { CommandCodeBalanceAlertManager } from "./balance-alerts.js";
import { buildCommandCodeGenerateBody } from "./converter.js";
import { BRIDGE_VERSION } from "./version.js";
import {
  CommandCodeEmptyResponseError,
  CommandCodeEmptyVisibleResponseError,
  CommandCodeEventError,
  streamOpenAIChunks,
} from "./openai.js";
import type { BridgeConfig, CommandCodeUpstream, OpenAIChatCompletionRequest } from "./types.js";

const toolCallSchema = z.object({
  id: z.string().optional(),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }),
});

const messageSchema = z.object({
  role: z.enum(["developer", "system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(z.record(z.string(), z.unknown())), z.null()]).optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(toolCallSchema).optional(),
});

const chatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(messageSchema).min(1),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  tools: z
    .array(
      z.object({
        type: z.literal("function"),
        function: z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          parameters: z.record(z.string(), z.unknown()).optional(),
        }),
      }),
    )
    .optional(),
  tool_choice: z.unknown().optional(),
  response_format: z.record(z.string(), z.unknown()).optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
  user: z.string().optional(),
});

export interface CreateAppOptions {
  upstream?: CommandCodeUpstream;
  configOverrides?: Partial<BridgeConfig>;
  configEnv?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  configAuthPaths?: string[];
}

interface CommandCodeCredentialDiagnosticsProvider {
  getCredentialDiagnostics(options?: {
    refresh?: boolean;
  }): Promise<CommandCodeCredentialDiagnostic[]>;
}

function isDiagnosticsProvider(
  upstream: CommandCodeUpstream,
): upstream is CommandCodeUpstream & CommandCodeCredentialDiagnosticsProvider {
  return (
    typeof (upstream as { getCredentialDiagnostics?: unknown }).getCredentialDiagnostics ===
    "function"
  );
}

function parseBooleanQuery(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function mergeConfig(options: CreateAppOptions = {}): BridgeConfig {
  const loadOptions: Parameters<typeof loadBridgeConfig>[0] = {};
  if (options.configEnv !== undefined) loadOptions.env = options.configEnv;
  if (options.configAuthPaths !== undefined) loadOptions.authPaths = options.configAuthPaths;
  const base = loadBridgeConfig(loadOptions);
  return { ...base, ...(options.configOverrides ?? {}) };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function clientApiKey(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  const header = request.headers["x-api-key"];
  if (Array.isArray(header)) return header[0];
  return header;
}

function openAIError(message: string, type: string, code: string | null = null) {
  return { error: { message, type, code } };
}

async function refreshProviderModelCatalog(
  baseConfig: BridgeConfig,
  logger: { warn(object: unknown, message?: string): void },
): Promise<BridgeConfig> {
  try {
    const liveCatalog = await fetchProviderModelCatalog(baseConfig.apiBase);
    const merged = mergeProviderModelCatalog(
      baseConfig.modelCatalog ?? defaultModelCatalog(),
      liveCatalog,
      baseConfig.allowedModels,
    );
    const enabledIds = merged
      .filter((model) => model.enabled)
      .map((model) => normalizeModelName(model.id));
    const allowedModels = Array.from(new Set([...enabledIds, baseConfig.defaultModel]));
    return { ...baseConfig, modelCatalog: merged, allowedModels };
  } catch (error) {
    logger.warn(
      { err: error },
      "CommandCode provider model discovery failed; keeping static catalog",
    );
    return baseConfig;
  }
}

function asOpenAIRequest(
  value: z.infer<typeof chatCompletionRequestSchema>,
): OpenAIChatCompletionRequest {
  return value as unknown as OpenAIChatCompletionRequest;
}

function withExistingCredentialSecrets(
  update: DashboardConfigUpdate,
  config: BridgeConfig,
): DashboardConfigUpdate {
  const existingById = new Map(
    config.commandCodeCredentials.map((credential) => [credential.id, credential.apiKey]),
  );
  const merged: DashboardConfigUpdate = { ...update };
  if (update.credentials) {
    merged.credentials = update.credentials.map((credential) => {
      const originalId = (credential as { originalId?: string }).originalId;
      const apiKey =
        typeof credential.apiKey === "string" && credential.apiKey.trim().length > 0
          ? credential.apiKey
          : typeof originalId === "string" && originalId.length > 0
            ? existingById.get(originalId)
            : typeof credential.id === "string"
              ? existingById.get(credential.id)
              : undefined;
      const mergedCredential: Partial<(typeof config.commandCodeCredentials)[number]> = {
        ...credential,
      };
      if (apiKey) mergedCredential.apiKey = apiKey;
      return mergedCredential;
    });
  }
  return merged;
}

function duplicateCommandCodeApiKeyIds(update: DashboardConfigUpdate): string[] {
  const seen = new Map<string, string>();
  const duplicateIds = new Set<string>();
  for (const credential of update.credentials ?? []) {
    const apiKey = typeof credential.apiKey === "string" ? credential.apiKey.trim() : "";
    if (!apiKey) continue;
    const id =
      typeof credential.id === "string" && credential.id.trim() ? credential.id.trim() : "unknown";
    const existingId = seen.get(apiKey);
    if (existingId) {
      duplicateIds.add(existingId);
      duplicateIds.add(id);
      continue;
    }
    seen.set(apiKey, id);
  }
  return Array.from(duplicateIds);
}

function dashboardConfigResponse(
  config: BridgeConfig,
  dirty: boolean,
  diagnostics: CommandCodeCredentialDiagnostic[] = [],
  providerAccessById: ReadonlyMap<string, boolean> = new Map(),
) {
  const diagnosticsById = new Map(diagnostics.map((diagnostic) => [diagnostic.id, diagnostic]));
  const routing = {
    ...DEFAULT_ROUTING_CONFIG,
    policy: config.commandCodeRoutingPolicy,
    fallbackPolicy:
      config.commandCodeFallbackRoutingPolicy ?? DEFAULT_ROUTING_CONFIG.fallbackPolicy,
    maxInFlightPerCredential:
      config.commandCodeMaxInFlightPerCredential ?? DEFAULT_ROUTING_CONFIG.maxInFlightPerCredential,
    maxTotalInFlight: config.commandCodeMaxTotalInFlight ?? null,
    maxTotalInFlightMultiplier:
      config.commandCodeMaxTotalInFlightMultiplier ??
      DEFAULT_ROUTING_CONFIG.maxTotalInFlightMultiplier,
    billingRefreshMs: config.commandCodeBillingRefreshMs,
    credentialCooldownMs: config.commandCodeCredentialCooldownMs,
  };
  return {
    object: "commandcode.dashboard_config",
    dirty,
    restart_required: dirty,
    bridgeApiKey: config.bridgeApiKey ? "[REDACTED]" : undefined,
    bridgeApiKeySource: config.bridgeApiKeySource,
    server: {
      host: config.host,
      port: config.port,
    },
    routing,
    models: config.modelCatalog ?? [],
    credentials: redactedCredentials(config.commandCodeCredentials).map((credential) => ({
      ...credential,
      metrics: diagnosticsById.get(credential.id),
      providerApiAccess: providerAccessById.get(credential.id),
    })),
    bridge: {
      online: true,
      version: BRIDGE_VERSION,
      upstream_mode: config.upstreamMode,
      endpoint: `${config.host}:${config.port}`,
      port: config.port,
      models: publicModelList(config),
    },
  };
}

function restartBridge(): void {
  if (process.platform === "linux") {
    const supervisedBySystemd = Boolean(process.env.INVOCATION_ID || process.env.SYSTEMD_EXEC_PID);
    if (supervisedBySystemd || process.env.COMMANDCODE_BRIDGE_RESTART_MODE === "exit") {
      setTimeout(() => {
        process.exit(0);
      }, 100).unref?.();
    }
    return;
  }
  const label = process.env.COMMANDCODE_BRIDGE_LAUNCHD_LABEL ?? "com.yorha.commandcode-bridge";
  const target = `gui/${process.getuid?.() ?? 501}/${label}`;
  const child = spawn("launchctl", ["kickstart", "-k", target], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function writeStreamingResponse(
  reply: FastifyReply,
  chunks: AsyncIterable<string>,
): Promise<FastifyReply> {
  return reply
    .type("text/event-stream; charset=utf-8")
    .header("cache-control", "no-cache, no-transform")
    .header("connection", "keep-alive")
    .header("x-accel-buffering", "no")
    .send(Readable.from(chunks));
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const baseConfig = mergeConfig(options);
  const injectedUpstream = options.upstream;
  const eventPipelineAll = injectedUpstream !== undefined;
  const app = Fastify({
    logger:
      baseConfig.logLevel === "silent"
        ? false
        : {
            level: baseConfig.logLevel,
            hooks: {
              logMethod(args: unknown[], method: (...input: unknown[]) => void): void {
                if (isQuietRequestLogObject(args[0])) return;
                method.apply(this, args);
              },
            },
            redact: {
              paths: [
                "req.headers.authorization",
                'req.headers["x-api-key"]',
                "req.headers.cookie",
                "headers.authorization",
                'headers["x-api-key"]',
                "body.commandCodeApiKey",
                "body.apiKey",
              ],
              censor: "[REDACTED]",
            },
          },
    bodyLimit: baseConfig.requestBodyLimitBytes,
  });
  let config = baseConfig;
  let providerAccessById = new Map<string, boolean>();
  let providerAccessAvailable = false;
  if (!eventPipelineAll) {
    if (config.upstreamMode === "provider") {
      providerAccessById = new Map(
        config.commandCodeCredentials.map((credential) => [credential.id, true]),
      );
      providerAccessAvailable = true;
      config = await refreshProviderModelCatalog(config, app.log);
    } else if (config.upstreamMode === "alpha") {
      providerAccessById = new Map(
        config.commandCodeCredentials.map((credential) => [credential.id, false]),
      );
    } else if (config.upstreamMode === "auto") {
      const probes = await Promise.all(
        config.commandCodeCredentials.map(
          async (credential) =>
            [credential.id, await probeProviderAccess(config, { credential })] as const,
        ),
      );
      providerAccessById = new Map(probes);
      providerAccessAvailable = [...providerAccessById.values()].some(Boolean);
      if (providerAccessAvailable) {
        config = await refreshProviderModelCatalog(config, app.log);
      } else {
        app.log.info(
          "CommandCode Provider API probe failed or this plan lacks API access (Go/GOAT/Pro keep the /alpha tunnel); using /alpha/generate",
        );
      }
    }
  }
  const upstream = injectedUpstream ?? new CommandCodeClient(config);
  const providerClient = new CommandCodeProviderClient(config);
  const diagnosticsProvider = isDiagnosticsProvider(upstream) ? upstream : undefined;
  const balanceAlertManager = config.balanceAlerts.enabled
    ? new CommandCodeBalanceAlertManager(config.balanceAlerts, app.log)
    : undefined;

  async function runBalanceAlertCheck(reason: string): Promise<void> {
    if (!balanceAlertManager) return;
    if (!diagnosticsProvider) {
      app.log.warn(
        { reason },
        "CommandCode balance alerts are enabled but the upstream client does not expose credential diagnostics",
      );
      return;
    }
    const diagnostics = await diagnosticsProvider.getCredentialDiagnostics({ refresh: true });
    await balanceAlertManager.check(diagnostics, { reason });
  }

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "http:"],
        upgradeInsecureRequests: null,
      },
    },
  });
  if (config.corsOrigin) await app.register(cors, { origin: config.corsOrigin });
  app.addHook("onRequest", async (request, reply) => {
    if (config.corsOrigin) return;
    const origin = sameHostnameOrigin(request);
    if (!origin) return;
    reply.header("access-control-allow-origin", origin);
    reply.header("vary", "origin");
    reply.header("access-control-allow-methods", "GET,PUT,POST,OPTIONS");
    reply.header("access-control-allow-headers", "authorization,content-type,x-api-key");
  });
  app.options("*", async (request, reply) => {
    const origin = config.corsOrigin ? request.headers.origin : sameHostnameOrigin(request);
    if (!origin && !config.corsOrigin) return reply.code(404).send();
    return reply.code(204).send();
  });
  await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: config.rateLimitWindow });
  app.setNotFoundHandler((request, reply) => {
    if (isCompatibilityProbePath(request.url)) {
      request.log.debug({ url: request.url }, "compatibility probe");
    }
    return reply.code(404).send(compatibilityProbeNotFoundBody());
  });

  let balanceAlertTimer: NodeJS.Timeout | undefined;
  if (balanceAlertManager) {
    app.addHook("onReady", async () => {
      await runBalanceAlertCheck("startup").catch((error: unknown) => {
        app.log.error({ err: error }, "CommandCode startup balance alert check failed");
      });
    });
    balanceAlertTimer = setInterval(() => {
      void runBalanceAlertCheck("periodic").catch((error: unknown) => {
        app.log.error({ err: error }, "CommandCode periodic balance alert check failed");
      });
    }, config.balanceAlerts.intervalMs);
    balanceAlertTimer.unref?.();
    app.addHook("onClose", async () => {
      if (balanceAlertTimer) clearInterval(balanceAlertTimer);
    });
  }

  app.addHook("preHandler", async (request, reply) => {
    if (!shouldRequireAuth(request)) return;
    if (
      isDashboardAdminWrite(request) &&
      !config.bridgeApiKey &&
      !isLoopbackBootstrapRequest(request)
    ) {
      return reply
        .code(403)
        .send(
          openAIError(
            "Admin bootstrap without BRIDGE_API_KEY requires a loopback connection and loopback Host",
            "configuration_error",
            "admin_bootstrap_loopback_required",
          ),
        );
    }
    if (isAdminRequest(request) && !isPublicAdminRequest(request) && !config.bridgeApiKey) {
      return;
    }
    if (!config.bridgeApiKey) return;
    const supplied = clientApiKey(request);
    if (!supplied || !safeEqual(supplied, config.bridgeApiKey)) {
      return reply
        .code(401)
        .send(openAIError("Unauthorized", "authentication_error", "unauthorized"));
    }
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "commandcode-bridge",
    version: BRIDGE_VERSION,
    upstream:
      config.upstreamMode === "provider" ||
      (config.upstreamMode === "auto" && providerAccessAvailable)
        ? "commandcode-provider-api"
        : "commandcode-alpha-generate",
    endpoint: `${config.host}:${config.port}`,
    port: config.port,
    default_model: config.defaultModel,
    models: publicModelList(config),
    auth: {
      bridge_api_key_configured: Boolean(config.bridgeApiKey),
      bridge_api_key_source: config.bridgeApiKeySource,
      commandcode_api_key_configured: Boolean(config.commandCodeApiKey),
      commandcode_credential_count: config.commandCodeCredentials.length,
      commandcode_routing_policy: config.commandCodeRoutingPolicy,
      commandcode_max_in_flight_per_credential: config.commandCodeMaxInFlightPerCredential ?? 4,
      commandcode_max_total_in_flight: config.commandCodeMaxTotalInFlight,
      upstream_mode: config.upstreamMode,
      provider_api_access: providerAccessAvailable,
    },
  }));

  app.get("/", async (_request, reply) => reply.redirect("/dashboard"));

  async function readCredentialDiagnostics(
    refresh: boolean,
  ): Promise<CommandCodeCredentialDiagnostic[]> {
    if (!diagnosticsProvider) return [];
    return diagnosticsProvider.getCredentialDiagnostics({ refresh });
  }

  app.get("/dashboard", async (_request, reply) => {
    const diagnostics = await readCredentialDiagnostics(false).catch(() => []);
    return reply
      .type("text/html; charset=utf-8")
      .header("cache-control", "no-store")
      .send(
        dashboardHtml(
          dashboardConfigResponse(config, configDirty, diagnostics, providerAccessById),
        ),
      );
  });

  let configDirty = false;

  app.get("/admin/config", async (_request, reply) => {
    const diagnostics = await readCredentialDiagnostics(false).catch(() => []);
    return reply
      .header("cache-control", "no-store")
      .send(dashboardConfigResponse(config, configDirty, diagnostics, providerAccessById));
  });

  app.put("/admin/config", async (request, reply) => {
    if (!config.configFilePath) {
      return reply
        .code(400)
        .send(
          openAIError(
            "COMMANDCODE_CREDENTIALS_FILE is required for dashboard edits",
            "configuration_error",
            "missing_config_file",
          ),
        );
    }
    const secretSourceConfig = loadBridgeConfig({
      env: { ...process.env, COMMANDCODE_CREDENTIALS_FILE: config.configFilePath },
    });
    const update = withExistingCredentialSecrets(
      request.body as DashboardConfigUpdate,
      secretSourceConfig,
    );
    if (!update.bridgeApiKey && secretSourceConfig.bridgeApiKey) {
      update.bridgeApiKey = secretSourceConfig.bridgeApiKey;
    }
    const duplicateIds = duplicateCommandCodeApiKeyIds(update);
    if (duplicateIds.length > 0) {
      return reply.code(409).send({
        ...openAIError(
          `Duplicate CommandCode API key for credential ids: ${duplicateIds.join(", ")}`,
          "invalid_request_error",
          "duplicate_commandcode_api_key",
        ),
        duplicateCredentialIds: duplicateIds,
      });
    }
    writeDashboardConfigFile(config.configFilePath, update);
    configDirty = true;
    const savedConfig = loadBridgeConfig({
      env: { ...process.env, COMMANDCODE_CREDENTIALS_FILE: config.configFilePath },
    });
    return dashboardConfigResponse(
      { ...savedConfig, bridgeApiKey: config.bridgeApiKey },
      true,
      [],
      providerAccessById,
    );
  });

  app.post("/admin/restart", async () => {
    restartBridge();
    configDirty = false;
    return { ok: true, restart_requested: true };
  });

  app.get("/admin/commandcode/credentials", async (request, reply) => {
    if (!diagnosticsProvider) {
      return reply
        .code(501)
        .send(
          openAIError(
            "Configured upstream does not expose CommandCode credential diagnostics",
            "configuration_error",
            "commandcode_diagnostics_unavailable",
          ),
        );
    }
    const query = request.query as Record<string, unknown> | undefined;
    const refresh = parseBooleanQuery(query?.refresh);
    const credentials = await diagnosticsProvider.getCredentialDiagnostics({ refresh });
    return {
      object: "commandcode.credential_metrics",
      generated_at: new Date().toISOString(),
      routing_policy: config.commandCodeRoutingPolicy,
      billing_refresh_ms: config.commandCodeBillingRefreshMs,
      billing_timeout_ms: config.commandCodeBillingTimeoutMs,
      credential_cooldown_ms: config.commandCodeCredentialCooldownMs,
      credential_count: credentials.length,
      alerting: {
        enabled: config.balanceAlerts.enabled,
        min_current_balance: config.balanceAlerts.minCurrentBalance,
        min_expiring_balance: config.balanceAlerts.minExpiringBalance,
        max_required_daily_burn: config.balanceAlerts.maxRequiredDailyBurn,
        interval_ms: config.balanceAlerts.intervalMs,
        repeat_ms: config.balanceAlerts.repeatMs,
        webhook_configured: Boolean(config.balanceAlerts.webhookUrl),
      },
      credentials,
    };
  });

  app.get("/v1/models", async () => ({
    object: "list",
    data: publicModelList(config).map((model) => publicModelObject(model, config)),
  }));

  app.get("/v1/models/*", async (request, reply) => {
    const wildcard = (request.params as { "*"?: string })["*"] ?? "";
    let model = wildcard;
    try {
      model = decodeURIComponent(wildcard);
    } catch {
      model = wildcard;
    }
    if (!publicModelList(config).includes(model)) {
      return reply
        .code(404)
        .send(
          openAIError(
            `The model "${model}" does not exist or is not available`,
            "invalid_request_error",
            "model_not_found",
          ),
        );
    }
    return publicModelObject(model, config);
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    let resolvedModel: ResolvedModel | undefined;
    try {
      const parsed = chatCompletionRequestSchema.parse(request.body);
      const openAIRequest = asOpenAIRequest(parsed);
      resolvedModel = resolveModel(openAIRequest.model, config);
      const resolved = resolvedModel;
      const useProviderChat =
        !eventPipelineAll &&
        !isClaudeModelId(resolved.upstreamModel) &&
        (config.upstreamMode === "provider" ||
          (config.upstreamMode === "auto" && providerAccessAvailable));
      const id = `chatcmpl_${randomUUID().replace(/-/g, "")}`;
      const created = Math.floor(Date.now() / 1000);
      const abortController = new AbortController();
      request.raw.on("aborted", () => abortController.abort());
      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) abortController.abort();
      });

      if (useProviderChat) {
        const handled = await handleProviderChat({
          reply,
          httpRequest: request,
          request: openAIRequest,
          providerClient,
          resolvedModel,
          signal: abortController.signal,
          config,
        });
        if (handled) return reply;
        providerAccessById = new Map(
          config.commandCodeCredentials.map((credential) => [credential.id, false]),
        );
        providerAccessAvailable = false;
      }

      const commandCodeBody = buildCommandCodeGenerateBody({
        request: openAIRequest,
        upstreamModel: resolvedModel.upstreamModel,
      });

      if (openAIRequest.stream) {
        return await writeStreamingResponse(
          reply,
          streamOpenAIChunks({
            id,
            created,
            model: resolvedModel.publicModel,
            events: upstream.generate(commandCodeBody, abortController.signal),
            includeReasoning: config.includeReasoning,
            emptyVisibleResponsePolicy: config.emptyVisibleResponsePolicy,
            includeUsage: openAIRequest.stream_options?.include_usage ?? false,
            requestId: request.id,
            log: request.log,
          }),
        );
      }

      return await collectOpenAICompletionWithEmptyVisibleRetry({
        upstream,
        body: commandCodeBody,
        signal: abortController.signal,
        id,
        created,
        model: resolvedModel.publicModel,
        includeReasoning: config.includeReasoning,
        emptyVisibleResponsePolicy: config.emptyVisibleResponsePolicy,
        retryMaxAttempts: config.emptyVisibleRetryMaxAttempts,
        retryBackoffMs: config.emptyVisibleRetryBackoffMs,
        maxTokens: requestedMaxTokens(openAIRequest),
        requestId: request.id,
        log: request.log,
      });
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return reply
          .code(400)
          .send(
            openAIError(
              `Invalid request: ${error.message}`,
              "invalid_request_error",
              "invalid_request",
            ),
          );
      }
      if (error instanceof ModelNotAllowedError) {
        return reply
          .code(error.statusCode)
          .send(openAIError(error.message, "invalid_request_error", "model_not_allowed"));
      }
      if (error instanceof CommandCodeAuthError) {
        return reply
          .code(500)
          .send(openAIError(error.message, "configuration_error", "missing_upstream_api_key"));
      }
      if (error instanceof NoAvailableCommandCodeCredentialError) {
        return reply
          .code(503)
          .send(
            openAIError(error.message, "upstream_error", "commandcode_no_available_credential"),
          );
      }
      if (
        error instanceof CommandCodeHttpError ||
        error instanceof CommandCodeEventError ||
        error instanceof CommandCodeEmptyResponseError ||
        error instanceof CommandCodeEmptyVisibleResponseError
      ) {
        const upstreamStatus =
          error instanceof CommandCodeHttpError ? error.status : error.upstreamStatus;
        const upstreamBody =
          error instanceof CommandCodeHttpError
            ? error.body
            : error instanceof CommandCodeEventError
              ? error.upstreamBody
              : undefined;
        const errorCode =
          error instanceof CommandCodeHttpError
            ? "commandcode_http_error"
            : error instanceof CommandCodeEventError
              ? "commandcode_event_error"
              : error instanceof CommandCodeEmptyVisibleResponseError
                ? "commandcode_empty_visible_response"
                : "commandcode_empty_response";
        if (!(error instanceof CommandCodeEmptyVisibleResponseError)) {
          request.log.warn(
            {
              code: errorCode,
              upstream_status: upstreamStatus,
              request_id: request.id,
              model: resolvedModel?.publicModel,
              error: error.message,
            },
            "non-streaming chat failed with an upstream error",
          );
        }
        return reply.code(502).send({
          error: {
            message: error.message,
            type: "upstream_error",
            code: errorCode,
            upstream_status: upstreamStatus,
            upstream_body: upstreamBody,
          },
        });
      }
      request.log.error({ err: error }, "Unhandled chat completion error");
      return reply
        .code(500)
        .send(openAIError("Internal server error", "internal_server_error", "internal_error"));
    }
  });

  return app;
}
