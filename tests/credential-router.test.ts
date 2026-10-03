import { describe, expect, it } from "vitest";

import {
  calculateCreditMetrics,
  calculateDepletionScore,
  CommandCodeCredentialRouter,
  type CommandCodeCredentialState,
} from "../src/credential-router.js";
import type { CommandCodeCredential, CommandCodeRoutingPolicy } from "../src/types.js";

const now = Date.parse("2026-05-12T00:00:00.000Z");
const DAY_MS = 86_400_000;

function credential(id: string): CommandCodeCredential {
  return { id, apiKey: `${id}-secret`, weight: 1 };
}

function state(id: string, remainingCredits: number, daysLeft: number): CommandCodeCredentialState {
  return {
    credential: credential(id),
    billing: {
      fetchedAt: now,
      monthlyCredits: remainingCredits,
      purchasedCredits: 0,
      freeCredits: 0,
      currentPeriodEnd: new Date(now + daysLeft * 86_400_000).toISOString(),
    },
    billingError: undefined,
    disabledReason: undefined,
    disabledUntil: 0,
    inFlight: 0,
    lastSelectedAt: 0,
    currentWeight: 0,
  };
}

describe("CommandCode credential routing", () => {
  it("derives current balance, remaining period, and daily burn pressure", () => {
    const metrics = calculateCreditMetrics(
      {
        fetchedAt: now,
        monthlyCredits: 7.2507,
        freeCredits: 0.25,
        purchasedCredits: 1.5,
        currentPeriodEnd: new Date(now + 25 * 86_400_000).toISOString(),
      },
      now,
    );

    expect(metrics.expiringBalance).toBeCloseTo(7.5007);
    expect(metrics.currentBalance).toBeCloseTo(9.0007);
    expect(metrics.daysRemaining).toBeCloseTo(25);
    expect(metrics.requiredDailyBurn).toBeCloseTo(7.5007 / 25);
  });

  it("scores credentials by expiring credits divided by days left", () => {
    expect(calculateDepletionScore(state("urgent", 8, 2), now)).toBeCloseTo(4);
    expect(calculateDepletionScore(state("slow", 8, 8), now)).toBeCloseTo(1);
  });

  it("routes proportionally to depletion score instead of raw remaining credits", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("urgent"), credential("slow")],
      policy: "depletion_aware",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      now: () => now,
      billingProvider: async (selected) => {
        if (selected.id === "urgent") return state("urgent", 8, 2).billing!;
        return state("slow", 8, 8).billing!;
      },
    });

    const selected: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      selected.push((await router.select({ model: "deepseek/deepseek-v4-pro" })).id);
    }

    expect(selected.filter((id) => id === "urgent")).toHaveLength(8);
    expect(selected.filter((id) => id === "slow")).toHaveLength(2);
  });

  it.each<CommandCodeRoutingPolicy>([
    "drain_first",
    "round_robin",
    "balance_priority",
    "daily_burn_priority",
    "depletion_aware",
  ])("prioritizes the universal urgent-expiry pool under %s", async (policy) => {
    const router = new CommandCodeCredentialRouter({
      credentials: [{ ...credential("non-urgent"), weight: 100 }, credential("urgent")],
      policy,
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) =>
        selected.id === "urgent"
          ? state("urgent", 1, 1).billing!
          : state("non-urgent", 100, 2).billing!,
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "urgent",
    });
  });

  it.each<{
    policy: CommandCodeRoutingPolicy;
    expected: string;
  }>([
    { policy: "drain_first", expected: "first" },
    { policy: "round_robin", expected: "weighted" },
    { policy: "balance_priority", expected: "balanced" },
    { policy: "daily_burn_priority", expected: "weighted" },
    { policy: "depletion_aware", expected: "weighted" },
  ])(
    "preserves $policy selection inside multiple urgent credentials",
    async ({ policy, expected }) => {
      const router = new CommandCodeCredentialRouter({
        credentials: [
          credential("first"),
          { ...credential("weighted"), weight: 10 },
          credential("balanced"),
        ],
        policy,
        billingRefreshMs: 60_000,
        cooldownMs: 60_000,
        validateBillingBeforeSelect: true,
        now: () => now,
        billingProvider: async (selected) => {
          if (selected.id === "first") return state("first", 1, 1).billing!;
          if (selected.id === "weighted") return state("weighted", 2, 1).billing!;
          return state("balanced", 10, 1).billing!;
        },
      });

      await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
        id: expected,
      });
    },
  );

  it("treats exactly one day as urgent and one day plus one millisecond as non-urgent", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [
        { ...credential("one-day-plus-1ms"), weight: 100 },
        credential("exactly-one-day"),
      ],
      policy: "round_robin",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) =>
        selected.id === "exactly-one-day"
          ? state("exactly-one-day", 1, 1).billing!
          : {
              ...state("one-day-plus-1ms", 100, 1).billing!,
              currentPeriodEnd: new Date(now + DAY_MS + 1).toISOString(),
            },
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "exactly-one-day",
    });
  });

  it("does not treat an exactly expired credential as urgent", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("expired"), credential("non-urgent")],
      policy: "drain_first",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) =>
        selected.id === "expired"
          ? {
              ...state("expired", 100, 1).billing!,
              currentPeriodEnd: new Date(now).toISOString(),
            }
          : state("non-urgent", 1, 2).billing!,
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "non-urgent",
    });
  });

  it("does not treat unknown billing as urgent", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [{ ...credential("unknown"), weight: 100 }, credential("urgent")],
      policy: "round_robin",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) => {
        if (selected.id === "unknown") throw new Error("billing unavailable");
        return state("urgent", 1, 1).billing!;
      },
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "urgent",
    });
  });

  it("does not let excluded or zero-balance urgent credentials block non-urgent routing", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [
        credential("excluded-urgent"),
        credential("empty-urgent"),
        credential("non-urgent"),
      ],
      policy: "drain_first",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) => {
        if (selected.id === "excluded-urgent") return state("excluded-urgent", 10, 1).billing!;
        if (selected.id === "empty-urgent") return state("empty-urgent", 0, 1).billing!;
        return state("non-urgent", 1, 2).billing!;
      },
    });

    await expect(
      router.select({
        model: "deepseek/deepseek-v4-pro",
        excludeIds: ["excluded-urgent"],
      }),
    ).resolves.toMatchObject({ id: "non-urgent" });
  });

  it("drain_first drains the credential with the least remaining time first", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("later"), credential("sooner")],
      policy: "drain_first",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) =>
        selected.id === "sooner" ? state("sooner", 1, 2).billing! : state("later", 1, 10).billing!,
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "sooner",
    });
  });

  it("drain_first keeps the first credential when expiry is unknown", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("first"), credential("second")],
      policy: "drain_first",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      now: () => now,
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "first",
    });
  });

  it("does not prioritize purchased-only reserve credits as expiring", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("purchased-only"), credential("expiring-monthly")],
      policy: "daily_burn_priority",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) => {
        if (selected.id === "purchased-only") {
          return {
            fetchedAt: now,
            monthlyCredits: 0,
            purchasedCredits: 100,
            freeCredits: 0,
            currentPeriodEnd: new Date(now + DAY_MS).toISOString(),
          };
        }
        return state("expiring-monthly", 10, 2).billing!;
      },
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "expiring-monthly",
    });
  });

  it("falls back to round-robin when billing probes fail", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("a"), credential("b")],
      policy: "depletion_aware",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      now: () => now,
      billingProvider: async () => {
        throw new Error("billing offline");
      },
    });

    const selected: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      selected.push((await router.select({ model: "deepseek/deepseek-v4-pro" })).id);
    }

    expect(selected).toEqual(["a", "b", "a", "b"]);
  });

  it("skips disabled or model-incompatible credentials", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [
        { ...credential("pro"), allowedModels: ["deepseek/deepseek-v4-pro"] },
        { ...credential("flash"), allowedModels: ["deepseek/deepseek-v4-flash"] },
      ],
      policy: "round_robin",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      now: () => now,
    });

    router.recordFailure("pro", { statusCode: 429 });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).rejects.toThrow(
      /available commandcode credentials/i,
    );
    await expect(router.select({ model: "deepseek/deepseek-v4-flash" })).resolves.toMatchObject({
      id: "flash",
    });
  });

  it("does not select manually disabled credentials", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [{ ...credential("off"), enabled: false }, credential("on")],
      policy: "round_robin",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      now: () => now,
    });

    for (let index = 0; index < 3; index += 1) {
      await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
        id: "on",
      });
    }
  });

  it("automatically disables expired credentials before any routing policy can select them", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("expired"), credential("active")],
      policy: "round_robin",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) =>
        selected.id === "expired"
          ? {
              fetchedAt: now,
              monthlyCredits: 10,
              purchasedCredits: 0,
              freeCredits: 0,
              currentPeriodEnd: new Date(now - 86_400_000).toISOString(),
            }
          : {
              fetchedAt: now,
              monthlyCredits: 1,
              purchasedCredits: 0,
              freeCredits: 0,
              currentPeriodEnd: new Date(now + 86_400_000).toISOString(),
            },
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "active",
    });
    const expired = router.snapshot().find((entry) => entry.credential.id === "expired");
    expect(expired?.disabledUntil).toBe(Number.MAX_SAFE_INTEGER);
    expect(expired?.disabledReason).toBe("expired");
  });

  it("re-enables expired credentials after a refreshed billing period becomes valid", async () => {
    let currentTime = now;
    let expiredPeriod = true;
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("renewed"), credential("active")],
      policy: "round_robin",
      billingRefreshMs: 1,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => currentTime,
      billingProvider: async (selected) =>
        selected.id === "renewed" && expiredPeriod
          ? {
              fetchedAt: currentTime,
              monthlyCredits: 10,
              purchasedCredits: 0,
              freeCredits: 0,
              currentPeriodEnd: new Date(currentTime - 86_400_000).toISOString(),
            }
          : {
              fetchedAt: currentTime,
              monthlyCredits: 1,
              purchasedCredits: 0,
              freeCredits: 0,
              currentPeriodEnd: new Date(currentTime + 86_400_000).toISOString(),
            },
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "active",
    });

    expiredPeriod = false;
    currentTime += 2;

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "renewed",
    });
    const renewed = router.snapshot().find((entry) => entry.credential.id === "renewed");
    expect(renewed?.disabledUntil).toBe(0);
    expect(renewed?.disabledReason).toBeUndefined();
  });

  it("excludes already attempted credentials from retry selection", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [
        { ...credential("alpha"), weight: 100 },
        { ...credential("beta"), weight: 1 },
      ],
      policy: "round_robin",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      now: () => now,
    });

    const first = await router.select({ model: "deepseek/deepseek-v4-pro" });
    const second = await router.select({
      model: "deepseek/deepseek-v4-pro",
      excludeIds: [first.id],
    });

    expect(first.id).toBe("alpha");
    expect(second.id).toBe("beta");
  });

  it("does not select credentials with a confirmed zero credit balance", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("empty"), credential("funded")],
      policy: "depletion_aware",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      now: () => now,
      billingProvider: async (selected) =>
        selected.id === "empty"
          ? {
              fetchedAt: now,
              monthlyCredits: 0,
              purchasedCredits: 0,
              freeCredits: 0,
              currentPeriodEnd: new Date(now + 86_400_000).toISOString(),
            }
          : {
              fetchedAt: now,
              monthlyCredits: 1,
              purchasedCredits: 0,
              freeCredits: 0,
              currentPeriodEnd: new Date(now + 86_400_000).toISOString(),
            },
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "funded",
    });
    expect(
      router.snapshot().find((entry) => entry.credential.id === "empty")?.disabledUntil,
    ).toBeGreaterThan(now);
  });

  it("marks a 400 insufficient-credits failure as an insufficient-credits cooldown", () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("alpha")],
      policy: "round_robin",
      billingRefreshMs: 300_000,
      cooldownMs: 60_000,
      now: () => now,
    });

    router.recordFailure("alpha", {
      statusCode: 400,
      errorMessage:
        "You have insufficient credits to make this request. Please purchase more credits to continue using the service.",
    });

    const entry = router.snapshot().find((state) => state.credential.id === "alpha");
    expect(entry?.disabledReason).toBe("insufficient_credits");
    expect(entry?.disabledUntil).toBe(now + 300_000);
  });

  it("keeps an insufficient-credits cooldown across billing refreshes", async () => {
    let current = now;
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("alpha")],
      policy: "round_robin",
      billingRefreshMs: 300_000,
      cooldownMs: 60_000,
      now: () => current,
      billingProvider: async () => ({
        fetchedAt: current,
        monthlyCredits: 0.09,
        purchasedCredits: 0,
        freeCredits: 0,
        currentPeriodEnd: new Date(current + 8 * DAY_MS).toISOString(),
      }),
    });

    router.recordFailure("alpha", {
      statusCode: 400,
      errorMessage:
        "You have insufficient credits to make this request. Please purchase more credits to continue using the service.",
    });

    current = now + 10_000;
    await router.refreshAllBilling({ force: true });

    const entry = router.snapshot().find((state) => state.credential.id === "alpha");
    expect(entry?.disabledReason).toBe("insufficient_credits");
    expect(entry?.disabledUntil).toBe(now + 300_000);
  });

  it("clears a 402 billing cooldown when fresh billing shows credits", async () => {
    let current = now;
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("alpha")],
      policy: "round_robin",
      billingRefreshMs: 300_000,
      cooldownMs: 60_000,
      now: () => current,
      billingProvider: async () => ({
        fetchedAt: current,
        monthlyCredits: 5,
        purchasedCredits: 0,
        freeCredits: 0,
        currentPeriodEnd: new Date(current + 8 * DAY_MS).toISOString(),
      }),
    });

    router.recordFailure("alpha", { statusCode: 402 });
    current = now + 10_000;
    await router.refreshAllBilling({ force: true });

    const entry = router.snapshot().find((state) => state.credential.id === "alpha");
    expect(entry?.disabledReason).toBeUndefined();
    expect(entry?.disabledUntil).toBe(0);
  });

  it("does not cool down a credential for a plain 400 failure", () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [credential("alpha")],
      policy: "round_robin",
      billingRefreshMs: 300_000,
      cooldownMs: 60_000,
      now: () => now,
    });

    router.recordFailure("alpha", {
      statusCode: 400,
      errorMessage: "Model not allowed for this plan.",
    });
    router.recordFailure("alpha", { statusCode: 400 });

    const entry = router.snapshot().find((state) => state.credential.id === "alpha");
    expect(entry?.disabledReason).toBeUndefined();
    expect(entry?.disabledUntil).toBe(0);
  });

  it("skips keys with an exhausted rolling window regardless of policy priority", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [{ ...credential("quota-hit"), weight: 100 }, credential("open")],
      policy: "drain_first",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) =>
        selected.id === "quota-hit"
          ? {
              ...state("quota-hit", 10, 2).billing!,
              windowLimits: {
                limited: true,
                exceeded: "weekly",
                fiveHour: { used: 2.5, cap: 3, exceeded: false, resetAt: now + 1 },
                weekly: { used: 6, cap: 6, exceeded: true, resetAt: now + 1 },
              },
            }
          : state("open", 10, 10).billing!,
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "open",
    });
  });

  it("does not skip an exceeded-window key when purchased credits are available", async () => {
    const router = new CommandCodeCredentialRouter({
      credentials: [{ ...credential("topup"), weight: 100 }, credential("other")],
      policy: "round_robin",
      billingRefreshMs: 60_000,
      cooldownMs: 60_000,
      validateBillingBeforeSelect: true,
      now: () => now,
      billingProvider: async (selected) =>
        selected.id === "topup"
          ? {
              fetchedAt: now,
              monthlyCredits: 1,
              purchasedCredits: 5,
              freeCredits: 0,
              currentPeriodEnd: new Date(now + 86_400_000).toISOString(),
              windowLimits: {
                limited: true,
                exceeded: "weekly",
                fiveHour: { used: 2.5, cap: 3, exceeded: false, resetAt: now + 1 },
                weekly: { used: 6, cap: 6, exceeded: true, resetAt: now + 1 },
              },
            }
          : state("other", 1, 3).billing!,
    });

    await expect(router.select({ model: "deepseek/deepseek-v4-pro" })).resolves.toMatchObject({
      id: "topup",
    });
  });

  describe("session affinity", () => {
    function router(
      options: { now?: () => number; sessionTtlMs?: number; sessionCapacity?: number } = {},
    ) {
      return new CommandCodeCredentialRouter({
        credentials: [credential("alpha"), credential("beta"), credential("gamma")],
        policy: "round_robin",
        billingRefreshMs: 60_000,
        cooldownMs: 60_000,
        now: options.now ?? (() => now),
        ...(options.sessionTtlMs !== undefined ? { sessionTtlMs: options.sessionTtlMs } : {}),
        ...(options.sessionCapacity !== undefined
          ? { sessionCapacity: options.sessionCapacity }
          : {}),
      });
    }
    const model = "deepseek/deepseek-v4-pro";

    it("keeps one conversation on the key that served its first turn", async () => {
      // Given a round-robin pool and one conversation key.
      const pool = router();

      // When the same conversation sends several turns, releasing each one.
      const picks: string[] = [];
      for (let turn = 0; turn < 4; turn += 1) {
        const selected = await pool.select({ model, sessionKey: "conversation-a" });
        picks.push(selected.id);
        pool.recordSuccess(selected.id);
      }

      // Then every turn lands on the first key.
      expect(new Set(picks).size).toBe(1);
    });

    it("still spreads different conversations by the configured policy", async () => {
      const pool = router();
      const first = await pool.select({ model, sessionKey: "conversation-a" });
      const second = await pool.select({ model, sessionKey: "conversation-b" });
      expect(second.id).not.toBe(first.id);
    });

    it("moves a conversation when its pinned key is excluded after a failure", async () => {
      // Given a conversation pinned to one key.
      const pool = router();
      const pinned = await pool.select({ model, sessionKey: "conversation-a" });
      pool.recordFailure(pinned.id, { statusCode: 500 });

      // When the retry excludes the failed key.
      const moved = await pool.select({
        model,
        sessionKey: "conversation-a",
        excludeIds: [pinned.id],
      });
      pool.recordSuccess(moved.id);

      // Then the conversation follows the new key on its next turn.
      expect(moved.id).not.toBe(pinned.id);
      const next = await pool.select({ model, sessionKey: "conversation-a" });
      expect(next.id).toBe(moved.id);
    });

    it("does not pin to a key that reached its in-flight limit", async () => {
      const pool = new CommandCodeCredentialRouter({
        credentials: [
          { ...credential("alpha"), maxInFlight: 1 },
          { ...credential("beta"), maxInFlight: 1 },
        ],
        policy: "round_robin",
        billingRefreshMs: 60_000,
        cooldownMs: 60_000,
        now: () => now,
      });
      const busy = await pool.select({ model, sessionKey: "conversation-a" });
      const overflow = await pool.select({ model, sessionKey: "conversation-a" });
      expect(overflow.id).not.toBe(busy.id);
    });

    it("forgets a pin after the affinity TTL", async () => {
      let clock = now;
      const pool = router({ now: () => clock, sessionTtlMs: 1_000 });
      const first = await pool.select({ model, sessionKey: "conversation-a" });
      pool.recordSuccess(first.id);
      await pool.select({ model, sessionKey: "other" }).then((c) => pool.recordSuccess(c.id));

      clock += 1_001;
      const after = await pool.select({ model, sessionKey: "conversation-a" });
      expect(after.id).not.toBe(first.id);
    });

    it("evicts the least recently used pin at capacity", async () => {
      // Given two pins at capacity.
      const pool = router({ sessionCapacity: 2 });
      pool.recordSuccess((await pool.select({ model, sessionKey: "a" })).id);
      const b = await pool.select({ model, sessionKey: "b" });
      pool.recordSuccess(b.id);

      // When "b" is served again and a third conversation arrives.
      pool.recordSuccess((await pool.select({ model, sessionKey: "b" })).id);
      pool.recordSuccess((await pool.select({ model, sessionKey: "c" })).id);

      // Then the least recently served pin ("a") is the one evicted.
      expect(pool.sessionCount).toBe(2);
      expect(pool.pinnedCredentialId("a")).toBeUndefined();
      expect(pool.pinnedCredentialId("b")).toBe(b.id);
      expect(pool.pinnedCredentialId("c")).toBeDefined();
    });

    it("lets an urgent-expiry key win over a pinned non-urgent key", async () => {
      const pool = new CommandCodeCredentialRouter({
        credentials: [credential("steady"), credential("urgent")],
        policy: "round_robin",
        billingRefreshMs: 60_000,
        cooldownMs: 60_000,
        validateBillingBeforeSelect: true,
        now: () => now,
        billingProvider: async (selected) =>
          selected.id === "urgent"
            ? state("urgent", 1, 1).billing!
            : state("steady", 100, 20).billing!,
      });
      await expect(pool.select({ model, sessionKey: "conversation-a" })).resolves.toMatchObject({
        id: "urgent",
      });
    });

    it("reports live pinned conversations per key in diagnostics", async () => {
      let clock = now;
      const pool = router({ now: () => clock, sessionTtlMs: 1_000 });
      const a = await pool.select({ model, sessionKey: "a" });
      pool.recordSuccess(a.id);
      const b = await pool.select({ model, sessionKey: "b" });
      pool.recordSuccess(b.id);

      const counts = Object.fromEntries(pool.diagnostics().map((d) => [d.id, d.activeSessions]));
      expect(counts[a.id]).toBe(1);
      expect(counts[b.id]).toBe(1);

      clock += 1_001;
      expect(pool.diagnostics().every((d) => d.activeSessions === 0)).toBe(true);
    });

    it("ignores affinity when no session key is given", async () => {
      const pool = router();
      const first = await pool.select({ model });
      pool.recordSuccess(first.id);
      const second = await pool.select({ model });
      expect(second.id).not.toBe(first.id);
      expect(pool.sessionCount).toBe(0);
    });
  });

  it("rejects duplicate credential IDs because health accounting is keyed by ID", () => {
    expect(
      () =>
        new CommandCodeCredentialRouter({
          credentials: [credential("same"), credential("same")],
          policy: "round_robin",
          billingRefreshMs: 60_000,
          cooldownMs: 60_000,
          now: () => now,
        }),
    ).toThrow(/duplicate commandcode credential id/i);
  });
});
