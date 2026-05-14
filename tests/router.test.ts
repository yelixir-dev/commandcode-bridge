import type { AddressInfo } from "node:net";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createRouterApp } from "../src/router.js";

const openedApps: FastifyInstance[] = [];

function chatPayload() {
  return { model: "default", messages: [{ role: "user", content: "hi" }] };
}

async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ host: "127.0.0.1", port: 0 });
  openedApps.push(app);
  const address = app.server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeApp(app: FastifyInstance): Promise<void> {
  if (openedApps.includes(app)) return;
  await app.close();
}

afterEach(async () => {
  while (openedApps.length > 0) {
    const app = openedApps.pop();
    if (app) await app.close();
  }
});

describe("CommandCode router", () => {
  it("proxies authenticated /v1 requests to the backend with backend auth", async () => {
    let seenAuth: string | undefined;
    const backend = Fastify({ logger: false });
    backend.get("/health", async () => ({ status: "ok" }));
    backend.get("/v1/models", async (request) => {
      seenAuth = request.headers.authorization;
      return { object: "list", data: [{ id: "default", object: "model" }] };
    });
    const backendUrl = await listen(backend);

    const router = await createRouterApp({
      env: {},
      config: {
        logLevel: "silent",
        apiKey: "client-secret",
        backends: [
          { id: "local", baseUrl: backendUrl, apiKey: "backend-secret", weight: 1, maxInflight: 1 },
        ],
      },
    });

    const response = await router.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer client-secret" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-commandcode-router-backend"]).toBe("local");
    expect(seenAuth).toBe("Bearer backend-secret");
    await closeApp(router);
  });

  it("serves health without leaking router or backend secrets", async () => {
    const backend = Fastify({ logger: false });
    backend.get("/health", async () => ({ status: "ok" }));
    const backendUrl = await listen(backend);

    const router = await createRouterApp({
      env: {},
      config: {
        logLevel: "silent",
        apiKey: "client-secret",
        backends: [
          { id: "local", baseUrl: backendUrl, apiKey: "backend-secret", weight: 1, maxInflight: 1 },
        ],
      },
    });

    const response = await router.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "commander-commandcode-router",
      backend_count: 1,
      healthy_backend_count: 1,
    });
    expect(response.body).not.toContain("client-secret");
    expect(response.body).not.toContain("backend-secret");
    await closeApp(router);
  });

  it("routes a concurrent request to the idle backend", async () => {
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const backendOne = Fastify({ logger: false });
    backendOne.get("/health", async () => ({ status: "ok" }));
    backendOne.post("/v1/chat/completions", async () => {
      markFirstStarted();
      await firstCanFinish;
      return { choices: [{ message: { content: "B1" } }] };
    });
    const backendOneUrl = await listen(backendOne);

    const backendTwo = Fastify({ logger: false });
    backendTwo.get("/health", async () => ({ status: "ok" }));
    backendTwo.post("/v1/chat/completions", async () => ({
      choices: [{ message: { content: "B2" } }],
    }));
    const backendTwoUrl = await listen(backendTwo);

    const router = await createRouterApp({
      env: {},
      config: {
        logLevel: "silent",
        apiKey: "client-secret",
        backends: [
          {
            id: "one",
            baseUrl: backendOneUrl,
            apiKey: "backend-secret",
            weight: 1,
            maxInflight: 1,
          },
          {
            id: "two",
            baseUrl: backendTwoUrl,
            apiKey: "backend-secret",
            weight: 1,
            maxInflight: 1,
          },
        ],
      },
    });

    const firstResponsePromise = router.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer client-secret" },
      payload: chatPayload(),
    });
    await firstStarted;

    const secondResponse = await router.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer client-secret" },
      payload: chatPayload(),
    });

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.headers["x-commandcode-router-backend"]).toBe("two");
    expect(secondResponse.json().choices[0].message.content).toBe("B2");

    releaseFirst();
    const firstResponse = await firstResponsePromise;
    expect(firstResponse.headers["x-commandcode-router-backend"]).toBe("one");
    await closeApp(router);
  });

  it("retries another backend before returning retryable backend statuses", async () => {
    const backendOne = Fastify({ logger: false });
    backendOne.get("/health", async () => ({ status: "ok" }));
    backendOne.post("/v1/chat/completions", async (_request, reply) =>
      reply.code(503).send({ error: { message: "busy" } }),
    );
    const backendOneUrl = await listen(backendOne);

    const backendTwo = Fastify({ logger: false });
    backendTwo.get("/health", async () => ({ status: "ok" }));
    backendTwo.post("/v1/chat/completions", async () => ({
      choices: [{ message: { content: "RECOVERED" } }],
    }));
    const backendTwoUrl = await listen(backendTwo);

    const router = await createRouterApp({
      env: {},
      config: {
        logLevel: "silent",
        apiKey: "client-secret",
        cooldownMs: 10_000,
        backends: [
          {
            id: "one",
            baseUrl: backendOneUrl,
            apiKey: "backend-secret",
            weight: 1,
            maxInflight: 1,
          },
          {
            id: "two",
            baseUrl: backendTwoUrl,
            apiKey: "backend-secret",
            weight: 1,
            maxInflight: 1,
          },
        ],
      },
    });

    const response = await router.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer client-secret" },
      payload: chatPayload(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-commandcode-router-backend"]).toBe("two");
    expect(response.json().choices[0].message.content).toBe("RECOVERED");
    await closeApp(router);
  });
});
