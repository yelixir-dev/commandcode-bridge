import type {
  CommandCodeBillingSnapshot,
  CommandCodeCredential,
  CommandCodeRoutingPolicy,
} from "./types.js";

const DAY_MS = 86_400_000;
const MIN_DAYS_LEFT = 0.25;
const DEFAULT_BILLING_TIMEOUT_MS = 10_000;

export interface CommandCodeCredentialState {
  credential: CommandCodeCredential;
  billing?: CommandCodeBillingSnapshot;
  billingError: string | undefined;
  disabledReason: "auth" | "billing" | "cooldown" | "expired" | undefined;
  disabledUntil: number;
  inFlight: number;
  lastSelectedAt: number;
  currentWeight: number;
  billingRefreshPromise?: Promise<void> | undefined;
}

export interface CommandCodeCreditMetrics {
  monthlyBalance: number;
  freeBalance: number;
  purchasedBalance: number;
  expiringBalance: number;
  currentBalance: number;
  daysRemaining: number | null;
  scoringDaysRemaining: number | null;
  requiredDailyBurn: number;
  reserveDailyWeight: number;
}

export interface CommandCodeCredentialDiagnostic {
  id: string;
  enabled: boolean;
  weight: number;
  allowedModels: string[] | undefined;
  disabledUntil: number | null;
  disabledUntilIso: string | null;
  disabledForMs: number;
  inFlight: number;
  lastSelectedAt: number | null;
  lastSelectedAtIso: string | null;
  currentWeight: number;
  routingScore: number;
  billingError: string | undefined;
  billing:
    | {
        fetchedAt: number;
        fetchedAtIso: string;
        ageMs: number;
        stale: boolean;
        monthlyCredits: number;
        freeCredits: number;
        purchasedCredits: number;
        currentPeriodEnd: string | null | undefined;
        planId: string | null | undefined;
        totalCost: number | undefined;
        totalCount: number | undefined;
        metrics: CommandCodeCreditMetrics;
      }
    | undefined;
}

export interface CommandCodeCredentialRouterOptions {
  credentials: CommandCodeCredential[];
  policy: CommandCodeRoutingPolicy;
  fallbackPolicy?: CommandCodeRoutingPolicy;
  maxInFlightPerCredential?: number;
  maxTotalInFlight?: number | undefined;
  billingRefreshMs: number;
  billingTimeoutMs?: number;
  cooldownMs: number;
  now?: () => number;
  billingProvider?: (
    credential: CommandCodeCredential,
    signal: AbortSignal,
  ) => Promise<CommandCodeBillingSnapshot>;
  validateBillingBeforeSelect?: boolean;
}

export interface SelectCredentialOptions {
  model: string;
  excludeIds?: Iterable<string>;
}

export interface RecordFailureOptions {
  statusCode?: number;
}

export class NoAvailableCommandCodeCredentialError extends Error {
  public constructor(message = "No available CommandCode credentials") {
    super(message);
    this.name = "NoAvailableCommandCodeCredentialError";
  }
}

function positive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback;
}

function isModelAllowed(credential: CommandCodeCredential, model: string): boolean {
  return !credential.allowedModels || credential.allowedModels.length === 0
    ? true
    : credential.allowedModels.includes(model);
}

function daysUntil(value: string | null | undefined, now: number): number | undefined {
  if (!value) return undefined;
  const end = Date.parse(value);
  if (!Number.isFinite(end)) return undefined;
  return Math.max((end - now) / DAY_MS, 0);
}

