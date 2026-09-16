import { modelAliasMap } from "./model-catalog.js";
import type { OpenAIChatMessage, OpenAIContentPart } from "./types.js";

// command-code 1.53.0: isKnownTextOnlyModel and the registry's inputModalities.
// Unknown models remain image-capable, matching the CLI registry fallback.
const textOnlyModels: ReadonlySet<string> = new Set([
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-flash-fast",
  "zai-org/GLM-5.3",
  "zai-org/GLM-5.2",
  "zai-org/GLM-5.2-Fast",
  "zai-org/GLM-5.1",
  "zai-org/GLM-5",
  "MiniMaxAI/MiniMax-M2.7",
  "minimax/minimax-m2.7-free",
  "MiniMaxAI/MiniMax-M2.5",
  "xiaomi/mimo-v2.5-pro",
  "Qwen/Qwen3.6-Max-Preview",
  "Qwen/Qwen3.7-Max",
  "meituan/LongCat-2.0:free",
  "stepfun/Step-3.5-Flash",
  "tencent/hy4-preview",
  "tencent/Hy3",
  "tencent/hy3-paid",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "poolside/laguna-s-2.1-free",
  "inclusionai/ling-3.0-flash-free",
  "inclusionai/ling-3.0-flash-sante:free",
]);
const aliases = modelAliasMap();

export function messagesForModel(
  messages: OpenAIChatMessage[],
  upstreamModel: string,
): OpenAIChatMessage[] {
  if (!textOnlyModels.has(aliases[upstreamModel] ?? upstreamModel)) return messages;

  let latest = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message &&
      (message.role === "user" || message.role === "tool") &&
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "image_url")
    ) {
      latest = index;
      break;
    }
  }
  if (latest < 0) return messages;

  return messages.map((message, index) => {
    if ((message.role !== "user" && message.role !== "tool") || !Array.isArray(message.content)) {
      return message;
    }

    let imageIndex = 0;
    const content: OpenAIContentPart[] = [];
    for (const part of message.content) {
      if (part.type !== "image_url") {
        content.push(part);
      } else if (index === latest) {
        imageIndex += 1;
        // Shipped CLI visionMarker: keep numbering and instructions for vision tools.
        content.push({
          type: "text",
          text: `<attached_image index="${imageIndex}">\nAn image is attached here. You cannot view it directly. If a vision tool is available, call it with image_index=${imageIndex} to read the image; otherwise tell the user you cannot see images.\n</attached_image>`,
        });
      }
    }
    if (content.length === 0 && message.content.length > 0) {
      content.push({ type: "text", text: "[image omitted: the active model is text-only]" });
    }
    return { ...message, content };
  });
}
