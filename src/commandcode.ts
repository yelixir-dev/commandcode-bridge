import {
  CommandCodeCredentialRouter,
  type CommandCodeCredentialDiagnostic,
  NoAvailableCommandCodeCredentialError,
  type SelectCredentialOptions,
} from "./credential-router.js";
import type {
  BridgeConfig,
  CommandCodeBillingSnapshot,
  CommandCodeCredential,
  CommandCodeEvent,
  CommandCodeGenerateBody,
  CommandCodeUpstream,
  CommandCodeUsageWindow,
  CommandCodeWindowLimits,
} from "./types.js";

export class CommandCodeHttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: unknown;

  public constructor(status: number, statusText: string, body: unknown) {
    super(`CommandCode upstream returned ${status} ${statusText}`);
    this.name = "CommandCodeHttpError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export class CommandCodeAuthError extends Error {
  public constructor() {
    super(
      "CommandCode API key is missing. Set COMMANDCODE_API_KEY or provide ~/.commandcode/auth.json.",
    );
    this.name = "CommandCodeAuthError";
  }
}

function isCommandCodeEvent(value: unknown): value is CommandCodeEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

export function parseCommandCodeEventLine(line: string): CommandCodeEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return undefined;
  if (trimmed.startsWith("event:")) return undefined;

  const payload = trimmed.startsWith("data:") ? trimmed.slice("data:".length).trim() : trimmed;
  if (!payload || payload === "[DONE]") return undefined;

  try {
    const parsed = JSON.parse(payload) as unknown;
    return isCommandCodeEvent(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function* parseCommandCodeStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<CommandCodeEvent> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseCommandCodeEventLine(line);
        if (event) yield event;
      }
    }

    buffer += decoder.decode();
    const event = parseCommandCodeEventLine(buffer);
    if (event) yield event;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export { responseBody };

function slugFromWorkingDir(workingDir: string): string {
  const last = workingDir.split(/[\\/]/).filter(Boolean).pop() ?? "workspace";
  return last.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 80) || "workspace";
}

export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const timeoutFactory = (
    AbortSignal as typeof AbortSignal & { timeout?: (milliseconds: number) => AbortSignal }
  ).timeout;
  if (typeof timeoutFactory === "function") return timeoutFactory(timeoutMs);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  timeout.unref?.();
  return controller.signal;
}

