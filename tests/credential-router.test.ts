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
