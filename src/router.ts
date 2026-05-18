import { timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

const DEFAULT_BACKEND_ROOT = "http://127.0.0.1:19992";
const RETRYABLE_STATUSES = new Set([401, 402, 408, 425, 429, 500, 502, 503, 504]);
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);
const SENSITIVE_HEADER_NAMES = new Set(["authorization", "x-api-key", "cookie"]);

export interface RouterBackendDefinition {
  id: string;
  baseUrl: string;
  apiKey: string | undefined;
  weight: number;
  maxInflight: number;
}

export interface RouterBackendState extends RouterBackendDefinition {
  inFlight: number;
  disabledUntil: number;
  failures: number;
  successes: number;
  lastSelectedAt: number | null;
  lastStatus: number | null;
  lastLatencyMs: number | null;
  lastError: string | null;
}

export interface RouterConfig {
  host: string;
  port: number;
  apiKey: string | undefined;
  backendTimeoutMs: number;
  healthTimeoutMs: number;
  cooldownMs: number;
  requestBodyLimitBytes: number;
  rateLimitMax: number;
  rateLimitWindow: string;
  logLevel: string;
  backends: RouterBackendDefinition[];
}

export interface CreateRouterAppOptions {
  config?: Partial<RouterConfig>;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

interface BackendSpecObject {
  id?: unknown;
  url?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  weight?: unknown;
  maxInflight?: unknown;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalPositiveNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBackendRoot(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -"/v1".length) : trimmed;
}

function parseBackendString(
  raw: string,
  index: number,
  defaultApiKey: string | undefined,
  defaultMaxInflight: number,
): RouterBackendDefinition {
  const trimmed = raw.trim();
  const separator = trimmed.indexOf("=");
  const hasNamedPrefix = separator > 0 && !trimmed.slice(0, separator).includes("://");
  const id = hasNamedPrefix ? trimmed.slice(0, separator).trim() : `backend-${index + 1}`;
  const baseUrl = hasNamedPrefix ? trimmed.slice(separator + 1).trim() : trimmed;
  return {
    id: id || `backend-${index + 1}`,
    baseUrl: normalizeBackendRoot(baseUrl),
    apiKey: defaultApiKey,
    weight: 1,
    maxInflight: defaultMaxInflight,
  };
}

function parseBackendObject(
  value: BackendSpecObject,
  index: number,
  defaultApiKey: string | undefined,
  defaultMaxInflight: number,
): RouterBackendDefinition {
  const rawUrl = typeof value.baseUrl === "string" ? value.baseUrl : value.url;
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error(`COMMANDCODE_ROUTER_BACKENDS[${index}] is missing baseUrl/url`);
  }
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `backend-${index + 1}`,
    baseUrl: normalizeBackendRoot(rawUrl),
    apiKey:
      typeof value.apiKey === "string" && value.apiKey.trim() ? value.apiKey.trim() : defaultApiKey,
    weight: parseOptionalPositiveNumber(value.weight, 1),
    maxInflight: parseOptionalPositiveNumber(value.maxInflight, defaultMaxInflight),
  };
}

