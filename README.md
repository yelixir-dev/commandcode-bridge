# CommandCode Bridge

[한국어 README](./README.ko.md)

CommandCode Bridge is a trusted-environment HTTP bridge that exposes a small OpenAI-compatible API for a CommandCode account. It lets local, LAN, VPN, or tailnet clients call CommandCode-backed models through standard `/v1/models` and `/v1/chat/completions` endpoints.

> **CommandCode required.** This project is not a public standalone DeepSeek proxy and does not include or repackage CommandCode's CLI bundle. You need the official CommandCode CLI/account environment (`cmd` from the `command-code` npm package) or equivalent CommandCode API credentials. Install/authenticate CommandCode from the official site: <https://commandcode.ai/install>.

> **Status.** Internal/trusted-environment bridge. The upstream CommandCode `/alpha/generate` path behaves like an alpha/internal API and may change.

## What this bridge does

- Provides OpenAI-compatible endpoints:
  - `GET /health`
  - `GET /dashboard`
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - `GET /admin/config` and `GET /admin/commandcode/credentials` for redacted read-only dashboard state
  - `PUT /admin/config` and `POST /admin/restart` for authenticated dashboard writes/restart
- Converts CommandCode streaming events into OpenAI chat completion responses or SSE chunks.
- Supports non-streaming and streaming OpenAI clients, including usage chunks for `stream_options.include_usage`.
- Supports tool calls emitted by CommandCode and maps them back to OpenAI `tool_calls`.
- Supports `developer`, `system`, `user`, `assistant`, and `tool` messages.
- Hides reasoning deltas by default (`INCLUDE_REASONING=false`).
- Fails closed on empty visible `finish_reason: length` responses by default instead of returning a blank success.
- Loads CommandCode upstream credentials from a CLI auth file, a single API key, a multi-key env var, or a JSON credentials file.
- Includes a multi-key credential router with routing policies designed for rotating multiple CommandCode keys safely.
- Includes a mobile-first `/dashboard` for server bind settings, routing policy, key management, model toggles, diagnostics, JSON save, and restart.
- Includes optional balance alerts and an optional `commandcode-router` process for routing across multiple bridge hosts.

## Version

Current bridge version: **v0.26.7**.

The version is also returned from `/health` and shown in the top-right of the web dashboard.

### v0.26.7 CommandCode compatibility update

This bridge release is aligned with the official `command-code` npm package `0.26.7`:

- The default upstream `x-command-code-version` header now advertises `0.26.7` unless `COMMANDCODE_CLI_VERSION` overrides it.
- The bridge package/runtime version is also `0.26.7` so `/health`, the dashboard, and the npm metadata match the CommandCode CLI version being targeted.
- Direct inspection of the `command-code@0.26.7` bundle confirmed that the bridge-critical API paths remain compatible: `/alpha/generate`, `/alpha/whoami`, `/alpha/billing/credits`, `/alpha/billing/subscriptions`, and `/alpha/usage/summary`.
- The model catalog was refreshed from the `0.26.7` CLI bundle. Existing enabled defaults stay conservative, while additional discovered entries such as Qwen 3.6 Max Preview, MiniMax M2.5, Kimi K2.5, GLM-5, GPT 5.4/5.3 Codex/5.4 Mini, and older Claude variants are present but disabled by default until an operator enables them.

## Architecture

```text
OpenAI-compatible client
  -> CommandCode Bridge :9992
  -> POST https://api.commandcode.ai/alpha/generate
  -> CommandCode stream events
  -> OpenAI chat.completion or chat.completion.chunk
```

The bridge does **not** spawn `cmd` for every request. It calls the same upstream API path used by the CommandCode CLI, then normalizes the response shape for OpenAI-compatible clients. This avoids CLI stdout parsing, reduces latency, and prevents CLI-side local tools/memory from inflating token usage.

A single chat-completion request stays bound to one upstream credential from start to finish. Parallelism comes from distributing independent requests across eligible keys and, optionally, across multiple bridge hosts.

## Requirements

