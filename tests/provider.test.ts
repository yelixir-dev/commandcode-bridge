import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandCodeAuthError } from "../src/commandcode.js";
import {
  fetchProviderModelCatalog,
  mergeProviderModelCatalog,
  providerModelsFromCatalog,
} from "../src/model-catalog.js";
import {
  buildProviderChatRequestBody,
  CommandCodeProviderClient,
  CommandCodeProviderSseTransform,
  probeProviderAccess,
  type CommandCodeProviderSseTransformOptions,
} from "../src/provider.js";
import { createApp } from "../src/server.js";
import type { BridgeConfig, CommandCodeCredential, CommandCodeModelConfig } from "../src/types.js";

function providerConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    host: "127.0.0.1",
    port: 9992,
    apiBase: "https://api.commandcode.ai",
    cliVersion: "1.14.0",
    upstreamMode: "provider",
    zdr: false,
    defaultModel: "deepseek/deepseek-v4-pro",
    allowedModels: ["deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash"],
    allowUnknownModels: false,
    bridgeApiKey: undefined,
    bridgeApiKeySource: "none",
    commandCodeApiKey: "provider-secret",
    commandCodeCredentials: [{ id: "alpha", apiKey: "provider-secret", weight: 1 }],
    commandCodeRoutingPolicy: "round_robin",
    commandCodeBillingRefreshMs: 60_000,
    commandCodeBillingTimeoutMs: 10_000,
    commandCodeCredentialCooldownMs: 60_000,
    commandCodeRetryMaxAttempts: 5,
    commandCodeRetryBackoffMs: 1,
    requestBodyLimitBytes: 1_048_576,
    rateLimitMax: 60,
    rateLimitWindow: "1 minute",
    logLevel: "silent",
    corsOrigin: undefined,
    includeReasoning: false,
    emptyVisibleResponsePolicy: "error_on_length",
    emptyVisibleRetryMaxAttempts: 1,
    emptyVisibleRetryBackoffMs: 250,
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
    ...overrides,
  };
}

