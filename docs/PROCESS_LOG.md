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
