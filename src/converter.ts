import { randomUUID } from "node:crypto";
import { cwd as processCwd } from "node:process";

import type {
  CommandCodeContentPart,
  CommandCodeGenerateBody,
  CommandCodeMessage,
  CommandCodeTool,
  CommandCodeToolResultPart,
  OpenAIChatCompletionRequest,
  OpenAIChatMessage,
  OpenAIChatTool,
  OpenAIContentPart,
  OpenAIMessageContent,
  OpenAITextContentPart,
} from "./types.js";

export interface BuildCommandCodeBodyOptions {
  request: OpenAIChatCompletionRequest;
  upstreamModel: string;
  now?: () => Date;
  cwd?: () => string;
  environment?: string;
  threadId?: string;
}

function isTextPart(part: OpenAIContentPart): part is { type: "text"; text: string } {
  return part.type === "text" && typeof part.text === "string";
}

function imageUrlToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "url" in value) {
    const url = (value as { url?: unknown }).url;
    return typeof url === "string" ? url : "";
  }
  return "";
}

export function flattenOpenAIContent(content: OpenAIMessageContent | undefined): string {
  if (content === undefined || content === null) return "";
  if (typeof content === "string") return content;
  return content
    .map((part) => {
      if (isTextPart(part)) return part.text;
      if (part.type === "image_url") return `[image_url: ${imageUrlToText(part.image_url)}]`;
      return "";
    })
    .join("");
}

function asTextContent(text: string): OpenAITextContentPart[] {
  return [{ type: "text", text }];
}

function parseToolInput(value: string): unknown {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { value };
  }
}

interface ToolCallTrace {
  name: string;
}

function toolResultPart(
  message: OpenAIChatMessage,
  toolCallsById: Map<string, ToolCallTrace>,
): CommandCodeToolResultPart {
  const trace = message.tool_call_id ? toolCallsById.get(message.tool_call_id) : undefined;
  return {
    type: "tool-result",
    toolCallId: message.tool_call_id ?? "call_unknown",
    toolName: message.name ?? trace?.name ?? "unknown_tool",
    output: { type: "text", value: flattenOpenAIContent(message.content) },
  };
}

export function convertOpenAITools(
  tools: OpenAIChatTool[] | undefined,
  toolChoice?: unknown,
): CommandCodeTool[] {
  if (!tools || toolChoice === "none") return [];
  return tools.map((tool) => ({
    type: "function",
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    input_schema: tool.function.parameters ?? { type: "object", properties: {} },
  }));
}

function convertMessages(messages: OpenAIChatMessage[]): CommandCodeMessage[] {
  const toolCallsById = new Map<string, ToolCallTrace>();
  const converted: CommandCodeMessage[] = [];

  for (const message of messages) {
    if (message.role === "developer" || message.role === "system") continue;

    if (message.role === "assistant") {
      const content: CommandCodeContentPart[] = [];
      const text = flattenOpenAIContent(message.content).trim();
      if (text.length > 0) content.push(...asTextContent(text));

      const toolCalls = message.tool_calls ?? [];
      for (let index = 0; index < toolCalls.length; index += 1) {
        const toolCall = toolCalls[index];
        if (!toolCall) continue;
        const id = toolCall.id ?? `call_${index}`;
        toolCallsById.set(id, { name: toolCall.function.name });
        content.push({
          type: "tool-call",
          toolCallId: id,
          toolName: toolCall.function.name,
          input: parseToolInput(toolCall.function.arguments),
        });
      }

      if (content.length > 0) converted.push({ role: "assistant", content });
      continue;
    }

    if (message.role === "tool") {
      const part = toolResultPart(message, toolCallsById);
      const previous = converted[converted.length - 1];
      if (previous?.role === "tool") {
        previous.content.push(part);
      } else {
        converted.push({ role: "tool", content: [part] });
      }
      continue;
    }

    const userPrefix = message.name ? `name: ${message.name}\n` : "";
    converted.push({
      role: "user",
      content: asTextContent(`${userPrefix}${flattenOpenAIContent(message.content)}`),
    });
  }

  return converted;
}

function responseFormatInstruction(
  responseFormat: Record<string, unknown> | undefined,
): string | undefined {
  if (!responseFormat) return undefined;
  const type = responseFormat.type;
  if (type === "json_schema") {
    const schema = JSON.stringify(responseFormat.json_schema ?? responseFormat);
    return `Respond only with valid JSON matching this JSON schema request. Do not wrap it in markdown. JSON schema request: ${schema}`;
  }
  if (type === "json_object") {
    return "Respond only with a valid JSON object. Do not wrap it in markdown or include explanatory text.";
  }
  return undefined;
}

function buildSystemPrompt(request: OpenAIChatCompletionRequest): string {
  const systemMessages = request.messages
    .filter((message) => message.role === "developer" || message.role === "system")
    .map((message) => flattenOpenAIContent(message.content))
    .filter(Boolean);
  const formatInstruction = responseFormatInstruction(request.response_format);
  if (formatInstruction) systemMessages.push(formatInstruction);
  return systemMessages.join("\n\n");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function buildCommandCodeGenerateBody(
  options: BuildCommandCodeBodyOptions,
): CommandCodeGenerateBody {
  const now = options.now?.() ?? new Date();
  const workingDir = options.cwd?.() ?? processCwd();
  const environment =
    options.environment ?? `${process.platform}-${process.arch}, Node.js ${process.version}`;

  const params: CommandCodeGenerateBody["params"] = {
    model: options.upstreamModel,
    messages: convertMessages(options.request.messages),
    tools: convertOpenAITools(options.request.tools, options.request.tool_choice),
    system: buildSystemPrompt(options.request),
    max_tokens: options.request.max_tokens ?? 64_000,
    stream: true,
  };
  if (options.request.reasoning_effort !== undefined)
    params.reasoning_effort = options.request.reasoning_effort;
  if (options.request.temperature !== undefined) params.temperature = options.request.temperature;
  if (options.request.top_p !== undefined) params.top_p = options.request.top_p;
  if (options.request.stop !== undefined) params.stop = options.request.stop;

  const threadId = options.threadId ?? randomUUID();
  return {
    config: {
      workingDir,
      date: formatDate(now),
      environment,
      structure: [],
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "",
      gitStatus: "",
      recentCommits: [],
    },
    memory: null,
    taste: null,
    skills: null,
    permissionMode: "standard",
    params,
    ...(isUuid(threadId) ? { threadId } : {}),
  };
}
