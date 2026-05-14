export type OpenAIRole = "system" | "user" | "assistant" | "tool";

export interface OpenAITextContentPart {
  type: "text";
  text: string;
}

export interface OpenAIImageUrlContentPart {
  type: "image_url";
  image_url: string | { url: string };
}

export type OpenAIContentPart =
  | OpenAITextContentPart
  | OpenAIImageUrlContentPart
  | Record<string, unknown>;
export type OpenAIMessageContent = string | OpenAIContentPart[] | null;

export interface OpenAIToolCall {
  id?: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIChatMessage {
  role: OpenAIRole;
  content?: OpenAIMessageContent;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export type OpenAIChatTool = OpenAIFunctionTool;

export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  tools?: OpenAIChatTool[];
  tool_choice?: unknown;
  response_format?: Record<string, unknown>;
  stream_options?: {
    include_usage?: boolean;
  };
  user?: string;
}

export interface CommandCodeConfigContext {
  workingDir: string;
  date: string;
  environment: string;
  structure: unknown[];
  isGitRepo: boolean;
  currentBranch: string;
  mainBranch: string;
  gitStatus: string;
  recentCommits: unknown[];
}

export interface CommandCodeTool {
  type: "function";
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface CommandCodeMessage {
  role: "user" | "assistant";
  content: OpenAITextContentPart[];
}

export interface CommandCodeGenerateBody {
  config: CommandCodeConfigContext;
  memory: string;
  taste: string;
  skills: string | null;
  permissionMode: "standard";
  params: {
    model: string;
    messages: CommandCodeMessage[];
    tools: CommandCodeTool[];
    system: string;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stop?: string | string[];
    stream: true;
  };
  threadId: string;
}

export interface CommandCodeUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  inputTokenDetails?: Record<string, unknown>;
  outputTokenDetails?: Record<string, unknown>;
}

export type CommandCodeEvent =
  | { type: "text-delta"; text: string; [key: string]: unknown }
  | { type: "reasoning-delta"; text: string; [key: string]: unknown }
  | { type: "reasoning-end"; [key: string]: unknown }
  | { type: "finish"; finishReason?: string; totalUsage?: CommandCodeUsage; [key: string]: unknown }
  | {
      type: "tool-call";
      toolCallId?: string;
      toolName?: string;
      args?: unknown;
      [key: string]: unknown;
    }
  | { type: string; [key: string]: unknown };

export interface CommandCodeUpstream {
  generate(body: CommandCodeGenerateBody, signal?: AbortSignal): AsyncIterable<CommandCodeEvent>;
}

export interface CommandCodeCredential {
  id: string;
  apiKey: string;
  weight: number;
  allowedModels?: string[];
}

export type CommandCodeRoutingPolicy = "round_robin" | "depletion_aware";

export type CommandCodeEmptyVisibleResponsePolicy = "allow" | "error_on_length";

export interface CommandCodeBalanceAlertConfig {
  enabled: boolean;
  minCurrentBalance: number;
  minExpiringBalance: number;
  maxRequiredDailyBurn: number;
  intervalMs: number;
  repeatMs: number;
  webhookUrl: string | undefined;
  webhookBearer: string | undefined;
}

export interface CommandCodeBillingSnapshot {
  fetchedAt: number;
  monthlyCredits: number;
  purchasedCredits: number;
  freeCredits: number;
  currentPeriodEnd?: string | null;
  planId?: string | null;
  totalCost?: number;
  totalCount?: number;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage: OpenAIUsage;
}

export interface BridgeConfig {
  host: string;
  port: number;
  apiBase: string;
  cliVersion: string;
  defaultModel: string;
  allowedModels: string[];
  allowUnknownModels: boolean;
  bridgeApiKey: string | undefined;
  commandCodeApiKey: string | undefined;
  commandCodeCredentials: CommandCodeCredential[];
  commandCodeRoutingPolicy: CommandCodeRoutingPolicy;
  commandCodeBillingRefreshMs: number;
  commandCodeBillingTimeoutMs: number;
  commandCodeCredentialCooldownMs: number;
  requestBodyLimitBytes: number;
  rateLimitMax: number;
  rateLimitWindow: string;
  logLevel: string;
  corsOrigin: string | undefined;
  includeReasoning: boolean;
  emptyVisibleResponsePolicy: CommandCodeEmptyVisibleResponsePolicy;
  balanceAlerts: CommandCodeBalanceAlertConfig;
  timeoutMs: number;
}
