import { describe, expect, it } from "vitest";

import {
  calculateCreditMetrics,
  calculateDepletionScore,
  CommandCodeCredentialRouter,
  type CommandCodeCredentialState,
} from "../src/credential-router.js";
import type { CommandCodeCredential } from "../src/types.js";

const now = Date.parse("2026-05-12T00:00:00.000Z");

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
