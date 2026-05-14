import { describe, expect, it } from "vitest";

import {
  collectOpenAICompletion,
  CommandCodeEmptyVisibleResponseError,
  CommandCodeEventError,
  mapUsageToOpenAI,
  streamOpenAIChunks,
} from "../src/openai.js";
import type { CommandCodeEvent } from "../src/types.js";

async function* events(): AsyncIterable<CommandCodeEvent> {
  yield { type: "reasoning-delta", text: "thinking" };
  yield { type: "reasoning-end" };
  yield { type: "text-delta", text: "Hello" };
  yield { type: "text-delta", text: " world" };
  yield {
    type: "finish",
    finishReason: "stop",
    totalUsage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, cachedInputTokens: 1 },
  };
}

async function* toolCallEvents(): AsyncIterable<CommandCodeEvent> {
  yield {
    type: "tool-call",
    toolCallId: "call_weather",
    toolName: "get_weather",
    args: { city: "Seoul" },
  };
  yield {
    type: "finish",
    finishReason: "tool-calls",
    totalUsage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
  };
}

async function* lengthOnlyEvents(): AsyncIterable<CommandCodeEvent> {
  yield {
    type: "finish",
    finishReason: "length",
    totalUsage: { inputTokens: 12, outputTokens: 128, totalTokens: 140 },
  };
}

async function* reasoningOnlyProEvents(): AsyncIterable<CommandCodeEvent> {
  yield { type: "reasoning-delta", text: "P" };
  yield { type: "reasoning-delta", text: "ONG" };
  yield { type: "reasoning-end" };
  yield {
    type: "finish",
    finishReason: "stop",
    totalUsage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
  };
}

function parseSsePayloads(chunks: string[]): unknown[] {
  return chunks
    .join("")
    .split("\n\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("data: ") && entry !== "data: [DONE]")
    .map((entry) => JSON.parse(entry.slice("data: ".length)) as unknown);
}

describe("CommandCode to OpenAI conversion", () => {
  it("maps usage fields", () => {
    expect(mapUsageToOpenAI({ inputTokens: 3, outputTokens: 2, totalTokens: 5 })).toEqual({
      prompt_tokens: 3,
      completion_tokens: 2,
      total_tokens: 5,
    });
  });

  it("collects non-streaming chat completion responses", async () => {
    const result = await collectOpenAICompletion({
      id: "chatcmpl_test",
      created: 1778420000,
      model: "deepseek/deepseek-v4-pro",
      events: events(),
    });
    expect(result.object).toBe("chat.completion");
    expect(result.choices[0]?.message.content).toBe("Hello world");
    expect(result.choices[0]?.finish_reason).toBe("stop");
    expect(result.usage.total_tokens).toBe(5);
  });

  it("maps CommandCode tool-call events to non-streaming OpenAI tool_calls", async () => {
    const result = await collectOpenAICompletion({
      id: "chatcmpl_tool",
      created: 1778420000,
      model: "deepseek/deepseek-v4-pro",
      events: toolCallEvents(),
    });
    expect(result.choices[0]?.finish_reason).toBe("tool_calls");
    expect(result.choices[0]?.message.content).toBeNull();
    expect(result.choices[0]?.message.tool_calls).toEqual([
      {
        id: "call_weather",
        type: "function",
        function: {
          name: "get_weather",
          arguments: JSON.stringify({ city: "Seoul" }),
        },
      },
    ]);
  });

  it("fails closed for non-streaming length completions with no visible content", async () => {
    await expect(
      collectOpenAICompletion({
        id: "chatcmpl_empty_length",
        created: 1778420000,
        model: "deepseek/deepseek-v4-pro",
        events: lengthOnlyEvents(),
      }),
    ).rejects.toBeInstanceOf(CommandCodeEmptyVisibleResponseError);
  });

  it("can explicitly allow empty length completions for compatibility", async () => {
    const result = await collectOpenAICompletion({
      id: "chatcmpl_empty_length",
      created: 1778420000,
      model: "deepseek/deepseek-v4-pro",
      events: lengthOnlyEvents(),
      emptyVisibleResponsePolicy: "allow",
    });
    expect(result.choices[0]?.message.content).toBe("");
    expect(result.choices[0]?.finish_reason).toBe("length");
  });

  it("emits OpenAI-compatible SSE chunks with an OpenAI-style usage-only final chunk", async () => {
    const chunks: string[] = [];
    for await (const responseChunk of streamOpenAIChunks({
      id: "chatcmpl_test",
      created: 1778420000,
      model: "deepseek/deepseek-v4-pro",
      events: events(),
      includeUsage: true,
    })) {
      chunks.push(responseChunk);
    }
    const payloads = parseSsePayloads(chunks) as Array<{
      choices: unknown[];
      usage?: { total_tokens: number };
    }>;
    expect(chunks[0]).toContain('"role":"assistant"');
    expect(chunks.join("")).toContain('"content":"Hello"');
    expect(payloads[payloads.length - 2]?.choices).not.toEqual([]);
    expect(payloads[payloads.length - 1]).toMatchObject({
      choices: [],
      usage: { total_tokens: 5 },
    });
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
  });

  it("emits OpenAI-compatible streaming tool_call deltas", async () => {
    const chunks: string[] = [];
    for await (const responseChunk of streamOpenAIChunks({
      id: "chatcmpl_tool",
      created: 1778420000,
      model: "deepseek/deepseek-v4-pro",
      events: toolCallEvents(),
    })) {
      chunks.push(responseChunk);
    }
    expect(chunks.join("")).toContain('"tool_calls"');
    expect(chunks.join("")).toContain('"name":"get_weather"');
    expect(chunks.join("")).toContain('"finish_reason":"tool_calls"');
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
  });

  it("falls back to reasoning deltas as content for DeepSeek V4 Pro streaming when upstream emits no text deltas", async () => {
    const chunks: string[] = [];
    for await (const responseChunk of streamOpenAIChunks({
      id: "chatcmpl_reasoning_fallback",
      created: 1778420000,
      model: "deepseek/deepseek-v4-pro",
      events: reasoningOnlyProEvents(),
    })) {
      chunks.push(responseChunk);
    }
    expect(chunks.join("")).toContain('"role":"assistant"');
    expect(chunks.join("")).toContain('"content":"P"');
    expect(chunks.join("")).toContain('"content":"ONG"');
    expect(chunks.join("")).toContain('"finish_reason":"stop"');
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
  });

  it("emits an SSE error for streaming length completions with no visible content", async () => {
    const chunks: string[] = [];
    for await (const responseChunk of streamOpenAIChunks({
      id: "chatcmpl_empty_length",
      created: 1778420000,
      model: "deepseek/deepseek-v4-pro",
      events: lengthOnlyEvents(),
    })) {
      chunks.push(responseChunk);
    }
    expect(chunks.join("")).toContain('"code":"commandcode_empty_visible_response"');
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
  });

  it("raises upstream event errors instead of returning empty success", async () => {
    async function* errorEvents(): AsyncIterable<CommandCodeEvent> {
      yield { type: "start" };
      yield {
        type: "error",
        error: { type: "server_error", message: "Insufficient Balance", statusCode: 402 },
      };
    }

    await expect(
      collectOpenAICompletion({
        id: "chatcmpl_test",
        created: 1778420000,
        model: "deepseek/deepseek-v4-pro",
        events: errorEvents(),
      }),
    ).rejects.toMatchObject({
      constructor: CommandCodeEventError,
      upstreamStatus: 402,
      upstreamMessage: "Insufficient Balance",
    });
  });
});
