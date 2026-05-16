import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

  it("persists and loads dashboard-managed admin API keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "commandcode-bridge-admin-key-"));
    const file = join(dir, "credentials.json");
    writeDashboardConfigFile(file, {
      bridgeApiKey: "sk-cmdbridge-123abc",
      credentials: [{ id: "alpha", apiKey: "alpha-secret" }],
    });

    const persisted = JSON.parse(readFileSync(file, "utf8")) as { bridgeApiKey?: string };
    expect(persisted.bridgeApiKey).toBe("sk-cmdbridge-123abc");

    const config = loadBridgeConfig({
      env: { COMMANDCODE_CREDENTIALS_FILE: file, BRIDGE_API_KEY: "old-env-key" },
      authPaths: [],
    });
    expect(config.bridgeApiKey).toBe("sk-cmdbridge-123abc");
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
      server: { host: "0.0.0.0", port: 9992 },
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

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(9992);
    expect(config.commandCodeRoutingPolicy).toBe("daily_burn_priority");
    expect(config.commandCodeMaxInFlightPerCredential).toBe(4);
    expect(config.commandCodeMaxTotalInFlight).toBeUndefined();
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
    const getResponse = await app.inject({ method: "GET", url: "/admin/config" });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body).not.toContain("alpha-secret");
    expect(getResponse.body).not.toContain("bridge-secret");
    expect(getResponse.json()).toMatchObject({
      dirty: false,
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "alpha", apiKeyConfigured: true }],
    });

    const putResponse = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers,
      payload: {
        server: { host: "0.0.0.0", port: 9992 },
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
    expect(putResponse.body).not.toContain("bridge-secret");

    const secondPutResponse = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers,
      payload: {
        server: { host: "0.0.0.0", port: 9992 },
        routing: { policy: "round_robin", maxInFlightPerCredential: 4 },
        models: [{ id: "deepseek/deepseek-v4-flash", enabled: true }],
        credentials: [
          { id: "renamed", originalId: "renamed", weight: 1, enabled: false },
          { id: "key2", originalId: "key2", weight: 1, enabled: true },
        ],
      },
    });
    expect(secondPutResponse.statusCode).toBe(200);
    const persisted = JSON.parse(readFileSync(file, "utf8")) as {
      credentials: Array<{ id: string; apiKey?: string; enabled?: boolean }>;
    };
    expect(persisted.credentials).toMatchObject([
      { id: "renamed", apiKey: "alpha-secret", enabled: false },
      { id: "key2", apiKey: "beta-secret", enabled: true },
    ]);

    await app.close();
  });

  it("preserves an existing credential secret by originalId when a browser rename payload omits apiKey", async () => {
    const file = tempConfigFile({
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [
        { id: "ktk.archive", apiKey: "ktk-secret", weight: 1 },
        { id: "teykim.001", apiKey: "teykim-secret", weight: 1 },
      ],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers: { authorization: "Bearer bridge-secret" },
      payload: {
        routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
        credentials: [
          { id: "ktk.archive", originalId: "ktk.archive", weight: 1, enabled: true },
          { id: "teykim.renamed", originalId: "teykim.001", weight: 1, enabled: true },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().credentials.map((credential: { id: string }) => credential.id)).toEqual([
      "ktk.archive",
      "teykim.renamed",
    ]);
    const persisted = JSON.parse(readFileSync(file, "utf8")) as {
      credentials: Array<{ id: string; apiKey?: string }>;
    };
    expect(persisted.credentials).toMatchObject([
      { id: "ktk.archive", apiKey: "ktk-secret" },
      { id: "teykim.renamed", apiKey: "teykim-secret" },
    ]);

    await app.close();
  });

  it("does not preserve credential secrets by position for ambiguous replacement payloads", async () => {
    const file = tempConfigFile({
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [
        { id: "alpha", apiKey: "alpha-secret", weight: 1 },
        { id: "beta", apiKey: "beta-secret", weight: 1 },
      ],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers: { authorization: "Bearer bridge-secret" },
      payload: {
        routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
        credentials: [
          { id: "new-alpha", weight: 1, enabled: true },
          { id: "beta", weight: 1, enabled: true },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const persisted = JSON.parse(readFileSync(file, "utf8")) as {
      credentials: Array<{ id: string; apiKey?: string }>;
    };
    expect(persisted.credentials).toMatchObject([{ id: "beta", apiKey: "beta-secret" }]);
    expect(persisted.credentials).not.toContainEqual(
      expect.objectContaining({ id: "new-alpha", apiKey: "alpha-secret" }),
    );

    await app.close();
  });


  it("saves dashboard JSON without requiring the bridge client API key", async () => {
    const file = tempConfigFile({
      bridgeApiKey: "bridge-secret",
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers: { host: "100.88.251.70:9992", origin: "http://100.88.251.70:9992" },
      payload: {
        server: { host: "0.0.0.0", port: 9992 },
        routing: { policy: "round_robin", maxInFlightPerCredential: 4 },
        credentials: [{ id: "alpha", originalId: "alpha", weight: 1, enabled: true }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ dirty: true, restart_required: true });
    const persisted = JSON.parse(readFileSync(file, "utf8")) as {
      server?: { host?: string };
      bridgeApiKey?: string;
      credentials: Array<{ id: string; apiKey?: string }>;
    };
    expect(persisted.server?.host).toBe("0.0.0.0");
    expect(persisted.bridgeApiKey).toBe("bridge-secret");
    expect(persisted.credentials).toMatchObject([{ id: "alpha", apiKey: "alpha-secret" }]);

    await app.close();
  });

  it("restarts from the dashboard without requiring the bridge client API key", async () => {
    const file = tempConfigFile({
      bridgeApiKey: "bridge-secret",
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/admin/restart",
      headers: { host: "100.88.251.70:9992", origin: "http://100.88.251.70:9992" },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, restart_requested: true });

    await app.close();
  });

  it("keeps bridge client API routes authenticated while dashboard JSON saves are open", async () => {
    const file = tempConfigFile({
      bridgeApiKey: "bridge-secret",
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const modelsResponse = await app.inject({ method: "GET", url: "/v1/models" });
    expect(modelsResponse.statusCode).toBe(401);

    await app.close();
  });

  it("rejects browserless non-loopback dashboard JSON writes", async () => {
    const file = tempConfigFile({
      bridgeApiKey: "bridge-secret",
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers: { host: "100.88.251.70:9992" },
      payload: { credentials: [{ id: "alpha", originalId: "alpha", weight: 1 }] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain("admin_origin_forbidden");

    await app.close();
  });

  it("allows local browserless dashboard JSON writes for loopback maintenance", async () => {
    const file = tempConfigFile({
      bridgeApiKey: "bridge-secret",
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers: { host: "127.0.0.1:9992" },
      payload: { credentials: [{ id: "alpha", originalId: "alpha", weight: 1 }] },
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it("rejects cross-origin dashboard JSON writes", async () => {
    const file = tempConfigFile({
      bridgeApiKey: "bridge-secret",
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers: { host: "100.88.251.70:9992", origin: "http://evil.example" },
      payload: { credentials: [{ id: "alpha", originalId: "alpha", weight: 1 }] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain("admin_origin_forbidden");

    await app.close();
  });

  it("rejects dashboard saves that would duplicate an existing API key", async () => {
    const file = tempConfigFile({
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/admin/config",
      headers: { authorization: "Bearer bridge-secret" },
      payload: {
        routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
        credentials: [
          { id: "alpha", originalId: "alpha", weight: 1 },
          { id: "beta", apiKey: "alpha-secret", weight: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.body).toContain("duplicate_commandcode_api_key");
    expect(response.body).not.toContain("alpha-secret");
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
      credentials: [{ id: "alpha", apiKey: "alpha-secret" }],
    });

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
    expect(response.body).toContain("Client API Key");
    expect(response.body).not.toContain("Admin API Key");
    expect(response.body).not.toContain("configFilePath");
    expect(response.body).not.toContain(process.env.HOME ?? "__NO_HOME__");
    expect(response.headers["content-security-policy"]).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    await app.close();
  });

  it("allows same-host dashboard fallback writes from portless mobile origins", async () => {
    const file = tempConfigFile({
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "alpha", apiKey: "alpha-secret", weight: 1 }],
    });
    const app = await createApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { COMMANDCODE_CREDENTIALS_FILE: file },
      configAuthPaths: [],
      configOverrides: { bridgeApiKey: "bridge-secret", logLevel: "silent" },
    });

    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/admin/config",
      headers: {
        origin: "http://100.88.251.70",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
        host: "100.88.251.70:9992",
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://100.88.251.70");
    expect(preflight.headers["access-control-allow-headers"]).toContain("authorization");

    await app.close();
  });
});
