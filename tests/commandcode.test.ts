import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CommandCodeBillingClient,
  CommandCodeClient,
  CommandCodeHttpError,
  parseCommandCodeEventLine,
  parseCommandCodeStream,
} from "../src/commandcode.js";
import type { BridgeConfig, CommandCodeEvent, CommandCodeGenerateBody } from "../src/types.js";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const baseConfig: BridgeConfig = {
  host: "127.0.0.1",
  port: 9992,
  apiBase: "https://api.commandcode.ai",
  cliVersion: "0.32.3",
  defaultModel: "deepseek/deepseek-v4-pro",
  allowedModels: ["deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash"],
  allowUnknownModels: false,
  bridgeApiKey: undefined,
  commandCodeApiKey: "alpha-secret",
  commandCodeCredentials: [
    { id: "alpha", apiKey: "alpha-secret", weight: 1 },
    { id: "beta", apiKey: "beta-secret", weight: 1 },
  ],
  commandCodeRoutingPolicy: "round_robin",
  commandCodeBillingRefreshMs: 60_000,
  commandCodeBillingTimeoutMs: 10_000,
  commandCodeCredentialCooldownMs: 60_000,
  requestBodyLimitBytes: 1_048_576,
  rateLimitMax: 60,
  rateLimitWindow: "1 minute",
  logLevel: "silent",
  corsOrigin: undefined,
  includeReasoning: false,
  emptyVisibleResponsePolicy: "error_on_length",
  balanceAlerts: {
    enabled: false,
    minCurrentBalance: 1,
    minExpiringBalance: 0,
    maxRequiredDailyBurn: 0,
    intervalMs: 60_000,
    repeatMs: 3_600_000,
    webhookUrl: undefined,
    webhookBearer: undefined,
  },
  timeoutMs: 300_000,
};

const generateBody: CommandCodeGenerateBody = {
  config: {
    workingDir: "/tmp/workspace",
    date: "2026-05-12",
    environment: "test",
    structure: [],
    isGitRepo: false,
    currentBranch: "main",
    mainBranch: "main",
    gitStatus: "",
    recentCommits: [],
  },
  memory: "",
  taste: "",
  skills: null,
  permissionMode: "standard",
  params: {
    model: "deepseek/deepseek-v4-pro",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    tools: [],
    system: "",
    stream: true,
  },
  threadId: "thread-test",
};

