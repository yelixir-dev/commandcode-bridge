# CommandCode Bridge

> **CommandCode CLI environment required:** this bridge is for machines/accounts already set up to use the official CommandCode CLI (`cmd`, npm package `command-code`). Download/install it from [commandcode.ai/install](https://commandcode.ai/install) (official site: [commandcode.ai](https://commandcode.ai/)), then authenticate the CLI or provide equivalent `COMMANDCODE_*` credentials. The bridge uses the same CommandCode account/upstream API; it is not a public standalone DeepSeek proxy.

OpenAI-compatible HTTP bridge for CommandCode's DeepSeek V4 Pro backend.

This project exposes a minimal OpenAI Chat Completions API over CommandCode's upstream `/alpha/generate` endpoint, so trusted local or tailnet clients can use CommandCode-backed DeepSeek models through standard `/v1/chat/completions` calls.

> **Status:** internal-use bridge for trusted environments. CommandCode's `/alpha/generate` endpoint is unofficial/alpha-style and may change.

## Features

- OpenAI-compatible endpoints:
  - `GET /health`
  - `GET /admin/commandcode/credentials` (authenticated admin metrics; requires `BRIDGE_API_KEY`)
  - `GET /v1/models`
  - `POST /v1/chat/completions`
- Default model: `deepseek/deepseek-v4-pro`
- Model aliases:
  - `default` → `deepseek/deepseek-v4-pro`
  - `commandcode/deepseek-v4-pro` → `deepseek/deepseek-v4-pro`
  - `deepseek-v4-flash` → `deepseek/deepseek-v4-flash`
- Streaming and non-streaming OpenAI clients supported.
- Upstream always uses `params.stream: true`, because CommandCode rejects non-streaming generation.
- Local auth discovery from `COMMANDCODE_API_KEY`, `COMMANDCODE_API_KEYS` / credentials file, or `~/.commandcode/auth.json`.
- Optional multi-key credential pool with `daily_burn_priority`, `balance_priority`, `round_robin`, or `drain_first` routing. `depletion_aware` remains a compatibility alias for `daily_burn_priority`. The default policy prioritizes the credential with the highest required daily burn over the remaining subscription period.
- Mobile-first `/dashboard` admin console for routing policy, credential CRUD/rename, per-key concurrency, model on/off toggles, bridge status, JSON save, and LaunchAgent restart.
- Authenticated admin credential metrics for balance/routing diagnostics without exposing raw API keys.
- Optional `commandcode-router` process for least-inflight routing across multiple bridge hosts/PCs while preserving an existing `/v1` endpoint.
- Optional balance threshold alerts; disabled by default and enabled only with `COMMANDCODE_BALANCE_ALERT_ENABLED=true`.
- Automatic failover/cooldown on upstream HTTP errors and application-level stream errors such as `statusCode: 402`.
- Empty visible-content `finish_reason: length` responses fail closed by default instead of returning blank success.
- Request body limit, model allowlist, rate limiting, helmet headers, CORS opt-in.
- Strict TypeScript, Vitest, ESLint, Prettier, Docker, systemd, GitHub Actions, GitLab CI.

## Architecture

```text
Single-host mode:
OpenAI-compatible client
  → CommandCode Bridge :9992
  → POST https://api.commandcode.ai/alpha/generate
  → CommandCode stream events
  → OpenAI chat.completion or chat.completion.chunk

Router mode for multiple PCs:
OpenAI-compatible client
  → commandcode-router :9992
  → least-inflight healthy backend selection
  → one CommandCode Bridge per PC, e.g. local :19992 + remote Tailscale :9992
  → CommandCode upstream
```

A single chat-completion request remains bound to one backend from start to finish. Parallelism is achieved by distributing independent requests across independent bridge hosts.

The bridge does **not** spawn `cmd` per request. It calls the same upstream API that the CLI uses. This reduces latency, avoids CLI stdout parsing, and prevents CLI-added local tools/memory from inflating token usage.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Official CommandCode CLI environment (`cmd`, npm package `command-code`); download/install: [commandcode.ai/install](https://commandcode.ai/install)
- A working CommandCode account/API key or authenticated CommandCode CLI auth file
- Linux/macOS/WSL recommended

## Quick Start

```bash
git clone http://100.113.251.30:8929/root/commandcode-bridge.git commandcode-bridge
cd commandcode-bridge
npm install --include=dev
cp .env.example .env
```

Set either single-key mode:

```bash
# Preferred for services and containers
COMMANDCODE_API_KEY=your_commandcode_api_key
```

or multi-key mode:

```bash
# Simple id=key pairs
COMMANDCODE_API_KEYS=primary=cmd_key_one,secondary=cmd_key_two
COMMANDCODE_ROUTING_POLICY=daily_burn_priority
```

For weighted/model-scoped credentials, use a JSON credentials file and set `COMMANDCODE_CREDENTIALS_FILE`:

```json
{
  "routing": {
    "policy": "daily_burn_priority",
    "fallbackPolicy": "round_robin",
    "maxInFlightPerCredential": 4,
    "maxTotalInFlight": null,
    "maxTotalInFlightMultiplier": 3
  },
  "models": [
    { "id": "deepseek/deepseek-v4-pro", "enabled": true },
    { "id": "deepseek/deepseek-v4-flash", "enabled": true },
    { "id": "openai/gpt-5.5", "enabled": false },
    { "id": "anthropic/claude-opus-4.7", "enabled": false },
    { "id": "anthropic/claude-sonnet-4.6", "enabled": false }
  ],
  "credentials": [
    { "id": "primary", "apiKey": "cmd_key_one", "weight": 1, "maxInFlight": 4 },
    {
      "id": "flash-only",
      "apiKey": "cmd_key_two",
      "weight": 1,
      "allowedModels": ["deepseek/deepseek-v4-flash"],
      "maxInFlight": 4
    }
  ]
}
```

or keep the normal CommandCode auth file:

```text
~/.commandcode/auth.json
```

Run locally:

```bash
npm run build
npm start
```

Health check:

```bash
curl http://127.0.0.1:9992/health | jq
```

Chat completion:

```bash
curl -sS http://127.0.0.1:9992/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Reply exactly: OK"}],
    "max_tokens": 64,
    "temperature": 0
  }' | jq
```

Streaming:

```bash
curl -N http://127.0.0.1:9992/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek/deepseek-v4-pro",
    "stream": true,
    "messages": [{"role": "user", "content": "Count to three."}]
  }'
```

## Authentication

### Upstream CommandCode Auth

The bridge loads upstream CommandCode credentials in this order:

1. `COMMANDCODE_CREDENTIALS_FILE` (JSON: either an array or `{ "credentials": [...] }`)
2. `COMMANDCODE_CREDENTIALS` / `COMMANDCODE_API_KEYS` (JSON or `id=key,id2=key2`)
3. legacy single-key `COMMANDCODE_API_KEY`
4. `~/.commandcode/auth.json`
5. `~/.config/commandcode/auth.json`

If multiple credentials are configured, `/health` reports only the count and routing policy, never raw keys.

### Client Auth

Set `BRIDGE_API_KEY` to require clients to authenticate:

```bash
BRIDGE_API_KEY=change-me-to-a-long-random-secret
```

Clients may send either:

```text
Authorization: Bearer <BRIDGE_API_KEY>
```

or:

```text
x-api-key: <BRIDGE_API_KEY>
```

`/health` intentionally remains unauthenticated but never returns secrets. Admin endpoints always require `BRIDGE_API_KEY`; if it is unset, `/admin/*` returns `admin_auth_not_configured`.

Credential metrics endpoint:

```bash
curl -sS http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

This returns routing state, billing-derived credit metrics, alert thresholds, and credential IDs only. It does not return upstream CommandCode API keys or the bridge key.

## Configuration

| Variable                                            | Default                          | Description                                                                                                                                                                        |
| --------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`                                              | `127.0.0.1`                      | Bind address. Keep localhost unless behind VPN/reverse proxy.                                                                                                                      |
| `PORT`                                              | `9992`                           | HTTP port.                                                                                                                                                                         |
| `COMMANDCODE_API_KEY`                               | unset                            | Legacy single upstream CommandCode API key.                                                                                                                                        |
| `COMMANDCODE_API_KEYS`                              | unset                            | Optional comma-separated multi-key `id=key` list. Takes precedence over single-key mode.                                                                                           |
| `COMMANDCODE_CREDENTIALS`                           | unset                            | Optional JSON credentials array/object or comma-separated multi-key list.                                                                                                          |
| `COMMANDCODE_CREDENTIALS_FILE`                      | unset                            | Optional JSON credentials file. Highest upstream credential precedence.                                                                                                            |
| `COMMANDCODE_ROUTING_POLICY`                        | `daily_burn_priority`            | `daily_burn_priority`, `balance_priority`, `round_robin`, or `drain_first`. Legacy `depletion_aware` aliases to `daily_burn_priority`.                                             |
| `COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL`          | `4`                              | Per-credential in-flight cap. Editable through JSON/dashboard. DeepSeek V4 Flash was healthy at 8-way parallel in testing, but 4 per key is the routine operations recommendation. |
| `COMMANDCODE_MAX_TOTAL_IN_FLIGHT_MULTIPLIER`        | `3`                              | Default total in-flight cap calculation: `credential_count × multiplier`. Default is keys × 3.                                                                                     |
| `COMMANDCODE_MAX_TOTAL_IN_FLIGHT`                   | unset                            | Fixed total in-flight cap; overrides multiplier calculation when set.                                                                                                              |
| `COMMANDCODE_BILLING_REFRESH_MS`                    | `300000`                         | Per-credential billing/usage cache TTL for depletion-aware routing.                                                                                                                |
| `COMMANDCODE_BILLING_TIMEOUT_MS`                    | `10000`                          | Per-credential billing probe timeout; stale/error fallback avoids request hangs.                                                                                                   |
| `COMMANDCODE_CREDENTIAL_COOLDOWN_MS`                | `60000`                          | Cooldown after 429/5xx/timeouts; 402 uses at least this and the billing TTL.                                                                                                       |
| `COMMANDCODE_API_BASE`                              | `https://api.commandcode.ai`     | Upstream API base.                                                                                                                                                                 |
| `COMMANDCODE_DEFAULT_MODEL`                         | `deepseek/deepseek-v4-pro`       | Default upstream model.                                                                                                                                                            |
| `COMMANDCODE_ALLOWED_MODELS`                        | Pro + Flash                      | Comma-separated allowlist.                                                                                                                                                         |
| `COMMANDCODE_ALLOW_UNKNOWN_MODELS`                  | `false`                          | Pass through arbitrary model IDs. Not recommended.                                                                                                                                 |
| `COMMANDCODE_CLI_VERSION`                           | `0.25.12`                        | Header value sent upstream.                                                                                                                                                        |
| `COMMANDCODE_TIMEOUT_MS`                            | `300000`                         | Upstream request timeout.                                                                                                                                                          |
| `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY`         | `error_on_length`                | `error_on_length` fails closed on empty visible content with `finish_reason: length`; `allow` preserves legacy blank success behavior.                                             |
| `BRIDGE_API_KEY`                                    | unset                            | Optional client-facing API key. Strongly recommended.                                                                                                                              |
| `REQUEST_BODY_LIMIT_BYTES`                          | `1048576`                        | Fastify request body limit.                                                                                                                                                        |
| `RATE_LIMIT_MAX`                                    | `60`                             | Requests per rate window.                                                                                                                                                          |
| `RATE_LIMIT_WINDOW`                                 | `1 minute`                       | Rate limit window.                                                                                                                                                                 |
| `LOG_LEVEL`                                         | `info`                           | Fastify/Pino log level. Use `silent` for tests.                                                                                                                                    |
| `CORS_ORIGIN`                                       | unset                            | Enables CORS for a specific origin when set.                                                                                                                                       |
| `INCLUDE_REASONING`                                 | `false`                          | If true, reasoning deltas are appended to visible output. Keep false by default.                                                                                                   |
| `COMMANDCODE_BALANCE_ALERT_ENABLED`                 | `false`                          | Enables periodic balance threshold checks. Default is off.                                                                                                                         |
| `COMMANDCODE_BALANCE_ALERT_MIN_CURRENT_BALANCE`     | `1`                              | Alert when current total balance drops below this value. Set `0` to disable this threshold.                                                                                        |
| `COMMANDCODE_BALANCE_ALERT_MIN_EXPIRING_BALANCE`    | `0`                              | Alert when monthly/free expiring balance drops below this value. `0` disables.                                                                                                     |
| `COMMANDCODE_BALANCE_ALERT_MAX_REQUIRED_DAILY_BURN` | `0`                              | Alert when required daily burn exceeds this value. `0` disables.                                                                                                                   |
| `COMMANDCODE_BALANCE_ALERT_INTERVAL_MS`             | `COMMANDCODE_BILLING_REFRESH_MS` | Periodic alert check interval.                                                                                                                                                     |
| `COMMANDCODE_BALANCE_ALERT_REPEAT_MS`               | `3600000`                        | Minimum repeat interval per credential/alert type.                                                                                                                                 |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL`             | unset                            | Optional JSON webhook target for due alerts. Alerts are logged even without a webhook.                                                                                             |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_BEARER`          | unset                            | Optional bearer token for the alert webhook.                                                                                                                                       |

## Admin Metrics and Balance Alerts

- `GET /admin/commandcode/credentials` is the operator-facing metrics endpoint. It is blocked unless `BRIDGE_API_KEY` is configured and supplied by the caller.
- `?refresh=true` forces fresh billing/usage probes before returning metrics; omit it for cached diagnostics.
- Balance alerts are intentionally opt-in. With `COMMANDCODE_BALANCE_ALERT_ENABLED=false` (default), no timer, webhook, or alert evaluation is active.
- When enabled, alerts run at startup and on `COMMANDCODE_BALANCE_ALERT_INTERVAL_MS`, log a structured warning, and optionally POST JSON to `COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL`.

## OpenAI Compatibility Notes

Supported request fields:

- `model`
- `messages`
- `stream`
- `max_tokens`
- `temperature`
- `top_p`
- `stop`
- `tools` with function schemas. Tool calls emitted by CommandCode are mapped back to OpenAI `tool_calls`.
- `tool_choice` only when omitted, `"auto"`, or `"none"`. Forced tool selection is rejected with `unsupported_tool_choice` because CommandCode `/alpha/generate` does not expose a stable forced-tool selector.
- `response_format` (`json_object` and `json_schema` receive JSON-only prompt reinforcement)
- `stream_options.include_usage`; streaming usage is emitted as an OpenAI-style final usage-only chunk with `choices: []` before `[DONE]`.

The upstream event stream is converted as follows:

| CommandCode event                              | OpenAI mapping                                                                                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text-delta`                                   | `choices[0].delta.content` or aggregated `message.content`                                                                                                                                                                       |
| `tool-call`                                    | `choices[0].delta.tool_calls` or aggregated `message.tool_calls`                                                                                                                                                                 |
| `finish.finishReason`                          | `finish_reason`                                                                                                                                                                                                                  |
| `finish.totalUsage.inputTokens`                | `usage.prompt_tokens`                                                                                                                                                                                                            |
| `finish.totalUsage.outputTokens`               | `usage.completion_tokens`                                                                                                                                                                                                        |
| `finish.totalUsage.totalTokens`                | `usage.total_tokens`                                                                                                                                                                                                             |
| `error`                                        | Non-streaming clients receive an upstream error. Streaming clients receive an SSE error frame and `[DONE]`. If the error arrives before visible output and another credential is available, the client retries/fails over first. |
| empty visible content + `finishReason: length` | Default `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=error_on_length` returns `commandcode_empty_visible_response` instead of blank success. Set `allow` only for legacy compatibility.                                            |

Reasoning deltas are hidden by default.

## Development

```bash
npm install --include=dev
npm test
npm run typecheck
npm run lint
npm run build
npm run verify
```

Smoke test against a running bridge:

```bash
npm run smoke
```

If `BRIDGE_API_KEY` is set, export the same value before running the smoke script.

If the CommandCode account is reachable but blocked by balance/credits, use routing-only smoke mode to verify the bridge surfaces upstream failure explicitly instead of returning a blank success:

```bash
SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

This mode accepts only explicit `commandcode_event_error`, `commandcode_empty_response`, or `commandcode_empty_visible_response`; real content generation still requires account balance.

Live multi-key canary is intentionally deferred until the CommandCode accounts have enough balance for generation. Until then, use `SMOKE_ACCEPT_UPSTREAM_ERRORS=1` only to verify routing/auth/fail-closed behavior. After payment/top-up, run this checklist:

1. Configure at least two credentials with distinct IDs in `COMMANDCODE_API_KEYS` or `COMMANDCODE_CREDENTIALS_FILE`.
2. Confirm `/admin/commandcode/credentials?refresh=true` shows positive balance on each canary credential.
3. Run `npm run smoke` without `SMOKE_ACCEPT_UPSTREAM_ERRORS`.
4. Send several low-token requests and confirm admin metrics show selections rotating according to `COMMANDCODE_ROUTING_POLICY`.
5. Keep `BRIDGE_API_KEY` enabled for any tailnet or non-localhost test.

## Docker

For production deployment and operations, start with:

- `docs/DEPLOYMENT.md` — primary English deployment guide.
- `docs/DEPLOYMENT.ko.md` — detailed Korean deployment guide.
- `release/README_RELEASE.md` — copy-ready release asset notes.

Docker builds require a full source checkout because the Dockerfile runs the verification/build pipeline before producing the runtime image. The npm package is runtime-oriented and intentionally does not contain the full Docker build context.

```bash
docker build -t commandcode-bridge .
docker run --rm -p 127.0.0.1:9992:9992 \
  -e HOST=0.0.0.0 \
  -e COMMANDCODE_API_KEY="$COMMANDCODE_API_KEY" \
  -e BRIDGE_API_KEY="$BRIDGE_API_KEY" \
  commandcode-bridge
```

The container listens on `0.0.0.0` internally, but the example publishes only to localhost. If you bind to a tailnet or external interface, set `BRIDGE_API_KEY`.

Or use:

```bash
docker compose up -d --build
```

See `release/docker-compose.yml`.

## systemd

See `docs/DEPLOYMENT.md` for the recommended user-systemd deployment and `release/systemd/commandcode-bridge.service` for a system-level host unit.

Recommended installation path:

```text
/opt/commandcode-bridge
```

## Security

- Do not expose this bridge publicly without TLS and authentication.
- Prefer `127.0.0.1`, Tailscale, VPN, or a private reverse proxy.
- Always set `BRIDGE_API_KEY` for non-localhost deployments.
- Treat your CommandCode API key as a personal credential.
- This project does not copy CommandCode's UNLICENSED CLI bundle source.

See `docs/SECURITY.md` for details.

## Documentation

- `README.ko.md` — Korean README.
- `docs/DEPLOYMENT.md` — deployment and operations guide.
- `docs/DEPLOYMENT.ko.md` — Korean deployment and operations guide.
- `docs/PRD.md` — product requirements.
- `docs/IMPLEMENTATION_PLAN.md` — implementation plan.
- `docs/ARCHITECTURE.md` — architecture and data flow.
- `docs/KNOW_HOW.md` — CommandCode API notes and operational lessons.
- `docs/SECURITY.md` — security model and deployment guardrails.
- `docs/PROCESS_LOG.md` — work log.

## License

MIT. CommandCode itself is separate software and may have different terms.
