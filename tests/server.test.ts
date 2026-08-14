import { describe, expect, it } from "vitest";

import { createApp } from "../src/server.js";
import type { CommandCodeCredentialDiagnostic } from "../src/credential-router.js";
import type {
  CommandCodeEvent,
  CommandCodeGenerateBody,
  CommandCodeUpstream,
} from "../src/types.js";

class FakeCommandCodeClient implements CommandCodeUpstream {
  public seenBodies: CommandCodeGenerateBody[] = [];

  async *generate(body: CommandCodeGenerateBody): AsyncIterable<CommandCodeEvent> {
    this.seenBodies.push(body);
    yield { type: "text-delta", text: "FAKE_OK" };
    yield {
      type: "finish",
      finishReason: "stop",
      totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    };
  }
}

class FakeDiagnosticsCommandCodeClient extends FakeCommandCodeClient {
  public refreshValues: Array<boolean | undefined> = [];

  async getCredentialDiagnostics(options?: {
    refresh?: boolean;
  }): Promise<CommandCodeCredentialDiagnostic[]> {
    this.refreshValues.push(options?.refresh);
    return [
      {
        id: "alpha",
        enabled: true,
        weight: 1,
        allowedModels: ["deepseek/deepseek-v4-pro"],
        disabledUntil: null,
        disabledUntilIso: null,
        disabledForMs: 0,
        inFlight: 0,
        lastSelectedAt: null,
        lastSelectedAtIso: null,
        currentWeight: 0,
        routingScore: 2,
        billingError: undefined,
        billing: {
          fetchedAt: Date.parse("2026-05-12T00:00:00.000Z"),
          fetchedAtIso: "2026-05-12T00:00:00.000Z",
          ageMs: 0,
          stale: false,
          monthlyCredits: 4,
          freeCredits: 1,
          purchasedCredits: 2,
          currentPeriodEnd: "2026-05-14T00:00:00.000Z",
          planId: "pro",
          totalCost: 3,
          totalCount: 6,
          metrics: {
            monthlyBalance: 4,
            freeBalance: 1,
            purchasedBalance: 2,
            expiringBalance: 5,
            currentBalance: 7,
            daysRemaining: 2,
            scoringDaysRemaining: 2,
            requiredDailyBurn: 2.5,
            reserveDailyWeight: 2 / 365,
          },
        },
      },
    ];
  }
}

class ErrorEventCommandCodeClient implements CommandCodeUpstream {
  async *generate(): AsyncIterable<CommandCodeEvent> {
    yield { type: "start" };
    yield {
      type: "error",
      error: { type: "server_error", message: "Insufficient Balance", statusCode: 402 },
    };
  }
}

class StartOnlyCommandCodeClient implements CommandCodeUpstream {
  async *generate(): AsyncIterable<CommandCodeEvent> {
    yield { type: "start" };
  }
}

class EmptyLengthThenOkCommandCodeClient implements CommandCodeUpstream {
  public calls = 0;

  async *generate(): AsyncIterable<CommandCodeEvent> {
    this.calls += 1;
    if (this.calls === 1) {
      yield { type: "finish", finishReason: "length" };
      return;
    }
    yield { type: "text-delta", text: "OK" };
    yield { type: "finish", finishReason: "stop" };
  }
}

class AlwaysEmptyLengthCommandCodeClient implements CommandCodeUpstream {
  public calls = 0;

  async *generate(): AsyncIterable<CommandCodeEvent> {
    this.calls += 1;
    yield { type: "finish", finishReason: "length" };
  }
}

class ThrowingStreamCommandCodeClient implements CommandCodeUpstream {
  async *generate(): AsyncIterable<CommandCodeEvent> {
    yield { type: "start" };
    throw new Error("simulated upstream stream failure");
  }
}

class AbortAwareCommandCodeClient implements CommandCodeUpstream {
  public signalStates: boolean[] = [];

