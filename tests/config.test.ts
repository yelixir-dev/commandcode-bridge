import { describe, expect, it } from "vitest";

import { loadBridgeConfig, normalizeModelName, resolveModel } from "../src/config.js";
import { COMMANDCODE_MODEL_DEFINITIONS, mergeModelCatalog } from "../src/model-catalog.js";

describe("configuration and model aliases", () => {
  it("defaults to DeepSeek V4 Pro", () => {
    const config = loadBridgeConfig({ env: {} });
    expect(config.defaultModel).toBe("deepseek/deepseek-v4-pro");
  });

  it("advertises CommandCode CLI 1.32.2 by default while allowing override", () => {
    expect(loadBridgeConfig({ env: {} }).cliVersion).toBe("1.32.2");
    expect(loadBridgeConfig({ env: { COMMANDCODE_CLI_VERSION: "1.14.0-test" } }).cliVersion).toBe(
      "1.14.0-test",
    );
  });

  it("matches the exact CommandCode 1.32.2 canonical catalog and advertised prices", () => {
    const expectedPrices = new Map<string, [number, number]>([
      ["deepseek/deepseek-v4-pro", [0.66, 1.98]],
      ["deepseek/deepseek-v4-flash", [0.22, 0.66]],
      ["deepseek/deepseek-v4-flash-vision-exp", [0.22, 0.66]],
      ["moonshotai/Kimi-K3", [3, 15]],
      ["moonshotai/Kimi-K2.7-Code", [0.95, 4]],
      ["moonshotai/Kimi-K2.7-Code-Highspeed", [1.9, 8]],
      ["moonshotai/Kimi-K2.6", [0.95, 4]],
      ["moonshotai/Kimi-K2.5", [0.6, 3]],
      ["zai-org/GLM-5.3", [1.4, 4.4]],
      ["zai-org/GLM-5.2", [1.4, 4.4]],
      ["zai-org/GLM-5.2-Fast", [3, 10.25]],
      ["zai-org/GLM-5.1", [1.4, 4.4]],
      ["zai-org/GLM-5", [1, 3.2]],
      ["MiniMaxAI/MiniMax-M3", [0.3, 1.2]],
      ["MiniMaxAI/MiniMax-M2.7", [0.3, 1.2]],
      ["MiniMaxAI/MiniMax-M2.5", [0.3, 1.2]],
      ["xiaomi/mimo-v2.5-pro", [0.435, 0.87]],
      ["xiaomi/mimo-v2.5", [0.14, 0.28]],
      ["Qwen/Qwen3.8-Max", [2, 6]],
      ["Qwen/Qwen3.8-27B", [0.4, 3]],
      ["Qwen/Qwen3.7-Max", [2.5, 7.5]],
      ["Qwen/Qwen3.7-Plus", [0.4, 1.6]],
      ["Qwen/Qwen3.7-Flash", [0.03, 0.13]],
      ["Qwen/Qwen3.6-Max-Preview", [1.3, 7.8]],
      ["Qwen/Qwen3.6-Plus", [0.5, 3]],
      ["stepfun/Step-3.7-Flash", [0.2, 1.15]],
      ["stepfun/Step-3.5-Flash", [0.1, 0.3]],
      ["tencent/hy3-paid", [0.14, 0.58]],
      ["nvidia/nemotron-3-ultra-550b-a55b", [0.6, 2.4]],
      ["thinkingmachines/inkling", [1, 4.05]],
      ["thinkingmachines/inkling-small", [0.5, 1.2]],
      ["poolside/laguna-s-2.1-free", [0, 0]],
      ["stealth/ox-alpha", [0, 0]],
      ["claude-sonnet-5", [2, 10]],
      ["claude-sonnet-4-6", [3, 15]],
      ["claude-fable-5", [10, 50]],
      ["claude-opus-5", [5, 25]],
      ["claude-opus-4-8", [5, 25]],
      ["claude-opus-4-7", [5, 25]],
      ["claude-haiku-4-5-20251001", [1, 5]],
      ["gpt-5.6-sol", [5, 30]],
      ["gpt-5.6-terra", [2, 12]],
      ["gpt-5.6-luna", [0.2, 1.2]],
      ["gpt-5.5", [5, 30]],
      ["gpt-5.4", [2.5, 15]],
      ["gpt-5.3-codex", [2, 8]],
      ["gpt-5.4-mini", [0.75, 4.5]],
      ["google/gemini-3.7-flash", [0.75, 3.75]],
      ["google/gemini-3.6-flash", [1.5, 7.5]],
      ["google/gemini-3.5-flash", [1.5, 9]],
      ["google/gemini-3.5-flash-lite", [0.3, 2.5]],
      ["google/gemini-3.1-flash-lite", [0.25, 1.5]],
      ["sakana/fugu-ultra", [5, 30]],
      ["meta/muse-spark-1.1", [1.25, 4.25]],
      ["meta/muse-spark-1.2", [1.25, 4.25]],
      ["meta/muse-spark-1.2-contributor", [0.1, 0.2]],
      ["xai/grok-4.5", [2, 6]],
      ["xai/grok-4.6", [2, 6]],
    ]);
    const catalog = loadBridgeConfig({ env: {} }).modelCatalog ?? [];

    expect(catalog).toHaveLength(58);
    expect(catalog.map((model) => model.id)).toEqual([...expectedPrices.keys()]);
    for (const model of catalog) {
      const match = model.notes?.match(/^\$(\d+(?:\.\d+)?)\/M in · \$(\d+(?:\.\d+)?)\/M out/);
      expect(match, `${model.id} should advertise input/output prices`).toBeTruthy();
      expect(match?.slice(1).map(Number), model.id).toEqual(expectedPrices.get(model.id));
    }
  });

  it("matches the exact CommandCode 1.32.2 published context windows", () => {
    const expectedContextWindows = new Map<string, number | undefined>([
      ["deepseek/deepseek-v4-pro", 1_000_000],
      ["deepseek/deepseek-v4-flash", 1_000_000],
      ["deepseek/deepseek-v4-flash-vision-exp", 1_000_000],
      ["moonshotai/Kimi-K3", 1_000_000],
      ["moonshotai/Kimi-K2.7-Code", 256_000],
      ["moonshotai/Kimi-K2.7-Code-Highspeed", 262_000],
      ["moonshotai/Kimi-K2.6", 256_000],
      ["moonshotai/Kimi-K2.5", 256_000],
      ["zai-org/GLM-5.3", 1_000_000],
      ["zai-org/GLM-5.2", 1_000_000],
      ["zai-org/GLM-5.2-Fast", 1_000_000],
      ["zai-org/GLM-5.1", 200_000],
      ["zai-org/GLM-5", 200_000],
      ["MiniMaxAI/MiniMax-M3", 1_000_000],
      ["MiniMaxAI/MiniMax-M2.7", 200_000],
      ["MiniMaxAI/MiniMax-M2.5", 200_000],
      ["xiaomi/mimo-v2.5-pro", 1_000_000],
      ["xiaomi/mimo-v2.5", 1_000_000],
      ["Qwen/Qwen3.8-Max", 1_000_000],
      ["Qwen/Qwen3.8-27B", 262_144],
      ["Qwen/Qwen3.7-Max", 1_000_000],
      ["Qwen/Qwen3.7-Plus", 1_000_000],
      ["Qwen/Qwen3.7-Flash", 1_000_000],
      ["Qwen/Qwen3.6-Max-Preview", 200_000],
      ["Qwen/Qwen3.6-Plus", 200_000],
      ["stepfun/Step-3.7-Flash", 256_000],
      ["stepfun/Step-3.5-Flash", 1_000_000],
      ["tencent/hy3-paid", 262_144],
      ["nvidia/nemotron-3-ultra-550b-a55b", 1_000_000],
      ["thinkingmachines/inkling", 256_000],
      ["thinkingmachines/inkling-small", 1_000_000],
      ["poolside/laguna-s-2.1-free", 256_000],
      ["stealth/ox-alpha", 1_048_576],
      ["claude-sonnet-5", 1_000_000],
      ["claude-sonnet-4-6", 1_000_000],
      ["claude-fable-5", 1_000_000],
      ["claude-opus-5", 1_000_000],
      ["claude-opus-4-8", 1_000_000],
      ["claude-opus-4-7", 1_000_000],
      ["claude-haiku-4-5-20251001", 200_000],
      ["gpt-5.6-sol", 1_050_000],
      ["gpt-5.6-terra", 1_050_000],
      ["gpt-5.6-luna", 1_050_000],
      ["gpt-5.5", 400_000],
      ["gpt-5.4", 400_000],
      ["gpt-5.3-codex", 400_000],
      ["gpt-5.4-mini", 400_000],
      ["google/gemini-3.7-flash", 1_048_576],
      ["google/gemini-3.6-flash", 1_000_000],
      ["google/gemini-3.5-flash", 1_000_000],
      ["google/gemini-3.5-flash-lite", 1_000_000],
      ["google/gemini-3.1-flash-lite", 1_000_000],
      ["sakana/fugu-ultra", 1_000_000],
      ["meta/muse-spark-1.1", 1_048_576],
      ["meta/muse-spark-1.2", 1_048_576],
      ["meta/muse-spark-1.2-contributor", 1_048_576],
      ["xai/grok-4.5", 500_000],
      ["xai/grok-4.6", 500_000],
    ]);
    const definitions = COMMANDCODE_MODEL_DEFINITIONS as Array<{
      id: string;
      contextWindow?: number;
    }>;

    expect(definitions.map((model) => model.id)).toEqual([...expectedContextWindows.keys()]);
    expect(definitions.map((model) => [model.id, model.contextWindow])).toEqual([
      ...expectedContextWindows,
    ]);
  });

  it("keeps canonical metadata for built-ins while preserving custom model metadata", () => {
    const merged = mergeModelCatalog([
      {
        id: "deepseek/deepseek-v4-pro",
        enabled: false,
        provider: "Legacy Provider",
        aliases: ["legacy-deepseek"],
        notes: "stale pricing",
        contextWindow: 900_000,
      },
      {
        id: "custom/long",
        enabled: true,
        provider: "Custom",
        aliases: ["custom-long"],
        notes: "custom metadata",
        contextWindow: 300_000,
      },
    ]) as Array<{
      id: string;
      provider?: string;
      aliases?: string[];
      notes?: string;
      contextWindow?: number;
    }>;
    const byId = new Map(merged.map((model) => [model.id, model]));

    expect(byId.get("deepseek/deepseek-v4-pro")).toMatchObject({
      provider: "DeepSeek",
      aliases: expect.not.arrayContaining(["legacy-deepseek"]),
      contextWindow: 1_000_000,
    });
    expect(byId.get("deepseek/deepseek-v4-pro")?.notes).not.toBe("stale pricing");
    expect(byId.get("deepseek/deepseek-v4-flash")?.contextWindow).toBe(1_000_000);
    expect(byId.get("zai-org/GLM-5.1")?.contextWindow).toBe(200_000);
    expect(byId.get("custom/long")).toMatchObject({
      provider: "Custom",
      aliases: ["custom-long"],
      notes: "custom metadata",
      contextWindow: 300_000,
    });
  });

  it("keeps only the established default models enabled", () => {
    const enabledIds = (loadBridgeConfig({ env: {} }).modelCatalog ?? [])
      .filter((model) => model.enabled)
      .map((model) => model.id);

    expect(enabledIds).toEqual([
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4-flash",
      "moonshotai/Kimi-K2.6",
      "zai-org/GLM-5.1",
      "MiniMaxAI/MiniMax-M2.7",
      "Qwen/Qwen3.6-Plus",
    ]);
  });

  it("defaults to auto upstream mode with zero data retention off", () => {
    const config = loadBridgeConfig({ env: {} });
    expect(config.upstreamMode).toBe("auto");
    expect(config.zdr).toBe(false);
    expect(loadBridgeConfig({ env: { COMMANDCODE_UPSTREAM_MODE: "alpha" } }).upstreamMode).toBe(
      "alpha",
    );
    expect(loadBridgeConfig({ env: { COMMANDCODE_UPSTREAM_MODE: "provider" } }).upstreamMode).toBe(
      "provider",
    );
    expect(loadBridgeConfig({ env: { COMMANDCODE_UPSTREAM_MODE: "PROVIDER" } }).upstreamMode).toBe(
      "provider",
    );
    expect(loadBridgeConfig({ env: { COMMANDCODE_UPSTREAM_MODE: "auto" } }).upstreamMode).toBe(
      "auto",
    );
    expect(loadBridgeConfig({ env: { COMMANDCODE_ZDR: "true" } }).zdr).toBe(true);
  });

  it("defaults to a five-attempt retry budget with a ten-minute timeout", () => {
    const config = loadBridgeConfig({ env: {} });
    expect(config.timeoutMs).toBe(600_000);
    expect(config.commandCodeRetryMaxAttempts).toBe(5);
    expect(config.commandCodeRetryBackoffMs).toBe(250);
    const overridden = loadBridgeConfig({
      env: {
        COMMANDCODE_TIMEOUT_MS: "120000",
        COMMANDCODE_RETRY_MAX_ATTEMPTS: "3",
        COMMANDCODE_RETRY_BACKOFF_MS: "500",
      },
    });
    expect(overridden.timeoutMs).toBe(120_000);
    expect(overridden.commandCodeRetryMaxAttempts).toBe(3);
    expect(overridden.commandCodeRetryBackoffMs).toBe(500);
  });

  it("keeps balance alerts off by default while failing closed on empty length responses", () => {
    const config = loadBridgeConfig({ env: {} });
    expect(config.balanceAlerts.enabled).toBe(false);
    expect(config.balanceAlerts.minCurrentBalance).toBe(1);
    expect(config.emptyVisibleResponsePolicy).toBe("error_on_length");
    expect(config.emptyVisibleRetryMaxAttempts).toBe(1);
    expect(config.emptyVisibleRetryBackoffMs).toBe(250);
    expect(config.bridgeApiKeySource).toBe("none");
  });

  it("parses empty-visible retry budget and env bridge API key source", () => {
    const config = loadBridgeConfig({
      env: {
        COMMANDCODE_EMPTY_VISIBLE_RETRY_MAX_ATTEMPTS: "0",
        COMMANDCODE_EMPTY_VISIBLE_RETRY_BACKOFF_MS: "100",
        BRIDGE_API_KEY: "env-bridge-key",
      },
    });
    expect(config.emptyVisibleRetryMaxAttempts).toBe(0);
    expect(config.emptyVisibleRetryBackoffMs).toBe(100);
    expect(config.bridgeApiKey).toBe("env-bridge-key");
    expect(config.bridgeApiKeySource).toBe("env");
  });

  it("parses opt-in balance alert thresholds from environment", () => {
    const config = loadBridgeConfig({
      env: {
        COMMANDCODE_BALANCE_ALERT_ENABLED: "true",
        COMMANDCODE_BALANCE_ALERT_MIN_CURRENT_BALANCE: "2.5",
        COMMANDCODE_BALANCE_ALERT_MIN_EXPIRING_BALANCE: "1.25",
        COMMANDCODE_BALANCE_ALERT_MAX_REQUIRED_DAILY_BURN: "0.75",
        COMMANDCODE_BALANCE_ALERT_INTERVAL_MS: "120000",
        COMMANDCODE_BALANCE_ALERT_REPEAT_MS: "240000",
        COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL: "https://alerts.example/hook",
        COMMANDCODE_BALANCE_ALERT_WEBHOOK_BEARER: "alert-secret",
      },
    });
    expect(config.balanceAlerts).toMatchObject({
      enabled: true,
      minCurrentBalance: 2.5,
      minExpiringBalance: 1.25,
      maxRequiredDailyBurn: 0.75,
      intervalMs: 120_000,
      repeatMs: 240_000,
      webhookUrl: "https://alerts.example/hook",
      webhookBearer: "alert-secret",
    });
  });

  it("normalizes shipped legacy ids to renamed CommandCode 1.14.0 canonical ids", () => {
    const renamedIds = {
      "alibaba/qwen3.7-max": "Qwen/Qwen3.7-Max",
      "openai/gpt-5.5": "gpt-5.5",
      "openai/gpt-5.4": "gpt-5.4",
      "openai/gpt-5.3-codex": "gpt-5.3-codex",
      "openai/gpt-5.4-mini": "gpt-5.4-mini",
      "anthropic/claude-fable-5": "claude-fable-5",
      "anthropic/claude-opus-4.8": "claude-opus-4-8",
      "anthropic/claude-opus-4.7": "claude-opus-4-7",
      "anthropic/claude-sonnet-4.6": "claude-sonnet-4-6",
      "anthropic/claude-haiku-4-5-20251001": "claude-haiku-4-5-20251001",
    };

    for (const [legacyId, canonicalId] of Object.entries(renamedIds)) {
      expect(normalizeModelName(legacyId), legacyId).toBe(canonicalId);
    }
  });

  it("retires removed 1.3.1 built-ins instead of forwarding them as custom models", () => {
    const retiredIds = [
      "MiniMaxAI/MiniMax-M3-Free",
      "anthropic/claude-opus-4.6",
      "anthropic/claude-opus-4-5-20251101",
      "anthropic/claude-sonnet-4-5-20250929",
      "anthropic/claude-sonnet-4-20250514",
      "inclusionai/ling-3.0-flash-free",
    ];
    const merged = mergeModelCatalog(
      retiredIds.map((id) => ({ id, enabled: true })),
      retiredIds,
      normalizeModelName,
      false,
    );

    expect(merged.map((model) => model.id)).not.toEqual(expect.arrayContaining(retiredIds));
    const config = loadBridgeConfig({
      env: {
        COMMANDCODE_DEFAULT_MODEL: "anthropic/claude-opus-4.6",
        COMMANDCODE_ALLOWED_MODELS: retiredIds.join(","),
      },
    });
    expect(config.defaultModel).toBe("deepseek/deepseek-v4-pro");
    expect(config.allowedModels).not.toEqual(expect.arrayContaining(retiredIds));
    const allowUnknownConfig = loadBridgeConfig({
      env: { COMMANDCODE_ALLOW_UNKNOWN_MODELS: "true" },
    });
    expect(() => resolveModel(retiredIds[0], allowUnknownConfig)).toThrow(/not allowed/i);
  });

  it("resolves common aliases to CommandCode model ids", () => {
    const config = loadBridgeConfig({
      env: {
        COMMANDCODE_ALLOWED_MODELS:
          "deepseek/deepseek-v4-pro,deepseek/deepseek-v4-flash,openai/gpt-5.6-terra,anthropic/claude-sonnet-5",
      },
    });
    expect(resolveModel("default", config).upstreamModel).toBe("deepseek/deepseek-v4-pro");
    expect(resolveModel("commandcode/deepseek-v4-pro", config).upstreamModel).toBe(
      "deepseek/deepseek-v4-pro",
    );
    expect(resolveModel("deepseek-v4-flash", config).upstreamModel).toBe(
      "deepseek/deepseek-v4-flash",
    );
    expect(resolveModel("openai/gpt-5.6-terra", config).upstreamModel).toBe("gpt-5.6-terra");
    expect(resolveModel("anthropic/claude-sonnet-5", config).upstreamModel).toBe("claude-sonnet-5");
  });

  it("rejects unknown models when allowUnknownModels is false", () => {
    const config = loadBridgeConfig({ env: { COMMANDCODE_ALLOW_UNKNOWN_MODELS: "false" } });
    expect(() => resolveModel("not-a-model", config)).toThrow(/not allowed/i);
  });

  it("normalizes allowed model aliases from environment before enforcing the allowlist", () => {
    const config = loadBridgeConfig({
      env: {
        COMMANDCODE_ALLOWED_MODELS: "commandcode/deepseek-v4-pro",
        COMMANDCODE_DEFAULT_MODEL: "commandcode/deepseek-v4-pro",
      },
    });
    expect(config.allowedModels).toContain("deepseek/deepseek-v4-pro");
    expect(resolveModel("default", config).upstreamModel).toBe("deepseek/deepseek-v4-pro");
  });

  it("routes the default alias to the configured default model", () => {
    const config = loadBridgeConfig({
      env: {
        COMMANDCODE_DEFAULT_MODEL: "deepseek/deepseek-v4-flash",
        COMMANDCODE_ALLOWED_MODELS: "deepseek/deepseek-v4-flash",
      },
    });
    expect(resolveModel("default", config).upstreamModel).toBe("deepseek/deepseek-v4-flash");
    expect(resolveModel("commandcode/default", config).upstreamModel).toBe(
      "deepseek/deepseek-v4-flash",
    );
  });

  it("loads multiple CommandCode credentials from inline environment config", () => {
    const config = loadBridgeConfig({
      env: {
        COMMANDCODE_API_KEYS: "alpha=alpha-secret,beta=beta-secret",
        COMMANDCODE_ROUTING_POLICY: "depletion_aware",
      },
      authPaths: [],
    });

    expect(config.commandCodeCredentials.map((credential) => credential.id)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(config.commandCodeCredentials.map((credential) => credential.apiKey)).toEqual([
      "alpha-secret",
      "beta-secret",
    ]);
    expect(config.commandCodeRoutingPolicy).toBe("daily_burn_priority");
    expect(config.commandCodeApiKey).toBe("alpha-secret");
  });

  it("normalizes credential-scoped allowed model aliases", () => {
    const config = loadBridgeConfig({
      env: {
        COMMANDCODE_CREDENTIALS: JSON.stringify([
          {
            id: "alias-key",
            apiKey: "alias-secret",
            allowedModels: ["deepseek-v4-pro", "commandcode/deepseek-v4-flash"],
          },
        ]),
      },
      authPaths: [],
    });

    expect(config.commandCodeCredentials[0]?.allowedModels).toEqual([
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4-flash",
    ]);
  });

  it("keeps legacy single-key configuration compatible", () => {
    const config = loadBridgeConfig({
      env: { COMMANDCODE_API_KEY: "legacy-secret" },
      authPaths: [],
    });

    expect(config.commandCodeCredentials).toEqual([
      { id: "default", apiKey: "legacy-secret", weight: 1 },
    ]);
    expect(config.commandCodeApiKey).toBe("legacy-secret");
  });
});
