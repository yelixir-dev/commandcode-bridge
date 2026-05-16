import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

import type {
  CommandCodeCredential,
  CommandCodeModelConfig,
  CommandCodeRoutingConfig,
  CommandCodeRoutingPolicy,
} from "./types.js";

export interface DashboardServerConfig {
  host: string;
  port: number;
}

export interface CommandCodeDashboardConfigFile {
  server?: Partial<DashboardServerConfig>;
  routing?: Partial<CommandCodeRoutingConfig>;
  models?: Array<Partial<CommandCodeModelConfig>>;
  credentials?: Array<Partial<CommandCodeCredential>>;
}

export interface RedactedCommandCodeCredential {
  id: string;
  apiKeyConfigured: boolean;
  apiKeyPreview: string | undefined;
  weight: number;
  enabled: boolean;
  allowedModels: string[] | undefined;
  maxInFlight: number | undefined;
}

export interface DashboardConfigView {
  object: "commandcode.dashboard_config";
  configFilePath: string | undefined;
  dirty: boolean;
  restart_required: boolean;
  server: DashboardServerConfig;
  routing: CommandCodeRoutingConfig;
  models: CommandCodeModelConfig[];
  credentials: RedactedCommandCodeCredential[];
}

export interface DashboardConfigUpdate {
  server?: Partial<DashboardServerConfig>;
  routing?: Partial<CommandCodeRoutingConfig>;
  models?: Array<Partial<CommandCodeModelConfig>>;
  credentials?: Array<Partial<CommandCodeCredential>>;
}

const VALID_POLICIES = new Set<CommandCodeRoutingPolicy>([
  "drain_first",
  "round_robin",
  "balance_priority",
  "daily_burn_priority",
  "depletion_aware",
]);

export const DEFAULT_ROUTING_CONFIG: CommandCodeRoutingConfig = {
  policy: "daily_burn_priority",
  fallbackPolicy: "round_robin",
  maxInFlightPerCredential: 4,
  maxTotalInFlight: null,
  maxTotalInFlightMultiplier: 3,
  billingRefreshMs: 300_000,
  credentialCooldownMs: 60_000,
};

export const DEFAULT_SERVER_CONFIG: DashboardServerConfig = {
  host: "127.0.0.1",
  port: 9992,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function optionalNumberValue(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return fallback;
}

function policyValue(value: unknown, fallback: CommandCodeRoutingPolicy): CommandCodeRoutingPolicy {
  const policy = stringValue(value) as CommandCodeRoutingPolicy | undefined;
  if (!policy || !VALID_POLICIES.has(policy)) return fallback;
  return policy;
}

function hostValue(value: unknown, fallback: string): string {
  const host = stringValue(value);
  if (!host) return fallback;
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "localhost") return host;
  return fallback;
}

function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return path;
}