- Node.js **20+**
- npm **10+**
- Linux, macOS, or WSL for manual/source operation
- Linux user systemd if you use the bundled `install.sh`
- Official CommandCode CLI (`cmd`, npm package `command-code`) or equivalent CommandCode upstream API key
- A CommandCode account with usable balance/credits for real generation

### CommandCode prerequisite states

The installer and manual setup are designed around three common states:

1. **CommandCode CLI is already installed and authenticated**
   - The bridge can import the existing `~/.commandcode/auth.json` credential as its first upstream key.
2. **CommandCode CLI is installed but not authenticated**
   - Run `cmd login`, then restart the bridge.
3. **CommandCode CLI is missing**
   - Install it first:
     ```bash
     npm install -g command-code
     cmd login
     ```
   - The Linux installer can offer to run `npm install -g command-code` for you when the CLI is missing.

## Installation options

### Option A — Linux rootless installer

From a source checkout or package root:

```bash
./install.sh
```

The installer:

- checks for Node.js, npm, user systemd, and CommandCode CLI;
- offers to install `command-code` with npm if the CLI is missing;
- imports an existing CommandCode CLI auth key when available;
- generates a client-facing `BRIDGE_API_KEY` if you do not provide one;
- installs the bridge under `~/.local/share/commandcode-bridge`;
- writes private runtime env to `~/.config/commandcode-bridge/env`;
- creates a `commandcode-bridge` user systemd service;
- starts the service unless `--no-start` is supplied.

Examples:

```bash
# Interactive, safe local-only default: 127.0.0.1:9992
./install.sh

# Non-interactive local install
./install.sh --yes --host 127.0.0.1 --port 9992

# Tailnet/LAN exposure; keep BRIDGE_API_KEY enabled
./install.sh --host 0.0.0.0 --port 9992
```

Useful service commands:

```bash
systemctl --user status commandcode-bridge --no-pager
systemctl --user restart commandcode-bridge
journalctl --user -u commandcode-bridge -f
curl -fsS http://127.0.0.1:9992/health | jq
```

If the service must run before login on a Linux host:

```bash
sudo loginctl enable-linger "$USER"
```

Uninstall while preserving private config:

```bash
./uninstall.sh
```

Remove service, installed files, and private config:

```bash
./uninstall.sh --purge-config
```

### Option B — Manual source run

```bash
git clone <your-commandcode-bridge-repository-url> commandcode-bridge
cd commandcode-bridge
npm install --include=dev
cp .env.example .env
```

Edit `.env` or export environment variables. Minimal local-only setup using the CommandCode CLI auth file:

```env
HOST=127.0.0.1
PORT=9992
BRIDGE_API_KEY=replace-with-a-long-random-client-key
COMMANDCODE_ROUTING_POLICY=daily_burn_priority
COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=error_on_length
```

If you prefer an explicit upstream key:

```env
COMMANDCODE_API_KEY=your_commandcode_api_key
```

Build and run:

```bash
npm run build
npm start
```

### Option C — Docker / Compose

Docker is supported for deployments that have a full source checkout. The Dockerfile runs the verification/build pipeline before producing the runtime image.

```bash
docker build -t commandcode-bridge .
docker run --rm -p 127.0.0.1:9992:9992 \
  -e HOST=0.0.0.0 \
  -e COMMANDCODE_API_KEY="$COMMANDCODE_API_KEY" \
  -e BRIDGE_API_KEY="$BRIDGE_API_KEY" \
  commandcode-bridge
```

Or use:

```bash
cd release
docker compose up -d --build
```

See `docs/DEPLOYMENT.md` and `release/docker-compose.yml` for production details.

## First verification

Health check:

```bash
curl -fsS http://127.0.0.1:9992/health | jq
```

If `BRIDGE_API_KEY` is configured, authenticated model list:

```bash
export BRIDGE_API_KEY='<same value as your bridge env>'
curl -fsS http://127.0.0.1:9992/v1/models \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

Non-streaming chat completion:

```bash
curl -sS http://127.0.0.1:9992/v1/chat/completions \
  -H "Authorization: Bearer $BRIDGE_API_KEY" \
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
  -H "Authorization: Bearer $BRIDGE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek/deepseek-v4-pro",
    "stream": true,
    "messages": [{"role": "user", "content": "Count to three."}],
    "stream_options": {"include_usage": true}
  }'
