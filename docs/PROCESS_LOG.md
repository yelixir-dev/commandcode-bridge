# Process Log

## 2026-05-11

- Selected the direct CommandCode `/alpha/generate` bridge design instead of per-request `cmd -p` subprocess wrapping.
- Created isolated workspace: `~/workspace/commandcode-bridge`.
- Recorded PRD and implementation plan before production implementation.
- TDD policy: tests are written before source implementation.

## Evidence from reconnaissance

- `COMMANDCODE_SANDBOX=true COMMANDCODE_API_URL=http://127.0.0.1:<port>` allows capturing CLI traffic without spending upstream tokens.
- `GET /alpha/whoami` succeeds with the API key in `~/.commandcode/auth.json`.
- `POST /alpha/generate` succeeds with `params.stream=true` and returns JSON-line/SSE-like events.
- `params.stream=false` is rejected with HTTP 400.
- Live bridge smoke found a stale process on `127.0.0.1:9992`; always check/clear port ownership before validating a fresh build.
- Current account state returns an application-level stream error over HTTP 200: `Insufficient Balance` with `statusCode: 402`. The bridge now maps this to non-streaming HTTP 502 `commandcode_event_error` and streaming SSE error + `[DONE]`.
- Start-only upstream streams are treated as `commandcode_empty_response`; blank OpenAI 200 completions with zero usage are not accepted as success.
- Independent review found and fixed two release blockers: Docker build inputs now include `tsconfig.build.json`/`vitest.config.ts`, and streaming upstream exceptions are converted into SSE error frames plus `[DONE]` instead of resetting the client stream.
- Added `.dockerignore`, logger secret-header redaction, env model-alias normalization, and removed unverified `MemoryDenyWriteExecute=true` from the systemd unit because it can break Node/V8 JIT.

## 2026-05-12

- Updated default CommandCode CLI header to `0.26.7`.
- Added multi-key upstream credential loading: `COMMANDCODE_CREDENTIALS_FILE`, `COMMANDCODE_CREDENTIALS`, `COMMANDCODE_API_KEYS`, and legacy `COMMANDCODE_API_KEY` fallback.
- Added `round_robin` and `depletion_aware` routing. Depletion-aware routing caches `/alpha/billing/credits`, `/alpha/billing/subscriptions`, and `/alpha/usage/summary` snapshots per credential and routes expiring credits first.
- Added credential health rules and failover: 401 disables, 402 drains/cools down, 429/5xx/timeouts cooldown, and pre-visible-output stream errors can retry on another credential.
- `/health` now reports credential count and routing policy without exposing raw upstream keys.

## 2026-05-16

- Renamed the workspace/package from `commander-commandcode-bridge` to `commandcode-bridge`; removed the old internal remote pending future GitHub publication.
- Added Hermes/OpenAI `developer` role compatibility by folding developer messages into the upstream system prompt.
- Fixed two tool-call reliability blockers found during strict review: malformed `tool_calls` now fail OpenAI-style validation, and normal Fastify request close no longer aborts upstream generation.
- Hardened follow-up tool history conversion: assistant `tool_calls` are no longer flattened into visible prose such as `Assistant requested tool calls`, tool results no longer expose OpenAI call IDs, and a system guard marks prior function context as internal bridge context.
- Verification: `npm run typecheck`, all 72 Vitest tests, `npm run build`, LaunchAgent restart, `/health`, and Hermes provider tool-loop smoke all passed.

## 2026-05-18 to 2026-06-25

- Extracted the model catalog, aliases, and pricing into `src/model-catalog.ts`.
- Added startup configuration smoke coverage and hardened server configuration validation.
- Added a Korean, English, and Chinese dashboard language switcher with persisted selection, plus `README.zh.md`.
- Kept the bridge aligned with CommandCode releases from `0.26.7` through `0.40.3`; most intervening commits were version and catalog synchronization.

## 2026-07-24

- Aligned request conversion, types, the model catalog, and tests with the CommandCode `1.3.1` contract.
- Preserved `developer` messages and tool-call history across the revised upstream request shape.

## 2026-08-06

- Established CommandCode `1.14.0` as the release baseline and added per-model context-window metadata.
- Added `DESIGN.md` and refreshed the architecture, deployment, security, and multilingual README documentation.
- Expanded credential routing, dashboard, server configuration, and contract test coverage for the new release.

## 2026-08-07

- Released bridge version `1.14.0.c`.
- Made the official CommandCode Provider API the default path, with startup model-catalog refresh and the legacy `/alpha/generate` tunnel retained for unsupported plans and Claude models.
- Added quota-aware multi-key routing, soonest-expiring balance drain priority, pre-output failover, and a configurable five-attempt transient retry budget.
- Hardened admin authentication and credential updates with timing-safe comparison and secret preservation.
- Consolidated the admin API key field into the server configuration card and surfaced backend save errors in the dashboard.

