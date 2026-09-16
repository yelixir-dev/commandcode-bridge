import { describe, expect, it } from "vitest";

import {
  buildCommandCodeGenerateBody,
  convertOpenAITools,
  flattenOpenAIContent,
} from "../src/converter.js";

describe("OpenAI to CommandCode conversion", () => {
  it("forwards temperature but never top_p or stop, matching the CommandCode CLI wire body", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-pro",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0.4,
        top_p: 0.9,
        stop: ["\n\n"],
      },
      upstreamModel: "deepseek/deepseek-v4-pro",
    });

    expect(body.params.temperature).toBe(0.4);
    expect(Object.keys(body.params)).not.toContain("top_p");
    expect(Object.keys(body.params)).not.toContain("stop");
  });

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

  it("defaults max_tokens to the CLI wire value and forwards reasoning_effort", () => {
    const minimal = buildCommandCodeGenerateBody({
      request: { model: "deepseek/deepseek-v4-pro", messages: [{ role: "user", content: "hi" }] },
      upstreamModel: "deepseek/deepseek-v4-pro",
    });
    expect(minimal.params.max_tokens).toBe(64_000);
    expect(minimal.params).not.toHaveProperty("reasoning_effort");

    const withEffort = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-pro",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 128,
        reasoning_effort: "high",
      },
      upstreamModel: "deepseek/deepseek-v4-pro",
    });
    expect(withEffort.params.max_tokens).toBe(128);
    expect(withEffort.params.reasoning_effort).toBe("high");
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

  it("converts base64 image_url parts into native image parts with mimeType", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-flash-vision-exp",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What is in this image?" },
              { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
            ],
          },
        ],
      },
      upstreamModel: "deepseek/deepseek-v4-flash-vision-exp",
    });

    expect(body.params.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "What is in this image?" },
          { type: "image", image: "data:image/png;base64,AAAA", mimeType: "image/png" },
        ],
      },
    ]);
  });

  it("flattens image parts to short placeholders instead of inlining base64", () => {
    expect(
      flattenOpenAIContent([
        { type: "text", text: "look" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } },
      ]),
    ).toBe("look[image: image/jpeg]");
    expect(
      flattenOpenAIContent([{ type: "image_url", image_url: "https://example.com/cat.png" }]),
    ).toBe("[image_url: https://example.com/cat.png]");
  });

  it("keeps remote image URLs as text placeholders instead of image parts", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-flash-vision-exp",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What is this?" },
              { type: "image_url", image_url: { url: "https://example.com/cat.png" } },
            ],
          },
        ],
      },
      upstreamModel: "deepseek/deepseek-v4-flash-vision-exp",
    });

    expect(body.params.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          { type: "text", text: "[image_url: https://example.com/cat.png]" },
        ],
      },
    ]);
  });

  it("falls back to text for data URIs that are not base64 encoded", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-flash-vision-exp",
        messages: [
          {
            role: "user",
            content: [{ type: "image_url", image_url: "data:image/svg+xml,%3Csvg%3E" }],
          },
        ],
      },
      upstreamModel: "deepseek/deepseek-v4-flash-vision-exp",
    });

    expect(body.params.messages).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "[image: image/svg+xml]" }],
      },
    ]);
  });

  it("forwards tool-result images as a following user image message", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-flash-vision-exp",
        messages: [
          { role: "user", content: "Inspect the screenshot." },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_shot",
                type: "function",
                function: { name: "read_image", arguments: "{}" },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_shot",
            content: [
              { type: "text", text: "Screenshot captured." },
              { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
            ],
          },
        ],
      },
      upstreamModel: "deepseek/deepseek-v4-flash-vision-exp",
    });

    expect(body.params.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "user",
    ]);
    expect(body.params.messages[2]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_shot",
          toolName: "read_image",
          output: { type: "text", value: "Screenshot captured.[image: image/png]" },
        },
      ],
    });
    expect(body.params.messages[3]).toEqual({
      role: "user",
      content: [{ type: "image", image: "data:image/png;base64,AAAA", mimeType: "image/png" }],
    });
  });

  it("keeps remote tool-result image URLs in the tool text only", () => {
    const body = buildCommandCodeGenerateBody({
      request: {
        model: "deepseek/deepseek-v4-flash-vision-exp",
        messages: [
          { role: "user", content: "Inspect the screenshot." },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_shot",
                type: "function",
                function: { name: "read_image", arguments: "{}" },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_shot",
            content: [
              { type: "text", text: "Screenshot captured." },
              { type: "image_url", image_url: { url: "https://example.com/shot.png" } },
            ],
          },
        ],
      },
      upstreamModel: "deepseek/deepseek-v4-flash-vision-exp",
    });

    expect(body.params.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(body.params.messages[2]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_shot",
          toolName: "read_image",
          output: {
            type: "text",
            value: "Screenshot captured.[image_url: https://example.com/shot.png]",
          },
        },
      ],
    });
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
