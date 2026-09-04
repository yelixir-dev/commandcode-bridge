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

## Current status — 2026-09-04

- Branch: `main`, synchronized with `origin/main` when this status audit began.
- Package: `commandcode-bridge` `1.49.0.a`, Node.js `>=20`, with `commandcode-bridge` and `commandcode-router` executables.
- API surface: authenticated OpenAI-compatible `/v1/models` and `/v1/chat/completions`, health endpoint, and same-origin dashboard configuration.
- Model surface: 68 statically aligned models with live Provider API refresh when available.
- Routing surface: `daily_burn_priority`, `balance_priority`, `round_robin`, and `drain_first`, with per-key model scope, concurrency, cooldown, failover, and retry controls.
- Deployment surface: Docker/Compose, Linux install/uninstall scripts, nginx and systemd release assets, and GitHub/GitLab CI definitions.
- Verification: `npm run typecheck`, `npm run lint`, all 222 Vitest tests in 15 files, and `npm run build` pass on this workstation.
- Known local exception: `npm run format:check` fails only because the untracked workspace instruction file `AGENTS.md` is not Prettier-formatted. It is not part of the tracked product tree and was left untouched.
- Local HTTP QA verifies `/health` reports the current bridge release, `/v1/models` returns the configured model list, and an empty chat request returns the expected structured `400 invalid_request`.
- Session recovery note: the current Senpi transcript exists at the path in `PI_SESSION_FILE`. Cross-platform local session search found no recoverable project implementation transcript covering the missing period, so the entries above were reconstructed from Git history and verified against the current source and test suite.