export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const anyFactory = (
    AbortSignal as typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal }
  ).any;
  if (typeof anyFactory === "function") return anyFactory(signals);

  const controller = new AbortController();
  const abortFrom = (signal: AbortSignal) => {
    controller.abort(signal.reason);
  };

  for (const signal of signals) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }
    signal.addEventListener("abort", () => abortFrom(signal), { once: true });
  }

  return controller.signal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function buildEndpoint(
  endpoint: string,
  params: Record<string, string | null | undefined> = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${endpoint}?${query}` : endpoint;
}

function errorStatusCode(event: CommandCodeEvent): number | undefined {
  if (event.type !== "error") return undefined;
  const error = isRecord(event.error) ? event.error : undefined;
  const statusCode = numberValue(
    error?.statusCode ?? error?.status ?? event.statusCode ?? event.status,
  );
  return statusCode > 0 ? statusCode : undefined;
}

function errorStatusCodeFromUnknown(error: unknown): number | undefined {
  return error instanceof CommandCodeHttpError ? error.status : undefined;
}

function shouldRetry(statusCode: number | undefined): boolean {
  return (
    statusCode === undefined ||
    statusCode === 401 ||
    statusCode === 402 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

function isClientVisibleEvent(event: CommandCodeEvent): boolean {
  return ["text-delta", "reasoning-delta", "tool-call", "finish"].includes(event.type);
}

export function isFatalCredFailure(statusCode: number | undefined): boolean {
  return statusCode === 401 || statusCode === 402 || statusCode === 403;
}

export function retryBackoff(attempt: number, baseMs: number): Promise<void> {
  const delay = Math.min(Math.max(1, baseMs) * 2 ** attempt, 2_000);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function usageWindowValue(value: unknown): CommandCodeUsageWindow | undefined {
  if (!isRecord(value)) return undefined;
  const used =
    typeof value.used === "number" && Number.isFinite(value.used) ? value.used : undefined;
  const cap = typeof value.cap === "number" && Number.isFinite(value.cap) ? value.cap : undefined;
  const resetAt =
    typeof value.resetAt === "number" && Number.isFinite(value.resetAt) ? value.resetAt : undefined;
  if (used === undefined || cap === undefined || resetAt === undefined) return undefined;
  return { used, cap, exceeded: value.exceeded === true, resetAt };
}

function windowLimitsValue(value: unknown): CommandCodeWindowLimits | undefined {
  if (!isRecord(value)) return undefined;
  const fiveHour = usageWindowValue(value.fiveHour);
  const weekly = usageWindowValue(value.weekly);
  const exceeded = typeof value.exceeded === "string" ? value.exceeded : null;
  const limits: CommandCodeWindowLimits = {
    limited: value.limited === true,
    exceeded,
  };
  if (fiveHour) limits.fiveHour = fiveHour;
  if (weekly) limits.weekly = weekly;
  if (!fiveHour && !weekly && !limits.limited) return undefined;
  return limits;
}

export class CommandCodeBillingClient {
  private readonly config: BridgeConfig;

  public constructor(config: BridgeConfig) {
    this.config = config;
  }

  public async getSnapshot(
    credential: CommandCodeCredential,
    signal?: AbortSignal,
  ): Promise<CommandCodeBillingSnapshot> {
    const effectiveSignal = signal ?? createTimeoutSignal(this.config.commandCodeBillingTimeoutMs);
    const whoami = await this.getJson("/alpha/whoami", credential, effectiveSignal);
    const org = isRecord(whoami) && isRecord(whoami.org) ? whoami.org : undefined;
    const orgId = stringValue(org?.id) ?? null;
    const credits = await this.getJson(
      buildEndpoint("/alpha/billing/credits", { orgId }),
      credential,
      effectiveSignal,
    );
    const subscription = await this.getJson(
      buildEndpoint("/alpha/billing/subscriptions", { orgId }),
      credential,
      effectiveSignal,
    );
    const subscriptionData =
      isRecord(subscription) && isRecord(subscription.data) ? subscription.data : undefined;
    const currentPeriodStart = stringValue(subscriptionData?.currentPeriodStart);
    const summary = await this.getJson(
      buildEndpoint("/alpha/usage/summary", { orgId, since: currentPeriodStart }),
      credential,
      effectiveSignal,
    ).catch(() => undefined);

    const creditData = isRecord(credits) && isRecord(credits.credits) ? credits.credits : undefined;
    const snapshot: CommandCodeBillingSnapshot = {
      fetchedAt: Date.now(),
      monthlyCredits: numberValue(creditData?.monthlyCredits),
      purchasedCredits: numberValue(creditData?.purchasedCredits),
      freeCredits: numberValue(creditData?.freeCredits),
      currentPeriodEnd: stringValue(subscriptionData?.currentPeriodEnd) ?? null,
      planId: stringValue(subscriptionData?.planId) ?? stringValue(creditData?.planId) ?? null,
    };
    const windowLimits = isRecord(credits) ? windowLimitsValue(credits.windowLimits) : undefined;
    if (windowLimits) snapshot.windowLimits = windowLimits;
    if (isRecord(summary)) {
      const totalCost = numberValue(summary.totalCost);
      const totalCount = numberValue(summary.totalCount);
      snapshot.totalCost = totalCost;
      snapshot.totalCount = totalCount;
    }
    return snapshot;
  }

  private async getJson(
    endpoint: string,
    credential: CommandCodeCredential,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const init: RequestInit = {
      method: "GET",
      headers: this.headers(credential),
    };
    if (signal) init.signal = signal;
    const response = await fetch(`${this.config.apiBase}${endpoint}`, init);
    if (!response.ok) {
      throw new CommandCodeHttpError(
        response.status,
        response.statusText,
        await responseBody(response),
      );
    }
    return responseBody(response);
  }

  private headers(credential: CommandCodeCredential): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential.apiKey}`,
      "User-Agent": "cli",
      "x-cli-environment": "production",
      "x-command-code-version": this.config.cliVersion,
    };
  }
}

export function createCommandCodeCredentialRouter(
  config: BridgeConfig,
): CommandCodeCredentialRouter {
  const billingClient = new CommandCodeBillingClient(config);
  return new CommandCodeCredentialRouter({
    credentials: config.commandCodeCredentials,
    policy: config.commandCodeRoutingPolicy,
    fallbackPolicy: config.commandCodeFallbackRoutingPolicy ?? "round_robin",
    maxInFlightPerCredential: config.commandCodeMaxInFlightPerCredential ?? 4,
    maxTotalInFlight: config.commandCodeMaxTotalInFlight,
    billingRefreshMs: config.commandCodeBillingRefreshMs,
    billingTimeoutMs: config.commandCodeBillingTimeoutMs,
    cooldownMs: config.commandCodeCredentialCooldownMs,
    billingProvider: (credential: CommandCodeCredential, signal: AbortSignal) =>
      billingClient.getSnapshot(credential, signal),
    validateBillingBeforeSelect: true,
  });
}

