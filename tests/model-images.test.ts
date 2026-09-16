import { describe, expect, it } from "vitest";

import { buildCommandCodeGenerateBody } from "../src/converter.js";
import { buildProviderChatRequestBody } from "../src/provider.js";
import type { OpenAIChatCompletionRequest, OpenAIContentPart } from "../src/types.js";

const image: OpenAIContentPart = {
  type: "image_url",
  image_url: { url: "data:image/png;base64,AAAA" },
};

describe("model image input limits", () => {
  it.each(["deepseek/deepseek-v4-pro", "deepseek-v4-pro", "alibaba/qwen3.7-max"])(
    "omits image data for the CLI text-only model %s",
    (model) => {
      const request: OpenAIChatCompletionRequest = {
        model,
        messages: [{ role: "user", content: [image] }],
      };

      const alpha = buildCommandCodeGenerateBody({ request, upstreamModel: model });
      const provider = buildProviderChatRequestBody(request, model);

      expect(JSON.stringify(alpha.params.messages)).not.toContain("base64");
      expect(JSON.stringify(provider.messages)).not.toContain("base64");
      expect(alpha.params.messages[0]?.content[0]?.type).toBe("text");
      expect(JSON.stringify(alpha.params.messages)).toContain('index=\\"1\\"');
      expect(request.messages[0]?.content).toEqual([image]);
    },
  );

  it.each([
    "deepseek/deepseek-v4.1-flash",
    "deepseek/deepseek-v4-flash-vision-exp",
    "custom/model",
  ])("preserves images for CLI vision-capable or unknown model %s", (model) => {
    const request: OpenAIChatCompletionRequest = {
      model,
      messages: [{ role: "user", content: [image] }],
    };

    const alpha = buildCommandCodeGenerateBody({ request, upstreamModel: model });
    const provider = buildProviderChatRequestBody(request, model);

    expect(alpha.params.messages[0]?.content).toEqual([
      { type: "image", image: "data:image/png;base64,AAAA", mimeType: "image/png" },
    ]);
    expect(provider.messages).toEqual(request.messages);
  });

  it("numbers only the most recent image message and preserves surrounding text", () => {
    const request: OpenAIChatCompletionRequest = {
      model: "deepseek/deepseek-v4-pro",
      messages: [
        { role: "user", content: [image] },
        { role: "assistant", content: "Earlier answer" },
        { role: "user", content: [{ type: "text", text: "Compare" }, image, image] },
        { role: "user", content: "Please continue" },
      ],
    };

    const body = buildCommandCodeGenerateBody({ request, upstreamModel: request.model });

    expect(body.params.messages[0]?.content).toEqual([expect.objectContaining({ type: "text" })]);
    expect(JSON.stringify(body.params.messages[0])).not.toContain("attached_image");
    expect(body.params.messages[2]?.content[0]).toEqual({ type: "text", text: "Compare" });
    expect(JSON.stringify(body.params.messages[2])).toContain('index=\\"1\\"');
    expect(JSON.stringify(body.params.messages[2])).toContain('index=\\"2\\"');
    expect(JSON.stringify(body.params.messages)).not.toContain("base64");
  });

  it("retains tool results without forwarding screenshot data to text-only models", () => {
    const request: OpenAIChatCompletionRequest = {
      model: "deepseek/deepseek-v4-pro",
      messages: [
        { role: "user", content: "Read the screen" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "shot", type: "function", function: { name: "read_image", arguments: "{}" } },
          ],
        },
        {
          role: "tool",
          tool_call_id: "shot",
          content: [{ type: "text", text: "Captured" }, image],
        },
      ],
    };

    const alpha = buildCommandCodeGenerateBody({ request, upstreamModel: request.model });
    const provider = buildProviderChatRequestBody(request, request.model);

    expect(JSON.stringify(alpha.params.messages)).not.toContain("base64");
    expect(JSON.stringify(provider.messages)).not.toContain("base64");
    expect(alpha.params.messages[2]?.content[0]).toMatchObject({
      type: "tool-result",
      toolCallId: "shot",
      output: { type: "text" },
    });
  });
});