  async *generate(
    _body: CommandCodeGenerateBody,
    signal?: AbortSignal,
  ): AsyncIterable<CommandCodeEvent> {
    this.signalStates.push(signal?.aborted ?? false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    this.signalStates.push(signal?.aborted ?? false);
    yield { type: "text-delta", text: "NOT_ABORTED" };
    yield { type: "finish", finishReason: "stop" };
  }
}

function createTestApp(options: Parameters<typeof createApp>[0] = {}) {
  return createApp({
    ...options,
    configEnv: {
      COMMANDCODE_CREDENTIALS_FILE: `/tmp/commandcode-bridge-test-${process.pid}-${Math.random()}.json`,
      ...(options.configEnv ?? {}),
    },
    configAuthPaths: options.configAuthPaths ?? [],
    configOverrides: { logLevel: "silent", ...options.configOverrides },
  });
}

describe("Fastify OpenAI-compatible server", () => {
  it("serves health without leaking secrets", async () => {
    const app = await createTestApp({
      upstream: new FakeCommandCodeClient(),
      configOverrides: { bridgeApiKey: "secret_key", commandCodeApiKey: "user_secret" },
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("secret_key");
    expect(response.body).not.toContain("user_secret");
    expect(response.json().auth.bridge_api_key_configured).toBe(true);
    expect(response.json().auth.bridge_api_key_source).toBe("none");
    await app.close();
  });

  it("serves dashboard CSP without upgrading HTTP admin calls to HTTPS", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
    const response = await app.inject({ method: "GET", url: "/dashboard" });
    const csp = String(response.headers["content-security-policy"] ?? "");
    expect(response.statusCode).toBe(200);
    expect(csp).toContain("connect-src 'self' http:");
    expect(csp).not.toContain("upgrade-insecure-requests");
    await app.close();
  });

  it("requires bridge API key when configured", async () => {
    const app = await createTestApp({
      upstream: new FakeCommandCodeClient(),
      configOverrides: { bridgeApiKey: "bridge-secret" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("serves redacted credential metrics without requiring BRIDGE_API_KEY", async () => {
    const app = await createTestApp({ upstream: new FakeDiagnosticsCommandCodeClient() });
    const response = await app.inject({ method: "GET", url: "/admin/commandcode/credentials" });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("commandcode-secret");
    expect(response.json()).toMatchObject({ object: "commandcode.credential_metrics" });
    await app.close();
  });

  it("keeps credential metrics public and redacted when BRIDGE_API_KEY is configured", async () => {
    const app = await createTestApp({
      upstream: new FakeDiagnosticsCommandCodeClient(),
      configOverrides: { bridgeApiKey: "bridge-secret" },
    });
    const response = await app.inject({ method: "GET", url: "/admin/commandcode/credentials" });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("bridge-secret");
    await app.close();
  });

  it("returns authenticated credential metrics without leaking API keys", async () => {
    const fake = new FakeDiagnosticsCommandCodeClient();
    const app = await createTestApp({
      upstream: fake,
      configOverrides: {
        bridgeApiKey: "bridge-secret",
        commandCodeApiKey: "commandcode-secret",
        commandCodeCredentials: [{ id: "alpha", apiKey: "commandcode-secret", weight: 1 }],
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/admin/commandcode/credentials?refresh=true",
      headers: { authorization: "Bearer bridge-secret" },
    });
    expect(response.statusCode).toBe(200);
    expect(fake.refreshValues).toEqual([true]);
    expect(response.body).not.toContain("bridge-secret");
    expect(response.body).not.toContain("commandcode-secret");
    expect(response.json()).toMatchObject({
      object: "commandcode.credential_metrics",
      routing_policy: "daily_burn_priority",
      credential_count: 1,
      alerting: { enabled: false, webhook_configured: false },
      credentials: [
        {
          id: "alpha",
          billing: {
            metrics: {
              currentBalance: 7,
              expiringBalance: 5,
              requiredDailyBurn: 2.5,
            },
          },
        },
      ],
    });
    await app.close();
  });

  it("returns models", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
    const response = await app.inject({ method: "GET", url: "/v1/models" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((model: { id: string }) => model.id)).toContain(
      "deepseek/deepseek-v4-pro",
    );
    await app.close();
  });

  it("publishes context metadata for known models and omits it for unknown capacities", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
    const response = await app.inject({ method: "GET", url: "/v1/models" });
    const rows = response.json().data as Array<Record<string, unknown> & { id: string }>;
    const byId = new Map(rows.map((model) => [model.id, model]));
    const expectedKnownIds = [
      "deepseek/deepseek-v4-pro",
      "deepseek-v4-pro",
      "commandcode/deepseek-v4-pro",
      "default",
      "commandcode/default",
    ];

    expect(response.statusCode).toBe(200);
    for (const id of expectedKnownIds) {
      expect(byId.get(id)).toMatchObject({
        context_window: 1_000_000,
        context_length: 1_000_000,
        max_context_length: 1_000_000,
      });
    }
    const unknownCapacity = byId.get("zai-org/GLM-5.1");
    expect(unknownCapacity).not.toHaveProperty("context_window");
    expect(unknownCapacity).not.toHaveProperty("context_length");
    expect(unknownCapacity).not.toHaveProperty("max_context_length");
    for (const row of rows) expect(row).not.toHaveProperty("max_tokens");
    await app.close();
  });

  it("retrieves the same model objects for canonical, alias, and slash ids", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
    const listResponse = await app.inject({ method: "GET", url: "/v1/models" });
    const rows = listResponse.json().data as Array<Record<string, unknown> & { id: string }>;
    const byId = new Map(rows.map((model) => [model.id, model]));

    for (const id of [
      "deepseek/deepseek-v4-pro",
      "deepseek-v4-pro",
      "commandcode/deepseek-v4-pro",
      "default",
      "commandcode/default",
    ]) {
      const response = await app.inject({
        method: "GET",
        url: `/v1/models/${encodeURIComponent(id)}`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(byId.get(id));
    }

    await app.close();
  });

  it("retrieves slash model ids from the raw unencoded path", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
    const response = await app.inject({
      method: "GET",
      url: "/v1/models/deepseek/deepseek-v4-pro",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "deepseek/deepseek-v4-pro",
      object: "model",
      owned_by: "deepseek",
    });
    await app.close();
  });

  it("returns an OpenAI model_not_found error when retrieving an unknown model", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
    const response = await app.inject({ method: "GET", url: "/v1/models/not-a-model" });
    const slashUnknown = await app.inject({ method: "GET", url: "/v1/models/missing/vendor-id" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { type: "invalid_request_error", code: "model_not_found" },
    });
    expect(slashUnknown.statusCode).toBe(404);
    expect(slashUnknown.json()).toMatchObject({
      error: { type: "invalid_request_error", code: "model_not_found" },
    });
    await app.close();
  });

  it("requires bridge API key for /v1/models when configured", async () => {
    const app = await createTestApp({
      upstream: new FakeCommandCodeClient(),
      configOverrides: { bridgeApiKey: "bridge-secret" },
    });
    const unauthorized = await app.inject({ method: "GET", url: "/v1/models" });
    const authorized = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer bridge-secret" },
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(authorized.statusCode).toBe(200);
    await app.close();
  });

  it("reports model ownership from the enabled catalog instead of defaulting to deepseek", async () => {
    const app = await createTestApp({
      upstream: new FakeCommandCodeClient(),
      configOverrides: {
        defaultModel: "gpt-5.4",
        allowedModels: ["deepseek/deepseek-v4-pro", "Qwen/Qwen3.6-Plus", "gpt-5.4"],
        modelCatalog: [
          {
            id: "deepseek/deepseek-v4-pro",
            provider: "DeepSeek",
            family: "deepseek",
            enabled: true,
          },
          {
            id: "Qwen/Qwen3.6-Plus",
            provider: "Qwen",
            family: "qwen",
            aliases: ["qwen3.6-plus"],
            enabled: true,
          },
          {
            id: "gpt-5.4",
            provider: "OpenAI",
            family: "gpt",
            enabled: true,
          },
        ],
      },
    });
    const response = await app.inject({ method: "GET", url: "/v1/models" });
    const modelRows = response.json().data as Array<{ id: string; owned_by: string }>;
    const byId = new Map<string, { id: string; owned_by: string }>(
      modelRows.map((model) => [model.id, model]),
    );
    expect(byId.get("deepseek/deepseek-v4-pro")?.owned_by).toBe("deepseek");
    expect(byId.get("Qwen/Qwen3.6-Plus")?.owned_by).toBe("qwen");
    expect(byId.get("qwen3.6-plus")?.owned_by).toBe("qwen");
    expect(byId.get("default")?.owned_by).toBe("openai");
    expect(byId.get("commandcode/default")?.owned_by).toBe("commandcode");
    const defaultResponse = await app.inject({ method: "GET", url: "/v1/models/default" });
    expect(defaultResponse.json()).toMatchObject({ id: "default", owned_by: "openai" });
    await app.close();
  });

  it("returns non-streaming OpenAI chat completions", async () => {
    const fake = new FakeCommandCodeClient();
    const app = await createTestApp({ upstream: fake });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("FAKE_OK");
    expect(fake.seenBodies[0]?.params.model).toBe("deepseek/deepseek-v4-pro");
    expect(fake.seenBodies[0]?.params.stream).toBe(true);
    await app.close();
  });

  it("accepts developer role messages from OpenAI-compatible clients", async () => {
    const fake = new FakeCommandCodeClient();
    const app = await createTestApp({ upstream: fake });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "default",
        messages: [
          { role: "developer", content: "Follow bridge policy." },
          { role: "user", content: "hi" },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(fake.seenBodies[0]?.params.system).toContain("Follow bridge policy.");
    expect(fake.seenBodies[0]?.params.messages.map((message) => message.role)).toEqual(["user"]);
    await app.close();
  });

  it("normalizes follow-up OpenAI tool history before forwarding upstream", async () => {
    const fake = new FakeCommandCodeClient();
    const app = await createTestApp({ upstream: fake });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "default",
        tools: [
          {
            type: "function",
            function: { name: "get_weather", parameters: { type: "object", properties: {} } },
          },
        ],
        tool_choice: "auto",
        messages: [
          { role: "user", content: "weather?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_weather",
                type: "function",
                function: { name: "get_weather", arguments: '{"city":"Seoul"}' },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_weather", content: "12C" },
          { role: "user", content: "summarize" },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(fake.seenBodies[0]?.params.tools).toHaveLength(1);
    expect(fake.seenBodies[0]?.params.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "user",
    ]);
    const serializedMessages = JSON.stringify(fake.seenBodies[0]?.params.messages);
    expect(serializedMessages).not.toContain("Assistant requested tool calls");
    expect(serializedMessages).not.toContain("Tool result for");
    expect(serializedMessages).not.toContain("tool_calls");
    expect(serializedMessages).not.toContain("tool_call_id");
    expect(serializedMessages).toContain('"role":"tool"');
    expect(serializedMessages).toContain("call_weather");
    expect(serializedMessages).toContain("tool-call");
    expect(serializedMessages).toContain("tool-result");
    expect(serializedMessages).toContain("get_weather");
    expect(serializedMessages).toContain("Seoul");
    expect(serializedMessages).toContain("12C");
    expect(fake.seenBodies[0]?.params.system).not.toMatch(/internal bridge context/i);
    await app.close();
  });

  it("rejects malformed assistant tool_calls with an OpenAI-style validation error", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "default",
        messages: [
          { role: "user", content: "weather?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "call_weather", type: "function" }],
          },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_request");
    await app.close();
  });

  it("honors tool_choice none by not forwarding tools upstream", async () => {
    const fake = new FakeCommandCodeClient();
    const app = await createTestApp({ upstream: fake });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "default",
        tool_choice: "none",
        tools: [
          {
            type: "function",
            function: { name: "get_weather", parameters: { type: "object", properties: {} } },
          },
        ],
        messages: [{ role: "user", content: "hi" }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(fake.seenBodies[0]?.params.tools).toEqual([]);
    await app.close();
  });

  it("treats forced tool_choice as auto and still forwards tools upstream", async () => {
    const fake = new FakeCommandCodeClient();
    const app = await createTestApp({ upstream: fake });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "default",
        tool_choice: { type: "function", function: { name: "get_weather" } },
        tools: [
          {
            type: "function",
            function: { name: "get_weather", parameters: { type: "object", properties: {} } },
          },
        ],
        messages: [{ role: "user", content: "hi" }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(fake.seenBodies[0]?.params.tools).toEqual([
      {
        type: "function",
        name: "get_weather",
        input_schema: { type: "object", properties: {} },
      },
    ]);
    await app.close();
  });

  it("returns OpenAI streaming chunks", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", stream: true, messages: [{ role: "user", content: "hi" }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("data: [DONE]");
    await app.close();
  });

  it("does not abort upstream generation when a normal request body closes", async () => {
    const fake = new AbortAwareCommandCodeClient();
    const app = await createTestApp({ upstream: fake });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("NOT_ABORTED");
    expect(fake.signalStates).toEqual([false, false]);
    await app.close();
  });

  it("maps upstream stream error events to non-streaming OpenAI-style 502 errors", async () => {
    const app = await createTestApp({ upstream: new ErrorEventCommandCodeClient() });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("commandcode_event_error");
    expect(response.json().error.upstream_status).toBe(402);
    expect(response.body).toContain("Insufficient Balance");
    await app.close();
  });

  it("fails closed instead of returning empty non-streaming success for start-only upstream streams", async () => {
    const app = await createTestApp({ upstream: new StartOnlyCommandCodeClient() });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("commandcode_empty_response");
    await app.close();
  });

  it("maps streaming upstream exceptions to SSE error frames instead of resetting the stream", async () => {
    const app = await createTestApp({ upstream: new ThrowingStreamCommandCodeClient() });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", stream: true, messages: [{ role: "user", content: "hi" }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain('"code":"commandcode_stream_error"');
    expect(response.body).toContain("data: [DONE]");
    await app.close();
  });

  it("retries a non-streaming empty visible length response once by default", async () => {
    const upstream = new EmptyLengthThenOkCommandCodeClient();
    const app = await createTestApp({
      upstream,
      configOverrides: { emptyVisibleRetryBackoffMs: 0 },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "default",
        max_tokens: 16,
        messages: [{ role: "user", content: "Return exactly OK." }],
      },
    });
    expect(upstream.calls).toBe(2);
    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0]?.message.content).toBe("OK");
    await app.close();
  });

  it("still fails closed when empty visible retries are exhausted", async () => {
    const upstream = new AlwaysEmptyLengthCommandCodeClient();
    const app = await createTestApp({
      upstream,
      configOverrides: { emptyVisibleRetryMaxAttempts: 1, emptyVisibleRetryBackoffMs: 0 },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "default",
        max_tokens: 16,
        messages: [{ role: "user", content: "Return exactly OK." }],
      },
    });
    expect(upstream.calls).toBe(2);
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("commandcode_empty_visible_response");
    await app.close();
  });

  it("reports env as the runtime bridge API key source", async () => {
    const app = await createTestApp({
      upstream: new FakeCommandCodeClient(),
      configEnv: { BRIDGE_API_KEY: "env-source-key" },
    });
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.json().auth.bridge_api_key_source).toBe("env");
    const config = await app.inject({ method: "GET", url: "/admin/config" });
    expect(config.json().bridgeApiKeySource).toBe("env");
    await app.close();
  });

  it("returns JSON guidance for Ollama-style compatibility probes", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
    const response = await app.inject({ method: "GET", url: "/api/tags" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
    expect(response.json().error.message).toMatch(/\/v1/);
    await app.close();
  });
});