function billingResponse(url: string): Response | undefined {
  if (url.includes("/alpha/whoami")) return Response.json({ org: { id: "org_test" } });
  if (url.includes("/alpha/billing/credits")) {
    return Response.json({ credits: { monthlyCredits: 10, purchasedCredits: 0, freeCredits: 0 } });
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

async function transformSse(
  input: string,
  options: CommandCodeProviderSseTransformOptions,
): Promise<string> {
  const transform = new CommandCodeProviderSseTransform(options);
  Readable.from([input]).pipe(transform);
  const chunks: Buffer[] = [];
  for await (const chunk of transform) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider model catalog", () => {
  it("parses the live provider catalog shape", () => {
    const models = providerModelsFromCatalog({
      data: [
        {
          id: "claude-sonnet-5",
          name: "Claude Sonnet 5",
          context_length: 1_000_000,
          owned_by: "command-code",
        },
        { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", context_length: 128_000 },
        { id: "deepseek/deepseek-v4-flash", name: "duplicate" },
        { id: "", name: "invalid" },
      ],
    });

    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({
      id: "claude-sonnet-5",
      label: "Claude Sonnet 5",
      contextWindow: 1_000_000,
      provider: "command-code",
      enabled: false,
    });
    expect(models[1]).toMatchObject({ id: "deepseek/deepseek-v4-flash", contextWindow: 128_000 });
  });

  it("rejects malformed and empty catalogs", () => {
    expect(() => providerModelsFromCatalog({})).toThrow(/data array/);
    expect(() => providerModelsFromCatalog({ data: [{ name: "missing id" }] })).toThrow(
      /no usable models/,
    );
  });

  it("fetches the live catalog from the provider models endpoint without auth", async () => {
    let requestUrl = "";
    const models = await fetchProviderModelCatalog("https://api.commandcode.ai", {
      fetchImpl: async (input) => {
        requestUrl = String(input);
        return Response.json({
          data: [{ id: "gpt-5.4", name: "GPT-5.4", context_length: 400_000 }],
        });
      },
    });

    expect(requestUrl).toBe("https://api.commandcode.ai/provider/v1/models");
    expect(models[0]?.id).toBe("gpt-5.4");
  });

  it("throws on non-ok catalog responses", async () => {
    await expect(
      fetchProviderModelCatalog("https://api.commandcode.ai", {
        fetchImpl: async () => new Response("nope", { status: 500 }),
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("merges live context windows over static and appends live-only models", () => {
    const base: CommandCodeModelConfig[] = [
      { id: "deepseek/deepseek-v4-pro", enabled: true, contextWindow: 1_000_000 },
      { id: "gpt-5.5", enabled: false },
      { id: "retired/old", enabled: false, contextWindow: 1_000 },
    ];
    const live: CommandCodeModelConfig[] = [
      {
        id: "deepseek/deepseek-v4-pro",
        enabled: false,
        contextWindow: 1_000_000,
        label: "DeepSeek V4 Pro",
      },
      { id: "brand-new/model", enabled: false, contextWindow: 200_000, label: "Brand New" },
    ];

    const merged = mergeProviderModelCatalog(base, live, ["brand-new/model"]);

    expect(merged.find((model) => model.id === "deepseek/deepseek-v4-pro")).toMatchObject({
      enabled: true,
      contextWindow: 1_000_000,
      label: "DeepSeek V4 Pro",
    });
    expect(merged.find((model) => model.id === "gpt-5.5")?.contextWindow).toBeUndefined();
    expect(merged.find((model) => model.id === "retired/old")).toMatchObject({
      contextWindow: 1_000,
    });
    expect(merged.find((model) => model.id === "brand-new/model")).toMatchObject({
      enabled: true,
      contextWindow: 200_000,
    });
    expect(merged).toHaveLength(4);
  });
});

describe("provider chat request shaping", () => {
  it("passes through OpenAI fields with the resolved model", () => {
    const body = buildProviderChatRequestBody(
      {
        model: "default",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "f", parameters: {} } }],
        tool_choice: { type: "function", function: { name: "f" } },
        response_format: { type: "json_object" },
        stream: true,
        max_tokens: 10,
      },
      "deepseek/deepseek-v4-pro",
    );

    expect(body.model).toBe("deepseek/deepseek-v4-pro");
    expect(body.messages).toHaveLength(1);
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "f" } });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(10);
  });
});

describe("provider SSE transform", () => {
  it("rewrites the public model id and folds reasoning deltas into content", async () => {
    const out = await transformSse(
      [
        'data: {"id":"x","model":"deepseek/deepseek-v4-pro","choices":[{"delta":{"content":"h"}}]}',
        "",
        "",
        'data: {"id":"x","model":"deepseek/deepseek-v4-pro","choices":[{"delta":{"reasoning_content":"think "}}]}',
        "",
        "",
        'data: {"id":"x","model":"deepseek/deepseek-v4-pro","choices":[{"delta":{"content":"i"}}]}',
        "",
        "",
        "data: [DONE]",
        "",
        "",
      ].join("\n"),
      { publicModel: "deepseek-v4-pro", includeReasoning: true },
    );

    expect(out).toContain('"model":"deepseek-v4-pro"');
    expect(out).toContain('"content":"h"');
    expect(out).toContain('"content":"think "');
    expect(out).toContain('"content":"i"');
    expect(out).toContain("data: [DONE]");
    expect(out).not.toContain("reasoning_content");
    expect(out).not.toContain('"model":"deepseek/deepseek-v4-pro"');
  });

  it("leaves reasoning deltas untouched when includeReasoning is disabled", async () => {
    const out = await transformSse(
      'data: {"model":"m","choices":[{"delta":{"reasoning_content":"think"}}]}\n\ndata: [DONE]\n\n',
      { publicModel: "p", includeReasoning: false },
    );
    expect(out).toContain('"reasoning_content":"think"');
    expect(out).toContain('"model":"p"');
  });

  it("passes through non-JSON and error frames", async () => {
    const out = await transformSse(
      ': keepalive\ndata: {"error":{"message":"boom"}}\n\ndata: [DONE]\n\n',
      { publicModel: "p", includeReasoning: false },
    );
    expect(out).toContain(": keepalive");
    expect(out).toContain('"error"');
    expect(out).toContain("data: [DONE]");
  });
});

describe("provider chat client", () => {
  it("posts to the official provider API with Bearer auth and no CLI headers", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const billing = billingResponse(url);
      if (billing) return billing;
      return Response.json(
        {
          id: "chatcmpl_1",
          object: "chat.completion",
          model: "deepseek/deepseek-v4-pro",
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new CommandCodeProviderClient(providerConfig());
    const response = await client.chat(
      buildProviderChatRequestBody(
        { model: "default", messages: [{ role: "user", content: "hi" }] },
        "deepseek/deepseek-v4-pro",
      ),
    );

    expect(response.ok).toBe(true);
    const post = postCalls(fetchMock)[0];
    expect(String(post?.[0])).toBe("https://api.commandcode.ai/provider/v1/chat/completions");
    const headers = (post?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer provider-secret");
    expect(headers).not.toHaveProperty("User-Agent");
    expect(headers).not.toHaveProperty("x-command-code-version");
    expect(headers).not.toHaveProperty("x-cli-environment");
    const body = JSON.parse((post?.[1] as RequestInit).body as string) as {
      model: string;
      messages: unknown[];
    };
    expect(body.model).toBe("deepseek/deepseek-v4-pro");
    expect(body.messages).toHaveLength(1);
  });

  it("sends x-cmd-zdr when zero data retention is enabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const billing = billingResponse(String(input));
      if (billing) return billing;
      return Response.json({ id: "chatcmpl_1", choices: [] }, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new CommandCodeProviderClient(providerConfig({ zdr: true }));
    await client.chat(
      buildProviderChatRequestBody(
        { model: "default", messages: [{ role: "user", content: "hi" }] },
        "deepseek/deepseek-v4-pro",
      ),
    );

    const post = postCalls(fetchMock)[0];
    expect((post?.[1] as RequestInit).headers).toMatchObject({ "x-cmd-zdr": "1" });
  });

  it("fails over to another credential on retryable provider status", async () => {
    let postCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const billing = billingResponse(String(input));
      if (billing) return billing;
      postCount += 1;
      if (postCount === 1) {
        return Response.json(
          { error: { message: "rate limited", type: "rate_limit_error" } },
          { status: 429 },
        );
      }
      return Response.json({ id: "chatcmpl_2", choices: [] }, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new CommandCodeProviderClient(
      providerConfig({
        commandCodeCredentials: [
          { id: "alpha", apiKey: "a-secret", weight: 1 },
          { id: "beta", apiKey: "b-secret", weight: 1 },
        ],
      }),
    );
    const response = await client.chat(
      buildProviderChatRequestBody(
        { model: "default", messages: [{ role: "user", content: "hi" }] },
        "deepseek/deepseek-v4-pro",
      ),
    );

    expect(response.ok).toBe(true);
    expect(postCount).toBe(2);
    const posts = postCalls(fetchMock);
    expect((posts[0]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer a-secret",
    });
    expect((posts[1]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer b-secret",
    });
  });

  it("throws the upstream status after exhausting credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const billing = billingResponse(String(input));
      if (billing) return billing;
      return Response.json(
        { error: { message: "upgrade required", type: "authentication_error" } },
        { status: 403 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new CommandCodeProviderClient(providerConfig());
    await expect(
      client.chat(
        buildProviderChatRequestBody(
          { model: "default", messages: [{ role: "user", content: "hi" }] },
          "deepseek/deepseek-v4-pro",
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("retries a transient provider failure up to the configured budget", async () => {
    let postCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const billing = billingResponse(String(input));
      if (billing) return billing;
      postCount += 1;
      return Response.json(
        { error: { message: "rate limited", type: "rate_limit_error" } },
        { status: 429 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new CommandCodeProviderClient(providerConfig());
    await expect(
      client.chat(
        buildProviderChatRequestBody(
          { model: "default", messages: [{ role: "user", content: "hi" }] },
          "deepseek/deepseek-v4-pro",
        ),
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(postCount).toBe(5);
  });

  it("recovers after transient provider failures", async () => {
    let postCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const billing = billingResponse(String(input));
      if (billing) return billing;
      postCount += 1;
      if (postCount < 3) {
        return Response.json(
          { error: { message: "server error", type: "server_error" } },
          { status: 500 },
        );
      }
      return Response.json({ id: "chatcmpl_ok", choices: [] }, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new CommandCodeProviderClient(providerConfig());
    const response = await client.chat(
      buildProviderChatRequestBody(
        { model: "default", messages: [{ role: "user", content: "hi" }] },
        "deepseek/deepseek-v4-pro",
      ),
    );
    expect(response.ok).toBe(true);
    expect(postCount).toBe(3);
  });

  it("throws a configuration error when no credentials are configured", async () => {
    const client = new CommandCodeProviderClient(providerConfig({ commandCodeCredentials: [] }));
    await expect(
      client.chat(
        buildProviderChatRequestBody(
          { model: "default", messages: [{ role: "user", content: "hi" }] },
          "deepseek/deepseek-v4-pro",
        ),
      ),
    ).rejects.toBeInstanceOf(CommandCodeAuthError);
  });
});

describe("provider access probe", () => {
  it("confirms access when the endpoint accepts a minimal probe request", async () => {
    let requestBody = "";
    const available = await probeProviderAccess(providerConfig(), {
      fetchImpl: async (_input, init) => {
        requestBody = String(init?.body ?? "");
        return Response.json({ choices: [] }, { status: 200 });
      },
    });
    expect(available).toBe(true);
    const body = JSON.parse(requestBody) as { model?: string; max_tokens?: number };
    expect(body.model).toBe("deepseek/deepseek-v4-flash");
    expect(body.max_tokens).toBe(1);
  });

  it("denies access on upgrade_required, bad keys, unknown routes, and network failures", async () => {
    for (const status of [401, 403, 404, 429, 500]) {
      const available = await probeProviderAccess(providerConfig(), {
        fetchImpl: async () => new Response("{}", { status }),
      });
      expect(available, `status ${status}`).toBe(false);
    }
    const offline = await probeProviderAccess(providerConfig(), {
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    expect(offline).toBe(false);
  });

  it("returns false without credentials", async () => {
    await expect(probeProviderAccess(providerConfig({ commandCodeCredentials: [] }))).resolves.toBe(
      false,
    );
  });
});

describe("server auto mode", () => {
  async function createAutoApp(fetchImpl: typeof fetch) {
    const fetchStub = vi.fn<typeof fetch>(fetchImpl);
    vi.stubGlobal("fetch", fetchStub);
    const app = await createApp({
      configEnv: {},
      configAuthPaths: [],
      configOverrides: {
        logLevel: "silent",
        upstreamMode: "auto",
        commandCodeCredentials: [{ id: "alpha", apiKey: "provider-secret", weight: 1 }],
      },
    });
    return { app, fetchStub };
  }

  it("probes each credential and exposes per-key provider access", async () => {
    const fetchStub = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const billing = billingResponse(url);
      if (billing) return billing;
      if (url.includes("/provider/v1/models")) return Response.json({ data: [] });
      if (url.includes("/provider/v1/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { max_tokens?: number };
        if (body.max_tokens === 1) {
          const auth = String(
            (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
          );
          return Response.json(
            { choices: [] },
            { status: auth.includes("capable-secret") ? 200 : 403 },
          );
        }
        return Response.json(
          {
            id: "c",
            model: "deepseek/deepseek-v4-pro",
            choices: [
              { index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" },
            ],
          },
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchStub);
    const app = await createApp({
      configEnv: {},
      configAuthPaths: [],
      configOverrides: {
        logLevel: "silent",
        upstreamMode: "auto",
        commandCodeCredentials: [
          { id: "capable", apiKey: "capable-secret", weight: 1 },
          { id: "proxy", apiKey: "proxy-secret", weight: 1 },
        ],
      },
    });

    const configResponse = await app.inject({ method: "GET", url: "/admin/config" });
    const credentials = configResponse.json().credentials as Array<{
      id: string;
      providerApiAccess: boolean;
    }>;
    expect(credentials.find((credential) => credential.id === "capable")?.providerApiAccess).toBe(
      true,
    );
    expect(credentials.find((credential) => credential.id === "proxy")?.providerApiAccess).toBe(
      false,
    );

    const chat = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });
    expect(chat.statusCode).toBe(200);
    expect(chat.json().choices[0].message.content).toBe("OK");
    await app.close();
  });

  it("keeps low-tier plans on the alpha tunnel when the probe returns 403", async () => {
    const { app, fetchStub } = await createAutoApp(async (input) => {
      const url = String(input);
      const billing = billingResponse(url);
      if (billing) return billing;
      if (url.includes("/provider/v1/chat/completions")) {
        return new Response("{}", { status: 403 });
      }
      if (url.includes("/alpha/generate")) {
        return new Response(
          'data: {"type":"text-delta","text":"ALPHA_OK"}\ndata: {"type":"finish","finishReason":"stop"}\n',
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("ALPHA_OK");
    const providerPosts = postCalls(fetchStub).filter((call) =>
      String(call[0]).includes("/provider/v1/chat/completions"),
    );
    expect(providerPosts).toHaveLength(1);
    const probeBody = JSON.parse((providerPosts[0]?.[1] as RequestInit).body as string) as {
      model: string;
      max_tokens: number;
    };
    expect(probeBody.model).toBe("deepseek/deepseek-v4-flash");
    expect(probeBody.max_tokens).toBe(1);
    expect(postCalls(fetchStub).some((call) => String(call[0]).includes("/alpha/generate"))).toBe(
      true,
    );
    await app.close();
  });

  it("uses the provider API when the probe confirms plan access", async () => {
    const { app, fetchStub } = await createAutoApp(async (input, init) => {
      const url = String(input);
      const billing = billingResponse(url);
      if (billing) return billing;
      if (url.includes("/provider/v1/models")) {
        return Response.json({
          data: [{ id: "deepseek/deepseek-v4-pro", context_length: 1_000_000 }],
        });
      }
      if (url.includes("/provider/v1/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { max_tokens?: number };
        if (body.max_tokens === 1) {
          return Response.json({ choices: [] }, { status: 200 });
        }
        return Response.json(
          {
            id: "chatcmpl_a",
            object: "chat.completion",
            model: "deepseek/deepseek-v4-pro",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "PROVIDER_AUTO_OK" },
                finish_reason: "stop",
              },
            ],
          },
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("PROVIDER_AUTO_OK");
    expect(postCalls(fetchStub).some((call) => String(call[0]).includes("/alpha/generate"))).toBe(
      false,
    );
    await app.close();
  });

  it("falls back to alpha when a provider request returns 403 mid-run", async () => {
    const { app, fetchStub } = await createAutoApp(async (input, init) => {
      const url = String(input);
      const billing = billingResponse(url);
      if (billing) return billing;
      if (url.includes("/provider/v1/models")) return Response.json({ data: [] });
      if (url.includes("/provider/v1/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { max_tokens?: number };
        if (body.max_tokens === 1) return Response.json({ choices: [] }, { status: 200 });
        return Response.json({ error: { code: "upgrade_required" } }, { status: 403 });
      }
      if (url.includes("/alpha/generate")) {
        return new Response(
          'data: {"type":"text-delta","text":"FALLBACK_OK"}\ndata: {"type":"finish","finishReason":"stop"}\n',
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    const first = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().choices[0].message.content).toBe("FALLBACK_OK");
    expect(second.json().choices[0].message.content).toBe("FALLBACK_OK");
    const chatPosts = postCalls(fetchStub).filter((call) => {
      const body = JSON.parse(String((call[1] as RequestInit).body)) as {
        model?: unknown;
        max_tokens?: number;
      };
      return Boolean(body.model) && body.max_tokens !== 1;
    });
    const providerChats = chatPosts.filter((call) =>
      String(call[0]).includes("/provider/v1/chat/completions"),
    );
    expect(providerChats).toHaveLength(1);
    await app.close();
  });

  it("reports the effective upstream and probe result in health", async () => {
    const { app } = await createAutoApp(async (input) => {
      const url = String(input);
      const billing = billingResponse(url);
      if (billing) return billing;
      if (url.includes("/provider/v1/chat/completions")) return new Response("{}", { status: 403 });
      throw new Error(`Unexpected fetch ${url}`);
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.json()).toMatchObject({
      upstream: "commandcode-alpha-generate",
      auth: { upstream_mode: "auto", provider_api_access: false },
    });
    await app.close();
  });
});

describe("server provider mode", () => {
  async function createProviderApp(
    options: {
      credentials?: CommandCodeCredential[];
      fetchImpl?: typeof fetch;
    } = {},
  ) {
    const fetchStub = vi.fn<typeof fetch>(
      options.fetchImpl ??
        (async (input) => {
          const url = String(input);
          const billing = billingResponse(url);
          if (billing) return billing;
          if (url.includes("/provider/v1/models")) {
            return Response.json({
              data: [
                {
                  id: "deepseek/deepseek-v4-pro",
                  name: "DeepSeek V4 Pro",
                  context_length: 1_000_000,
                },
              ],
            });
          }
          if (url.includes("/provider/v1/chat/completions")) {
            return Response.json(
              {
                id: "chatcmpl_p",
                object: "chat.completion",
                model: "deepseek/deepseek-v4-pro",
                created: 1,
                choices: [
                  {
                    index: 0,
                    message: { role: "assistant", content: "PROVIDER_OK" },
                    finish_reason: "stop",
                  },
                ],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
              },
              { status: 200 },
            );
          }
          throw new Error(`Unexpected fetch ${url}`);
        }),
    );
    vi.stubGlobal("fetch", fetchStub);
    const app = await createApp({
      configEnv: {},
      configAuthPaths: [],
      configOverrides: {
        logLevel: "silent",
        upstreamMode: "provider",
        commandCodeCredentials: options.credentials ?? [
          { id: "alpha", apiKey: "provider-secret", weight: 1 },
        ],
      },
    });
    return { app, fetchStub };
  }

  it("routes non-Claude chat through the provider API and rewrites the model", async () => {
    const { app, fetchStub } = await createProviderApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("PROVIDER_OK");
    expect(response.json().model).toBe("deepseek/deepseek-v4-pro");
    const posts = postCalls(fetchStub);
    expect(posts.some((call) => String(call[0]).includes("/provider/v1/chat/completions"))).toBe(
      true,
    );
    expect(posts.some((call) => String(call[0]).includes("/alpha/generate"))).toBe(false);
    await app.close();
  });

  it("allows forced tool_choice on the provider path", async () => {
    const { app } = await createProviderApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "default",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "f", parameters: { type: "object" } } }],
        tool_choice: { type: "function", function: { name: "f" } },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("PROVIDER_OK");
    await app.close();
  });

  it("streams provider SSE with the public model id", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"id":"1","model":"deepseek/deepseek-v4-pro","choices":[{"delta":{"content":"ok"}}]}\n\n',
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const { app } = await createProviderApp({
      fetchImpl: async (input) => {
        const url = String(input);
        const billing = billingResponse(url);
        if (billing) return billing;
        if (url.includes("/provider/v1/models")) return Response.json({ data: [] });
        return new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", stream: true, messages: [{ role: "user", content: "hi" }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain('"model":"deepseek/deepseek-v4-pro"');
    expect(response.body).toContain("data: [DONE]");
    await app.close();
  });

  it("keeps Claude models on the alpha path in provider mode", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const billing = billingResponse(url);
      if (billing) return billing;
      if (url.includes("/provider/v1/models")) {
        return Response.json({
          data: [{ id: "claude-sonnet-5", name: "Claude Sonnet 5", context_length: 1_000_000 }],
        });
      }
      if (url.includes("/alpha/generate")) {
        return new Response(
          'data: {"type":"text-delta","text":"CLAUDE_ALPHA"}\ndata: {"type":"finish","finishReason":"stop"}\n',
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = await createApp({
      configEnv: {},
      configAuthPaths: [],
      configOverrides: {
        logLevel: "silent",
        upstreamMode: "provider",
        allowedModels: ["claude-sonnet-5"],
        modelCatalog: [{ id: "claude-sonnet-5", enabled: true }],
        commandCodeCredentials: [{ id: "alpha", apiKey: "provider-secret", weight: 1 }],
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "claude-sonnet-5", messages: [{ role: "user", content: "hi" }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("CLAUDE_ALPHA");
    const posts = postCalls(fetchMock);
    expect(posts.some((call) => String(call[0]).includes("/alpha/generate"))).toBe(true);
    expect(posts.some((call) => String(call[0]).includes("/provider/v1/chat/completions"))).toBe(
      false,
    );
    await app.close();
  });

  it("forwards provider error envelopes with their upstream status", async () => {
    const { app } = await createProviderApp({
      fetchImpl: async (input) => {
        const url = String(input);
        const billing = billingResponse(url);
        if (billing) return billing;
        if (url.includes("/provider/v1/models")) return Response.json({ data: [] });
        return Response.json(
          { error: { message: "upgrade required", type: "authentication_error" } },
          { status: 403 },
        );
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "default", messages: [{ role: "user", content: "hi" }] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { message: "upgrade required", type: "authentication_error" },
    });
    await app.close();
  });
});
