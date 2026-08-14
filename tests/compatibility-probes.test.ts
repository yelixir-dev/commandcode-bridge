import { describe, expect, it } from "vitest";

import { isCompatibilityProbePath, isQuietRequestLogObject } from "../src/compatibility-probes.js";

describe("compatibility probes", () => {
  it("recognizes Ollama-style probe paths", () => {
    expect(isCompatibilityProbePath("/api/tags")).toBe(true);
    expect(isCompatibilityProbePath("/api/tags?x=1")).toBe(true);
    expect(isCompatibilityProbePath("/v1/models")).toBe(false);
  });

  it("drops Fastify request logs for probe urls", () => {
    expect(isQuietRequestLogObject({ req: { url: "/api/tags" } })).toBe(true);
    expect(isQuietRequestLogObject({ url: "/version" })).toBe(true);
    expect(isQuietRequestLogObject({ req: { url: "/v1/chat/completions" } })).toBe(false);
    expect(isQuietRequestLogObject("incoming request")).toBe(false);
  });
});
