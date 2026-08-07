import { Transform, type TransformCallback } from "node:stream";

import {
  combineAbortSignals,
  CommandCodeAuthError,
  CommandCodeHttpError,
  createCommandCodeCredentialRouter,
  createTimeoutSignal,
  isFatalCredFailure,
  responseBody,
  retryBackoff,
} from "./commandcode.js";
import {
  NoAvailableCommandCodeCredentialError,
  type CommandCodeCredentialRouter,
  type SelectCredentialOptions,
} from "./credential-router.js";
import type { BridgeConfig, CommandCodeCredential, OpenAIChatCompletionRequest } from "./types.js";

export interface ProviderChatRequestBody extends Omit<OpenAIChatCompletionRequest, "model"> {
  model: string;
}

export function buildProviderChatRequestBody(
  request: OpenAIChatCompletionRequest,
  upstreamModel: string,
): ProviderChatRequestBody {
  const body: ProviderChatRequestBody = {
    model: upstreamModel,
    messages: request.messages,
  };
  if (request.stream !== undefined) body.stream = request.stream;
  if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.top_p !== undefined) body.top_p = request.top_p;
  if (request.stop !== undefined) body.stop = request.stop;
  if (request.tools !== undefined) body.tools = request.tools;
  if (request.tool_choice !== undefined) body.tool_choice = request.tool_choice;
  if (request.response_format !== undefined) body.response_format = request.response_format;
  if (request.stream_options !== undefined) body.stream_options = request.stream_options;
  if (request.user !== undefined) body.user = request.user;
  return body;
}