function parseBackends(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): RouterBackendDefinition[] {
  const defaultBackendApiKey =
    env.COMMANDCODE_ROUTER_BACKEND_API_KEY?.trim() || env.BRIDGE_API_KEY?.trim() || undefined;
  const defaultMaxInflight = parsePositiveNumber(env.COMMANDCODE_ROUTER_BACKEND_MAX_INFLIGHT, 1);
  const raw = env.COMMANDCODE_ROUTER_BACKENDS?.trim();
  if (raw) {
    if (raw.startsWith("[")) {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("COMMANDCODE_ROUTER_BACKENDS JSON value must be an array");
      }
      return parsed.map((entry, index) => {
        if (typeof entry === "string") {
          return parseBackendString(entry, index, defaultBackendApiKey, defaultMaxInflight);
        }
        if (typeof entry === "object" && entry !== null) {
          return parseBackendObject(
            entry as BackendSpecObject,
            index,
            defaultBackendApiKey,
            defaultMaxInflight,
          );
        }
        throw new Error(`COMMANDCODE_ROUTER_BACKENDS[${index}] must be a string or object`);
      });
    }
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry, index) =>
        parseBackendString(entry, index, defaultBackendApiKey, defaultMaxInflight),
      );
  }

  const fallbackRoot = env.COMMANDCODE_ROUTER_BACKEND_URL?.trim() || DEFAULT_BACKEND_ROOT;
  return [
    {
      id: env.COMMANDCODE_ROUTER_BACKEND_ID?.trim() || "local",
      baseUrl: normalizeBackendRoot(fallbackRoot),
      apiKey: defaultBackendApiKey,
      weight: 1,
      maxInflight: defaultMaxInflight,
    },
  ];
}

export function loadRouterConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): RouterConfig {
  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: parsePositiveNumber(env.PORT, 9992),
    apiKey: env.COMMANDCODE_ROUTER_API_KEY?.trim() || env.BRIDGE_API_KEY?.trim() || undefined,
    backendTimeoutMs: parsePositiveNumber(env.COMMANDCODE_ROUTER_BACKEND_TIMEOUT_MS, 300_000),
    healthTimeoutMs: parsePositiveNumber(env.COMMANDCODE_ROUTER_HEALTH_TIMEOUT_MS, 2_000),
    cooldownMs: parsePositiveNumber(env.COMMANDCODE_ROUTER_COOLDOWN_MS, 60_000),
    requestBodyLimitBytes: parsePositiveNumber(env.REQUEST_BODY_LIMIT_BYTES, 1_048_576),
    rateLimitMax: parsePositiveNumber(env.RATE_LIMIT_MAX, 60),
    rateLimitWindow: env.RATE_LIMIT_WINDOW?.trim() || "1 minute",
    logLevel: env.LOG_LEVEL?.trim() || "info",
    backends: parseBackends(env),
  };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function clientApiKey(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  const header = request.headers["x-api-key"];
  if (Array.isArray(header)) return header[0];
  return header;
}

function isAdminRequest(request: FastifyRequest): boolean {
  return request.url.startsWith("/admin/");
}

function shouldRequireAuth(request: FastifyRequest): boolean {
  return request.url.startsWith("/v1/") || isAdminRequest(request);
}

function openAIError(message: string, type: string, code: string | null = null) {
  return { error: { message, type, code } };
}

function toState(definition: RouterBackendDefinition): RouterBackendState {
  return {
    ...definition,
    inFlight: 0,
    disabledUntil: 0,
    failures: 0,
    successes: 0,
    lastSelectedAt: null,
    lastStatus: null,
    lastLatencyMs: null,
    lastError: null,
  };
}

function visibleBackend(backend: RouterBackendState, now = Date.now()) {
  return {
    id: backend.id,
    base_url: backend.baseUrl,
    weight: backend.weight,
    max_inflight: backend.maxInflight,
    in_flight: backend.inFlight,
    disabled_for_ms: Math.max(0, backend.disabledUntil - now),
    failures: backend.failures,
    successes: backend.successes,
    last_selected_at: backend.lastSelectedAt
      ? new Date(backend.lastSelectedAt).toISOString()
      : null,
    last_status: backend.lastStatus,
    last_latency_ms: backend.lastLatencyMs,
    last_error: backend.lastError,
    api_key_configured: Boolean(backend.apiKey),
  };
}

