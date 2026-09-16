import Fastify from "fastify";
import { describe, expect, it, onTestFinished } from "vitest";

import { CommandCodeProviderClient } from "../src/provider.js";
import { handleProviderChat } from "../src/provider-chat.js";
import type { BridgeConfig, OpenAIChatCompletionRequest } from "../src/types.js";

function completion(message: Record<string, unknown>, finishReason: string | null = "length") {
  return {
    id: "chatcmpl_fixture",
    object: "chat.completion",
    model: "upstream-model",
    choices: [
      { index: 0, message: { role: "assistant", ...message }, finish_reason: finishReason },
    ],
  };
}

async function fixture(
  responses: readonly [ReturnType<typeof completion>, ...ReturnType<typeof completion>[]],
  overrides: Partial<BridgeConfig>,
) {
  const upstream = Fastify();
  const app = Fastify();
  onTestFinished(async () => {
    await app.close();
    await upstream.close();
  });
  let calls = 0;
  upstream.get("/alpha/whoami", async () => ({ org: { id: "fixture-org" } }));
  upstream.get("/alpha/billing/credits", async () => ({ credits: { purchasedCredits: 10 } }));
  upstream.get("/alpha/billing/subscriptions", async () => ({ data: {} }));
  upstream.get("/alpha/usage/summary", async () => ({ totalCost: 0, totalCount: 0 }));
  upstream.post("/provider/v1/chat/completions", async () => {
    const response = responses[calls] ?? responses.at(-1);
    calls += 1;
    return response;
  });
  const apiBase = await upstream.listen({ host: "127.0.0.1", port: 0 });
  const config: BridgeConfig = {
    host: "127.0.0.1",
    port: 0,
    apiBase,
    cliVersion: "fixture",
    upstreamMode: "provider",
    zdr: false,
    defaultModel: "public-model",
    allowedModels: ["public-model"],
    allowUnknownModels: false,
    bridgeApiKey: undefined,
    bridgeApiKeySource: "none",
    commandCodeApiKey: "fixture-key",
    commandCodeCredentials: [{ id: "fixture", apiKey: "fixture-key", weight: 1 }],
    commandCodeRoutingPolicy: "round_robin",
    commandCodeBillingRefreshMs: 60_000,
    commandCodeBillingTimeoutMs: 1_000,
    commandCodeCredentialCooldownMs: 0,
    commandCodeRetryMaxAttempts: 1,
    commandCodeRetryBackoffMs: 0,
    requestBodyLimitBytes: 1_048_576,
    rateLimitMax: 60,
    rateLimitWindow: "1 minute",
    logLevel: "silent",
    corsOrigin: undefined,
    includeReasoning: false,
    emptyVisibleResponsePolicy: "error_on_length",
    emptyVisibleRetryMaxAttempts: 2,
    emptyVisibleRetryBackoffMs: 0,
    balanceAlerts: {
      enabled: false,
      minCurrentBalance: 0,
      minExpiringBalance: 0,
      maxRequiredDailyBurn: 0,
      intervalMs: 60_000,
      repeatMs: 60_000,
      webhookUrl: undefined,
      webhookBearer: undefined,
    },
    timeoutMs: 1_000,
    ...overrides,
  };
  const providerClient = new CommandCodeProviderClient(config);
  app.post<{ Body: OpenAIChatCompletionRequest }>(
    "/v1/chat/completions",
    async (request, reply) => {
      await handleProviderChat({
        reply,
        httpRequest: request,
        request: request.body,
        providerClient,
        resolvedModel: {
          requestedModel: "public-model",
          publicModel: "public-model",
          upstreamModel: "upstream-model",
        },
        signal: AbortSignal.timeout(2_000),
        config,
      });
      return reply;
    },
  );
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  return {
    calls: () => calls,
    chat: () =>
      fetch(`${url}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "public-model",
          messages: [{ role: "user", content: "hi" }],
          stream: false,
          max_tokens: 8,
        }),
        signal: AbortSignal.timeout(3_000),
      }),
  };
}

const reasoningOnly = { content: "", reasoning_content: "THINK" };
const toolCalls = [{ id: "call_1", type: "function", function: { name: "f", arguments: "{}" } }];

describe("Provider non-streaming visibility", () => {
  it.each([0, 2])("returns 502 when hidden reasoning exhausts %i retries", async (retries) => {
    const upstream = await fixture([completion(reasoningOnly)], {
      emptyVisibleRetryMaxAttempts: retries,
    });

    const response = await upstream.chat();

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { code: "commandcode_empty_visible_response", upstream_status: 502 },
    });
    expect(upstream.calls()).toBe(retries + 1);
  });

  it("returns the first reasoning-only response without retry when reasoning is exposed", async () => {
    const upstream = await fixture(
      [completion(reasoningOnly), completion({ content: "RETRIED" })],
      { includeReasoning: true },
    );

    const response = await upstream.chat();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...completion(reasoningOnly), model: "public-model" });
    expect(upstream.calls()).toBe(1);
  });

  it.each([
    { includeReasoning: false, content: "ANSWER", tool_calls: [] },
    { includeReasoning: true, content: "ANSWER", tool_calls: [] },
    { includeReasoning: false, content: "", tool_calls: toolCalls },
    { includeReasoning: true, content: "", tool_calls: toolCalls },
  ])(
    "preserves visible output without retries for %j",
    async ({ includeReasoning, ...message }) => {
      const upstream = await fixture([completion({ ...message, reasoning_content: "THINK" })], {
        includeReasoning,
      });

      const response = await upstream.chat();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ...completion({ ...message, ...(includeReasoning ? { reasoning_content: "THINK" } : {}) }),
        model: "public-model",
      });
      expect(upstream.calls()).toBe(1);
    },
  );

  it.each([false, true])(
    "retries empty length responses with includeReasoning=%s",
    async (includeReasoning) => {
      const upstream = await fixture(
        [
          completion({ content: null, reasoning_content: "", tool_calls: [] }),
          completion({ content: "RECOVERED" }, "stop"),
        ],
        { includeReasoning },
      );

      const response = await upstream.chat();

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        choices: [{ message: { content: "RECOVERED" } }],
      });
      expect(upstream.calls()).toBe(2);
    },
  );

  it.each([false, true])(
    "returns 502 after empty length retries with includeReasoning=%s",
    async (includeReasoning) => {
      const upstream = await fixture([completion({})], { includeReasoning });

      const response = await upstream.chat();

      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        error: { code: "commandcode_empty_visible_response" },
      });
      expect(upstream.calls()).toBe(3);
    },
  );

  it.each(["stop", "tool_calls", null])(
    "does not retry empty responses when finish_reason=%s",
    async (finishReason) => {
      const upstream = await fixture([completion(reasoningOnly, finishReason)], {});

      const response = await upstream.chat();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ...completion({ content: "" }, finishReason),
        model: "public-model",
      });
      expect(upstream.calls()).toBe(1);
    },
  );

  it("allows stripped reasoning without retries when the empty policy is allow", async () => {
    const upstream = await fixture([completion(reasoningOnly)], {
      emptyVisibleResponsePolicy: "allow",
    });

    const response = await upstream.chat();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...completion({ content: "" }),
      model: "public-model",
    });
    expect(upstream.calls()).toBe(1);
  });
});
