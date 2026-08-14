const COMPATIBILITY_PROBE_PATHS = new Set([
  "/api/tags",
  "/api/show",
  "/api/ps",
  "/api/version",
  "/api/v1/models",
  "/version",
  "/props",
  "/v1/props",
  "/metrics/credentials",
]);

export function normalizeRequestPath(url: string): string {
  const path = url.split("?")[0] ?? url;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isCompatibilityProbePath(url: string): boolean {
  return COMPATIBILITY_PROBE_PATHS.has(normalizeRequestPath(url));
}

export function isQuietRequestLogObject(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as { req?: { url?: unknown }; url?: unknown };
  const url = record.req?.url ?? record.url;
  return typeof url === "string" && isCompatibilityProbePath(url);
}

export function compatibilityProbeNotFoundBody(): {
  error: { message: string; type: "invalid_request_error"; code: "not_found" };
} {
  return {
    error: {
      message:
        "Not found. This bridge exposes OpenAI-compatible routes under /v1, plus /health and /dashboard.",
      type: "invalid_request_error",
      code: "not_found",
    },
  };
}