## 2026-08-15

- Released bridge version `1.14.0.d`.
- Forwarded OpenAI follow-up tool history to Alpha as native `tool-call` / `role:tool` parts instead of flattening it into user text, so non-streaming tool loops can complete after the first call.

## 2026-08-15

- Released bridge version `1.14.0.e`.
- Added warn-level empty-visible diagnostics, a one-shot non-streaming retry for `finish_reason=length` with no visible text or tool calls, JSON guidance for compatibility-probe 404s, and runtime `bridgeApiKeySource` on `/health` and `/admin/config`.

## 2026-08-15

- Released bridge version `1.14.0.f`.
- Retrieve unencoded slash model ids on `GET /v1/models/*`, and treat Alpha forced/`required` `tool_choice` as auto instead of returning 400.

## 2026-08-15

- Released bridge version `1.25.0.a` aligned with CommandCode CLI `1.25.0`.
- Added `zai-org/GLM-5.3`, `google/gemini-3.7-flash`, and `xai/grok-4.6` to the static catalog (55 models). CLI 1.22 itself only merged `read_multiple_files` into `read_file` and does not change the bridge wire.

## 2026-08-15

- Released bridge version `1.25.0.b`.
- Added dashboard enable-all / disable-all controls beside the models heading.

## 2026-08-19

- Released bridge version `1.28.1.a` aligned with CommandCode CLI `1.28.1`.
- Added `Qwen/Qwen3.8-27B` to the static catalog (56 models). GPT-5.6 Sol advertised price stays $5/$30 after the 1.27.1 standard-pricing note.

## 2026-08-21

- Released bridge version `1.31.0.a` aligned with CommandCode CLI `1.31.0`.
- Added `stealth/ox-alpha` (free stealth preview, 1,048,576 context) to the static catalog (57 models) and added the `claude-haiku-4-5` alias now published by the CLI.
- Repriced DeepSeek V4 Pro/Flash (off-peak $0.66/$1.98 and $0.22/$0.66; peak rates noted) and GPT-5.6 Terra/Luna ($2/$12, $0.2/$1.2) to the current published rates.
- Filled static context windows from the live Provider API (GLM-5.1, MiniMax M2.7, Qwen 3.6 Max Preview/Plus, GPT-5.5) and corrected Qwen 3.8 27B/Tencent Hy3 to 262,144 and Gemini 3.7 Flash/Muse Spark/Ox Alpha to 1,048,576.

## 2026-08-21

- Released bridge version `1.32.1.a` aligned with CommandCode CLI `1.32.1`.
- Added `deepseek/deepseek-v4-flash-vision-exp` to the static catalog (58 models).
- Client disconnects during a completion now release the credential slot without recording a failure or cooldown, abort the upstream body read, and log a single info line instead of a 500 "Unhandled chat completion error"; previously an abort parked the credential in cooldown and burst requests failed 503.
- Tool-call events whose name arrives as multiplexed XML-ish frames (observed on `stealth/ox-alpha`) are split into separate OpenAI `tool_calls` with deterministic ids, with a `commandcode_multiplexed_tool_call` warn log.
- Live QA against `stealth/ox-alpha` verified: streaming tool calls, forced single tools, parallel tool calls, three-result tool history follow-ups, and abort-then-burst recovery.

## 2026-08-21

