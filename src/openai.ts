import { CommandCodeAuthError, CommandCodeHttpError } from "./commandcode.js";
import type {
  CommandCodeEvent,
  CommandCodeUsage,
  CommandCodeEmptyVisibleResponsePolicy,
  OpenAIChatCompletion,
  OpenAIToolCall,
  OpenAIUsage,
} from "./types.js";

export interface CollectOpenAICompletionOptions {
  id: string;
  created: number;
  model: string;
  events: AsyncIterable<CommandCodeEvent>;
  includeReasoning?: boolean;
  emptyVisibleResponsePolicy?: CommandCodeEmptyVisibleResponsePolicy;
}

export class CommandCodeEventError extends Error {
  public readonly upstreamStatus: number;
  public readonly upstreamMessage: string;
  public readonly upstreamBody: unknown;

  public constructor(upstreamMessage: string, upstreamStatus = 502, upstreamBody?: unknown) {
    super(`CommandCode upstream event error: ${upstreamMessage}`);
    this.name = "CommandCodeEventError";
    this.upstreamStatus = upstreamStatus;
    this.upstreamMessage = upstreamMessage;
    this.upstreamBody = upstreamBody;
  }
}

export class CommandCodeEmptyResponseError extends Error {
  public readonly upstreamStatus = 502;
  public readonly upstreamMessage =
    "CommandCode upstream stream ended without text, finish, usage, or error events";

  public constructor() {
    super("CommandCode upstream stream ended without text, finish, usage, or error events");
    this.name = "CommandCodeEmptyResponseError";
  }
}

export class CommandCodeEmptyVisibleResponseError extends Error {
  public readonly upstreamStatus = 502;
  public readonly upstreamMessage =
    "CommandCode upstream consumed the response budget without visible text or tool calls";

  public constructor() {
    super("CommandCode upstream consumed the response budget without visible text or tool calls");
    this.name = "CommandCodeEmptyVisibleResponseError";
  }
}

export interface StreamOpenAIChunksOptions extends CollectOpenAICompletionOptions {
  includeUsage?: boolean;
}

export function mapUsageToOpenAI(usage: CommandCodeUsage | undefined): OpenAIUsage {
  const promptTokens = usage?.inputTokens ?? 0;
  const completionTokens = usage?.outputTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

function normalizeFinishReason(
  finishReason: string | undefined,
  hasToolCalls = false,
): "stop" | "length" | "tool_calls" | "content_filter" | null {
  let normalized: "stop" | "length" | "tool_calls" | "content_filter" | null = "stop";
  if (["stop", "length", "tool_calls", "content_filter"].includes(finishReason ?? "")) {
    normalized = finishReason as "stop" | "length" | "tool_calls" | "content_filter";
  } else if (finishReason === "tool-calls") {
    normalized = "tool_calls";
  } else if (finishReason === "max_tokens") {
    normalized = "length";
  }
  if (hasToolCalls && normalized === "stop") return "tool_calls";
  return normalized;
}

function shouldFailEmptyVisibleResponse(options: {
  policy: CommandCodeEmptyVisibleResponsePolicy | undefined;
  visibleContentLength: number;
  toolCallCount: number;
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}): boolean {
  return (
    (options.policy ?? "error_on_length") === "error_on_length" &&
    options.finishReason === "length" &&
    options.visibleContentLength === 0 &&
    options.toolCallCount === 0
  );
}

function chunk(
  id: string,
  created: number,
  model: string,
  delta: Record<string, unknown>,
  finishReason: string | null,
  includeUsage = false,
) {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };
  return includeUsage ? { ...payload, usage: null } : payload;
}

function usageChunk(id: string, created: number, model: string, usage: OpenAIUsage) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [],
    usage,
  };
}

