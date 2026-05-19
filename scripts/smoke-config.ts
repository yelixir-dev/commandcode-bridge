import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parse } from "dotenv";

export const DEFAULT_BRIDGE_ENV_FILE = join(homedir(), ".config", "commandcode-bridge", "env");

export interface SmokeRuntimeConfigOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  defaultEnvFile?: string;
  cwd?: string;
}

export interface SmokeRuntimeConfig {
  baseUrl: string;
  bridgeApiKey?: string;
  acceptUpstreamErrors: boolean;
}

export function isUsableModelsResponse(json: unknown): boolean {
  if (typeof json !== "object" || json === null) return false;
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.some((model) => {
    if (typeof model !== "object" || model === null) return false;
    const id = (model as { id?: unknown }).id;
    return typeof id === "string" && id.trim().length > 0;
  });
}

function loadEnvFile(path: string | undefined): Record<string, string> {
  if (!path || !existsSync(path)) return {};
  return parse(readFileSync(path));
}

export function loadSmokeRuntimeConfig(
  options: SmokeRuntimeConfigOptions = {},
): SmokeRuntimeConfig {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const localDotenv = loadEnvFile(join(cwd, ".env"));
  const bridgeEnvFile =
    env.BRIDGE_ENV_FILE ??
    env.COMMANDCODE_BRIDGE_ENV_FILE ??
    options.defaultEnvFile ??
    DEFAULT_BRIDGE_ENV_FILE;
  const bridgeEnv = loadEnvFile(bridgeEnvFile);
  const merged = { ...localDotenv, ...bridgeEnv, ...env };
  const baseUrl =
    merged.BRIDGE_BASE_URL ?? `http://${merged.HOST ?? "127.0.0.1"}:${merged.PORT ?? "9992"}`;
  const config: SmokeRuntimeConfig = {
    baseUrl,
    acceptUpstreamErrors: merged.SMOKE_ACCEPT_UPSTREAM_ERRORS === "1",
  };
  if (merged.BRIDGE_API_KEY) config.bridgeApiKey = merged.BRIDGE_API_KEY;
  return config;
}