function shouldRetryStatus(statusCode: number | undefined): boolean {
  return (
    statusCode === undefined ||
    statusCode === 401 ||
    statusCode === 402 ||
    statusCode === 403 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

export async function probeProviderAccess(
  config: BridgeConfig,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    credential?: CommandCodeCredential;
  } = {},
): Promise<boolean> {
  const credential = options.credential ?? config.commandCodeCredentials[0];
  if (!credential) return false;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? config.commandCodeBillingTimeoutMs;
  try {
    const response = await fetchImpl(`${config.apiBase}/provider/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential.apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v4-flash",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    // A valid minimal request is required: body validation runs before the
    // plan check, so an empty body returns 400 even without API access.
    return response.ok;
  } catch {
    return false;
  }
}

export class CommandCodeProviderClient {
  private readonly config: BridgeConfig;
  private readonly router: CommandCodeCredentialRouter;

  public constructor(config: BridgeConfig) {
    this.config = config;
    this.router = createCommandCodeCredentialRouter(config);
  }

  public async chat(body: ProviderChatRequestBody, signal?: AbortSignal): Promise<Response> {
    if (this.router.credentialCount === 0) throw new CommandCodeAuthError();

    const timeoutSignal = createTimeoutSignal(this.config.timeoutMs);
    const effectiveSignal = signal ? combineAbortSignals([signal, timeoutSignal]) : timeoutSignal;
    const maxAttempts = Math.max(1, this.config.commandCodeRetryMaxAttempts ?? 5);
    const fatalIds = new Set<string>();
    const retryableFailed = new Set<string>();
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let credential: CommandCodeCredential;
      try {
        const selectOptions: SelectCredentialOptions = {
          model: body.model,
          ignoreCooldown: attempt > 0,
        };
        if (fatalIds.size + retryableFailed.size > 0) {
          selectOptions.excludeIds = new Set([...fatalIds, ...retryableFailed]);
        }
        credential = await this.router.select(selectOptions);
      } catch (error) {
        if (retryableFailed.size > 0) {
          retryableFailed.clear();
          credential = await this.router.select({
            model: body.model,
            ignoreCooldown: true,
          });
        } else {
          if (lastError instanceof Error) throw lastError;
          throw error;
        }
      }

      let finalized = false;
      const finalizeSuccess = () => {
        if (finalized) return;
        this.router.recordSuccess(credential.id);
        finalized = true;
      };
      const finalizeFailure = (statusCode?: number) => {
        if (finalized) return;
        if (statusCode === undefined) this.router.recordFailure(credential.id);
        else this.router.recordFailure(credential.id, { statusCode });
        finalized = true;
      };

      try {
        const response = await this.fetchChat(body, credential, effectiveSignal);
        if (!response.ok) {
          const error = new CommandCodeHttpError(
            response.status,
            response.statusText,
            await responseBody(response),
          );
          finalizeFailure(response.status);
          lastError = error;
          if (
            attempt < maxAttempts - 1 &&
            shouldRetryStatus(response.status) &&
            !effectiveSignal.aborted
          ) {
            if (isFatalCredFailure(response.status)) fatalIds.add(credential.id);
            else retryableFailed.add(credential.id);
            await retryBackoff(attempt, this.config.commandCodeRetryBackoffMs ?? 250);
            continue;
          }
          throw error;
        }
        finalizeSuccess();
        return response;
      } catch (error) {
        if (error instanceof CommandCodeHttpError && finalized) throw error;
        const statusCode = error instanceof CommandCodeHttpError ? error.status : undefined;
        finalizeFailure(statusCode);
        lastError = error;
        if (
          attempt < maxAttempts - 1 &&
          shouldRetryStatus(statusCode) &&
          !effectiveSignal.aborted
        ) {
          if (statusCode !== undefined && isFatalCredFailure(statusCode))
            fatalIds.add(credential.id);
          else if (statusCode !== undefined) retryableFailed.add(credential.id);
          await retryBackoff(attempt, this.config.commandCodeRetryBackoffMs ?? 250);
          continue;
        }
        throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new NoAvailableCommandCodeCredentialError();
  }

  private async fetchChat(
    body: ProviderChatRequestBody,
    credential: CommandCodeCredential,
    signal: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential.apiKey}`,
    };
    if (this.config.zdr) headers["x-cmd-zdr"] = "1";
    return fetch(`${this.config.apiBase}/provider/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface CommandCodeProviderSseTransformOptions {
  publicModel: string;
  includeReasoning: boolean;
}

export class CommandCodeProviderSseTransform extends Transform {
  private readonly publicModel: string;
  private readonly includeReasoning: boolean;
  private buffer = "";

  public constructor(options: CommandCodeProviderSseTransformOptions) {
    super();
    this.publicModel = options.publicModel;
    this.includeReasoning = options.includeReasoning;
  }

  public override _transform(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.buffer += chunk instanceof Uint8Array ? new TextDecoder().decode(chunk) : String(chunk);
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      this.push(this.rewriteLine(line));
    }
    callback();
  }

  public override _flush(callback: TransformCallback): void {
    if (this.buffer.length > 0) this.push(this.rewriteLine(this.buffer));
    this.buffer = "";
    callback();
  }

  private rewriteLine(line: string): string {
    if (!line.startsWith("data: ")) return `${line}\n`;
    const payload = line.slice("data: ".length).trim();
    if (payload === "" || payload === "[DONE]") return `${line}\n`;
    try {
      const json = JSON.parse(payload) as Record<string, unknown>;
      if (typeof json.model === "string") json.model = this.publicModel;
      const firstChoice = Array.isArray(json.choices) ? json.choices[0] : undefined;
      const delta =
        isRecord(firstChoice) && isRecord(firstChoice.delta) ? firstChoice.delta : undefined;
      if (
        this.includeReasoning &&
        delta &&
        typeof delta.reasoning_content === "string" &&
        delta.reasoning_content.length > 0
      ) {
        delta.content = `${typeof delta.content === "string" ? delta.content : ""}${delta.reasoning_content}`;
        delete delta.reasoning_content;
      }
      return `data: ${JSON.stringify(json)}\n`;
    } catch {
      return `${line}\n`;
    }
  }
}
