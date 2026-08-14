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

## Current status — 2026-08-15

- Branch: `main`, synchronized with `origin/main` when this status audit began.
- Package: `commandcode-bridge` `1.25.0.a`, Node.js `>=20`, with `commandcode-bridge` and `commandcode-router` executables.
- API surface: authenticated OpenAI-compatible `/v1/models` and `/v1/chat/completions`, health endpoint, and same-origin dashboard configuration.
- Model surface: 55 statically aligned models with live Provider API refresh when available.
- Routing surface: `daily_burn_priority`, `balance_priority`, `round_robin`, and `drain_first`, with per-key model scope, concurrency, cooldown, failover, and retry controls.
- Deployment surface: Docker/Compose, Linux install/uninstall scripts, nginx and systemd release assets, and GitHub/GitLab CI definitions.
- Verification: `npm run typecheck`, `npm run lint`, all 199 Vitest tests in 14 files, and `npm run build` pass on this workstation.
- Known local exception: `npm run format:check` fails only because the untracked workspace instruction file `AGENTS.md` is not Prettier-formatted. It is not part of the tracked product tree and was left untouched.
- Live upstream smoke was not repeated because it requires a running bridge and an upstream CommandCode account; the last recorded live bridge/tool-loop smoke remains the 2026-05-16 entry.
- Session recovery note: the current Senpi transcript exists at the path in `PI_SESSION_FILE`. Cross-platform local session search found no recoverable project implementation transcript covering the missing period, so the entries above were reconstructed from Git history and verified against the current source and test suite.
