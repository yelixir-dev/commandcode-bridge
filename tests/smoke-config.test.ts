import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isUsableModelsResponse, loadSmokeRuntimeConfig } from "../scripts/smoke-config.js";

describe("smoke runtime config", () => {
  it("loads the configured bridge env file for installed-service smoke runs", () => {
    const dir = mkdtempSync(join(tmpdir(), "commandcode-smoke-env-"));
    const envPath = join(dir, "env");
    writeFileSync(
      envPath,
      [
        "HOST=0.0.0.0",
        "PORT=9992",
        "BRIDGE_API_KEY=file-bridge-key",
        "BRIDGE_BASE_URL=http://100.64.0.1:9992",
      ].join("\n"),
    );

    expect(
      loadSmokeRuntimeConfig({
        env: { BRIDGE_ENV_FILE: envPath },
        defaultEnvFile: join(dir, "missing-env"),
      }),
    ).toMatchObject({
      baseUrl: "http://100.64.0.1:9992",
      bridgeApiKey: "file-bridge-key",
    });
  });

  it("keeps explicit shell environment values ahead of file values", () => {
    const dir = mkdtempSync(join(tmpdir(), "commandcode-smoke-env-"));
    const envPath = join(dir, "env");
    writeFileSync(envPath, "BRIDGE_BASE_URL=http://from-file:9992\nBRIDGE_API_KEY=file-key\n");

    expect(
      loadSmokeRuntimeConfig({
        env: {
          BRIDGE_ENV_FILE: envPath,
          BRIDGE_BASE_URL: "http://from-shell:9992",
          BRIDGE_API_KEY: "shell-key",
        },
        defaultEnvFile: join(dir, "missing-env"),
      }),
    ).toMatchObject({
      baseUrl: "http://from-shell:9992",
      bridgeApiKey: "shell-key",
    });
  });

  it("recognizes usable /v1/models responses before chat smoke", () => {
    expect(
      isUsableModelsResponse({
        object: "list",
        data: [{ id: "deepseek/deepseek-v4-pro", object: "model", owned_by: "deepseek" }],
      }),
    ).toBe(true);
    expect(isUsableModelsResponse({ object: "list", data: [] })).toBe(false);
    expect(isUsableModelsResponse({ error: { code: "unauthorized" } })).toBe(false);
  });
});
