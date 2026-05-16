import { describe, expect, it } from "vitest";

import { dashboardHtml } from "../src/dashboard.js";

describe("dashboard UI", () => {
  it("shows the bridge version in the header instead of the endpoint", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
      bridge: { online: true, endpoint: "0.0.0.0:9992", version: "0.1.0" },
    });

    expect(html).toContain('id="bridgeVersion"');
    expect(html).toContain("v0.1.0");
    expect(html).not.toContain('id="endpoint"');
  });

  it("shows only the key-level concurrency field, not total concurrency controls", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
    });

    expect(html).toContain("키당 동시 요청");
    expect(html).toContain('id="maxPer"');
    expect(html).toContain("운영 기본값은 키당 4회입니다.");
    expect(html).toContain("concurrencyInfo");
    expect(html).toContain("concurrency-row");
    expect(html).toContain("concurrency-spacer");
    expect(html).not.toContain('id="maxMult"');
    expect(html).not.toContain('id="maxTotal"');
    expect(html).not.toContain("총 동시요청");
  });

  it("lays out bind host and port on one compact row with an admin key field", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
      bridgeApiKey: "sk-cmdbridge-a1b2c3",
    });

    expect(html).toContain("bind-grid");
    expect(html).not.toContain("bind-help");
    expect(html).toContain('id="bridgeApiKey"');
    expect(html).toContain('type="text"');
    expect(html).toContain("bridge-key-row");
    expect(html).toContain("bridge-key-help-row");
    expect(html).toContain("bridge-key-prefix");
    expect(html).toContain('id="copyBridgeKey"');
    expect(html).toContain("💾");
    expect(html).toContain("📋");
    expect(html).toContain("sk-");
    expect(html).toContain('id="saveBridgeKey"');
    expect(html).not.toContain('id="bridgeKeyInfo"');
    expect(html).toContain("0.0.0.0/LAN 공개 시 필요");
    expect(html).toContain("sk-cmdbridge-a1b2c3");
    expect(html).toContain("cfg?.bridgeApiKey");
  });

  it("renders a per-credential enable toggle before the delete button", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "alpha", enabled: true, apiKeyConfigured: true }],
      models: [],
    });

    expect(html).toContain("data-cenabled");
    expect(html.indexOf("data-cenabled")).toBeLessThan(html.indexOf("data-del"));
  });

  it("keeps save/restart actions in normal document flow with no overlay hit-target", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
    });

    expect(html).toContain(".footerbar{position:relative");
    expect(html).not.toContain(".footerbar{position:fixed");
    expect(html).toContain(".toast{position:fixed");
    expect(html).toContain("top:10px");
    expect(html).toContain("pointer-events:none");
    expect(html).toContain("@media(max-width:520px)");
    expect(html).toContain(".footerbar{grid-template-columns:minmax(0,1fr) minmax(0,1fr)");
    expect(html).toContain(".footerbar .token{grid-column:1/-1");
    expect(html).toContain(".footerbar button{width:100%;min-width:0}");
  });
});