export function resolveConfigFilePath(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string | undefined {
  const explicit = stringValue(env.COMMANDCODE_CREDENTIALS_FILE);
  if (explicit) return expandPath(explicit);
  const xdgConfigHome = stringValue(env.XDG_CONFIG_HOME);
  if (xdgConfigHome)
    return resolve(expandPath(xdgConfigHome), "commandcode-bridge", "credentials.json");
  return resolve(homedir(), ".config", "commandcode-bridge", "credentials.json");
}

export function readDashboardConfigFile(path: string | undefined): CommandCodeDashboardConfigFile {
  if (!path || !existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(parsed) ? (parsed as CommandCodeDashboardConfigFile) : {};
  } catch {
    return {};
  }
}

export function normalizeRoutingConfig(
  value: unknown,
  defaults: CommandCodeRoutingConfig = DEFAULT_ROUTING_CONFIG,
): CommandCodeRoutingConfig {
  const record = isRecord(value) ? value : {};
  const maxTotalInFlight = optionalNumberValue(record.maxTotalInFlight);
  return {
    policy: policyValue(record.policy, defaults.policy),
    fallbackPolicy: policyValue(record.fallbackPolicy, defaults.fallbackPolicy),
    maxInFlightPerCredential: numberValue(
      record.maxInFlightPerCredential,
      defaults.maxInFlightPerCredential,
    ),
    maxTotalInFlight: maxTotalInFlight === undefined ? defaults.maxTotalInFlight : maxTotalInFlight,
    maxTotalInFlightMultiplier: numberValue(
      record.maxTotalInFlightMultiplier,
      defaults.maxTotalInFlightMultiplier,
    ),
    billingRefreshMs: numberValue(record.billingRefreshMs, defaults.billingRefreshMs),
    credentialCooldownMs: numberValue(record.credentialCooldownMs, defaults.credentialCooldownMs),
  };
}

export function normalizeServerConfig(
  value: unknown,
  defaults: DashboardServerConfig = DEFAULT_SERVER_CONFIG,
): DashboardServerConfig {
  const record = isRecord(value) ? value : {};
  return {
    host: hostValue(record.host, defaults.host),
    port: numberValue(record.port, defaults.port),
  };
}

export function normalizeCredentialUpdate(
  credentials: Array<Partial<CommandCodeCredential>>,
): CommandCodeCredential[] {
  const used = new Set<string>();
  return credentials
    .map((credential, index) => {
      const fallbackId = `key${index + 1}`;
      let id = stringValue(credential.id) ?? fallbackId;
      if (used.has(id)) id = fallbackId;
      used.add(id);
      const apiKey = stringValue(credential.apiKey);
      if (!apiKey) return undefined;
      const normalized: CommandCodeCredential = {
        id,
        apiKey,
        weight: numberValue(credential.weight, 1),
        enabled: booleanValue(credential.enabled, true),
      };
      if (Array.isArray(credential.allowedModels)) {
        normalized.allowedModels = credential.allowedModels.filter(
          (model): model is string => typeof model === "string" && model.trim().length > 0,
        );
      }
      const maxInFlight = optionalNumberValue(credential.maxInFlight);
      if (typeof maxInFlight === "number") normalized.maxInFlight = maxInFlight;
      return normalized;
    })
    .filter((credential): credential is CommandCodeCredential => Boolean(credential));
}

export function normalizeModelUpdate(
  models: Array<Partial<CommandCodeModelConfig>>,
): CommandCodeModelConfig[] {
  return models
    .map((model) => {
      const id = stringValue(model.id);
      if (!id) return undefined;
      const normalized: CommandCodeModelConfig = {
        id,
        enabled: booleanValue(model.enabled, false),
      };
      const label = stringValue(model.label);
      if (label) normalized.label = label;
      const provider = stringValue(model.provider);
      if (provider) normalized.provider = provider;
      const family = stringValue(model.family);
      if (family) normalized.family = family;
      if (Array.isArray(model.aliases)) {
        normalized.aliases = model.aliases.filter(
          (alias): alias is string => typeof alias === "string" && alias.trim().length > 0,
        );
      }
      const notes = stringValue(model.notes);
      if (notes) normalized.notes = notes;
      return normalized;
    })
    .filter((model): model is CommandCodeModelConfig => Boolean(model));
}

export function redactedCredentials(
  credentials: CommandCodeCredential[],
): RedactedCommandCodeCredential[] {
  return credentials.map((credential) => ({
    id: credential.id,
    apiKeyConfigured: credential.apiKey.trim().length > 0,
    apiKeyPreview:
      credential.apiKey.length > 8
        ? `${credential.apiKey.slice(0, 4)}…${credential.apiKey.slice(-4)}`
        : undefined,
    weight: credential.weight,
    enabled: credential.enabled !== false,
    allowedModels: credential.allowedModels ? [...credential.allowedModels] : undefined,
    maxInFlight: credential.maxInFlight,
  }));
}

export function buildWritableDashboardConfig(
  update: DashboardConfigUpdate,
): CommandCodeDashboardConfigFile {
  return {
    server: normalizeServerConfig(update.server),
    routing: normalizeRoutingConfig(update.routing),
    models: normalizeModelUpdate(update.models ?? []),
    credentials: normalizeCredentialUpdate(update.credentials ?? []),
  };
}

export function writeDashboardConfigFile(path: string, update: DashboardConfigUpdate): void {
  mkdirSync(dirname(path), { recursive: true });
  const content = buildWritableDashboardConfig(update);
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}