function scoringDaysUntil(value: string | null | undefined, now: number): number | undefined {
  const remaining = daysUntil(value, now);
  return remaining === undefined ? undefined : Math.max(remaining, MIN_DAYS_LEFT);
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
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

function remainingCredits(state: CommandCodeCredentialState, now: number): number | undefined {
  if (!state.billing) return undefined;
  return calculateCreditMetrics(state.billing, now).currentBalance;
}

function hasKnownCreditCapacity(state: CommandCodeCredentialState, now: number): boolean {
  const remaining = remainingCredits(state, now);
  return remaining === undefined || remaining > 0;
}

export function calculateCreditMetrics(
  billing: CommandCodeBillingSnapshot,
  now: number,
): CommandCodeCreditMetrics {
  const monthlyBalance = Math.max(0, billing.monthlyCredits);
  const freeBalance = Math.max(0, billing.freeCredits);
  const purchasedBalance = Math.max(0, billing.purchasedCredits);
  const expiringBalance = monthlyBalance + freeBalance;
  const currentBalance = expiringBalance + purchasedBalance;
  const daysRemaining = daysUntil(billing.currentPeriodEnd, now) ?? null;
  const scoringDaysRemaining = scoringDaysUntil(billing.currentPeriodEnd, now) ?? null;
  const requiredDailyBurn =
    scoringDaysRemaining === null ? expiringBalance : expiringBalance / scoringDaysRemaining;

  return {
    monthlyBalance,
    freeBalance,
    purchasedBalance,
    expiringBalance,
    currentBalance,
    daysRemaining,
    scoringDaysRemaining,
    requiredDailyBurn,
    reserveDailyWeight: purchasedBalance / 365,
  };
}

export function calculateDepletionScore(state: CommandCodeCredentialState, now: number): number {
  const configuredWeight = positive(state.credential.weight, 1);
  if (!state.billing) return configuredWeight;

  const metrics = calculateCreditMetrics(state.billing, now);

  if (metrics.requiredDailyBurn > 0) {
    return Math.max(metrics.requiredDailyBurn, 0.0001) * configuredWeight;
  }

  // Purchased credits are treated as reserve capacity when monthly/free credits are unavailable.
  if (metrics.reserveDailyWeight > 0)
    return Math.max(0.01, metrics.reserveDailyWeight) * configuredWeight;

  return 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CommandCodeCredentialRouter {
  private readonly states: CommandCodeCredentialState[];
  private readonly policy: CommandCodeRoutingPolicy;
  private readonly fallbackPolicy: CommandCodeRoutingPolicy;
  private readonly maxInFlightPerCredential: number;
  private readonly maxTotalInFlight: number | undefined;
  private readonly billingRefreshMs: number;
  private readonly billingTimeoutMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly billingProvider:
    | ((
        credential: CommandCodeCredential,
        signal: AbortSignal,
      ) => Promise<CommandCodeBillingSnapshot>)
    | undefined;
  private readonly validateBillingBeforeSelect: boolean;

  public constructor(options: CommandCodeCredentialRouterOptions) {
    this.policy = options.policy === "depletion_aware" ? "daily_burn_priority" : options.policy;
    this.fallbackPolicy = options.fallbackPolicy ?? "round_robin";
    this.maxInFlightPerCredential =
      options.maxInFlightPerCredential === undefined
        ? Number.MAX_SAFE_INTEGER
        : positive(options.maxInFlightPerCredential, 4);
    this.maxTotalInFlight = options.maxTotalInFlight;
    this.billingRefreshMs = options.billingRefreshMs;
    this.billingTimeoutMs = positive(options.billingTimeoutMs, DEFAULT_BILLING_TIMEOUT_MS);
    this.cooldownMs = options.cooldownMs;
    this.now = options.now ?? Date.now;
    this.billingProvider = options.billingProvider;
    this.validateBillingBeforeSelect = options.validateBillingBeforeSelect ?? false;

    const ids = new Set<string>();
    this.states = options.credentials.map((credential) => {
      if (ids.has(credential.id)) {
        throw new Error(`Duplicate CommandCode credential id: ${credential.id}`);
      }
      ids.add(credential.id);

      const normalizedCredential: CommandCodeCredential = {
        id: credential.id,
        apiKey: credential.apiKey,
        weight: positive(credential.weight, 1),
        enabled: credential.enabled !== false,
      };
      if (credential.maxInFlight !== undefined) {
        normalizedCredential.maxInFlight = positive(
          credential.maxInFlight,
          this.maxInFlightPerCredential,
        );
      }
      if (credential.allowedModels)
        normalizedCredential.allowedModels = [...credential.allowedModels];
      return {
        credential: normalizedCredential,
        billingError: undefined,
        disabledReason: undefined,
        disabledUntil: 0,
        inFlight: 0,
        lastSelectedAt: 0,
        currentWeight: 0,
      };
    });
  }

  public get credentialCount(): number {
    return this.states.length;
  }

  public snapshot(): CommandCodeCredentialState[] {
    return this.states.map((state) => {
      const redactedCredential: CommandCodeCredential = {
        id: state.credential.id,
        apiKey: "[REDACTED]",
        weight: state.credential.weight,
        enabled: state.credential.enabled !== false,
      };
      if (state.credential.maxInFlight !== undefined) {
        redactedCredential.maxInFlight = state.credential.maxInFlight;
      }
      if (state.credential.allowedModels) {
        redactedCredential.allowedModels = [...state.credential.allowedModels];
      }
      const snapshot: CommandCodeCredentialState = {
        credential: redactedCredential,
        billingError: state.billingError,
        disabledReason: state.disabledReason,
        disabledUntil: state.disabledUntil,
        inFlight: state.inFlight,
        lastSelectedAt: state.lastSelectedAt,
        currentWeight: state.currentWeight,
      };
      if (state.billing) snapshot.billing = { ...state.billing };
      return snapshot;
    });
  }

  public async refreshAllBilling(options: { force?: boolean } = {}): Promise<void> {
    if (!this.billingProvider) return;
    const now = this.now();
    await Promise.all(
      this.states.map((state) =>
        options.force ? this.loadBilling(state) : this.refreshBillingIfStale(state, now),
      ),
    );
  }

  public diagnostics(now = this.now()): CommandCodeCredentialDiagnostic[] {
    return this.states.map((state) => {
      const disabledUntil = state.disabledUntil > now ? state.disabledUntil : null;
      const billing = state.billing;
      const metrics = billing ? calculateCreditMetrics(billing, now) : undefined;
      return {
        id: state.credential.id,
        enabled: state.credential.enabled !== false,
        weight: state.credential.weight,
        allowedModels: state.credential.allowedModels
          ? [...state.credential.allowedModels]
          : undefined,
        disabledUntil,
        disabledUntilIso:
          disabledUntil === null || disabledUntil === Number.MAX_SAFE_INTEGER
            ? null
            : new Date(disabledUntil).toISOString(),
        disabledForMs:
          disabledUntil === null
            ? 0
            : disabledUntil === Number.MAX_SAFE_INTEGER
              ? Number.MAX_SAFE_INTEGER
              : Math.max(0, disabledUntil - now),
        inFlight: state.inFlight,
        lastSelectedAt: state.lastSelectedAt > 0 ? state.lastSelectedAt : null,
        lastSelectedAtIso:
          state.lastSelectedAt > 0 ? new Date(state.lastSelectedAt).toISOString() : null,
        currentWeight: state.currentWeight,
        routingScore: calculateDepletionScore(state, now),
        billingError: state.billingError,
        billing:
          billing && metrics
            ? {
                fetchedAt: billing.fetchedAt,
                fetchedAtIso: new Date(billing.fetchedAt).toISOString(),
                ageMs: Math.max(0, now - billing.fetchedAt),
                stale: now - billing.fetchedAt >= this.billingRefreshMs,
                monthlyCredits: billing.monthlyCredits,
                freeCredits: billing.freeCredits,
                purchasedCredits: billing.purchasedCredits,
                currentPeriodEnd: billing.currentPeriodEnd,
                planId: billing.planId,
                totalCost: billing.totalCost,
                totalCount: billing.totalCount,
                metrics,
              }
            : undefined,
      };
    });
  }

  public async select(options: SelectCredentialOptions): Promise<CommandCodeCredential> {
    if (this.states.length === 0) {
      throw new NoAvailableCommandCodeCredentialError("No CommandCode credentials are configured");
    }

    const now = this.now();
    if (this.billingProvider && this.validateBillingBeforeSelect) {
      await Promise.all(this.states.map((state) => this.refreshBillingIfStale(state, now)));
    }
    const excludedIds = new Set(options.excludeIds ?? []);
    if (this.maxTotalInFlight !== undefined && this.totalInFlight() >= this.maxTotalInFlight) {
      throw new NoAvailableCommandCodeCredentialError(
        `CommandCode bridge is at max total in-flight capacity (${this.maxTotalInFlight})`,
      );
    }
    let candidates = this.basicCandidates(options.model, now, excludedIds);
    if (candidates.length === 0) {
      throw new NoAvailableCommandCodeCredentialError(
        `No available CommandCode credentials for model ${options.model}`,
      );
    }

    if (this.policy === "daily_burn_priority") {
      await Promise.all(candidates.map((state) => this.refreshBillingIfStale(state, now)));
      candidates = this.activeCandidates(options.model, now, excludedIds);
    } else if (this.policy === "balance_priority") {
      await Promise.all(candidates.map((state) => this.refreshBillingIfStale(state, now)));
      candidates = this.activeCandidates(options.model, now, excludedIds);
      if (candidates.some((state) => state.billing === undefined)) {
        candidates = this.selectableCandidatesForPolicy(this.fallbackPolicy, candidates, now);
      }
    } else {
      candidates = this.activeCandidates(options.model, now, excludedIds);
    }

    if (candidates.length === 0) {
      throw new NoAvailableCommandCodeCredentialError(
        `No available CommandCode credentials for model ${options.model}`,
      );
    }

    const selected = this.selectForPolicy(this.policy, candidates, now);
    selected.inFlight += 1;
    selected.lastSelectedAt = now;
    return selected.credential;
  }

  public recordSuccess(id: string): void {
    this.release(id);
  }

  public recordFailure(id: string, options: RecordFailureOptions = {}): void {
    const state = this.stateById(id);
    if (!state) return;

    const statusCode = options.statusCode;
    if (statusCode === 401) {
      state.disabledUntil = Number.MAX_SAFE_INTEGER;
      state.disabledReason = "auth";
    } else if (statusCode === 402) {
      state.disabledUntil = this.now() + Math.max(this.cooldownMs, this.billingRefreshMs);
      state.disabledReason = "billing";
    } else if (
      statusCode === undefined ||
      statusCode === 429 ||
      (statusCode !== undefined && statusCode >= 500)
    ) {
      state.disabledUntil = this.now() + this.cooldownMs;
      state.disabledReason = "cooldown";
    }

    this.release(id);
  }

  public release(id: string): void {
    const state = this.stateById(id);
    if (!state) return;
    state.inFlight = Math.max(0, state.inFlight - 1);
  }

  private async refreshBillingIfStale(
    state: CommandCodeCredentialState,
    now: number,
  ): Promise<void> {
    if (!this.billingProvider) return;
    if (state.billing && now - state.billing.fetchedAt < this.billingRefreshMs) return;
    if (state.billingRefreshPromise) return state.billingRefreshPromise;

    state.billingRefreshPromise = this.loadBilling(state).finally(() => {
      state.billingRefreshPromise = undefined;
    });
    return state.billingRefreshPromise;
  }

  private async loadBilling(state: CommandCodeCredentialState): Promise<void> {
    if (!this.billingProvider) return;
    try {
      state.billing = await this.billingProvider(
        state.credential,
        createTimeoutSignal(this.billingTimeoutMs),
      );
      state.billingError = undefined;
      const remaining = remainingCredits(state, this.now()) ?? 0;
      const expired = daysUntil(state.billing.currentPeriodEnd, this.now()) === 0;
      if (expired) {
        state.disabledUntil = Number.MAX_SAFE_INTEGER;
        state.disabledReason = "expired";
      } else if (remaining > 0 && state.disabledReason !== "auth") {
        state.disabledUntil = 0;
        state.disabledReason = undefined;
      } else if (state.disabledUntil !== Number.MAX_SAFE_INTEGER) {
        state.disabledUntil = this.now() + this.billingRefreshMs;
        state.disabledReason = "billing";
      }
    } catch (error) {
      state.billingError = errorMessage(error);
    }
  }

  private basicCandidates(
    model: string,
    now: number,
    excludedIds: Set<string>,
  ): CommandCodeCredentialState[] {
    return this.states.filter(
      (state) =>
        !excludedIds.has(state.credential.id) &&
        state.credential.enabled !== false &&
        state.disabledUntil <= now &&
        state.inFlight < this.maxInFlightForState(state) &&
        isModelAllowed(state.credential, model),
    );
  }

  private activeCandidates(
    model: string,
    now: number,
    excludedIds: Set<string>,
  ): CommandCodeCredentialState[] {
    return this.basicCandidates(model, now, excludedIds).filter((state) =>
      hasKnownCreditCapacity(state, now),
    );
  }

  private maxInFlightForState(state: CommandCodeCredentialState): number {
    return positive(state.credential.maxInFlight, this.maxInFlightPerCredential);
  }

  private totalInFlight(): number {
    return this.states.reduce((sum, state) => sum + state.inFlight, 0);
  }

  private selectableCandidatesForPolicy(
    policy: CommandCodeRoutingPolicy,
    candidates: CommandCodeCredentialState[],
    now: number,
  ): CommandCodeCredentialState[] {
    if (
      policy === "balance_priority" ||
      policy === "daily_burn_priority" ||
      policy === "depletion_aware"
    ) {
      return candidates.filter((state) => hasKnownCreditCapacity(state, now));
    }
    return candidates;
  }

  private selectForPolicy(
    policy: CommandCodeRoutingPolicy,
    candidates: CommandCodeCredentialState[],
    now: number,
  ): CommandCodeCredentialState {
    if (policy === "drain_first")
      return candidates[0] ?? this.selectSmoothWeighted(candidates, now);
    if (policy === "balance_priority") return this.selectHighestBalance(candidates, now);
    return this.selectSmoothWeighted(candidates, now);
  }

  private selectHighestBalance(
    candidates: CommandCodeCredentialState[],
    now: number,
  ): CommandCodeCredentialState {
    let best: CommandCodeCredentialState | undefined;
    for (const state of candidates) {
      const balance = remainingCredits(state, now) ?? 0;
      const bestBalance = best ? (remainingCredits(best, now) ?? 0) : Number.NEGATIVE_INFINITY;
      if (
        !best ||
        balance > bestBalance ||
        (balance === bestBalance && state.inFlight < best.inFlight)
      ) {
        best = state;
      }
    }
    if (!best) throw new NoAvailableCommandCodeCredentialError();
    return best;
  }

  private selectSmoothWeighted(
    candidates: CommandCodeCredentialState[],
    now: number,
  ): CommandCodeCredentialState {
    let best: CommandCodeCredentialState | undefined;
    let totalWeight = 0;

    for (const state of candidates) {
      const weight =
        this.policy === "daily_burn_priority" || this.policy === "depletion_aware"
          ? calculateDepletionScore(state, now)
          : positive(state.credential.weight, 1);
      const adjustedWeight = Math.max(0.0001, weight);
      state.currentWeight += adjustedWeight;
      totalWeight += adjustedWeight;
      if (!best || state.currentWeight > best.currentWeight) best = state;
    }

    if (!best) throw new NoAvailableCommandCodeCredentialError();
    best.currentWeight -= totalWeight;
    return best;
  }

  private stateById(id: string): CommandCodeCredentialState | undefined {
    return this.states.find((state) => state.credential.id === id);
  }
}
