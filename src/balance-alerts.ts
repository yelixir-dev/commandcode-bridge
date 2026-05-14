import type { CommandCodeCredentialDiagnostic } from "./credential-router.js";
import type { CommandCodeBalanceAlertConfig } from "./types.js";

export type CommandCodeBalanceAlertType =
  | "low_current_balance"
  | "low_expiring_balance"
  | "high_required_daily_burn";

export interface CommandCodeBalanceAlert {
  type: CommandCodeBalanceAlertType;
  credentialId: string;
  message: string;
  value: number;
  threshold: number;
  metrics: {
    currentBalance: number;
    expiringBalance: number;
    daysRemaining: number | null;
    requiredDailyBurn: number;
  };
}

export interface CommandCodeBalanceAlertContext {
  reason?: string;
  now?: number;
}

interface AlertLogger {
  warn(object: unknown, message?: string): void;
  error(object: unknown, message?: string): void;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function alertKey(alert: CommandCodeBalanceAlert): string {
  return `${alert.credentialId}:${alert.type}`;
}

function metricSummary(diagnostic: CommandCodeCredentialDiagnostic) {
  const metrics = diagnostic.billing?.metrics;
  if (!metrics) return undefined;
  return {
    currentBalance: roundMetric(metrics.currentBalance),
    expiringBalance: roundMetric(metrics.expiringBalance),
    daysRemaining: metrics.daysRemaining === null ? null : roundMetric(metrics.daysRemaining),
    requiredDailyBurn: roundMetric(metrics.requiredDailyBurn),
  };
}

function buildMessage(
  type: CommandCodeBalanceAlertType,
  credentialId: string,
  value: number,
  threshold: number,
): string {
  return `CommandCode credential ${credentialId} ${type}: ${roundMetric(value)} threshold ${roundMetric(threshold)}`;
}

export function buildCommandCodeBalanceAlerts(
  diagnostics: CommandCodeCredentialDiagnostic[],
  config: CommandCodeBalanceAlertConfig,
): CommandCodeBalanceAlert[] {
  if (!config.enabled) return [];

  const alerts: CommandCodeBalanceAlert[] = [];
  for (const diagnostic of diagnostics) {
    const metrics = diagnostic.billing?.metrics;
    const summary = metricSummary(diagnostic);
    if (!metrics || !summary) continue;

    if (config.minCurrentBalance > 0 && metrics.currentBalance < config.minCurrentBalance) {
      alerts.push({
        type: "low_current_balance",
        credentialId: diagnostic.id,
        message: buildMessage(
          "low_current_balance",
          diagnostic.id,
          metrics.currentBalance,
          config.minCurrentBalance,
        ),
        value: roundMetric(metrics.currentBalance),
        threshold: roundMetric(config.minCurrentBalance),
        metrics: summary,
      });
    }

    if (config.minExpiringBalance > 0 && metrics.expiringBalance < config.minExpiringBalance) {
      alerts.push({
        type: "low_expiring_balance",
        credentialId: diagnostic.id,
        message: buildMessage(
          "low_expiring_balance",
          diagnostic.id,
          metrics.expiringBalance,
          config.minExpiringBalance,
        ),
        value: roundMetric(metrics.expiringBalance),
        threshold: roundMetric(config.minExpiringBalance),
        metrics: summary,
      });
    }

    if (
      config.maxRequiredDailyBurn > 0 &&
      metrics.requiredDailyBurn > config.maxRequiredDailyBurn
    ) {
      alerts.push({
        type: "high_required_daily_burn",
        credentialId: diagnostic.id,
        message: buildMessage(
          "high_required_daily_burn",
          diagnostic.id,
          metrics.requiredDailyBurn,
          config.maxRequiredDailyBurn,
        ),
        value: roundMetric(metrics.requiredDailyBurn),
        threshold: roundMetric(config.maxRequiredDailyBurn),
        metrics: summary,
      });
    }
  }

  return alerts;
}

export class CommandCodeBalanceAlertManager {
  private readonly config: CommandCodeBalanceAlertConfig;
  private readonly logger: AlertLogger;
  private readonly lastSentAt = new Map<string, number>();

  public constructor(config: CommandCodeBalanceAlertConfig, logger: AlertLogger) {
    this.config = config;
    this.logger = logger;
  }

  public async check(
    diagnostics: CommandCodeCredentialDiagnostic[],
    context: CommandCodeBalanceAlertContext = {},
  ): Promise<CommandCodeBalanceAlert[]> {
    const now = context.now ?? Date.now();
    const alerts = buildCommandCodeBalanceAlerts(diagnostics, this.config);
    const dueAlerts = alerts.filter((alert) => this.isDue(alert, now));
    if (dueAlerts.length === 0) return alerts;

    const payload = {
      service: "commander-commandcode-bridge",
      kind: "commandcode_balance_alert",
      generatedAt: new Date(now).toISOString(),
      reason: context.reason ?? "periodic",
      alerts: dueAlerts,
    };

    this.logger.warn(payload, "CommandCode balance threshold alert");
    await this.sendWebhook(payload);

    for (const alert of dueAlerts) {
      this.lastSentAt.set(alertKey(alert), now);
    }

    return alerts;
  }

  private isDue(alert: CommandCodeBalanceAlert, now: number): boolean {
    const lastSentAt = this.lastSentAt.get(alertKey(alert)) ?? 0;
    return now - lastSentAt >= this.config.repeatMs;
  }

  private async sendWebhook(payload: unknown): Promise<void> {
    if (!this.config.webhookUrl) return;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.webhookBearer) {
      headers.Authorization = `Bearer ${this.config.webhookBearer}`;
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        this.logger.error(
          { status: response.status, statusText: response.statusText },
          "CommandCode balance alert webhook failed",
        );
      }
    } catch (error) {
      this.logger.error({ err: error }, "CommandCode balance alert webhook failed");
    }
  }
}