async function collectEvents(events: AsyncIterable<CommandCodeEvent>): Promise<CommandCodeEvent[]> {
  const collected: CommandCodeEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function billingResponse(url: string): Response | undefined {
  if (url.includes("/alpha/whoami")) return Response.json({ org: { id: "org_test" } });
  if (url.includes("/alpha/billing/credits")) {
    return Response.json({
      credits: { monthlyCredits: 10, purchasedCredits: 0, freeCredits: 0 },
    });
  }
  if (url.includes("/alpha/billing/subscriptions")) {
    return Response.json({
      data: {
        currentPeriodStart: "2026-05-01T00:00:00.000Z",
        currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      },
    });
  }
  if (url.includes("/alpha/usage/summary")) return Response.json({ totalCost: 0, totalCount: 0 });
  return undefined;
}

function postCalls(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchMock.mock.calls.filter(
    (call) => (call[1] as RequestInit | undefined)?.method === "POST",
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommandCode stream parsing", () => {
  it("parses raw JSON lines and SSE data lines", () => {
    expect(parseCommandCodeEventLine('{"type":"text-delta","text":"x"}')).toEqual({
      type: "text-delta",
      text: "x",
    });
    expect(parseCommandCodeEventLine('data: {"type":"finish","finishReason":"stop"}')).toEqual({
      type: "finish",
      finishReason: "stop",
    });
  });

  it("ignores comments, labels, done markers, and malformed lines", () => {
    expect(parseCommandCodeEventLine(":")).toBeUndefined();
    expect(parseCommandCodeEventLine("event: message")).toBeUndefined();
    expect(parseCommandCodeEventLine("data: [DONE]")).toBeUndefined();
    expect(parseCommandCodeEventLine("not-json")).toBeUndefined();
  });

  it("parses chunk boundaries safely", async () => {
    const events = [];
    for await (const event of parseCommandCodeStream(
      streamFromChunks([
        '{"type":"text-delta",',
        '"text":"hel"}\n{"type":"finish","finishReason":"stop"}\n',
      ]),
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: "text-delta", text: "hel" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("parses structured upstream error events", () => {
    expect(
      parseCommandCodeEventLine(
        '{"type":"error","error":{"type":"server_error","message":"Insufficient Balance","statusCode":402}}',
      ),
    ).toEqual({
      type: "error",
      error: { type: "server_error", message: "Insufficient Balance", statusCode: 402 },
    });
  });

  it("keeps structured upstream HTTP error data", () => {
    const error = new CommandCodeHttpError(400, "Bad Request", { error: { message: "bad" } });
    expect(error.status).toBe(400);
    expect(error.message).toContain("Bad Request");
    expect(error.body).toEqual({ error: { message: "bad" } });
  });
});

describe("CommandCode client credential routing", () => {
  it("queries billing endpoints and maps a depletion snapshot", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ org: { id: "org_123" } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credits: { monthlyCredits: 12, purchasedCredits: 3, freeCredits: 1, planId: "pro" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              currentPeriodStart: "2026-05-01T00:00:00.000Z",
              currentPeriodEnd: "2026-06-01T00:00:00.000Z",
              planId: "pro-plan",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ totalCost: 4.5, totalCount: 9 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const billingClient = new CommandCodeBillingClient(baseConfig);
    const snapshot = await billingClient.getSnapshot({
      id: "alpha",
      apiKey: "alpha-secret",
      weight: 1,
    });

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://api.commandcode.ai/alpha/whoami",
      "https://api.commandcode.ai/alpha/billing/credits?orgId=org_123",
      "https://api.commandcode.ai/alpha/billing/subscriptions?orgId=org_123",
      "https://api.commandcode.ai/alpha/usage/summary?orgId=org_123&since=2026-05-01T00%3A00%3A00.000Z",
    ]);
    expect(snapshot).toMatchObject({
      monthlyCredits: 12,
      purchasedCredits: 3,
      freeCredits: 1,
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      planId: "pro-plan",
      totalCost: 4.5,
      totalCount: 9,
    });
  });

  it("uses configured credential pool instead of one fixed API key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const billing = billingResponse(url);
      if (billing) return billing;
      return new Response(
        'data: {"type":"text-delta","text":"ok"}\ndata: {"type":"finish","finishReason":"stop"}\n',
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new CommandCodeClient(baseConfig);
    await collectEvents(client.generate(generateBody));
    await collectEvents(client.generate(generateBody));

    const posts = postCalls(fetchMock);
    expect(posts).toHaveLength(2);
    expect((posts[0]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer alpha-secret",
    });
    expect((posts[1]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer beta-secret",
    });
  });

  it("fails over to another credential when an upstream stream error marks the first key depleted", async () => {
    const postResponses = [
      new Response(
        'data: {"type":"error","error":{"message":"Insufficient Balance","statusCode":402}}\n',
        { status: 200 },
      ),
      new Response(
        'data: {"type":"text-delta","text":"ok"}\ndata: {"type":"finish","finishReason":"stop"}\n',
        { status: 200 },
      ),
    ];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const billing = billingResponse(String(input));
      if (billing) return billing;
      if (init?.method === "POST") return postResponses.shift()!;
      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new CommandCodeClient(baseConfig);
    const events = await collectEvents(client.generate(generateBody));

    const posts = postCalls(fetchMock);
    expect(posts).toHaveLength(2);
    expect((posts[0]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer alpha-secret",
    });
    expect((posts[1]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer beta-secret",
    });
    expect(events).toContainEqual(expect.objectContaining({ type: "text-delta", text: "ok" }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: "error" }));
  });

  it("does not retry the same credential after an opaque retryable stream error", async () => {
    const postResponses = [
      new Response('data: {"type":"error","message":"temporary upstream error"}\n', {
        status: 200,
      }),
      new Response(
        'data: {"type":"text-delta","text":"ok"}\ndata: {"type":"finish","finishReason":"stop"}\n',
        { status: 200 },
      ),
    ];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const billing = billingResponse(String(input));
      if (billing) return billing;
      if (init?.method === "POST") return postResponses.shift()!;
      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new CommandCodeClient({
      ...baseConfig,
      commandCodeCredentials: [
        { id: "alpha", apiKey: "alpha-secret", weight: 100 },
        { id: "beta", apiKey: "beta-secret", weight: 1 },
      ],
    });
    const events = await collectEvents(client.generate(generateBody));

    const posts = postCalls(fetchMock);
    expect(posts).toHaveLength(2);
    expect((posts[0]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer alpha-secret",
    });
    expect((posts[1]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer beta-secret",
    });
    expect(events).toContainEqual(expect.objectContaining({ type: "text-delta", text: "ok" }));
  });
});