function chooseBackend(
  backends: RouterBackendState[],
  excluded: Set<string>,
  now = Date.now(),
): RouterBackendState | undefined {
  const eligible = backends.filter(
    (backend) => !excluded.has(backend.id) && backend.disabledUntil <= now,
  );
  if (eligible.length === 0) return undefined;
  const belowCap = eligible.filter((backend) => backend.inFlight < backend.maxInflight);
  const candidates = belowCap.length > 0 ? belowCap : eligible;
  return candidates.sort((left, right) => {
    const leftInflightScore = left.inFlight / Math.max(1, left.weight);
    const rightInflightScore = right.inFlight / Math.max(1, right.weight);
    if (leftInflightScore !== rightInflightScore) return leftInflightScore - rightInflightScore;
    return (left.lastSelectedAt ?? 0) - (right.lastSelectedAt ?? 0);
  })[0];
}

function createTimeoutSignal(ms: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("router backend timeout")), ms);
  timeout.unref?.();
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

function appendPath(baseUrl: string, requestUrl: string): string {
  return `${baseUrl}${requestUrl.startsWith("/") ? "" : "/"}${requestUrl}`;
}

function requestBody(method: string, body: unknown): BodyInit | undefined {
  if (["GET", "HEAD"].includes(method.toUpperCase())) return undefined;
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) {
    const arrayBuffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(arrayBuffer).set(body);
    return arrayBuffer;
  }
  return JSON.stringify(body);
}

function outboundHeaders(request: FastifyRequest, backend: RouterBackendState): Headers {
  const headers = new Headers();
  for (const [key, rawValue] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) continue;
    if (SENSITIVE_HEADER_NAMES.has(lowerKey)) continue;
    if (rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      headers.set(key, rawValue.join(", "));
    } else {
      headers.set(key, String(rawValue));
    }
  }
  if (!headers.has("content-type") && request.body !== undefined && request.body !== null) {
    headers.set("content-type", "application/json");
  }
  if (backend.apiKey) headers.set("authorization", `Bearer ${backend.apiKey}`);
  return headers;
}

function retryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function markFailure(
  backend: RouterBackendState,
  cooldownMs: number,
  status: number | null,
  error: string,
) {
  backend.failures += 1;
  backend.lastStatus = status;
  backend.lastError = error;
  backend.disabledUntil = Date.now() + cooldownMs;
}

function markSuccess(backend: RouterBackendState, status: number, latencyMs: number) {
  backend.successes += 1;
  backend.lastStatus = status;
  backend.lastLatencyMs = latencyMs;
  backend.lastError = null;
}

async function forwardResponse(
  reply: FastifyReply,
  response: Response,
  backend: RouterBackendState,
): Promise<FastifyReply> {
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) reply.header(key, value);
  });
  reply.header("x-commandcode-router-backend", backend.id);
  reply.code(response.status);
  if (!response.body) return reply.send();
  return reply.send(Readable.fromWeb(response.body as WebReadableStream<Uint8Array>));
}

