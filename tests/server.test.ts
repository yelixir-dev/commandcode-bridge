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

class ThrowingStreamCommandCodeClient implements CommandCodeUpstream {
  async *generate(): AsyncIterable<CommandCodeEvent> {
    yield { type: "start" };
    throw new Error("simulated upstream stream failure");
  }
}

function createTestApp(options: Parameters<typeof createApp>[0] = {}) {
  return createApp({
    ...options,
    configEnv: options.configEnv ?? {},
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

  it("keeps admin credential metrics closed unless BRIDGE_API_KEY is configured", async () => {
    const app = await createTestApp({ upstream: new FakeDiagnosticsCommandCodeClient() });
    const response = await app.inject({ method: "GET", url: "/admin/commandcode/credentials" });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("admin_auth_not_configured");
    await app.close();
  });

  it("requires authentication for admin credential metrics when BRIDGE_API_KEY is configured", async () => {
    const app = await createTestApp({
      upstream: new FakeDiagnosticsCommandCodeClient(),
      configOverrides: { bridgeApiKey: "bridge-secret" },
    });
    const response = await app.inject({ method: "GET", url: "/admin/commandcode/credentials" });
    expect(response.statusCode).toBe(401);
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
      routing_policy: "depletion_aware",
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
      "user",
      "user",
    ]);
    expect(JSON.stringify(fake.seenBodies[0]?.params.messages)).not.toContain('"role":"tool"');
    expect(JSON.stringify(fake.seenBodies[0]?.params.messages)).not.toContain("tool_calls");
    expect(fake.seenBodies[0]?.params.messages[1]?.content[0]?.text).toContain(
      "Assistant requested tool calls",
    );
    expect(fake.seenBodies[0]?.params.messages[2]?.content[0]?.text).toContain(
      "Tool result for call_weather",
    );
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

  it("rejects unsupported forced tool_choice values instead of silently ignoring them", async () => {
    const app = await createTestApp({ upstream: new FakeCommandCodeClient() });
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
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("unsupported_tool_choice");
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
});
