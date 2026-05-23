import { loadCommandCodeCredentialsFromEnvOrFile } from "./auth.js";
import {
  normalizeRoutingConfig,
  normalizeServerConfig,
  readDashboardConfigFile,
  resolveConfigFilePath,
} from "./dashboard-config.js";
import { defaultModelCatalog, mergeModelCatalog, modelAliasMap } from "./model-catalog.js";
import type {
  BridgeConfig,
  CommandCodeEmptyVisibleResponsePolicy,
  CommandCodeRoutingPolicy,
} from "./types.js";

export const DEFAULT_MODEL = "deepseek/deepseek-v4-pro";
export const FLASH_MODEL = "deepseek/deepseek-v4-flash";

export const MODEL_ALIASES: Record<string, string> = {
  default: DEFAULT_MODEL,
  "commandcode/default": DEFAULT_MODEL,
  ...modelAliasMap(),
};

export interface LoadBridgeConfigOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  authPaths?: string[];
}

export interface ResolvedModel {
  requestedModel: string;
  upstreamModel: string;
  publicModel: string;
}

export class ModelNotAllowedError extends Error {
  public readonly statusCode = 400;

  public constructor(model: string, allowedModels: string[]) {
    super(`Model "${model}" is not allowed. Allowed models: ${allowedModels.join(", ")}`);
    this.name = "ModelNotAllowedError";
  }
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseRoutingPolicy(value: string | undefined): CommandCodeRoutingPolicy {
  if (value === "drain_first") return "drain_first";
  if (value === "round_robin") return "round_robin";
  if (value === "balance_priority") return "balance_priority";
  if (value === "daily_burn_priority") return "daily_burn_priority";
  if (value === "depletion_aware") return "daily_burn_priority";
  return "daily_burn_priority";
}

function parseEmptyVisibleResponsePolicy(
  value: string | undefined,
): CommandCodeEmptyVisibleResponsePolicy {
  return value === "allow" ? "allow" : "error_on_length";
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function normalizeModelName(model: string): string {
  const trimmed = model.trim();
  return MODEL_ALIASES[trimmed] ?? trimmed;
}

function normalizeCommandCodeCredentialAllowedModels(
  credentials: BridgeConfig["commandCodeCredentials"],
): BridgeConfig["commandCodeCredentials"] {
  return credentials.map((credential) => {
    if (!credential.allowedModels || credential.allowedModels.length === 0) return credential;
    return {
      ...credential,
      allowedModels: uniq(credential.allowedModels.map(normalizeModelName)),
    };
  });
}

export function loadBridgeConfig(options: LoadBridgeConfigOptions = {}): BridgeConfig {
  const env = options.env ?? process.env;
  const configFilePath = resolveConfigFilePath(env);
  const dashboardConfig = readDashboardConfigFile(configFilePath);
  const serverFromFile = normalizeServerConfig(dashboardConfig.server, {
    host: env.HOST?.trim() || "127.0.0.1",
    port: parseNumber(env.PORT, 9992),
  });
  const defaultModel = normalizeModelName(env.COMMANDCODE_DEFAULT_MODEL?.trim() || DEFAULT_MODEL);
  const allowedFromEnv = parseCsv(env.COMMANDCODE_ALLOWED_MODELS).map(normalizeModelName);
  const configuredModelCatalog = dashboardConfig.models
    ? mergeModelCatalog(dashboardConfig.models, allowedFromEnv, normalizeModelName, false)
    : allowedFromEnv.length > 0
      ? mergeModelCatalog(
          allowedFromEnv.map((model) => ({ id: model, enabled: true })),
          allowedFromEnv,
          normalizeModelName,
        )
      : defaultModelCatalog();
  const enabledModels = configuredModelCatalog
    .filter((model) => model.enabled)
    .map((model) => normalizeModelName(model.id));
  const allowedModels = uniq(
    enabledModels.length > 0 ? [...enabledModels, defaultModel] : [DEFAULT_MODEL, FLASH_MODEL],
  );
  const apiKeyOptions =
    options.authPaths === undefined ? { env } : { env, authPaths: options.authPaths };
  const commandCodeCredentials = normalizeCommandCodeCredentialAllowedModels(
    loadCommandCodeCredentialsFromEnvOrFile(apiKeyOptions),
  );
  const routingFromFile = normalizeRoutingConfig(dashboardConfig.routing);
  const routingPolicy = dashboardConfig.routing
    ? routingFromFile.policy
    : env.COMMANDCODE_ROUTING_POLICY
      ? parseRoutingPolicy(env.COMMANDCODE_ROUTING_POLICY)
      : routingFromFile.policy;
  const commandCodeBillingRefreshMs = parseNumber(
    env.COMMANDCODE_BILLING_REFRESH_MS,
    routingFromFile.billingRefreshMs,
  );
  const commandCodeCredentialCooldownMs = parseNumber(
    env.COMMANDCODE_CREDENTIAL_COOLDOWN_MS,
    routingFromFile.credentialCooldownMs,
  );
  const maxInFlightPerCredential = parseNumber(
    env.COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL,
    routingFromFile.maxInFlightPerCredential,
  );
  const maxTotalMultiplier = parseNumber(
    env.COMMANDCODE_MAX_TOTAL_IN_FLIGHT_MULTIPLIER,
    routingFromFile.maxTotalInFlightMultiplier,
  );
  const maxTotalFromEnv = parseNumber(env.COMMANDCODE_MAX_TOTAL_IN_FLIGHT, 0);
  const commandCodeMaxTotalInFlight =
    maxTotalFromEnv > 0
      ? maxTotalFromEnv
      : typeof routingFromFile.maxTotalInFlight === "number"
        ? routingFromFile.maxTotalInFlight
        : undefined;
  const balanceAlertIntervalMs = parseNumber(
    env.COMMANDCODE_BALANCE_ALERT_INTERVAL_MS,
    commandCodeBillingRefreshMs,
  );

  return {
    host: serverFromFile.host,
    port: serverFromFile.port,
    apiBase: (env.COMMANDCODE_API_BASE?.trim() || "https://api.commandcode.ai").replace(/\/+$/, ""),
    cliVersion: env.COMMANDCODE_CLI_VERSION?.trim() || "0.26.24",
    defaultModel,
    allowedModels,
    allowUnknownModels: parseBoolean(env.COMMANDCODE_ALLOW_UNKNOWN_MODELS, false),
    bridgeApiKey:
      stringValue(dashboardConfig.bridgeApiKey) || env.BRIDGE_API_KEY?.trim() || undefined,
    commandCodeApiKey: commandCodeCredentials[0]?.apiKey,
    commandCodeCredentials,
    commandCodeRoutingPolicy: routingPolicy,
    commandCodeFallbackRoutingPolicy: routingFromFile.fallbackPolicy,
    commandCodeMaxInFlightPerCredential: maxInFlightPerCredential,
    commandCodeMaxTotalInFlight,
    commandCodeMaxTotalInFlightMultiplier: maxTotalMultiplier,
    modelCatalog: configuredModelCatalog,
    configFilePath,
    commandCodeBillingRefreshMs,
    commandCodeBillingTimeoutMs: parseNumber(env.COMMANDCODE_BILLING_TIMEOUT_MS, 10_000),
    commandCodeCredentialCooldownMs,
    requestBodyLimitBytes: parseNumber(env.REQUEST_BODY_LIMIT_BYTES, 1_048_576),
    rateLimitMax: parseNumber(env.RATE_LIMIT_MAX, 60),
    rateLimitWindow: env.RATE_LIMIT_WINDOW?.trim() || "1 minute",
    logLevel: env.LOG_LEVEL?.trim() || "info",
    corsOrigin: env.CORS_ORIGIN?.trim() || undefined,
    includeReasoning: parseBoolean(env.INCLUDE_REASONING, false),
    emptyVisibleResponsePolicy: parseEmptyVisibleResponsePolicy(
      env.COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY,
    ),
    balanceAlerts: {
      enabled: parseBoolean(env.COMMANDCODE_BALANCE_ALERT_ENABLED, false),
      minCurrentBalance: parseNonNegativeNumber(
        env.COMMANDCODE_BALANCE_ALERT_MIN_CURRENT_BALANCE,
        1,
      ),
      minExpiringBalance: parseNonNegativeNumber(
        env.COMMANDCODE_BALANCE_ALERT_MIN_EXPIRING_BALANCE,
        0,
      ),
      maxRequiredDailyBurn: parseNonNegativeNumber(
        env.COMMANDCODE_BALANCE_ALERT_MAX_REQUIRED_DAILY_BURN,
        0,
      ),
      intervalMs: balanceAlertIntervalMs,
      repeatMs: parseNumber(env.COMMANDCODE_BALANCE_ALERT_REPEAT_MS, 3_600_000),
      webhookUrl: env.COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL?.trim() || undefined,
      webhookBearer: env.COMMANDCODE_BALANCE_ALERT_WEBHOOK_BEARER?.trim() || undefined,
    },
    timeoutMs: parseNumber(env.COMMANDCODE_TIMEOUT_MS, 300_000),
  };
}

export function resolveModel(model: string | undefined, config: BridgeConfig): ResolvedModel {
  const requestedModel = model?.trim() || "default";
  const upstreamModel =
    requestedModel === "default" || requestedModel === "commandcode/default"
      ? config.defaultModel
      : normalizeModelName(requestedModel);
  const publicModel = upstreamModel;

  if (!config.allowUnknownModels && !config.allowedModels.includes(upstreamModel)) {
    throw new ModelNotAllowedError(requestedModel, config.allowedModels);
  }

  return { requestedModel, upstreamModel, publicModel };
}

export function publicModelList(config: BridgeConfig): string[] {
  const canonicalModels = uniq([config.defaultModel, ...config.allowedModels]);
  const aliasModels = Object.entries(MODEL_ALIASES)
    .filter(
      ([alias, upstream]) =>
        !["default", "commandcode/default"].includes(alias) && canonicalModels.includes(upstream),
    )
    .map(([alias]) => alias);
  return uniq([
    config.defaultModel,
    ...config.allowedModels,
    "default",
    "commandcode/default",
    ...aliasModels,
  ]);
}

function ownedBySlug(value: string | undefined): string {
  const slug = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "commandcode";
}

export function publicModelOwnedBy(model: string, config: BridgeConfig): string {
  if (model.startsWith("commandcode/")) return "commandcode";
  const upstreamModel = normalizeModelName(model);
  const catalogEntry = config.modelCatalog?.find((entry) => entry.id === upstreamModel);
  return ownedBySlug(catalogEntry?.provider ?? upstreamModel.split("/")[0]);
}