- Merged PR `ef7e64d` (author 이재현, branch `pr-2-rebased`): `fix(openai): forward CommandCode cache usage` — OpenAI usage objects now carry `prompt_tokens_details.cached_tokens` from upstream `cachedInputTokens`/`inputTokenDetails.cacheReadTokens`, in both non-stream and stream usage chunks. Merged into local `main` via fast-forward; combined tree passes all gates.
- Released bridge version `1.32.1.b`.
- CLI 1.32.1 bundle drift audit (one-shot field-level diff of `/alpha/generate`): the bridge now defaults `max_tokens` to the CLI wire value `64000` when the client omits it, forwards OpenAI `reasoning_effort` into Alpha params, drops the vestigial `x-co-flag` header the CLI no longer sends, and sends `x-cmd-zdr: 1` when `COMMANDCODE_ZDR` is on (matching the CLI's `buildCommandAuthHeaders`). Verified parity: body envelope (`config`/`memory`/`taste`/`skills`/`permissionMode`/`threadId`), `toWireMessages`/`toWireTools` shapes, and the remaining header set.

## 2026-08-25

- Updated the locally installed CommandCode CLI from `1.32.1` to `1.32.2`.
- Audited the npm package diff and installed bundle. The release fixes the BYOK model picker and malformed tool-result session recovery; the Alpha endpoint constants and adjacent wire contract remain unchanged, so no bridge protocol change was required.
- Confirmed the static catalog remains at 58 models. CommandCode's reference table only corrected the unexposed cache-read price for `deepseek/deepseek-v4-flash-vision-exp` from `$0.01` to `$0.007`.
- Released bridge version `1.32.2.a`, updated the default advertised CLI version, and aligned all English, Korean, and Chinese README version references.

## 2026-08-26

- Updated the locally installed CommandCode CLI from `1.32.2` to `1.36.0` and audited the complete npm package diff across releases 1.33.0 through 1.36.0.
- Added `z-ai/glm-5.3-flash`, `minimax/minimax-m3-free`, `minimax/minimax-m2.7-free`, and `Qwen/Qwen3.8-Flash`; retired `stealth/ox-alpha`. The static catalog now contains 61 models.
- Compared the Alpha request function around `/alpha/generate`: request envelope, headers, message/tool conversion, reasoning effort, 64K default output limit, and stream contract remain semantically unchanged. Existing generic multiplexed tool-call handling covers GLM-5.3 Flash without a model-specific parser.
- Released bridge version `1.36.0.a`, updated the default advertised CLI version, and aligned all English, Korean, and Chinese README version references and model tables.

## 2026-08-29

- Updated the locally installed CommandCode CLI from `1.36.0` to `1.38.2` and audited npm releases 1.37.0 through 1.38.2.
- Added `tencent/hy4-preview` with a 1,048,576-token context window and published `$0.834/M` input, `$2.501/M` output pricing. Updated Gemini 3.7 Flash to the corrected `$1.5/M` input and `$7.5/M` output pricing. The static catalog now contains 62 models.
- Audited the Alpha request and stream implementation for reasoning effort and tool-call changes. Custom-agent reasoning effort and Tencent tool-efficiency improvements are CLI-local; the bridge already forwards `reasoning_effort` and emits canonical tool messages, so no protocol parser change was required.
- Released bridge version `1.38.2.a`, updated the default advertised CLI version, and aligned English, Korean, and Chinese README version references and model tables.

## 2026-09-04

- Aligned the bridge from `1.38.2.a` to `1.49.0.a` with CommandCode CLI `1.49.0`. npm metadata confirms both CLI releases require Node.js `>=22`; runtime dependencies are unchanged, with only development-dependency ordering changed in the package manifest.
- Audited `npm diff --diff=command-code@1.38.2 --diff=command-code@1.49.0 --diff-name-only`, the changelog, and every changed readable bundled reference. The published model table adds eight models and removes the two MiniMax Free models, leaving 68 visible canonical models. No retained model's advertised input/output prices or context windows changed.
- Added `deepseek/deepseek-v4-flash-fast` (1,000,000 context; $0.28/$0.56 input/output per million tokens), `Qwen/Qwen3.8-Max-0902` (1,000,000; $2/$6), `meituan/LongCat-2.0:free` (1,048,576; $0/$0), `claude-fable-5-1` (1,000,000; $10/$50), `gpt-6-astra` (1,050,000; $10/$50), `google/gemini-3.8-flash` (1,000,000; $1.5/$7.5), `meta/muse-spark-1.3` (1,048,576; $1.25/$4.25), and `meta/muse-spark-1.3-contributor` (1,048,576; $0.1/$0.2). Prices come from the shipped official `models.md`; exact context integers come from the installed bundle's model definitions/context map, not rounded table labels. Existing Provider-derived context metadata remains intact.
- Retired `minimax/minimax-m3-free` and `minimax/minimax-m2.7-free`, including their four previously shipped aliases. The CLI still recognizes these historical ids but marks their definitions hidden; the changelog explicitly retires them and the current model table omits them. Persisted retired entries and allowlists are filtered, retired defaults fall back to DeepSeek V4 Pro, and unknown-model mode cannot bypass retirement. Custom models and the six established enabled defaults are preserved; all eight additions are opt-in.
- Independent read-only wire audit found no upgrade-specific protocol change: Alpha envelope, headers, 64,000 default output limit, reasoning-effort serialization, message/tool conversion, and stream consumption remain unchanged apart from binding renames. Provider-binding auth selection, browser sign-in, feature-model ZDR filtering, compaction, document reads, and TUI/config behavior are CLI-local. No protocol code changed; this is not a claim of full bridge/CLI parity. Existing text-only EOF acceptance, string-error loss, and tool input/args precedence are separate audit candidates, not part of this release.
- Updated all current English, Korean, and Chinese README version/catalog badges and tables, deployment defaults, environment example, package/lockfile versions, and dashboard/version assertions. Preserved earlier process-log entries and the untracked local `AGENTS.md`.
- Regression-first verification observed 10 expected failures before implementation (version, catalog, context, dashboard, and six retired-id cases). Focused config/dashboard/Alpha/Provider/server tests then passed: 122 tests in five files. Full `npm test` passed once: 222 tests in 15 files. LSP diagnostics on all five changed TypeScript files, `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Built-artifact HTTP QA used isolated HOME/config/auth, a local unused port, Alpha mode, and a non-routable upstream. The listening log event signaled readiness without polling. `/health` returned `1.49.0.a`, `/v1/models` returned all 68 canonical models (192 entries with aliases) with matching context fields, and an empty chat request returned structured `400 invalid_request`. Both QA processes were stopped. `node dist/index.js --help` still starts the HTTP server rather than printing help; this existing behavior was observed and its process stopped.

## 2026-10-03 (1.74.0.b)

- Released bridge-only version `1.74.0.b` on CommandCode CLI `1.74.0` with PR #7 (commit `187107e`, merge `278e83a`) and PR #8 (commit `5f5141a`, merge `0eea7eb`) from WhatAHappyPig (`A8Cl233395`).
- PR #7: CommandCode reports a drained key as HTTP 400 with an "insufficient credits" message rather than 402, and the bridge treated every 400 as client-scoped, so the key stayed in rotation and kept failing. Both paths now pass the upstream error message to the router; a 400 matching `insufficient (credits|balance)` is credential-scoped and starts an `insufficient_credits` cooldown of `max(COMMANDCODE_CREDENTIAL_COOLDOWN_MS, billing refresh)`. Unlike 402, a billing refresh does not clear it, because upstream pre-charges the estimated cost and a positive balance can still be too small. The installed CLI 1.74.0 uses the same check (`400 === status && message.toLowerCase().includes("insufficient credits")`).
- PR #8: one shared `shouldRetryStatus(statusCode, errorMessage)` now drives both paths. Insufficient-credits 400s and 403s rotate to another key within the request (the Alpha path did not retry 403 before), with the failed key excluded for the rest of the request. Other 400/404/422 fail fast; 429/5xx keep retrying without a cooldown.
- With a single key, a drained key now returns `NoAvailableCommandCodeCredentialError` (503) for the cooldown window instead of repeating the upstream 400. The dashboard shows the new state as "Cooling" because it reads `disabledUntil`. `PREMIUM_CREDITS_EXHAUSTED`, which the CLI also recognizes, is not classified.
- Updated the README routing paragraph (English, Korean, Chinese), `docs/KNOW_HOW.md`, `docs/ARCHITECTURE.md`, and both deployment guides.
- Verification: PR CI passed on Node 20/22/24 for both PRs; locally #7 alone passed 299 tests and #7 + #8 on `main` passed 303 tests in 16 files, and `npm run verify` passed on the release commit. Built-artifact HTTP QA with two keys against a mock Alpha upstream: a key answering 400 "Insufficient credits" made the first request rotate to the other key and succeed (200), later requests skipped the drained key, and a plain 400 made exactly one upstream call and failed.

## 2026-10-02 (1.74.0.a)

- Updated the locally installed CommandCode CLI from `1.66.0` to `1.74.0` and released bridge version `1.74.0.a`.
- Audited the changelog for 1.67.0 through 1.74.0, `npm diff --diff=command-code@1.66.0 --diff=command-code@1.74.0` (changed: `package.json`, `CHANGELOG.md`, bundled knowledge/config/mod-builder references, `dist/cli.mjs`, and the VS Code extension archive), and the bundled `models.md`.
- Added four opt-in models from the installed bundle, in `models.md` row order: `deepseek/deepseek-v4.1-flash-fast` (1,000,000 context; $0.16/$0.58), `inclusionai/ling-3.1-flash:free` (262,144; $0/$0), `claude-sonnet-5-5` (1,000,000; $2/$10), and `gpt-6.1-sol` (1,050,000; $2/$10). Context integers come from the bundle's context map.
- Retired `stealth/pixel-canary`: 1.73.1 hides it after its stealth preview ended on 2026-09-30 at 11 PM Pacific (`get hidden(){return isPixelCanaryEnded()}`) and the current `models.md` omits it. It joins `LEGACY_RETIRED_MODEL_IDS` instead of being aliased.
- Repriced `xai/grok-4.7` from `$1.2/$3.6` to `$2/$6`.
- Re-derived the text-only image set from `isKnownTextOnlyModel`: the only addition is `inclusionai/ling-3.1-flash:free`. The other three new models declare image input.
- Reasoning effort: 1.73.3 adds `off` to the DeepSeek V4/V4.1 effort lists, and the Alpha body builder forwards the selected effort unchanged (`...a?{reasoning_effort:a}:{}`), so the CLI now sends `reasoning_effort: "off"`. The bridge request schema accepted only `minimal` through `max` and returned 400 for `off`; it now accepts `off` and forwards it on the Alpha path. The Provider path still never forwards `reasoning_effort`, which matches the CLI provider bindings that drop reasoning options for `off`. The 1.73.4 `max` effort for Space Bunny Alpha needs no bridge change because the bridge does not gate efforts per model.
- Wire audit of both bundles found no other bridge-facing change: the `/alpha/generate` body envelope and `params` keys, the 64,000 default `max_tokens`, `toWireMessages`, and the billing/usage probes are identical apart from minifier renames. `buildCommandAuthHeaders` gained an optional `x-cli-surface` header, but it is set only by `cmd acp` (`acp`) and `cmd rpc` (`rpc`), never by the regular CLI the bridge mirrors, so the bridge does not send it. ACP mode, `/rc` remote control, separate planning/implementation models, mod toggles, and BYOK package bumps are CLI-only.
- Aligned current version references in `package.json`, `package-lock.json`, `src/version.ts`, the default `COMMANDCODE_CLI_VERSION`, `.env.example`, `release/env.production.example`, `install.sh`, the deployment guides, the dashboard demo data, and the English, Korean, and Chinese READMEs (badges, catalog baseline, example version, and model tables).
- Regression-first verification observed 9 expected failures before implementation (CLI version, catalog, contexts, four opt-in merges, the Ling 3.1 image limit, and `reasoning_effort: "off"`). `npm run verify` then passed with 293 tests in 16 files, followed by `npm run build`, `npm pack --dry-run` (`commandcode-bridge-1.74.0.a.tgz`, 53 files), and `git diff --check`.
- Built-artifact HTTP QA against a mock Alpha upstream: `/health` reported `1.74.0.a`, `/v1/models` listed opted-in `claude-sonnet-5-5` and `gpt-6.1-sol` but not `stealth/pixel-canary`, an empty chat body returned `400 invalid_request`, `reasoning_effort: "off"` reached the upstream body unchanged with `x-command-code-version: 1.74.0` and no `x-cli-surface`, and an explicitly allowed `stealth/pixel-canary` was still refused with `400 model_not_allowed`. `node dist/index.js --help` still starts the server instead of printing help.

## 2026-10-02 (1.66.0.d)

- Released bridge-only version `1.66.0.d` on CommandCode CLI `1.66.0` with PR #6 from WhatAHappyPig (`A8Cl233395`, commit `48f0bbb`, merge `ec97dcd`).
- Incident: every terminal upstream failure used to call `recordFailure`, including at-capacity errors that arrive as statusless stream `error` events and transient failures that were retried and then succeeded. On a single-key deployment that benched the only key for `COMMANDCODE_CREDENTIAL_COOLDOWN_MS` (60 s), and every request in that window failed in about 1 ms with `NoAvailableCommandCodeCredentialError`.
- Both the Alpha (`/alpha/generate`) and Provider (`/provider/v1/chat/completions`) paths now record a failure only for credential-scoped statuses (401/402/403). HTTP 429/5xx, empty bodies, stream `error` events, network errors, and caller aborts release the in-flight slot without a cooldown. Retries within a request and the per-request exclusion of already-tried keys are unchanged.
- When every credential is cooling down at attempt zero, selection retries with `ignoreCooldown`, so a cooled key still serves; auth-disabled and billing-disabled keys stay excluded.
- `COMMANDCODE_CREDENTIAL_COOLDOWN_MS` now only sets the minimum 402 cooldown. The router still maps 429/5xx/statusless failures to a cooldown when `recordFailure` is called with them, but neither request path does so any more. With several keys, a key-specific 429 no longer steers later requests away for 60 s; only the failing request fails over.
- Updated the README routing paragraph (English, Korean, Chinese), `docs/KNOW_HOW.md`, `docs/ARCHITECTURE.md`, and both deployment guides, which still described 429/5xx/timeout cooldowns.
- Verification: PR CI passed on Node 20/22/24; `npm run verify` on merged `main` passed with 284 tests in 16 files.

## 2026-09-28 (1.66.0.c)

- Released bridge-only version `1.66.0.c` on CommandCode CLI `1.66.0`, importing two routing ideas from kiro-lb (design only; no kiro-lb code, which is AGPL-3.0).
- Session affinity: the credential router remembers which key served a conversation, keyed by a SHA-256 of the system text plus the first user message, and prefers that key on later turns so the upstream prompt cache stays warm. The pin is a preference only: health, capacity, urgent-expiry, and exclusion filters run first, and failover re-pins the conversation to the next choice. Pins expire after `COMMANDCODE_SESSION_AFFINITY_TTL_MS` (default 2 hours, `0` disables) and are capped at 10,000 with least-recently-served eviction. Applies to the Alpha and Provider paths.
- Stable conversation identity: the CLI keeps one random v4 UUID as `threadId`/`x-session-id` for a whole conversation, while the bridge sent a new one per request. The bridge now derives a v4-shaped UUID from the conversation key so every turn shares it. The conversation key itself stays bridge-local and is never sent upstream; the Alpha body keeps exactly the CLI key set.
- Diagnostics and the dashboard credential table report live pinned conversations per key (`activeSessions`).
- Not imported: Rust rewrite, off-request-path billing refresh (it would weaken the pre-selection expiry filter), client setup commands, prompt reduction, and binary releases.
- Verification: `npm run verify` passed with 280 tests in 16 files. A built bridge with three keys against a mock upstream sent three turns of one conversation on one key with one `x-session-id`, moved a second conversation to another key, and reported `activeSessions` 1/1/0.

## 2026-09-27 (1.66.0.b)

- Released bridge-only version `1.66.0.b` on CommandCode CLI `1.66.0`: the dashboard was rebuilt with the kiro-lb operations-console layout in the yelixir.dev palette and typography.
- The new dashboard is three static files in `dashboard/` (`index.html`, `app.css`, `app.js`) with no build step or dependency. `GET /dashboard/` serves them from a fixed whitelist (unknown names and path traversal return 404); `/` and `/dashboard` redirect to `/dashboard/` and keep the query string. The package `files` list and the Docker runtime image now include `dashboard/`.
- Tabs: Overview (five KPI cards, a browser-sampled dithered live-load chart, a balance-by-key donut, credential health with 5-hour and weekly limit meters), Credentials, Models (grouped by provider with search), Settings (bind, client API key, routing policy, per-key concurrency), and Info. It keeps the Korean, English, and Chinese locales, adds a light theme, and adds `?demo` sample data that never calls a write endpoint. It uses only the existing `/health` and `/admin/*` endpoints, so no API contract changed.
- The previous inline dashboard (`src/dashboard.ts`) and its 29 string-level tests (`tests/dashboard-ui.test.ts`) were removed. The last revision serving it is commit `dfc0761`, tagged `legacy-dashboard-1.66.0.a`, which also introduced the preview at `/test-page/`; that preview route is gone now that the page is the dashboard.
- Verification: server tests cover the whitelist, redirects, query preservation, and CSP. Headless Chromium against the built bridge confirmed live and demo rendering, tab and keyboard navigation, model search, the save bar, theme and language switching, no console errors, and no page-level horizontal overflow at 375 px.

## 2026-09-27

- Updated the locally installed CommandCode CLI from `1.53.0` to `1.66.0` and released bridge version `1.66.0.a`.
- Audited `npm diff --diff=command-code@1.53.0 --diff=command-code@1.66.0`, the changelog for 1.53.1 through 1.66.0, and the bundled `models.md` reference. Changed files were `package.json`, `CHANGELOG.md`, the bundled knowledge references, the new bundled `loop` skill, `dist/cli.mjs`, and the VS Code extension archive.
- Added 13 opt-in models from the installed bundle: `z-ai/glm-5.3-flashx`, `xiaomi/mimo-v2.6-pro`, `xiaomi/mimo-v2.6-pro-ultraspeed`, `xiaomi/mimo-v2.6-flash`, `Qwen/Qwen3.8-Omni-Flash`, paid `meituan/LongCat-2.0`, `stepfun/Step-5-Preview`, `stealth/space-bunny-alpha`, `stealth/pixel-canary`, `claude-opus-5-5`, `gpt-6-sol`, `gpt-6-luna`, and `xai/grok-4.7`. Retired `meituan/LongCat-2.0:free` (the CLI now marks it hidden and non-selectable) through `LEGACY_RETIRED_MODEL_IDS`, taking the static catalog from 70 to 82 models. The six established enabled defaults are unchanged.
- Repriced `deepseek/deepseek-v4-flash-vision-exp` to `$0.15/$0.6` and `stepfun/Step-3.5-Flash` to `$0.09/$0.3`; `stepfun/Step-3.5-Flash` context moved from 1,000,000 to 262,144. Context integers come from the bundle's context map, not the rounded table labels.
- Re-derived the text-only image set from `isKnownTextOnlyModel`: the only addition is paid `meituan/LongCat-2.0`, so `src/model-images.ts` strips images for it as the CLI does. All other new models declare image input.
- Wire audit of both bundles found no bridge-facing contract change: the `/alpha/generate` body envelope and `params` keys, the 64,000 default `max_tokens`, `buildCommandAuthHeaders` header names, and `toWireMessages` are identical apart from minifier renames. New additive items stay out of the bridge: a `cache-write-tokens` stream event the CLI folds into usage (the bridge ignores unknown events and never reported cache-write counts), a `conversationId` on the local telemetry span, the Provider API OpenAI Responses endpoint and `/provider/v1/systemone` for `typesafe/jev` (the bridge keeps using `/provider/v1/chat/completions`), and CLI-local `/loop`, herdr, clipboard paste, plan-review, sub-agent card, telemetry, BYOK session-id, and usage-display changes.
- Aligned current version references in `package.json`, `package-lock.json`, `src/version.ts`, the default `COMMANDCODE_CLI_VERSION`, `.env.example`, `release/env.production.example`, `install.sh`, the deployment guides, the dashboard version assertion, and the English, Korean, and Chinese READMEs (badges, catalog baseline, and model tables).
- Regression-first verification observed 17 expected catalog, image, and version failures before implementation.

## 2026-09-16

- Bridge-only release `1.53.0.c` incorporates PR #3 and the image-input policy from issue #5; the CLI baseline remains `1.53.0` and the 70-model catalog is unchanged.
- With `INCLUDE_REASONING=true`, streaming and non-streaming responses return reasoning separately in `reasoning_content`, rather than appending it to `content`. Clients displaying reasoning must read the separate field. Provider empty-response retries count reasoning only when it is exposed.
- Alpha forwards base64 image inputs as native image parts with `mimeType`; remote URLs remain text placeholders. Both transports apply the CLI's 23-model text-only input policy, including aliases, while preserving vision-capable and unknown-model fallback behavior.
- Contributor commits are preserved in the merge of PR #3. The release contains no deployment credentials or environment changes.

## 2026-09-15

- Released bridge version `1.53.0.b` against an unchanged CommandCode CLI `1.53.0`; this is a bridge-only bugfix release and no catalog, model, or version default other than the bridge version string changed.
- Fixed the dashboard restart path reported in issue #4. `auth()` skipped `fullBridgeKey()` whenever `pendingBridgeKey` was set, while the server reported the configured key as `[REDACTED]` and `localStorage` was written only after a successful restart, so the restart request left without an Authorization header and returned 401. The pending key now participates in authentication directly.
- Replaced the silent `restartBridge()` no-op with an explicit `resolveRestartMode({ platform, env })` returning `systemd`, `exit`, `launchctl`, or `unsupported`. An unsupervised linux process now answers `POST /admin/restart` with `restart_requested: false`, a `restart_mode`, and a reason, keeps the configuration marked dirty, and the dashboard shows an instruction to restart the service by hand instead of polling for a restart that cannot happen. The bridge still refuses to exit without a declared supervisor, because an unsupervised exit would end the service rather than restart it.
- Set `COMMANDCODE_BRIDGE_RESTART_MODE=exit` in `docker-compose.yml` and `release/docker-compose.yml` beside the existing `restart: unless-stopped`, and documented the prerequisite in both deployment guides and all three READMEs.
- Stopped forwarding `top_p` and `stop` in the generate body. The CLI wire body built by `toWireMessages`/`postStream` in `command-code@1.53.0` carries only `model`, `messages`, `tools`, `system`, `max_tokens`, `stream`, and optional `temperature` and `reasoning_effort`, so both fields made bridge traffic distinguishable from CLI traffic. Clients may still send them; they are dropped before the upstream request.
- Reviewed PR #3 (`reasoning_content`) against the CLI bundle. Assistant `{type:"reasoning"}` parts and emitting tool-result images as a following `user` message match `toWireMessages` exactly, but the image part field is `mimeType` rather than `mediaType` and the CLI only ever builds image parts from data URIs; those two changes plus a commit split were requested before merge.
- Opened issue #5 for the remaining CLI behavior the bridge cannot yet mirror: the CLI drops image parts for models without an image input modality (`supportsVision` then `stripImages`), and the bridge model catalog carries no modality data.
- Closed PR #1 as superseded. Three catalog alignments landed since it was opened, its additions other than `commandcode/taste-1` are already present, `commandcode/taste-1` appears nowhere in the shipped CLI bundle, and the retirement it performed is already handled through `LEGACY_RETIRED_MODEL_IDS`.
- Verification: `npm run verify` passed end to end (typecheck, eslint, Prettier, 233 tests in 15 files, build). Seven tests were added for restart-mode resolution, the dropped `top_p`/`stop` fields, and the two dashboard behaviors; two existing assertions that pinned the old buggy `auth()` expression and a hardcoded `restart_requested: true` were updated to the corrected contract.

## 2026-09-10

- Updated the locally installed CommandCode CLI from `1.49.0` to `1.53.0` and released bridge version `1.53.0.a`.
- Audited `npm diff --diff=command-code@1.49.0 --diff=command-code@1.53.0`, the changelog, and every changed readable bundled reference. Only `package.json`, `CHANGELOG.md`, the bundled `mcp.md`/`models.md`/`product-help.md` references, `dist/cli.mjs`, and the VS Code extension archive changed; npm metadata keeps `engines.node >= 22` and unchanged runtime dependencies.
- Added `deepseek/deepseek-v4.1-flash` (1,000,000 context; $0.15/$0.6) and `inclusionai/ling-3.0-flash-sante:free` (262,144 context; $0/$0), taking the static catalog to 70 models. Both are opt-in; the six established enabled defaults are unchanged, and the historical `inclusionai/ling-3.0-flash-free` id stays retired and distinct from the new Sante model.
- Repriced `deepseek/deepseek-v4-flash` to the published `$0.15/$0.6` and dropped its obsolete peak/off-peak note. No other retained model's advertised price or context window changed. Context integers come from the installed bundle's model definitions rather than the rounded table labels.
- Release notes classified as CLI-local: MCP env-placeholder resolution with `${VAR:-default}`, WSL2 screenshot pasting and `Alt+V` image paste, MCP OAuth RFC 8707 resource indicators, stable process title, UNIX-socket idle/working/blocked status reporting, Anthropic caching improvements, org spend-cap messaging, MiniMax M3 effort tiers, and the withdrawn DeepSeek V4.1 Flash Beta. No bridge-facing wire contract difference was found, so no protocol code changed.
- Aligned all current version references: `package.json`, `package-lock.json`, `src/version.ts`, the default `COMMANDCODE_CLI_VERSION` in `src/config.ts`, `.env.example`, `release/env.production.example`, `install.sh`, the deployment guides, the dashboard version assertion, and the English, Korean, and Chinese README badges, catalog baselines, and model tables. `install.sh` and `release/env.production.example` also moved off their stale `1.14.0` CLI default.
- An independent read-only differential audit of both npm bundles found the Alpha caching work of 1.50.0 to be additive rather than breaking: `params.system` may now be a structured block list with `cache_control`, `promptCache` is an optional top-level field, and one-hour cache-write counts arrive as extra provider metadata. The bridge keeps sending a string system prompt with no `promptCache`, its parsers ignore unknown metadata, and existing `cacheReadTokens`/`cacheWriteTokens` mapping stays correct, so no protocol code changed. Adopting cache blocks or org spend-cap surfacing would be separate feature work. `/alpha/generate` transport, `buildCommandAuthHeaders`, `toWireMessages`/`toWireTools`, the 64,000 default output limit, and the NDJSON stream reader are unchanged.
- Regression-first verification observed 6 expected catalog/version failures before implementation, then 30 passing focused config tests. The full suite passed once with 226 tests in 15 files, alongside `npm run typecheck`, `npm run lint`, Prettier checks on the changed parser-supported files, `npm run build`, `npm pack --dry-run`, and `git diff --check`.

## Current status — 2026-10-03

- Branch: `main`, synchronized with `origin/main` when this status audit began.
- Package: `commandcode-bridge` `1.74.0.b`, Node.js `>=20`, with `commandcode-bridge` and `commandcode-router` executables.
- API surface: authenticated OpenAI-compatible `/v1/models` and `/v1/chat/completions`, health endpoint, and the static `/dashboard/` operations console over same-origin admin configuration.
- Model surface: 85 statically aligned models (CommandCode CLI 1.74.0) with live Provider API refresh when available.
- Routing surface: `daily_burn_priority`, `balance_priority`, `round_robin`, and `drain_first`, with per-key model scope, concurrency, cooldown, failover, and retry controls.
- Deployment surface: Docker/Compose, Linux install/uninstall scripts, nginx and systemd release assets, and GitHub/GitLab CI definitions.
- Verification baseline: merged PR #3 passed 265 tests in 17 files, local HTTP QA, and GitHub CI on Node 20, 22, and 24. Release and deployment checks are performed separately for each version.
- Local workspace instruction file `AGENTS.md` remains untracked and is excluded from release commits.
- Local HTTP QA verifies `/health` reports the current bridge release, `/v1/models` returns the configured model list, and an empty chat request returns the expected structured `400 invalid_request`.
- Session recovery note: the current Senpi transcript exists at the path in `PI_SESSION_FILE`. Cross-platform local session search found no recoverable project implementation transcript covering the missing period, so the entries above were reconstructed from Git history and verified against the current source and test suite.