function sse(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function isTextDelta(event: CommandCodeEvent): event is { type: "text-delta"; text: string } {
  return event.type === "text-delta" && typeof event.text === "string";
}

function isReasoningDelta(
  event: CommandCodeEvent,
): event is { type: "reasoning-delta"; text: string } {
  return event.type === "reasoning-delta" && typeof event.text === "string";
}

function shouldFallbackReasoningAsContent(model: string): boolean {
  return ["deepseek/deepseek-v4-pro", "deepseek-v4-pro", "commandcode/deepseek-v4-pro"].includes(
    model,
  );
}

function isFinishEvent(
  event: CommandCodeEvent,
): event is { type: "finish"; finishReason?: string; totalUsage?: CommandCodeUsage } {
  return event.type === "finish";
}

function isToolCallEvent(
  event: CommandCodeEvent,
): event is CommandCodeEvent & { type: "tool-call" } {
  return event.type === "tool-call";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function commandCodeEventError(event: CommandCodeEvent): CommandCodeEventError | undefined {
  if (event.type !== "error") return undefined;
  const errorBody = isRecord(event.error) ? event.error : event;
  const messageValue = errorBody.message;
  const statusValue = errorBody.statusCode ?? errorBody.status;
  const message =
    typeof messageValue === "string" && messageValue ? messageValue : "Unknown upstream error";
  const status =
    typeof statusValue === "number" && Number.isFinite(statusValue) ? statusValue : 502;
  return new CommandCodeEventError(message, status, errorBody);
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function jsonStringFrom(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? {});
}

function openAIToolCallFromCommandCodeEvent(
  event: CommandCodeEvent,
  index: number,
): OpenAIToolCall | undefined {
  if (!isToolCallEvent(event)) return undefined;
  const record = event as Record<string, unknown>;
  const id =
    stringFrom(record.toolCallId) ??
    stringFrom(record.tool_call_id) ??
    stringFrom(record.id) ??
    `call_${index}`;
  const name =
    stringFrom(record.toolName) ??
    stringFrom(record.tool_name) ??
    stringFrom(record.name) ??
    "unknown_tool";
  const args = record.args ?? record.arguments ?? record.input ?? {};
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: jsonStringFrom(args),
    },
  };
}

function toolCallDelta(toolCall: OpenAIToolCall, index: number): Record<string, unknown> {
  return {
    tool_calls: [
      {
        index,
        id: toolCall.id,
        type: toolCall.type,
        function: toolCall.function,
      },
    ],
  };
}

function streamExceptionPayload(error: unknown): unknown {
  if (error instanceof CommandCodeAuthError) {
    return {
      error: {
        message: error.message,
        type: "configuration_error",
        code: "missing_upstream_api_key",
      },
    };
  }

  if (error instanceof CommandCodeHttpError) {
    return {
      error: {
        message: error.message,
        type: "upstream_error",
        code: "commandcode_http_error",
        upstream_status: error.status,
      },
    };
  }

  if (error instanceof CommandCodeEventError) {
    return {
      error: {
        message: error.upstreamMessage,
        type: "upstream_error",
        code: "commandcode_event_error",
        upstream_status: error.upstreamStatus,
      },
    };
  }

  if (error instanceof CommandCodeEmptyResponseError) {
    return {
      error: {
        message: error.message,
        type: "upstream_error",
        code: "commandcode_empty_response",
        upstream_status: error.upstreamStatus,
      },
    };
  }

  if (error instanceof CommandCodeEmptyVisibleResponseError) {
    return {
      error: {
        message: error.message,
        type: "upstream_error",
        code: "commandcode_empty_visible_response",
        upstream_status: error.upstreamStatus,
      },
    };
  }

  const message = error instanceof Error ? error.message : "CommandCode upstream stream failed";
  return {
    error: {
      message,
      type: "upstream_error",
      code: "commandcode_stream_error",
      upstream_status: 502,
    },
  };
}

export async function collectOpenAICompletion(
  options: CollectOpenAICompletionOptions,
): Promise<OpenAIChatCompletion> {
  let content = "";
  const toolCalls: OpenAIToolCall[] = [];
  let usage: CommandCodeUsage | undefined;
  let finishReason: string | undefined;
  let sawCompletionSignal = false;

  for await (const event of options.events) {
    const upstreamError = commandCodeEventError(event);
    if (upstreamError) throw upstreamError;

    if (isTextDelta(event)) {
      sawCompletionSignal = true;
      content += event.text;
    } else if (options.includeReasoning && isReasoningDelta(event)) {
      sawCompletionSignal = true;
      content += event.text;
    } else if (isToolCallEvent(event)) {
      sawCompletionSignal = true;
      const toolCall = openAIToolCallFromCommandCodeEvent(event, toolCalls.length);
      if (toolCall) toolCalls.push(toolCall);
    } else if (isFinishEvent(event)) {
      sawCompletionSignal = true;
      finishReason = event.finishReason;
      usage = event.totalUsage;
    }
  }

  if (!sawCompletionSignal) {
    throw new CommandCodeEmptyResponseError();
  }

  const finalReason = normalizeFinishReason(finishReason, toolCalls.length > 0);
  if (
    shouldFailEmptyVisibleResponse({
      policy: options.emptyVisibleResponsePolicy,
      visibleContentLength: content.length,
      toolCallCount: toolCalls.length,
      finishReason: finalReason,
    })
  ) {
    throw new CommandCodeEmptyVisibleResponseError();
  }

  const message: OpenAIChatCompletion["choices"][number]["message"] = {
    role: "assistant",
    content: toolCalls.length > 0 && content.length === 0 ? null : content,
  };
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  return {
    id: options.id,
    object: "chat.completion",
    created: options.created,
    model: options.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finalReason,
      },
    ],
    usage: mapUsageToOpenAI(usage),
  };
}

