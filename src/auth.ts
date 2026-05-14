import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { CommandCodeCredential } from "./types.js";

export interface LoadApiKeyOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  authPaths?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numberValue(value: unknown, fallback = 1): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map(stringValue).filter((entry): entry is string => Boolean(entry));
    return values.length > 0 ? values : undefined;
  }
  const scalar = stringValue(value);
  if (!scalar) return undefined;
  const values = scalar
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export function extractCommandCodeApiKey(authJson: unknown): string | undefined {
  if (!isRecord(authJson)) return undefined;

  const preferredKeys = ["apiKey", "api_key", "access", "accessToken", "token", "key"];
  for (const key of preferredKeys) {
    const direct = stringValue(authJson[key]);
    if (direct) return direct;
  }

  const commandCodeEntry = authJson.commandcode ?? authJson.commandCode ?? authJson.command_code;
  const commandCodeString = stringValue(commandCodeEntry);
  if (commandCodeString) return commandCodeString;
  if (isRecord(commandCodeEntry)) {
    const nested = extractCommandCodeApiKey(commandCodeEntry);
    if (nested) return nested;
  }

  const nestedKeys = ["auth", "credentials", "oauth", "account"];
  for (const key of nestedKeys) {
    const nested = authJson[key];
    if (isRecord(nested)) {
      const extracted = extractCommandCodeApiKey(nested);
      if (extracted) return extracted;
    }
  }

  return undefined;
}

function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return path;
}

function credentialFromRecord(
  value: Record<string, unknown>,
  index: number,
): CommandCodeCredential | undefined {
  const apiKey =
    stringValue(value.apiKey) ??
    stringValue(value.api_key) ??
    stringValue(value.key) ??
    stringValue(value.token);
  if (!apiKey) return undefined;
  const credential: CommandCodeCredential = {
    id: stringValue(value.id) ?? stringValue(value.name) ?? `key-${index + 1}`,
    apiKey,
    weight: numberValue(value.weight, 1),
  };
  const allowedModels = stringArrayValue(value.allowedModels ?? value.allowed_models);
  if (allowedModels) credential.allowedModels = allowedModels;
  return credential;
}

function credentialFromUnknown(value: unknown, index: number): CommandCodeCredential | undefined {
  const scalar = stringValue(value);
  if (scalar) return { id: `key-${index + 1}`, apiKey: scalar, weight: 1 };
  if (isRecord(value)) return credentialFromRecord(value, index);
  return undefined;
}

export function extractCommandCodeCredentials(value: unknown): CommandCodeCredential[] {
  const source = isRecord(value) && Array.isArray(value.credentials) ? value.credentials : value;
  if (Array.isArray(source)) {
    return source
      .map((entry, index) => credentialFromUnknown(entry, index))
      .filter((entry): entry is CommandCodeCredential => Boolean(entry));
  }

  if (isRecord(source)) {
    const recordCredential = credentialFromRecord(source, 0);
    if (recordCredential) return [recordCredential];
  }

  return [];
}

function parseInlineCredentials(value: string): CommandCodeCredential[] {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return extractCommandCodeCredentials(JSON.parse(trimmed) as unknown);
    } catch {
      return [];
    }
  }

  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const separator = entry.indexOf("=");
      if (separator > 0) {
        const id = entry.slice(0, separator).trim();
        const apiKey = entry.slice(separator + 1).trim();
        return apiKey ? { id: id || `key-${index + 1}`, apiKey, weight: 1 } : undefined;
      }
      return { id: `key-${index + 1}`, apiKey: entry, weight: 1 };
    })
    .filter((entry): entry is CommandCodeCredential => Boolean(entry));
}

function loadCredentialsFromFile(path: string): CommandCodeCredential[] {
  const filePath = expandPath(path);
  if (!existsSync(filePath)) return [];
  try {
    return extractCommandCodeCredentials(JSON.parse(readFileSync(filePath, "utf8")) as unknown);
  } catch {
    return [];
  }
}

export function loadCommandCodeApiKeyFromEnvOrFile(
  options: LoadApiKeyOptions = {},
): string | undefined {
  const env = options.env ?? process.env;
  const envKey = stringValue(env.COMMANDCODE_API_KEY);
  if (envKey) return envKey;

  const authPaths = options.authPaths ?? [
    "~/.commandcode/auth.json",
    "~/.config/commandcode/auth.json",
  ];
  for (const candidate of authPaths) {
    const filePath = expandPath(candidate);
    if (!existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      const key = extractCommandCodeApiKey(parsed);
      if (key) return key;
    } catch {
      continue;
    }
  }

  return undefined;
}

export function loadCommandCodeCredentialsFromEnvOrFile(
  options: LoadApiKeyOptions = {},
): CommandCodeCredential[] {
  const env = options.env ?? process.env;

  const filePath = stringValue(env.COMMANDCODE_CREDENTIALS_FILE);
  if (filePath) {
    const credentials = loadCredentialsFromFile(filePath);
    if (credentials.length > 0) return credentials;
  }

  const inline = stringValue(env.COMMANDCODE_CREDENTIALS) ?? stringValue(env.COMMANDCODE_API_KEYS);
  if (inline) {
    const credentials = parseInlineCredentials(inline);
    if (credentials.length > 0) return credentials;
  }

  const legacyKey = loadCommandCodeApiKeyFromEnvOrFile(options);
  return legacyKey ? [{ id: "default", apiKey: legacyKey, weight: 1 }] : [];
}
