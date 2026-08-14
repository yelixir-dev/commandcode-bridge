import { describe, expect, it } from "vitest";

import { dashboardHtml } from "../src/dashboard.js";

describe("dashboard UI", () => {
  it("shows the summed current balance inline next to the credentials heading", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
    });

    expect(html).toContain('id="credTotalBalance"');
    expect(html).toContain("Number(bm.currentBalance??b?.currentBalance??bm.monthlyCredits)");
    expect(html).toContain("tr('totalBalanceLabel')+'$'+total.toFixed(2)");
    expect(html).toContain("totalBalanceLabel:'현재 총 잔액 : '");
    expect(html).toContain("totalBalanceLabel:'Total balance: '");
    expect(html).toContain("totalBalanceLabel:'当前总余额：'");
  });

  it("annotates ready credentials with the active upstream path", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [
        { id: "alpha", enabled: true, apiKeyConfigured: true, providerApiAccess: true },
      ],
      models: [],
    });

    expect(html).toContain("c.providerApiAccess===true?tr('officialApi'):tr('apiProxy')");
    expect(html).toContain("officialApi:'공식 API'");
    expect(html).toContain("apiProxy:'API 프록시'");
    expect(html).toContain("officialApi:'official API'");
    expect(html).toContain("apiProxy:'API proxy'");
  });

  it("shows the bridge version in the header instead of the endpoint", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
      bridge: { online: true, endpoint: "0.0.0.0:9992", version: "1.14.0" },
    });

    expect(html).toContain('id="bridgeVersion"');
    expect(html).toContain("v1.25.0.b");
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

  it("lays out bind host and port on one compact row with a client key field", () => {
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
    expect(html).toContain("cmdbr-랜덤6");
    expect(html).toContain('id="generateBridgeKey"');
    expect(html.indexOf('id="generateBridgeKey"')).toBeLessThan(html.indexOf('id="copyBridgeKey"'));
    expect(html).toContain('id="copyBridgeKey"');
    expect(html).toContain("🎲");
    expect(html).toContain("💾");
    expect(html).toContain("📋");
    expect(html).toContain("sk-");
    expect(html).toContain('id="saveBridgeKey"');
    expect(html).not.toContain('id="bridgeKeyInfo"');
    expect(html).toContain("외부 /v1 호출용 key");
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

  it("renders every credential as a closed native disclosure card", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "alpha", enabled: true, apiKeyConfigured: true }],
      models: [],
    });
    const credentialRender = html.slice(
      html.indexOf("$('creds').innerHTML"),
      html.indexOf("document.querySelectorAll('[data-cid]')"),
    );

    expect.soft(credentialRender).toContain('<details class="cred credential-fold"');
    expect.soft(credentialRender).toContain("<summary");
    expect.soft(credentialRender).toContain('class="credential-body"');
    expect.soft(credentialRender).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
    expect.soft(html).toContain(".credential-fold:not([open]) .credential-body");
    expect.soft(html).toContain(".provider-fold:not([open]) .provider-models{display:none}");
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

  it("includes duplicate API key validation in the dashboard save flow", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "alpha", apiKeyConfigured: true, apiKeyPreview: "alph…cret" }],
      models: [],
    });

    expect(html).toContain("duplicateCredentialMessage");
    expect(html).toContain("이미 등록된 키입니다");
    expect(html).toContain("Duplicate CommandCode API key");
  });

  it("uses a stored client API key when one is available", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
      bridgeApiKey: "test-admin-token",
    });

    expect(html).toContain(
      "authKey(cfg?.bridgeApiKey)||authKey(localStorage.getItem('bridgeApiKey'))",
    );
    expect(html).toContain("'authorization':'Bearer '+key");
  });

  it("does not treat redacted admin API key values as usable write credentials", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
      bridgeApiKey: "[REDACTED]",
    });

    expect(html).toContain("function isRedactedSecret");
    expect(html).toContain("authKey(cfg?.bridgeApiKey)");
    expect(html).toContain("const configured=authKey(cfg?.bridgeApiKey)");
    expect(html).toContain("return isRedactedSecret(key)?''");
  });

  it("does not ask for the current admin key before save or restart", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
      bridgeApiKey: "[REDACTED]",
    });

    expect(html).not.toContain('id="adminAuthKey"');
    expect(html).not.toContain("function fullAdminAuthKey");
    expect(html).not.toContain("현재 Admin API Key");
    expect(html).not.toContain("Current Admin API Key");
    expect(html).not.toContain("当前管理员 API Key");
  });

  it("can generate and persist a random client API key from the dashboard", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
      bridgeApiKey: "[REDACTED]",
    });

    expect(html).toContain("function randomBridgeKey");
    expect(html).toContain("new Uint8Array(24)");
    expect(html).not.toContain("new Uint8Array(3)");
    expect(html).not.toContain("Math.random()");
    expect(html).toContain("cmdbr-");
    expect(html).toContain("generateBridgeKey");
    expect(html).toContain("pendingBridgeApiKey");
    expect(html).toContain("currentBridgeAuthKey()||(!pendingBridgeKey?fullBridgeKey():'')");
    expect(html).toContain("bridgeApiKey:pendingKey");
    expect(html).toContain("Pending Client API key saved");
  });

  it("keeps the JSON save action legible against the dark footer", () => {
    const html = dashboardHtml();

    expect
      .soft(html)
      .toContain(
        ".footerbar #save{background:var(--paper);color:var(--ink);border-color:var(--paper)}",
      );
    expect
      .soft(html)
      .toContain(
        ".footerbar #save:hover{background:var(--gold);color:var(--ink);border-color:var(--gold)}",
      );
  });

  it("keeps client API key setup visible for loopback binding", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
    });
    const syncBridgeKey = html.slice(
      html.indexOf("function syncBridgeKey"),
      html.indexOf("function setDirty"),
    );

    expect.soft(html).toContain('id="bridgeKeyWrap"');
    expect.soft(syncBridgeKey).not.toContain("wrap.style.display");
  });

  it("builds save payloads from current relative-page DOM inputs instead of stale cfg state", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "default", apiKeyConfigured: true }],
      models: [],
    });

    expect(html).toContain("function credentialPayloads");
    expect(html).toContain("document.querySelectorAll('[data-cid]')");
    expect(html).toContain("data-original-id");
    expect(html).toContain("originalIds.set(i,e.dataset.originalId");
    expect(html).toContain("document.querySelector('[data-ckey=\"'+i+'\"]')");
    expect(html).toContain("api('/admin/config'");
    expect(html).toContain("api('/admin/restart'");
    expect(html).not.toContain("/Users/yorha");
  });

  it("uses a three-second modal popup for explicit save feedback", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "default", apiKeyConfigured: true }],
      models: [],
    });

    expect(html).toContain('id="modal"');
    expect(html).toContain(".modal{position:fixed");
    expect(html).toContain("function showPopup(t,ms=0)");
    expect(html).toContain("function popup(t,ms=3000)");
    expect(html).toContain("popup(tr('jsonSaved'),3000)");
  });

  it("keeps the restart popup open in five-second health/config polling windows", () => {
    const html = dashboardHtml({
      server: { host: "0.0.0.0", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "default", apiKeyConfigured: true }],
      models: [],
    });

    expect(html).toContain("async function load(){");
    expect(html).toContain(
      "return {ok:true,dirty:!!cfg.dirty,restartRequired:!!cfg.restart_required}",
    );
    expect(html).toContain("async function waitForRestart()");
    expect(html).toContain("elapsed=5;elapsed<=30;elapsed+=5");
    expect(html).toContain("setTimeout(r,5000)");
    expect(html).toContain("showPopup(tr('restartRequested')+");
    expect(html).toContain(
      "if(state?.ok&&!state.dirty&&!state.restartRequired){hidePopup(); return true;}",
    );
    expect(html).toContain("Restart did not finish cleanly within 30s");
    expect(html).not.toContain("if($('online').textContent==='online')return");
  });

  it("adds a flag language selector beside the compact brand title", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
    });

    expect(html).toContain('class="brand-row"');
    expect(html).toContain('class="lang-switch"');
    expect(html).toContain('data-lang="ko"');
    expect(html).toContain('data-lang="en"');
    expect(html).toContain('data-lang="zh"');
    expect(html).toContain("🇰🇷");
    expect(html).toContain("🇺🇸");
    expect(html).toContain("🇨🇳");
    expect(html).toContain("filter:grayscale(1)");
    expect(html).toContain(".brand h1{font-size:16px");
  });

  it("groups models by provider in closed native disclosure elements", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [
        { id: "qwen/off", provider: "Qwen", enabled: false },
        { id: "deepseek/on", provider: "DeepSeek", enabled: true },
        { id: "qwen/on", provider: "Qwen", enabled: true },
        { id: "openai/on", provider: "OpenAI", enabled: true },
      ],
    });
    const modelRender = html.slice(
      html.indexOf("$('models').innerHTML="),
      html.indexOf("function randomBridgeKey"),
    );

    expect.soft(modelRender).toMatch(/(?:Map|groupBy|reduce)[\s\S]*provider/);
    expect.soft(modelRender).toContain("<details");
    expect.soft(modelRender).toContain("<summary");
    expect.soft(modelRender).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
    expect.soft(modelRender).toContain("data-provider");
    expect.soft(modelRender).toContain("data-enabled");
    expect.soft(modelRender).toContain("data-total");
    expect.soft(modelRender).toMatch(/summary[\s\S]*provider[\s\S]*enabled[\s\S]*\/[\s\S]*total/);
    expect.soft(modelRender).toMatch(/provider[\s\S]*\.sort\(/);
    expect.soft(html).toContain(".provider-fold:not([open]) .provider-models{display:none}");
  });

  it("places enable-all and disable-all controls beside the models heading", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
    });
    const heading = html.slice(html.indexOf('data-i18n="models"'), html.indexOf('id="models"'));
    expect(heading).toContain('id="enableAllModels"');
    expect(heading).toContain('id="disableAllModels"');
    expect(heading.indexOf("enableAllModels")).toBeLessThan(heading.indexOf("disableAllModels"));
    expect(html).toContain("function setAllModels(enabled)");
    expect(html).toContain("enableAllModels:'모두 켜기'");
    expect(html).toContain("disableAllModels:'모두 끄기'");
    expect(html).toContain("enableAllModels:'Enable all'");
    expect(html).toContain("disableAllModels:'Disable all'");
  });

  it("updates a provider enabled count without rebuilding its open details element", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [
        { id: "qwen/off", provider: "Qwen", enabled: false },
        { id: "qwen/on", provider: "Qwen", enabled: true },
      ],
    });
    const modelRender = html.slice(
      html.indexOf("$('models').innerHTML="),
      html.indexOf("function randomBridgeKey"),
    );
    const checkboxHandler = modelRender.slice(
      modelRender.indexOf("querySelectorAll('[data-mid]')"),
    );

    expect.soft(checkboxHandler).toContain("closest('details')");
    expect.soft(checkboxHandler).toContain("data-enabled");
    expect.soft(checkboxHandler).toContain("textContent");
    expect.soft(checkboxHandler).not.toContain("render()");
    expect.soft(checkboxHandler).not.toContain("innerHTML");
  });

  it("exposes the emil palette and Georgia typography as dashboard design tokens", () => {
    const html = dashboardHtml();
    const rootRules = html.slice(html.indexOf(":root"), html.indexOf("*{box-sizing"));

    for (const color of ["#28231f", "#f1ede5", "#fffdf8", "#9f4d2e", "#1f6f78", "#b57920"]) {
      expect.soft(rootRules.toLowerCase()).toContain(color);
    }
    const georgiaToken = rootRules.match(/(--[\w-]+):\s*Georgia(?:,|;)/);
    expect.soft(georgiaToken).not.toBeNull();
    if (georgiaToken) expect.soft(html).toContain(`font-family:var(${georgiaToken[1]})`);
  });

  it("renders rolling window quota and exceeded markers", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [],
      models: [],
    });

    expect(html).toContain("tr('quota')");
    expect(html).toContain("quotaExceeded?' ('+tr('quotaExceeded')+')':''");
    expect(html).toContain("wf.used.toFixed(2)+'/'+wf.cap+' · '+ww.used.toFixed(2)+'/'+ww.cap");
    expect(html).toContain("quota:'쿼타 5h/1w'");
    expect(html).toContain("quotaExceeded:'쿼타 초과'");
    expect(html).toContain("quotaExceeded:'quota exceeded'");
    expect(html).toContain(".kv b.bad{color:var(--bad)}");
  });

  it("places the save/restart bar above the server bind card", () => {
    const html = dashboardHtml();
    expect(html.indexOf('class="footerbar"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="footerbar"')).toBeLessThan(html.indexOf('<section class="grid">'));
  });

  it("extracts the upstream error message from save failures", () => {
    const html = dashboardHtml();
    expect(html).toContain("function saveErrorMessage(e)");
    expect(html).toContain("const msg=j?.error?.message");
    expect(html).toContain("tr('saveFailed')+saveErrorMessage(e)");
  });

  it("contains Korean, English, and Chinese dashboard translations with locale fallback", () => {
    const html = dashboardHtml({
      server: { host: "127.0.0.1", port: 9992 },
      routing: { policy: "daily_burn_priority", maxInFlightPerCredential: 4 },
      credentials: [{ id: "default", apiKeyConfigured: true }],
      models: [],
    });

    expect(html).toContain("const translations=");
    expect(html).toContain("navigator.language");
    expect(html).toContain("function detectLang()");
    expect(html).toContain("CommandCode Bridge 콘솔");
    expect(html).toContain("CommandCode Bridge Console");
    expect(html).toContain("CommandCode Bridge 控制台");
    expect(html).toContain("설정 로드 실패");
    expect(html).toContain("Config load failed");
    expect(html).toContain("配置加载失败");
    expect(html).toContain("잔액/남은일수 우선");
    expect(html).toContain("Balance / days remaining first");
    expect(html).toContain("优先余额/剩余天数");
  });
});