export async function* streamOpenAIChunks(
  options: StreamOpenAIChunksOptions,
): AsyncIterable<string> {
  let sentRole = false;
  let usage: CommandCodeUsage | undefined;
  let finishReason: string | undefined;
  let toolCallCount = 0;
  let visibleContentLength = 0;
  let sawCompletionSignal = false;
  const fallbackReasoningDeltas: string[] = [];
  const useReasoningFallback = shouldFallbackReasoningAsContent(options.model);

  try {
    for await (const event of options.events) {
      const upstreamError = commandCodeEventError(event);
      if (upstreamError) {
        yield sse({
          error: {
            message: upstreamError.upstreamMessage,
            type: "upstream_error",
            code: "commandcode_event_error",
            upstream_status: upstreamError.upstreamStatus,
          },
        });
        yield "data: [DONE]\n\n";
        return;
      }

      if (isTextDelta(event)) {
        sawCompletionSignal = true;
        visibleContentLength += event.text.length;
        if (!sentRole) {
          yield sse(
            chunk(
              options.id,
              options.created,
              options.model,
              { role: "assistant" },
              null,
              options.includeUsage,
            ),
          );
          sentRole = true;
        }
        yield sse(
          chunk(
            options.id,
            options.created,
            options.model,
            { content: event.text },
            null,
            options.includeUsage,
          ),
        );
      } else if (options.includeReasoning && isReasoningDelta(event)) {
        sawCompletionSignal = true;
        visibleContentLength += event.text.length;
        if (!sentRole) {
          yield sse(
            chunk(
              options.id,
              options.created,
              options.model,
              { role: "assistant" },
              null,
              options.includeUsage,
            ),
          );
          sentRole = true;
        }
        yield sse(
          chunk(
            options.id,
            options.created,
            options.model,
            { content: event.text },
            null,
            options.includeUsage,
          ),
        );
      } else if (useReasoningFallback && isReasoningDelta(event) && event.text.length > 0) {
        sawCompletionSignal = true;
        fallbackReasoningDeltas.push(event.text);
      } else if (isToolCallEvent(event)) {
        sawCompletionSignal = true;
        if (!sentRole) {
          yield sse(
            chunk(
              options.id,
              options.created,
              options.model,
              { role: "assistant" },
              null,
              options.includeUsage,
            ),
          );
          sentRole = true;
        }
        const toolCall = openAIToolCallFromCommandCodeEvent(event, toolCallCount);
        if (toolCall) {
          yield sse(
            chunk(
              options.id,
              options.created,
              options.model,
              toolCallDelta(toolCall, toolCallCount),
              null,
              options.includeUsage,
            ),
          );
          toolCallCount += 1;
        }
      } else if (isFinishEvent(event)) {
        sawCompletionSignal = true;
        finishReason = event.finishReason;
        usage = event.totalUsage;
      }
    }
  } catch (error: unknown) {
    yield sse(streamExceptionPayload(error));
    yield "data: [DONE]\n\n";
    return;
  }

  if (!sawCompletionSignal) {
    yield sse({
      error: {
        message: "CommandCode upstream stream ended without text, finish, usage, or error events",
        type: "upstream_error",
        code: "commandcode_empty_response",
        upstream_status: 502,
      },
    });
    yield "data: [DONE]\n\n";
    return;
  }

  const finalReason = normalizeFinishReason(finishReason, toolCallCount > 0);
  if (visibleContentLength === 0 && toolCallCount === 0 && fallbackReasoningDeltas.length > 0) {
    if (!sentRole) {
      yield sse(
        chunk(
          options.id,
          options.created,
          options.model,
          { role: "assistant" },
          null,
          options.includeUsage,
        ),
      );
      sentRole = true;
    }
    for (const text of fallbackReasoningDeltas) {
      visibleContentLength += text.length;
      yield sse(
        chunk(
          options.id,
          options.created,
          options.model,
          { content: text },
          null,
          options.includeUsage,
        ),
      );
    }
  }
  if (
    shouldFailEmptyVisibleResponse({
      policy: options.emptyVisibleResponsePolicy,
      visibleContentLength,
      toolCallCount,
      finishReason: finalReason,
    })
  ) {
    yield sse(streamExceptionPayload(new CommandCodeEmptyVisibleResponseError()));
    yield "data: [DONE]\n\n";
    return;
  }

  if (!sentRole) {
    yield sse(
      chunk(
        options.id,
        options.created,
        options.model,
        { role: "assistant" },
        null,
        options.includeUsage,
      ),
    );
  }
  yield sse(
    chunk(options.id, options.created, options.model, {}, finalReason, options.includeUsage),
  );
  if (options.includeUsage) {
    yield sse(usageChunk(options.id, options.created, options.model, mapUsageToOpenAI(usage)));
  }
  yield "data: [DONE]\n\n";
}
