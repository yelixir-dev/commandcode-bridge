import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadBridgeConfig } from "../src/config.js";
import { resolveConfigFilePath, writeDashboardConfigFile } from "../src/dashboard-config.js";
import { createApp } from "../src/server.js";
import type {
  CommandCodeEvent,
  CommandCodeGenerateBody,
  CommandCodeUpstream,
} from "../src/types.js";

class FakeCommandCodeClient implements CommandCodeUpstream {
  public seenBodies: CommandCodeGenerateBody[] = [];

  async *generate(body: CommandCodeGenerateBody): AsyncIterable<CommandCodeEvent> {
    this.seenBodies.push(body);
    yield { type: "text-delta", text: "OK" };
    yield { type: "finish", finishReason: "stop" };
  }
}

function tempConfigFile(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "commandcode-bridge-admin-"));
  const file = join(dir, "credentials.json");
  writeFileSync(file, JSON.stringify(content, null, 2));
  return file;
}

describe("JSON dashboard configuration", () => {
  it("resolves config file path from env, XDG config, then home config", () => {
    expect(resolveConfigFilePath({ COMMANDCODE_CREDENTIALS_FILE: "~/bridge.json" })).toContain(
      "/bridge.json",
    );
    expect(resolveConfigFilePath({ XDG_CONFIG_HOME: "/tmp/xdg-test" })).toBe(
      "/tmp/xdg-test/commandcode-bridge/credentials.json",
    );
    expect(resolveConfigFilePath({})).toContain("/.config/commandcode-bridge/credentials.json");
  });

  it("writes dashboard config files with 0600 permissions", () => {
    const dir = mkdtempSync(join(tmpdir(), "commandcode-bridge-admin-mode-"));
    const file = join(dir, "credentials.json");
    writeDashboardConfigFile(file, {
      credentials: [{ id: "alpha", apiKey: "alpha-secret" }],
      routing: { policy: "daily_burn_priority" },
    });

    expect((statSync(file).mode & 0o777).toString(8)).toBe("600");
  });

  it("lets JSON routing policy drive dashboard-managed configuration over legacy env", () => {
    const file = tempConfigFile({
      routing: { policy: "round_robin", maxInFlightPerCredential: 4 },
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });

    const config = loadBridgeConfig({
      env: { COMMANDCODE_CREDENTIALS_FILE: file, COMMANDCODE_ROUTING_POLICY: "depletion_aware" },
      authPaths: [],
    });

    expect(config.commandCodeRoutingPolicy).toBe("round_robin");
  });

  it("loads routing defaults and enabled model toggles from credentials JSON", () => {
    const file = tempConfigFile({
      routing: {
        policy: "daily_burn_priority",
        maxInFlightPerCredential: 4,
        maxTotalInFlightMultiplier: 3,
      },
      models: [
        { id: "deepseek/deepseek-v4-flash", enabled: true },
        { id: "openai/gpt-5.5", enabled: false },
      ],
      credentials: [
        { id: "alpha", apiKey: "alpha-secret", weight: 1 },
        { id: "beta", apiKey: "beta-secret", weight: 1 },
      ],
    });

    const config = loadBridgeConfig({
      env: { COMMANDCODE_CREDENTIALS_FILE: file },
      authPaths: [],
    });

    expect(config.commandCodeRoutingPolicy).toBe("daily_burn_priority");
    expect(config.commandCodeMaxInFlightPerCredential).toBe(4);
    expect(config.commandCodeMaxTotalInFlight).toBe(6);
    expect(config.allowedModels).toEqual([
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-pro",
    ]);
    expect(config.modelCatalog!.find((model) => model.id === "openai/gpt-5.5")?.enabled).toBe(
      false,
    );
  });

  it("exposes redacted dashboard config and accepts credential/model edits", async () => {
    const file = tempConfigFile({
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      models: [{ id: "deepseek/deepseek-v4-flash", enabled: true }],
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const headers = { authorization: "Bearer bridge-secret" };
    const getResponse = await app.inject({ method: "GET", url: "/admin/config", headers });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body).not.toContain("alpha-secret");
    expect(getResponse.json()).toMatchObject({
      dirty: false,
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "alpha", apiKeyConfigured: true }],
    });

    const putResponse = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers,
      payload: {
        routing: {
          policy: "round_robin",
          maxInFlightPerCredential: 4,
          maxTotalInFlightMultiplier: 3,
        },
        models: [
          { id: "deepseek/deepseek-v4-flash", enabled: true },
          { id: "openai/gpt-5.5", enabled: true },
        ],
        credentials: [
          { id: "renamed", apiKey: "alpha-secret", weight: 1 },
          { id: "key2", apiKey: "beta-secret", weight: 1 },
        ],
      },
    });
    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.json()).toMatchObject({ dirty: true, restart_required: true });
    expect(putResponse.body).not.toContain("alpha-secret");
    expect(putResponse.body).not.toContain("beta-secret");

    await app.close();
  });

  it("serves the mobile dashboard shell without admin authorization", async () => {
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: {},
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });
    const response = await app.inject({ method: "GET", url: "/dashboard" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("CommandCode Bridge Console");
    expect(response.headers["content-security-policy"]).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    await app.close();
  });
});