```

Project smoke script:

```bash
npm run smoke
```

If the account is reachable but temporarily blocked by balance/credit, use the routing-only fail-closed smoke mode:

```bash
SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

This mode confirms that the bridge surfaces explicit upstream/fail-closed errors instead of returning blank success. It is not a generation-readiness canary.

## Web dashboard

Open:

```text
http://127.0.0.1:9992/dashboard
```

If the bridge is bound to `0.0.0.0` behind Tailscale/VPN/LAN, open:

```text
http://<host-or-tailnet-ip>:9992/dashboard
```

The dashboard is intentionally mobile-first. It is useful from a phone on the same trusted tailnet.

### Dashboard sections

- **Header**
  - Shows bridge online/offline state.
  - Shows bridge version, for example `v0.26.7`.
- **Server Bind**
  - Choose `127.0.0.1` for local-only use.
  - Choose `0.0.0.0` only for LAN/Tailscale/VPN/reverse-proxy use.
  - Edit the port.
  - Save/copy the browser-local Admin API Key for authenticated writes.
- **Routing Policy**
  - Select how eligible upstream keys are chosen.
  - Edit the per-key concurrency limit. Routine default is **4 in-flight requests per key**.
- **Credentials**
  - Add, rename, enable/disable, delete, and refresh upstream CommandCode keys.
  - The dashboard preserves existing secrets when you rename a key or leave the secret field blank.
  - Billing/diagnostic data is redacted and shown as operator-friendly balance/day summaries.
- **Models**
  - Toggle configured model catalog entries on/off.
  - Changes require restart.
- **Footer**
  - `Save JSON` writes the dashboard JSON config.
  - `Restart Bridge` restarts the LaunchAgent/system service path where supported.

### Dashboard auth model

- `GET /dashboard`, `GET /admin/config`, and redacted `GET /admin/commandcode/credentials` can be read without `BRIDGE_API_KEY` so a phone browser can load status and saved redacted state on a trusted network.
- These public read-only dashboard endpoints are still metadata-bearing: they can reveal service version, bind/port, configured model IDs, credential IDs/previews, counts, and redacted balance summaries. Expose them only on localhost or a trusted VPN/tailnet.
- Writes and restarts require `BRIDGE_API_KEY`:
  - `PUT /admin/config`
  - `POST /admin/restart`
  - all `/v1/*` inference calls when `BRIDGE_API_KEY` is configured
- The dashboard never returns raw CommandCode upstream keys.
- The dashboard is not designed as a public internet control plane. It relies on a trusted network boundary plus bearer-token-protected writes, not cookie-based sessions.

### Save/restart flow

1. Change bind host, port, routing policy, credentials, or models.
2. Click **Save JSON**.
3. Click **Restart Bridge**.
4. Verify `/health` and `/v1/models`.

If you rotate the client-facing bridge key, update any clients that use it. For Hermes, keep `COMMANDCODE_BRIDGE_API_KEY` and the bridge's `BRIDGE_API_KEY` in sync, then restart the Hermes gateway/session that uses the bridge. During a key rotation, clients that still hold the old key will receive `401 Unauthorized` until they reload the new value.

## Upstream CommandCode authentication

The bridge loads upstream CommandCode credentials in this order:

1. `COMMANDCODE_CREDENTIALS_FILE`
2. `COMMANDCODE_CREDENTIALS` or `COMMANDCODE_API_KEYS`
3. legacy single-key `COMMANDCODE_API_KEY`
4. `~/.commandcode/auth.json`
5. `~/.config/commandcode/auth.json`

If multiple credentials are configured, `/health` reports only the count and routing policy. Raw keys are never included.

### Single-key env

```env
COMMANDCODE_API_KEY=your_commandcode_api_key
```

### Simple multi-key env

```env
COMMANDCODE_API_KEYS=primary=cmd_key_one,secondary=cmd_key_two
COMMANDCODE_ROUTING_POLICY=daily_burn_priority
```

