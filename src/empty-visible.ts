import { retryBackoff } from "./commandcode.js";
import {
  collectOpenAICompletion,
  CommandCodeEmptyVisibleResponseError,
  type EmptyVisibleResponseDiagnostics,
} from "./openai.js";
import type {
  CommandCodeGenerateBody,
  CommandCodeUpstream,
  OpenAIChatCompletion,
} from "./types.js";

export interface EmptyVisibleLogFields extends EmptyVisibleResponseDiagnostics {
  maxTokens: number | undefined;
  stream: boolean;
  requestId: string | undefined;
  attempt: number;
  retrying: boolean;
}

export function emptyVisibleWarnPayload(fields: EmptyVisibleLogFields): Record<string, unknown> {
  return {
    code: "commandcode_empty_visible_response",
    model: fields.model,
    finish_reason: fields.finishReason,
    visible_content_length: fields.visibleContentLength,
    tool_call_count: fields.toolCallCount,
    max_tokens: fields.maxTokens,
    stream: fields.stream,
    upstream_status: 200,
    request_id: fields.requestId,
    attempt: fields.attempt,
    retrying: fields.retrying,
  };
}

export function requestedMaxTokens(request: {
  max_tokens?: number | undefined;
  max_completion_tokens?: number | undefined;
}): number | undefined {
  return request.max_tokens ?? request.max_completion_tokens;
}

export async function collectOpenAICompletionWithEmptyVisibleRetry(options: {
  upstream: CommandCodeUpstream;
  body: CommandCodeGenerateBody;
  signal: AbortSignal;
  id: string;
  created: number;
  model: string;
  includeReasoning: boolean;
  emptyVisibleResponsePolicy: "error_on_length" | "allow";
  retryMaxAttempts: number;
  retryBackoffMs: number;
  maxTokens: number | undefined;
  requestId: string | undefined;
  log: { warn: (payload: Record<string, unknown>, message: string) => void };
}): Promise<OpenAIChatCompletion> {
  const retries = Math.max(0, options.retryMaxAttempts);
  let lastError: CommandCodeEmptyVisibleResponseError | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0 && options.retryBackoffMs > 0) {
      await retryBackoff(attempt, options.retryBackoffMs);
    }
    try {
      return await collectOpenAICompletion({
        id: options.id,
        created: options.created,
        model: options.model,
        events: options.upstream.generate(options.body, options.signal),
        includeReasoning: options.includeReasoning,
        emptyVisibleResponsePolicy: options.emptyVisibleResponsePolicy,
      });
    } catch (error) {
      if (!(error instanceof CommandCodeEmptyVisibleResponseError)) throw error;
      lastError = error;
      const retrying = attempt < retries;
      options.log.warn(
        emptyVisibleWarnPayload({
          ...error.diagnostics,
          maxTokens: options.maxTokens,
          stream: false,
          requestId: options.requestId,
          attempt: attempt + 1,
          retrying,
        }),
        "empty visible response from CommandCode upstream",
      );
      if (!retrying) throw error;
    }
  }

  throw lastError ?? new Error("empty visible retry loop exited without a result");
}
