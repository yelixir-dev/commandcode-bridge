import { randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import { CommandCodeAuthError, CommandCodeClient, CommandCodeHttpError } from "./commandcode.js";
import { loadBridgeConfig, ModelNotAllowedError, publicModelList, resolveModel } from "./config.js";
import {
  type CommandCodeCredentialDiagnostic,
  NoAvailableCommandCodeCredentialError,
} from "./credential-router.js";
import { CommandCodeBalanceAlertManager } from "./balance-alerts.js";
import { buildCommandCodeGenerateBody, isSupportedToolChoice } from "./converter.js";
import {
  collectOpenAICompletion,
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

function isAdminRequest(request: FastifyRequest): boolean {
  return request.url.startsWith("/admin/");
}

function shouldRequireAuth(request: FastifyRequest): boolean {
  return request.url.startsWith("/v1/") || isAdminRequest(request);
}

function asOpenAIRequest(
  value: z.infer<typeof chatCompletionRequestSchema>,
): OpenAIChatCompletionRequest {
  return value as unknown as OpenAIChatCompletionRequest;
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
  const config = mergeConfig(options);
  const app = Fastify({
    logger:
      config.logLevel === "silent"
        ? false
        : {
            level: config.logLevel,
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
    bodyLimit: config.requestBodyLimitBytes,
  });
  const upstream = options.upstream ?? new CommandCodeClient(config);
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

  await app.register(helmet);
  await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: config.rateLimitWindow });
  if (config.corsOrigin) await app.register(cors, { origin: config.corsOrigin });

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
    if (isAdminRequest(request) && !config.bridgeApiKey) {
      return reply
        .code(403)
        .send(
          openAIError(
            "Admin endpoints require BRIDGE_API_KEY to be configured",
            "configuration_error",
            "admin_auth_not_configured",
          ),
        );
    }
    if (!config.bridgeApiKey || !shouldRequireAuth(request)) return;
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
    version: "0.1.0",
    upstream: "commandcode-alpha-generate",
    default_model: config.defaultModel,
    auth: {
      bridge_api_key_configured: Boolean(config.bridgeApiKey),
      commandcode_api_key_configured: Boolean(config.commandCodeApiKey),
      commandcode_credential_count: config.commandCodeCredentials.length,
      commandcode_routing_policy: config.commandCodeRoutingPolicy,
    },
  }));

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
    data: publicModelList(config).map((model) => ({
      id: model,
      object: "model",
      created: 1_778_454_400,
      owned_by: model.startsWith("commandcode/") ? "commandcode" : "deepseek",
    })),
  }));

  app.post("/v1/chat/completions", async (request, reply) => {
    try {
      const parsed = chatCompletionRequestSchema.parse(request.body);
      const openAIRequest = asOpenAIRequest(parsed);
      if (!isSupportedToolChoice(openAIRequest.tool_choice)) {
        return reply
          .code(400)
          .send(
            openAIError(
              'Unsupported tool_choice. This bridge supports only omitted, "auto", or "none" because CommandCode /alpha/generate does not expose a stable forced-tool selector.',
              "invalid_request_error",
              "unsupported_tool_choice",
            ),
          );
      }
      const resolvedModel = resolveModel(openAIRequest.model, config);
      const id = `chatcmpl_${randomUUID().replace(/-/g, "")}`;
      const created = Math.floor(Date.now() / 1000);
      const abortController = new AbortController();
      request.raw.on("aborted", () => abortController.abort());
      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) abortController.abort();
      });
      const commandCodeBody = buildCommandCodeGenerateBody({
        request: openAIRequest,
        upstreamModel: resolvedModel.upstreamModel,
      });
      const events = upstream.generate(commandCodeBody, abortController.signal);

      if (openAIRequest.stream) {
        return await writeStreamingResponse(
          reply,
          streamOpenAIChunks({
            id,
            created,
            model: resolvedModel.publicModel,
            events,
            includeReasoning: config.includeReasoning,
            emptyVisibleResponsePolicy: config.emptyVisibleResponsePolicy,
            includeUsage: openAIRequest.stream_options?.include_usage ?? false,
          }),
        );
      }

      return await collectOpenAICompletion({
        id,
        created,
        model: resolvedModel.publicModel,
        events,
        includeReasoning: config.includeReasoning,
        emptyVisibleResponsePolicy: config.emptyVisibleResponsePolicy,
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
        return reply.code(502).send({
          error: {
            message: error.message,
            type: "upstream_error",
            code:
              error instanceof CommandCodeHttpError
                ? "commandcode_http_error"
                : error instanceof CommandCodeEventError
                  ? "commandcode_event_error"
                  : error instanceof CommandCodeEmptyVisibleResponseError
                    ? "commandcode_empty_visible_response"
                    : "commandcode_empty_response",
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
