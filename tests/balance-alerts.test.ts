import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCommandCodeBalanceAlerts,
  CommandCodeBalanceAlertManager,
} from "../src/balance-alerts.js";
import type { CommandCodeCredentialDiagnostic } from "../src/credential-router.js";
import type { CommandCodeBalanceAlertConfig } from "../src/types.js";

const baseConfig: CommandCodeBalanceAlertConfig = {
  enabled: true,
  minCurrentBalance: 3,
  minExpiringBalance: 2,
  maxRequiredDailyBurn: 1,
  intervalMs: 60_000,
  repeatMs: 3_600_000,
  webhookUrl: undefined,
  webhookBearer: undefined,
};

function diagnostic(overrides: {
  id?: string;
  currentBalance: number;
  expiringBalance: number;
  requiredDailyBurn: number;
}): CommandCodeCredentialDiagnostic {
  const id = overrides.id ?? "alpha";
  return {
    id,
    enabled: true,
    weight: 1,
    allowedModels: undefined,
    disabledUntil: null,
    disabledUntilIso: null,
    disabledForMs: 0,
    inFlight: 0,
    lastSelectedAt: null,
    lastSelectedAtIso: null,
    currentWeight: 0,
    routingScore: overrides.requiredDailyBurn,
    billingError: undefined,
    billing: {
      fetchedAt: Date.parse("2026-05-12T00:00:00.000Z"),
      fetchedAtIso: "2026-05-12T00:00:00.000Z",
      ageMs: 0,
      stale: false,
      monthlyCredits: overrides.expiringBalance,
      freeCredits: 0,
      purchasedCredits: Math.max(0, overrides.currentBalance - overrides.expiringBalance),
      currentPeriodEnd: "2026-05-14T00:00:00.000Z",
      planId: "pro",
      totalCost: 0,
      totalCount: 0,
      metrics: {
        monthlyBalance: overrides.expiringBalance,
        freeBalance: 0,
        purchasedBalance: Math.max(0, overrides.currentBalance - overrides.expiringBalance),
        expiringBalance: overrides.expiringBalance,
        currentBalance: overrides.currentBalance,
        daysRemaining: 2,
        scoringDaysRemaining: 2,
        requiredDailyBurn: overrides.requiredDailyBurn,
        reserveDailyWeight: 0,
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommandCode balance alerts", () => {
  it("returns no alerts when disabled", () => {
    const alerts = buildCommandCodeBalanceAlerts(
      [diagnostic({ currentBalance: 0.5, expiringBalance: 0.5, requiredDailyBurn: 2 })],
      { ...baseConfig, enabled: false },
    );
    expect(alerts).toEqual([]);
  });

  it("builds low-balance and high-daily-burn threshold alerts", () => {
    const alerts = buildCommandCodeBalanceAlerts(
      [diagnostic({ currentBalance: 1.5, expiringBalance: 1, requiredDailyBurn: 2.25 })],
      baseConfig,
    );
    expect(alerts.map((alert) => alert.type)).toEqual([
      "low_current_balance",
      "low_expiring_balance",
      "high_required_daily_burn",
    ]);
    expect(alerts[0]).toMatchObject({
      credentialId: "alpha",
      value: 1.5,
      threshold: 3,
      metrics: { currentBalance: 1.5, expiringBalance: 1, requiredDailyBurn: 2.25 },
    });
  });

  it("logs/posts only due alerts and throttles repeats", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const logger = { warn: vi.fn(), error: vi.fn() };
    const manager = new CommandCodeBalanceAlertManager(
      {
        ...baseConfig,
        webhookUrl: "https://alerts.example/hook",
        webhookBearer: "alert-secret",
      },
      logger,
    );
    const diagnostics = [
      diagnostic({ currentBalance: 1, expiringBalance: 1, requiredDailyBurn: 2 }),
    ];

    await manager.check(diagnostics, { now: 1_778_454_400_000, reason: "startup" });
    await manager.check(diagnostics, { now: 1_778_454_401_000, reason: "periodic" });
    await manager.check(diagnostics, { now: 1_778_458_001_000, reason: "periodic" });

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://alerts.example/hook");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer alert-secret" },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