export class CommandCodeClient implements CommandCodeUpstream {
  private readonly config: BridgeConfig;
  private readonly router: CommandCodeCredentialRouter;

  public constructor(config: BridgeConfig) {
    this.config = config;
    this.router = createCommandCodeCredentialRouter(config);
  }

  public async getCredentialDiagnostics(
    options: { refresh?: boolean } = {},
  ): Promise<CommandCodeCredentialDiagnostic[]> {
    await this.router.refreshAllBilling({ force: options.refresh ?? false });
    return this.router.diagnostics();
  }

  public async *generate(
    body: CommandCodeGenerateBody,
    signal?: AbortSignal,
  ): AsyncIterable<CommandCodeEvent> {
    if (this.router.credentialCount === 0) throw new CommandCodeAuthError();

    const timeoutSignal = createTimeoutSignal(this.config.timeoutMs);
    const effectiveSignal = signal ? combineAbortSignals([signal, timeoutSignal]) : timeoutSignal;
    let lastError: unknown;
    const maxAttempts = Math.max(1, this.config.commandCodeRetryMaxAttempts ?? 5);
    const fatalIds = new Set<string>();
    const retryableFailed = new Set<string>();

    attemptLoop: for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let credential: CommandCodeCredential;
      try {
        const selectOptions: SelectCredentialOptions = {
          model: body.params.model,
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
            model: body.params.model,
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
      const finalizeCallerAbort = () => {
        if (finalized) return;
        this.router.release(credential.id);
        finalized = true;
      };

      try {
        const response = await this.fetchGenerate(body, credential, effectiveSignal);
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
            shouldRetry(response.status) &&
            !effectiveSignal.aborted
          ) {
            if (isFatalCredFailure(response.status)) fatalIds.add(credential.id);
            else retryableFailed.add(credential.id);
            await retryBackoff(attempt, this.config.commandCodeRetryBackoffMs ?? 250);
            continue;
          }
          throw error;
        }
        if (!response.body) {
          const error = new CommandCodeHttpError(
            response.status,
            response.statusText,
            "Upstream response body is empty",
          );
          finalizeFailure(response.status);
          lastError = error;
          if (attempt < maxAttempts - 1 && !effectiveSignal.aborted) {
            retryableFailed.add(credential.id);
            await retryBackoff(attempt, this.config.commandCodeRetryBackoffMs ?? 250);
            continue;
          }
          throw error;
        }

        let emittedVisibleEvent = false;
        for await (const event of parseCommandCodeStream(response.body)) {
          const statusCode = errorStatusCode(event);
          if (event.type === "error") {
            finalizeFailure(statusCode);
            lastError = new CommandCodeHttpError(
              statusCode ?? 502,
              "CommandCode stream error",
              event,
            );
            if (
              !emittedVisibleEvent &&
              attempt < maxAttempts - 1 &&
              shouldRetry(statusCode) &&
              !effectiveSignal.aborted
            ) {
              if (statusCode !== undefined && isFatalCredFailure(statusCode))
                fatalIds.add(credential.id);
              else retryableFailed.add(credential.id);
              await retryBackoff(attempt, this.config.commandCodeRetryBackoffMs ?? 250);
              continue attemptLoop;
            }
            yield event;
            return;
          }
          if (isClientVisibleEvent(event)) emittedVisibleEvent = true;
          yield event;
        }
        finalizeSuccess();
        return;
      } catch (error) {
        const statusCode = errorStatusCodeFromUnknown(error);
        if (signal?.aborted === true) finalizeCallerAbort();
        else finalizeFailure(statusCode);
        lastError = error;
        if (attempt < maxAttempts - 1 && shouldRetry(statusCode) && !effectiveSignal.aborted) {
          if (statusCode !== undefined && isFatalCredFailure(statusCode))
            fatalIds.add(credential.id);
          else retryableFailed.add(credential.id);
          await retryBackoff(attempt, this.config.commandCodeRetryBackoffMs ?? 250);
          continue;
        }
        throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new NoAvailableCommandCodeCredentialError();
  }

  private fetchGenerate(
    body: CommandCodeGenerateBody,
    credential: CommandCodeCredential,
    signal: AbortSignal,
  ): Promise<Response> {
    return fetch(`${this.config.apiBase}/alpha/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential.apiKey}`,
        "User-Agent": "cli",
        "x-cli-environment": "production",
        "x-command-code-version": this.config.cliVersion,
        "x-project-slug": slugFromWorkingDir(body.config.workingDir),
        "x-taste-learning": "false",
        ...(this.config.zdr ? { "x-cmd-zdr": "1" } : {}),
        ...(body.threadId ? { "x-session-id": body.threadId } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  }
}