### JSON credentials file

Recommended for dashboard-managed or multi-key setups:

```env
COMMANDCODE_CREDENTIALS_FILE=/home/you/.config/commandcode-bridge/credentials.json
```

Example `credentials.json`:

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 9992
  },
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
    { "id": "MiniMaxAI/MiniMax-M2.7", "enabled": true },
    { "id": "Qwen/Qwen3.6-Plus", "enabled": true },
    { "id": "zai-org/GLM-5.1", "enabled": true },
    { "id": "moonshotai/Kimi-K2.6", "enabled": true },
    { "id": "openai/gpt-5.5", "enabled": false },
    { "id": "anthropic/claude-opus-4.7", "enabled": false },
    { "id": "anthropic/claude-sonnet-4.6", "enabled": false }
  ],
  "credentials": [
    { "id": "primary", "apiKey": "cmd_key_one", "weight": 1, "enabled": true },
    {
      "id": "flash-only",
      "apiKey": "cmd_key_two",
      "weight": 1,
      "enabled": true,
      "allowedModels": ["deepseek/deepseek-v4-flash"]
    }
  ]
}
```

Protect it:

```bash
chmod 600 ~/.config/commandcode-bridge/credentials.json
```

## Multi-key routing — the main benefit

CommandCode Bridge can run with several upstream CommandCode keys and choose among them per request. This is the key operational feature: you can spread traffic, avoid hammering one key, and automatically skip unhealthy or expired credentials.

### Routing policies

| Policy                | Purpose                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `daily_burn_priority` | Default. Prioritizes keys that need more daily usage before the current billing/credit period ends. Legacy `depletion_aware` is normalized to this policy. |
| `balance_priority`    | Prefer keys with more usable balance.                                                                                                                      |
| `round_robin`         | Rotate across eligible keys, respecting weight and availability.                                                                                           |
| `drain_first`         | Use the first eligible key until it is blocked/exhausted, then move to the next.                                                                           |

### Eligibility and failover

A credential can be skipped when it is:

- manually disabled in the dashboard/JSON;
- outside its `allowedModels` scope;
- at the per-key in-flight limit;
- in cooldown after 429/5xx/timeouts;
- out of usable billing balance or expired for the current period.

If an upstream error arrives before visible output and another eligible credential exists, the bridge can retry/fail over. If visible output has already started, the bridge surfaces the error instead of retrying and risking duplicated partial output.

### Concurrency

Routine default:

```env
COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL=4
```

DeepSeek V4 Flash load testing was healthy at higher parallelism, but **4 in-flight requests per key** is the recommended normal operating value. Increase only after observing diagnostics and upstream behavior.

### Proving multi-key rotation

1. Configure at least two credentials with distinct IDs.
2. Restart the bridge.
3. Refresh diagnostics:

   ```bash
   curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true' \
     -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
   ```

4. Send several concurrent low-token requests.
5. Refresh diagnostics again and confirm different credentials show selection/in-flight movement.
6. Confirm all responses are either successful generations or explicit upstream/fail-closed errors.

## Client authentication

Set `BRIDGE_API_KEY` to require clients to authenticate.

```env
BRIDGE_API_KEY=replace-with-a-long-random-client-key
```

Clients may send either:

```text
Authorization: Bearer <BRIDGE_API_KEY>
```

or:

```text
x-api-key: <BRIDGE_API_KEY>
```

`/health` intentionally remains unauthenticated and secret-free. Admin writes and `/v1/*` requests require the key when configured.

## Configuration reference

| Variable                                     | Default                      | Description                                                                                                                  |
| -------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `HOST`                                       | `127.0.0.1`                  | Bind address. Use localhost unless behind VPN, tailnet, or reverse proxy.                                                    |
| `PORT`                                       | `9992`                       | HTTP port.                                                                                                                   |
| `BRIDGE_API_KEY`                             | unset                        | Client-facing API key. Strongly recommended; required for admin writes.                                                      |
| `COMMANDCODE_API_KEY`                        | unset                        | Legacy single upstream CommandCode key.                                                                                      |
| `COMMANDCODE_API_KEYS`                       | unset                        | Comma-separated multi-key list such as `primary=...,secondary=...`.                                                          |
| `COMMANDCODE_CREDENTIALS`                    | unset                        | JSON credentials array/object or comma-separated multi-key list.                                                             |
| `COMMANDCODE_CREDENTIALS_FILE`               | unset                        | JSON dashboard/credential file. Highest upstream credential precedence.                                                      |
| `COMMANDCODE_ROUTING_POLICY`                 | `daily_burn_priority`        | `daily_burn_priority`, `balance_priority`, `round_robin`, or `drain_first`. `depletion_aware` is accepted as a legacy alias. |
| `COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL`   | `4`                          | Per-key concurrency cap.                                                                                                     |
| `COMMANDCODE_MAX_TOTAL_IN_FLIGHT`            | unset                        | Optional explicit total in-flight cap.                                                                                       |
| `COMMANDCODE_MAX_TOTAL_IN_FLIGHT_MULTIPLIER` | `3`                          | Legacy/default multiplier used when an explicit total cap is not set.                                                        |
| `COMMANDCODE_BILLING_REFRESH_MS`             | `300000`                     | Billing/usage cache TTL for routing diagnostics.                                                                             |
| `COMMANDCODE_BILLING_TIMEOUT_MS`             | `10000`                      | Billing probe timeout.                                                                                                       |
| `COMMANDCODE_CREDENTIAL_COOLDOWN_MS`         | `60000`                      | Cooldown after upstream failures.                                                                                            |
| `COMMANDCODE_API_BASE`                       | `https://api.commandcode.ai` | Upstream API base. Do not change unless testing a known alternate upstream.                                                  |
| `COMMANDCODE_DEFAULT_MODEL`                  | `deepseek/deepseek-v4-pro`   | Model used for `default`.                                                                                                    |
| `COMMANDCODE_ALLOWED_MODELS`                 | Pro + Flash/catalog defaults | Comma-separated allowlist.                                                                                                   |
| `COMMANDCODE_ALLOW_UNKNOWN_MODELS`           | `false`                      | Pass arbitrary model IDs upstream. Not recommended.                                                                          |
| `COMMANDCODE_CLI_VERSION`                    | `0.26.7`                     | Version header sent upstream.                                                                                                |
| `COMMANDCODE_TIMEOUT_MS`                     | `300000`                     | Upstream request timeout.                                                                                                    |
| `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY`  | `error_on_length`            | `error_on_length` fails closed on empty visible `finish_reason: length`; `allow` preserves legacy blank success behavior.    |
| `REQUEST_BODY_LIMIT_BYTES`                   | `1048576`                    | Fastify body limit.                                                                                                          |
| `RATE_LIMIT_MAX`                             | `60`                         | Requests per rate-limit window.                                                                                              |
| `RATE_LIMIT_WINDOW`                          | `1 minute`                   | Rate-limit window string.                                                                                                    |
| `LOG_LEVEL`                                  | `info`                       | Fastify/Pino log level.                                                                                                      |
| `CORS_ORIGIN`                                | unset                        | Optional CORS origin.                                                                                                        |
| `INCLUDE_REASONING`                          | `false`                      | Append reasoning deltas to visible output. Keep false for normal clients.                                                    |
| `COMMANDCODE_BALANCE_ALERT_ENABLED`          | `false`                      | Enables periodic balance alerts. Disabled by default.                                                                        |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL`      | unset                        | Optional JSON webhook for alerts.                                                                                            |

## OpenAI compatibility notes

Supported request fields:

- `model`
- `messages`
- `stream`
- `max_tokens`
- `temperature`
- `top_p`
- `stop`
- `tools` with function schemas
- `tool_choice` only when omitted, `"auto"`, or `"none"`
- `response_format` (`json_object` / `json_schema` receive JSON-only prompt reinforcement)
- `stream_options.include_usage`
- `user`

Unsupported forced tool selection returns `unsupported_tool_choice` because CommandCode `/alpha/generate` does not expose a stable forced-tool selector.

## Optional commandcode-router

`commandcode-router` is a separate process for multi-host deployments. It preserves one `/v1` endpoint while routing independent requests to the least-in-flight healthy bridge backend.

```env
COMMANDCODE_ROUTER_BACKENDS=local=http://127.0.0.1:19992,pc2=http://<tailnet-ip>:9992
COMMANDCODE_ROUTER_BACKEND_MAX_INFLIGHT=1
COMMANDCODE_ROUTER_BACKEND_TIMEOUT_MS=300000
COMMANDCODE_ROUTER_HEALTH_TIMEOUT_MS=3000
COMMANDCODE_ROUTER_COOLDOWN_MS=60000
```

Use this only when you operate more than one bridge host. For most users, the built-in multi-key credential router inside a single bridge process is enough.

## Development

```bash
npm install --include=dev
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run verify
```

`npm run verify` runs typecheck, lint, format check, tests, and build.

## Security and non-goals

- Do not expose the bridge to the public internet without TLS, authentication, and a trusted network boundary.
- `HOST=0.0.0.0` means every interface on the machine. Use it only behind Tailscale/WireGuard/VPN/firewall/reverse proxy; it is not a security control by itself.
- Prefer `127.0.0.1`, Tailscale, WireGuard, a VPN, or a private reverse proxy.
- Always set `BRIDGE_API_KEY` for non-localhost deployments.
- Treat dashboard read-only endpoints as metadata-bearing even though they are redacted.
- Do not commit `.env`, `~/.commandcode/auth.json`, `credentials.json`, upstream API keys, bridge keys, billing details, router backend topology, or dashboard-exported secrets.
- Treat CommandCode credentials as personal upstream credentials.
- This repository does not include CommandCode's proprietary/UNLICENSED CLI bundle source.
- The bridge does not bypass CommandCode account limits, billing, rate limits, or terms.
- The bridge is not a general public proxy service.

See `docs/SECURITY.md` for more details.

## Troubleshooting

### `/health` works but `/v1/models` or chat returns 401

`/health` is public. `/v1/*` requires `BRIDGE_API_KEY` when configured.

```bash
export BRIDGE_API_KEY='<same value as bridge env>'
curl -fsS http://127.0.0.1:9992/v1/models \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

### Hermes compression or a client suddenly gets 401 after a bridge key rotation

The client-facing key changed in the bridge, but the client still has the old key. For Hermes, keep these paired:

- bridge runtime env: `BRIDGE_API_KEY`
- Hermes env/client setting: `COMMANDCODE_BRIDGE_API_KEY`

Update both and restart the bridge/Hermes gateway or session that loads the env.

### CommandCode CLI is installed but generation fails with missing upstream key

Run:

```bash
cmd login
```

Then restart the bridge. Or provide `COMMANDCODE_API_KEY`, `COMMANDCODE_API_KEYS`, or `COMMANDCODE_CREDENTIALS_FILE` explicitly.

### Account reachable but generation fails due to balance/credits

Use diagnostics:

```bash
curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true' \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

For bridge behavior testing only:

```bash
SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

Real generation readiness requires a normal smoke without that flag.

### Dashboard changes were saved but not applied

Most dashboard changes write JSON and require restart. Click **Restart Bridge**, or restart your service manually.

### Port 9992 is already in use

```bash
lsof -nP -iTCP:9992 -sTCP:LISTEN
# or on Linux
ss -ltnp '( sport = :9992 )'
```

Stop the conflicting process or change `PORT`.

## Documentation map

- `README.ko.md` — Korean README.
- `docs/DEPLOYMENT.md` — deployment and operations guide.
- `docs/DEPLOYMENT.ko.md` — Korean deployment and operations guide.
- `docs/ARCHITECTURE.md` — architecture and data flow.
- `docs/KNOW_HOW.md` — CommandCode API notes and operational lessons.
- `docs/SECURITY.md` — security model and deployment guardrails.
- `docs/PRD.md` — product requirements.
- `docs/IMPLEMENTATION_PLAN.md` — implementation plan.
- `docs/PROCESS_LOG.md` — work log.

## License

MIT. CommandCode itself is separate software and may have different terms.
