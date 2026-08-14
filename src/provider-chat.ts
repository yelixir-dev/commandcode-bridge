import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import type { FastifyReply, FastifyRequest } from "fastify";

import { CommandCodeHttpError, retryBackoff } from "./commandcode.js";
import type { ResolvedModel } from "./config.js";
import { emptyVisibleWarnPayload, requestedMaxTokens } from "./empty-visible.js";
import {
  buildProviderChatRequestBody,
  CommandCodeProviderSseTransform,
  type CommandCodeProviderClient,
} from "./provider.js";
import type { BridgeConfig, OpenAIChatCompletionRequest } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handleProviderChat(options: {
  reply: FastifyReply;
  httpRequest: FastifyRequest;
  request: OpenAIChatCompletionRequest;
  providerClient: CommandCodeProviderClient;
  resolvedModel: ResolvedModel;
  signal: AbortSignal;
  config: BridgeConfig;
}): Promise<boolean | null> {
  const { reply, httpRequest, request, providerClient, resolvedModel, signal, config } = options;
  const body = buildProviderChatRequestBody(request, resolvedModel.upstreamModel);
  const retries = request.stream ? 0 : Math.max(0, config.emptyVisibleRetryMaxAttempts);
  const maxTokens = requestedMaxTokens(request);
  let response: Response | undefined;
  try {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0 && config.emptyVisibleRetryBackoffMs > 0) {
        await retryBackoff(attempt, config.emptyVisibleRetryBackoffMs);
      }
      response = await providerClient.chat(body, signal);
      if (request.stream || !response.ok) break;
      const completion = (await response.clone().json()) as Record<string, unknown>;
      if (typeof completion.model === "string") completion.model = resolvedModel.publicModel;
      const firstChoice =
        Array.isArray(completion.choices) && isRecord(completion.choices[0])
          ? completion.choices[0]
          : undefined;
      const message =
        firstChoice && isRecord(firstChoice.message) ? firstChoice.message : undefined;
      const content = typeof message?.content === "string" ? message.content : "";
      const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
      const emptyVisible =
        config.emptyVisibleResponsePolicy === "error_on_length" &&
        firstChoice?.finish_reason === "length" &&
        content.length === 0 &&
        toolCalls.length === 0;
      if (!emptyVisible) break;
      const retrying = attempt < retries;
      httpRequest.log.warn(
        emptyVisibleWarnPayload({
          model: resolvedModel.publicModel,
          finishReason: "length",
          visibleContentLength: content.length,
          toolCallCount: toolCalls.length,
          maxTokens,
          stream: false,
          requestId: httpRequest.id,
          attempt: attempt + 1,
          retrying,
        }),
        "empty visible response from CommandCode upstream",
      );
      if (!retrying) break;
    }
    if (!response) throw new Error("provider chat produced no response");
  } catch (error) {
    if (
      error instanceof CommandCodeHttpError &&
      error.status === 403 &&
      config.upstreamMode === "auto"
    ) {
      return null;
    }
    if (error instanceof CommandCodeHttpError) {
      const payload =
        error.body ??
        ({
          error: {
            message: error.message,
            type: "upstream_error",
            code: "commandcode_http_error",
            upstream_status: error.status,
          },
        } as const);
      reply.code(error.status).type("application/json; charset=utf-8").send(payload);
      return true;
    }
    throw error;
  }

  if (request.stream) {
    const transform = new CommandCodeProviderSseTransform({
      publicModel: resolvedModel.publicModel,
      includeReasoning: config.includeReasoning,
    });
    const stream = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>).pipe(transform);
    reply
      .type("text/event-stream; charset=utf-8")
      .header("cache-control", "no-cache, no-transform")
      .header("connection", "keep-alive")
      .header("x-accel-buffering", "no")
      .send(stream);
    return true;
  }

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      // keep the raw upstream body when it is not JSON
    }
    reply.code(response.status).type("application/json; charset=utf-8").send(payload);
    return true;
  }

  const completion = (await response.json()) as Record<string, unknown>;
  if (typeof completion.model === "string") completion.model = resolvedModel.publicModel;
  const firstChoice =
    Array.isArray(completion.choices) && isRecord(completion.choices[0])
      ? completion.choices[0]
      : undefined;
  const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : undefined;
  const content = typeof message?.content === "string" ? message.content : "";
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  if (
    config.emptyVisibleResponsePolicy === "error_on_length" &&
    firstChoice?.finish_reason === "length" &&
    content.length === 0 &&
    toolCalls.length === 0
  ) {
    reply.code(502).send({
      error: {
        message:
          "CommandCode upstream consumed the response budget without visible text or tool calls. Raise max_tokens to at least 32 for reasoning models.",
        type: "upstream_error",
        code: "commandcode_empty_visible_response",
        upstream_status: 502,
      },
    });
    return true;
  }
  reply.send(completion);
  return true;
}
