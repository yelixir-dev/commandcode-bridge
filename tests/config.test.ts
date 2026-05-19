import { describe, expect, it } from "vitest";

import { loadBridgeConfig, resolveModel } from "../src/config.js";

describe("configuration and model aliases", () => {
  it("defaults to DeepSeek V4 Pro", () => {
    const config = loadBridgeConfig({ env: {} });
    expect(config.defaultModel).toBe("deepseek/deepseek-v4-pro");
  });

  it("advertises the current CommandCode CLI version by default while allowing override", () => {
    expect(loadBridgeConfig({ env: {} }).cliVersion).toBe("0.26.8");
    expect(loadBridgeConfig({ env: { COMMANDCODE_CLI_VERSION: "0.26.8-test" } }).cliVersion).toBe(
      "0.26.8-test",
    );
  });

  it("shows CommandCode pricing instead of descriptive model notes", () => {
    const config = loadBridgeConfig({ env: {} });
    expect(config.modelCatalog?.find((model) => model.id === "openai/gpt-5.5")?.notes).toBe(
      "$5/M in · $30/M out",
    );
    expect(config.modelCatalog?.find((model) => model.id === "openai/gpt-5.4")?.notes).toBe(
      "$2.50/M in · $15/M out",
    );
    expect(
      config.modelCatalog?.find((model) => model.id === "deepseek/deepseek-v4-pro")?.notes,
    ).toBe("$0.435/M in · $0.87/M out · cache hit $0.003625/M");
  });

  it("keeps the CommandCode 0.26.8 discovered model catalog available but conservative", () => {
    const config = loadBridgeConfig({ env: {} });
    const catalog = new Map(config.modelCatalog?.map((model) => [model.id, model]));

    for (const id of [
      "MiniMaxAI/MiniMax-M2.5",
      "Qwen/Qwen3.6-Max-Preview",
      "zai-org/GLM-5",
      "moonshotai/Kimi-K2.5",
      "stepfun/Step-3.5-Flash",
      "google/gemini-3.1-flash-lite",
      "openai/gpt-5.4",
      "openai/gpt-5.3-codex",
      "openai/gpt-5.4-mini",
      "anthropic/claude-haiku-4-5-20251001",
    ]) {
      expect(catalog.has(id)).toBe(true);
      expect(catalog.get(id)?.enabled).toBe(false);
    }
  });

  it("keeps balance alerts off by default while failing closed on empty length responses", () => {
    const config = loadBridgeConfig({ env: {} });
    expect(config.balanceAlerts.enabled).toBe(false);
    expect(config.balanceAlerts.minCurrentBalance).toBe(1);
    expect(config.emptyVisibleResponsePolicy).toBe("error_on_length");
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

  it("resolves common aliases to CommandCode model ids", () => {
    const config = loadBridgeConfig({ env: {} });
    expect(resolveModel("default", config).upstreamModel).toBe("deepseek/deepseek-v4-pro");
    expect(resolveModel("commandcode/deepseek-v4-pro", config).upstreamModel).toBe(
      "deepseek/deepseek-v4-pro",
    );
    expect(resolveModel("deepseek-v4-flash", config).upstreamModel).toBe(
      "deepseek/deepseek-v4-flash",
    );
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
