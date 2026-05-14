import { describe, expect, it } from "vitest";

import { extractCommandCodeApiKey, loadCommandCodeApiKeyFromEnvOrFile } from "../src/auth.js";

describe("CommandCode auth loading", () => {
  it("extracts direct apiKey fields", () => {
    expect(extractCommandCodeApiKey({ apiKey: "user_direct" })).toBe("user_direct");
  });

  it("extracts legacy commandcode string fields", () => {
    expect(extractCommandCodeApiKey({ commandcode: "user_legacy" })).toBe("user_legacy");
  });

  it("extracts nested OAuth access fields", () => {
    expect(
      extractCommandCodeApiKey({
        commandcode: { type: "oauth", access: "user_oauth", refresh: "user_refresh" },
      }),
    ).toBe("user_oauth");
  });

  it("prefers COMMANDCODE_API_KEY over auth files", () => {
    const key = loadCommandCodeApiKeyFromEnvOrFile({
      env: { COMMANDCODE_API_KEY: "user_env" },
      authPaths: ["/path/that/does/not/exist"],
    });
    expect(key).toBe("user_env");
  });
});
