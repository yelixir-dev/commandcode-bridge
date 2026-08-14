import { describe, expect, it } from "vitest";

import {
  buildCommandCodeGenerateBody,
  convertOpenAITools,
  flattenOpenAIContent,
} from "../src/converter.js";

describe("OpenAI to CommandCode conversion", () => {
  it("flattens string and structured text content", () => {
    expect(flattenOpenAIContent("hello")).toBe("hello");
    expect(
      flattenOpenAIContent([
        { type: "text", text: "hello" },
        { type: "text", text: " world" },
      ]),
    ).toBe("hello world");
  });

  it("converts function tools to CommandCode function schemas", () => {
    const openAITools = [
      {
        type: "function" as const,
        function: {
          name: "get_weather",
          description: "Get weather",
          parameters: { type: "object", properties: { city: { type: "string" } } },
        },
      },
    ];
    const tools = convertOpenAITools(openAITools);
    expect(tools).toEqual([
      {
        type: "function",
        name: "get_weather",
        description: "Get weather",
        input_schema: { type: "object", properties: { city: { type: "string" } } },
      },
    ]);
    expect(convertOpenAITools(openAITools, "none")).toEqual([]);
    expect(
      convertOpenAITools(openAITools, { type: "function", function: { name: "get_weather" } }),
    ).toEqual(tools);
    expect(convertOpenAITools(openAITools, "required")).toEqual(tools);
  });

  it("builds a minimal streaming CommandCode body with system prompts preserved", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-pro",
        messages: [
          { role: "system", content: "You are terse." },
          { role: "user", content: "Say hi" },
        ],
        max_tokens: 50,
        temperature: 0,
      },
      upstreamModel: "deepseek/deepseek-v4-pro",
      now: () => new Date("2026-05-11T00:00:00Z"),
      cwd: () => "/tmp/project",
      environment: "linux-x64, Node.js test",
      threadId: "00000000-0000-4000-8000-000000000000",
    });

    expect(body.params.stream).toBe(true);
    expect(body.params.model).toBe("deepseek/deepseek-v4-pro");
    expect(body.params.system).toContain("You are terse.");
    expect(body.params.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Say hi" }] },
    ]);
    expect(body.config.workingDir).toBe("/tmp/project");
    expect(body.memory).toBeNull();
    expect(body.taste).toBeNull();
    expect(body.skills).toBeNull();
    expect(body.threadId).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("omits invalid thread IDs instead of forwarding them upstream", () => {
    const body = buildCommandCodeGenerateBody({
      request: { model: "deepseek/deepseek-v4-pro", messages: [{ role: "user", content: "hi" }] },
      upstreamModel: "deepseek/deepseek-v4-pro",
      threadId: "not-a-uuid",
    });
    expect(body.threadId).toBeUndefined();
  });

  it("treats OpenAI developer messages as system instructions for Hermes compatibility", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-pro",
        messages: [
          { role: "developer", content: "Follow bridge policy." },
          { role: "system", content: "You are terse." },
          { role: "user", content: "Say hi" },
        ],
      },
      upstreamModel: "deepseek/deepseek-v4-pro",
      now: () => new Date("2026-05-11T00:00:00Z"),
      cwd: () => "/tmp/project",
      environment: "linux-x64, Node.js test",
      threadId: "00000000-0000-4000-8000-000000000000",
    });

    expect(body.params.system).toContain("Follow bridge policy.");
    expect(body.params.system).toContain("You are terse.");
    expect(body.params.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Say hi" }] },
    ]);
  });

  it("preserves prior tool-result context without leaking OpenAI tool transcript markers", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-pro",
        messages: [
          { role: "user", content: "What is the weather in Seoul?" },
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
          { role: "tool", tool_call_id: "call_weather", content: '{"temperature":"12C"}' },
          { role: "user", content: "Summarize the result." },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              parameters: { type: "object", properties: { city: { type: "string" } } },
            },
          },
        ],
        tool_choice: "auto",
      },
      upstreamModel: "deepseek/deepseek-v4-pro",
      now: () => new Date("2026-05-11T00:00:00Z"),
      cwd: () => "/tmp/project",
      environment: "linux-x64, Node.js test",
      threadId: "00000000-0000-4000-8000-000000000000",
    });

    expect(body.params.tools).toHaveLength(1);
    expect(body.params.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "user",
    ]);
    expect(body.params.messages[1]).toEqual({
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call_weather",
          toolName: "get_weather",
          input: { city: "Seoul" },
        },
      ],
    });
    expect(body.params.messages[2]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_weather",
          toolName: "get_weather",
          output: { type: "text", value: '{"temperature":"12C"}' },
        },
      ],
    });

    const serializedMessages = JSON.stringify(body.params.messages);
    expect(serializedMessages).not.toContain("Assistant requested tool calls");
    expect(serializedMessages).not.toContain("Tool result for");
    expect(serializedMessages).not.toContain("tool_calls");
    expect(serializedMessages).not.toContain("tool_call_id");
    expect(serializedMessages).not.toContain("Prior function execution context");
    expect(body.params.system).not.toMatch(/internal bridge context/i);
  });

  it("merges consecutive tool results into one native tool message", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-pro",
        messages: [
          { role: "user", content: "Need both." },
          {
            role: "assistant",
            content: "Checking.",
            tool_calls: [
              {
                id: "call_weather",
                type: "function",
                function: { name: "get_weather", arguments: '{"city":"Seoul"}' },
              },
              {
                id: "call_time",
                type: "function",
                function: { name: "get_time", arguments: '{"city":"Seoul"}' },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_weather", content: "12C" },
          { role: "tool", tool_call_id: "call_time", content: "09:00" },
        ],
      },
      upstreamModel: "deepseek/deepseek-v4-pro",
      now: () => new Date("2026-05-11T00:00:00Z"),
      cwd: () => "/tmp/project",
      environment: "linux-x64, Node.js test",
      threadId: "00000000-0000-4000-8000-000000000000",
    });

    expect(body.params.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(body.params.messages[1]?.content).toEqual([
      { type: "text", text: "Checking." },
      {
        type: "tool-call",
        toolCallId: "call_weather",
        toolName: "get_weather",
        input: { city: "Seoul" },
      },
      {
        type: "tool-call",
        toolCallId: "call_time",
        toolName: "get_time",
        input: { city: "Seoul" },
      },
    ]);
    expect(body.params.messages[2]?.content).toHaveLength(2);
    expect(body.params.messages[2]?.content).toEqual([
      {
        type: "tool-result",
        toolCallId: "call_weather",
        toolName: "get_weather",
        output: { type: "text", value: "12C" },
      },
      {
        type: "tool-result",
        toolCallId: "call_time",
        toolName: "get_time",
        output: { type: "text", value: "09:00" },
      },
    ]);
  });

  it("injects JSON-only guidance for OpenAI response_format", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-pro",
        messages: [{ role: "user", content: "Return object" }],
        response_format: { type: "json_object" },
      },
      upstreamModel: "deepseek/deepseek-v4-pro",
      now: () => new Date("2026-05-11T00:00:00Z"),
      cwd: () => "/tmp/project",
      environment: "linux-x64, Node.js test",
      threadId: "00000000-0000-4000-8000-000000000000",
    });
    expect(body.params.system).toMatch(/valid JSON object/i);
  });
});