async function probeBackend(
  backend: RouterBackendState,
  config: RouterConfig,
): Promise<{
  ok: boolean;
  status: number | null;
  latency_ms: number | null;
  error: string | null;
}> {
  const { signal, cleanup } = createTimeoutSignal(config.healthTimeoutMs);
  const started = Date.now();
  try {
    const init: RequestInit = {
      method: "GET",
      signal,
    };
    if (backend.apiKey) init.headers = { authorization: `Bearer ${backend.apiKey}` };
    const response = await fetch(appendPath(backend.baseUrl, "/health"), init);
    return {
      ok: response.ok,
      status: response.status,
      latency_ms: Date.now() - started,
      error: null,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: null,
      latency_ms: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cleanup();
  }
}

export async function createRouterApp(
  options: CreateRouterAppOptions = {},
): Promise<FastifyInstance> {
  const baseConfig = loadRouterConfig(options.env ?? process.env);
  const config: RouterConfig = { ...baseConfig, ...(options.config ?? {}) };
  const backends = config.backends.map(toState);

  const app = Fastify({
    logger:
      config.logLevel === "silent"
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                "req.headers.authorization",
                'req.headers["x-api-key"]',
                "req.headers.cookie",
                "headers.authorization",
                'headers["x-api-key"]',
              ],
              censor: "[REDACTED]",
            },
          },
    bodyLimit: config.requestBodyLimitBytes,
  });

  await app.register(helmet);
  await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: config.rateLimitWindow });

  app.addHook("preHandler", async (request, reply) => {
    if (isAdminRequest(request) && !config.apiKey) {
      return reply
        .code(403)
        .send(
          openAIError(
            "Admin endpoints require BRIDGE_API_KEY or COMMANDCODE_ROUTER_API_KEY to be configured",
            "configuration_error",
            "router_admin_auth_not_configured",
          ),
        );
    }
    if (!config.apiKey || !shouldRequireAuth(request)) return;
    const supplied = clientApiKey(request);
    if (!supplied || !safeEqual(supplied, config.apiKey)) {
      return reply
        .code(401)
        .send(openAIError("Unauthorized", "authentication_error", "unauthorized"));
    }
  });

  app.get("/health", async () => {
    const probes = await Promise.all(
      backends.map(async (backend) => ({
        ...visibleBackend(backend),
        health: await probeBackend(backend, config),
      })),
    );
    const healthyCount = probes.filter((backend) => backend.health.ok).length;
    return {
      status: healthyCount > 0 ? "ok" : "degraded",
      service: "commandcode-router",
      version: "0.26.7",
      external_port: config.port,
      backend_count: backends.length,
      healthy_backend_count: healthyCount,
      auth: {
        router_api_key_configured: Boolean(config.apiKey),
      },
      backends: probes,
    };
  });

  app.get("/admin/router/backends", async () => ({
    object: "commandcode.router_backends",
    generated_at: new Date().toISOString(),
    routing_policy: "least_inflight_with_cooldown",
    backend_timeout_ms: config.backendTimeoutMs,
    health_timeout_ms: config.healthTimeoutMs,
    cooldown_ms: config.cooldownMs,
    backends: backends.map((backend) => visibleBackend(backend)),
  }));

  app.all("/*", async (request, reply) => {
    const tried = new Set<string>();
    let lastError: string | null = null;
    let lastStatus: number | null = null;
    const body = requestBody(request.method, request.body);

    while (tried.size < backends.length) {
      const backend = chooseBackend(backends, tried);
      if (!backend) break;
      tried.add(backend.id);
      backend.inFlight += 1;
      backend.lastSelectedAt = Date.now();
      const started = Date.now();
      const { signal, cleanup } = createTimeoutSignal(config.backendTimeoutMs);
      try {
        const init: RequestInit = {
          method: request.method,
          headers: outboundHeaders(request, backend),
          signal,
        };
        if (body !== undefined) init.body = body;
        const response = await fetch(appendPath(backend.baseUrl, request.url), init);
        const latencyMs = Date.now() - started;
        markSuccess(backend, response.status, latencyMs);
        if (retryableStatus(response.status) && tried.size < backends.length) {
          await response.body?.cancel();
          markFailure(backend, config.cooldownMs, response.status, `HTTP ${response.status}`);
          lastStatus = response.status;
          lastError = `backend ${backend.id} returned HTTP ${response.status}`;
          request.log.warn({ backend: backend.id, status: response.status }, "Retrying backend");
          continue;
        }
        return await forwardResponse(reply, response, backend);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        markFailure(backend, config.cooldownMs, null, message);
        lastError = `backend ${backend.id} failed: ${message}`;
        request.log.warn({ backend: backend.id, err: error }, "Backend request failed");
      } finally {
        cleanup();
        backend.inFlight = Math.max(0, backend.inFlight - 1);
      }
    }

    const message = lastError ?? "No available CommandCode router backend";
    return reply.code(lastStatus && lastStatus >= 500 ? lastStatus : 503).send({
      error: {
        message,
        type: "upstream_error",
        code: "commandcode_router_no_available_backend",
      },
    });
  });

  return app;
}
