import { describe, expect, it } from "vitest";

import {
  buildCommandCodeGenerateBody,
  convertOpenAITools,
  flattenOpenAIContent,
  isSupportedToolChoice,
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
  });

  it("supports only safe tool_choice values that can be honored by CommandCode", () => {
    expect(isSupportedToolChoice(undefined)).toBe(true);
    expect(isSupportedToolChoice("auto")).toBe(true);
    expect(isSupportedToolChoice("none")).toBe(true);
    expect(isSupportedToolChoice("required")).toBe(false);
    expect(isSupportedToolChoice({ type: "function", function: { name: "get_weather" } })).toBe(
      false,
    );
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
    expect(body.params.messages.map((message) => message.role)).toEqual(["user", "user", "user"]);

    const serializedMessages = JSON.stringify(body.params.messages);
    expect(serializedMessages).not.toContain("Assistant requested tool calls");
    expect(serializedMessages).not.toContain("Tool result for");
    expect(serializedMessages).not.toContain('"role":"tool"');
    expect(serializedMessages).not.toContain("tool_calls");
    expect(serializedMessages).not.toContain("tool_call_id");
    expect(serializedMessages).not.toContain("call_weather");

    expect(serializedMessages).toContain("get_weather");
    expect(serializedMessages).toContain("Seoul");
    expect(serializedMessages).toContain("12C");
    expect(body.params.system).toMatch(/internal bridge context/i);
    expect(body.params.system).toMatch(/do not quote|do not expose|do not mention/i);
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
