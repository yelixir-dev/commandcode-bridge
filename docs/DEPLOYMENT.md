# Commander CommandCode Bridge Deployment Guide

This guide explains how to deploy Commander CommandCode Bridge as a durable OpenAI-compatible API service for CommandCode-backed DeepSeek models in a CommandCode CLI environment.

> **CommandCode CLI environment required:** download/install the official CLI from [commandcode.ai/install](https://commandcode.ai/install) (official site: [commandcode.ai](https://commandcode.ai/)), then authenticate the CLI or provide equivalent `COMMANDCODE_*` credentials. This bridge uses the same CommandCode account/upstream API and is not a public standalone DeepSeek proxy.

Korean version: [`DEPLOYMENT.ko.md`](./DEPLOYMENT.ko.md)

## Recommended production shape

For a personal workstation, homelab, or tailnet host, the recommended shape is:

```text
OpenAI-compatible client
  -> http://127.0.0.1:9992 or http://<tailscale-ip>:9992
  -> commander-commandcode-bridge systemd service
  -> CommandCode /alpha/generate upstream
```

Security baseline:

- Keep `BRIDGE_API_KEY` enabled for anything beyond local ad-hoc testing.
- Bind to `127.0.0.1` for local-only use, or `0.0.0.0` only behind a private network such as Tailscale/WireGuard/VPN or an authenticated reverse proxy.
- Never commit real environment files or credential JSON files.
- Treat CommandCode CLI auth files and API keys as personal upstream credentials.
- Use the admin endpoint only with bridge authentication.

## Current host deployment

On this workstation, the public/tailnet endpoint is now fronted by a **user-systemd router**. The local bridge remains a separate user service and listens on an internal port used by the router.

Paths:

- Bridge user unit: `~/.config/systemd/user/commander-commandcode-bridge.service`
- Router user unit: `~/.config/systemd/user/commander-commandcode-router.service`
- Bridge runtime env file: `~/.config/commander-commandcode-bridge/env`
- Router runtime env file: `~/.config/commander-commandcode-bridge/router.env`
- Bridge executable: `~/.local/bin/commandcode-bridge`
- Router executable: `~/.local/bin/commandcode-router`
- External/Tailscale endpoint: router on `0.0.0.0:9992`
- Local backend endpoint: bridge on `127.0.0.1:19992` via router config
- Tailscale URL base for clients: `http://100.122.162.75:9992`

Check status:

```bash
systemctl --user status commander-commandcode-bridge --no-pager
systemctl --user status commander-commandcode-router --no-pager
systemctl --user is-enabled commander-commandcode-bridge
systemctl --user is-enabled commander-commandcode-router
loginctl show-user "$USER" -p Linger
```

Expected:

- both services are `active (running)`
- both services are `enabled`
- linger is `Linger=yes`

Operate:

```bash
systemctl --user restart commander-commandcode-bridge
systemctl --user restart commander-commandcode-router
journalctl --user -u commander-commandcode-bridge -f
journalctl --user -u commander-commandcode-router -f
```

Router health:

```bash
curl -sS http://127.0.0.1:9992/health | jq
```

Direct local backend health, bypassing the router:

```bash
curl -sS http://127.0.0.1:19992/health | jq
```

Authenticated models check through the router:

```bash
set -a
. "$HOME/.config/commander-commandcode-bridge/env"
set +a
curl -sS http://127.0.0.1:9992/v1/models   -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

Router backend status:

```bash
set -a
. "$HOME/.config/commander-commandcode-bridge/env"
set +a
curl -sS http://127.0.0.1:9992/admin/router/backends   -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

Smoke test through the externally preserved endpoint:

```bash
set -a
. "$HOME/.config/commander-commandcode-bridge/env"
set +a
BRIDGE_BASE_URL=http://127.0.0.1:9992 npm run smoke
```

If the upstream account is reachable but blocked by balance/credits, use routing-only smoke mode:

```bash
set -a
. "$HOME/.config/commander-commandcode-bridge/env"
set +a
BRIDGE_BASE_URL=http://127.0.0.1:9992 SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

`SMOKE_ACCEPT_UPSTREAM_ERRORS=1` is not a generation canary. It only accepts explicit upstream/fail-closed errors such as `commandcode_event_error`, `commandcode_empty_response`, or `commandcode_empty_visible_response`.

Admin credential metrics through the router:

```bash
set -a
. "$HOME/.config/commander-commandcode-bridge/env"
set +a
curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true'   -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

The admin endpoint returns credential IDs, routing state, billing-derived metrics, and alert configuration. It must not return raw CommandCode API keys or the bridge key.

## Router mode for multiple bridge hosts

Run one `commander-commandcode-bridge` per machine, then put one `commandcode-router` in front of them. The router preserves a single OpenAI-compatible endpoint for agents and chooses an eligible backend by least in-flight request count.

Minimal router env:

```env
HOST=0.0.0.0
PORT=9992
COMMANDCODE_ROUTER_BACKENDS=local=http://127.0.0.1:19992,pc2=http://100.x.y.z:9992
COMMANDCODE_ROUTER_BACKEND_MAX_INFLIGHT=1
COMMANDCODE_ROUTER_BACKEND_TIMEOUT_MS=300000
COMMANDCODE_ROUTER_HEALTH_TIMEOUT_MS=3000
COMMANDCODE_ROUTER_COOLDOWN_MS=60000
```

If all bridge backends use the same `BRIDGE_API_KEY`, the router can reuse it as both client auth and backend auth. If a backend uses a different key, provide JSON backend entries with per-backend `apiKey` values in a private env file; never commit those values.

A single streaming request cannot migrate between PCs after output starts. Failover and load distribution happen at independent request boundaries.

## User systemd deployment

Use this when you do not have root access, or when the bridge should run as the current user and read that user's `~/.commandcode/auth.json`.

Prerequisites:

```bash
command -v node
command -v npm
command -v commandcode-bridge
systemctl --user is-system-running
```

Enable linger so the user service starts at boot even before login:

```bash
sudo loginctl enable-linger "$USER"
loginctl show-user "$USER" -p Linger
```

Create the env directory and file:

```bash
mkdir -p ~/.config/commander-commandcode-bridge
chmod 700 ~/.config/commander-commandcode-bridge
nano ~/.config/commander-commandcode-bridge/env
chmod 600 ~/.config/commander-commandcode-bridge/env
```

Minimal env file:

```env
HOST=0.0.0.0
PORT=9992
NODE_ENV=production
BRIDGE_API_KEY=replace-with-long-random-client-key
COMMANDCODE_ROUTING_POLICY=depletion_aware
COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=error_on_length
COMMANDCODE_BALANCE_ALERT_ENABLED=false
```

If you rely on the normal CommandCode CLI auth file, keep it at:

```text
~/.commandcode/auth.json
```

If you prefer explicit upstream credentials, add one of these to the env file:

```env
# Single-key mode
COMMANDCODE_API_KEY=cmd_key_here

# Multi-key mode
COMMANDCODE_API_KEYS=primary=cmd_key_one,secondary=cmd_key_two
```

Create the user unit manually, or copy the release template from `release/systemd/commander-commandcode-bridge.user.service`.

Manual unit creation:

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/commander-commandcode-bridge.service <<'EOF'
[Unit]
Description=Commander CommandCode Bridge - OpenAI-compatible API for CommandCode DeepSeek
After=default.target

[Service]
Type=simple
WorkingDirectory=%h
EnvironmentFile=%h/.config/commander-commandcode-bridge/env
ExecStart=%h/.local/bin/commandcode-bridge
Restart=always
RestartSec=5
TimeoutStopSec=20
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=default.target
EOF
```

Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now commander-commandcode-bridge
systemctl --user status commander-commandcode-bridge --no-pager
```

## System-level systemd deployment

Use this for server-style installs where a dedicated service user owns `/opt/commander-commandcode-bridge`.

The repository includes a system unit at:

```text
release/systemd/commander-commandcode-bridge.service
```

Install from a source checkout:

```bash
sudo useradd --system --home /opt/commander-commandcode-bridge --shell /usr/sbin/nologin commandcode-bridge || true
sudo mkdir -p /opt/commander-commandcode-bridge
sudo rsync -a --delete ./ /opt/commander-commandcode-bridge/
cd /opt/commander-commandcode-bridge
sudo npm ci
sudo npm run verify
sudo npm run build
sudo npm prune --omit=dev
```

Create the environment file:

```bash
sudo cp release/env.production.example /etc/commander-commandcode-bridge.env
sudo chmod 600 /etc/commander-commandcode-bridge.env
sudoedit /etc/commander-commandcode-bridge.env
```

Start the unit:

```bash
sudo cp release/systemd/commander-commandcode-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now commander-commandcode-bridge
sudo systemctl status commander-commandcode-bridge --no-pager
```

Operate:

```bash
sudo journalctl -u commander-commandcode-bridge -f
sudo systemctl restart commander-commandcode-bridge
sudo systemctl stop commander-commandcode-bridge
```

## Docker Compose deployment

Use Docker Compose when you want a container boundary and have the full source checkout available.

```bash
cd /opt/commander-commandcode-bridge
cp release/env.production.example release/env.production
chmod 600 release/env.production
nano release/env.production
cd release
docker compose up -d --build
```

Verify:

```bash
export BRIDGE_API_KEY='<same value as release/env.production>'
./smoke-curl.sh http://127.0.0.1:9992
```

Notes:

- The Compose service binds inside the container to `HOST=0.0.0.0`.
- The host port can still be published as `127.0.0.1:9992:9992` for local-only exposure.
- Do not commit `release/env.production`.

## Updating the global npm deployment

If the live service uses the globally installed package, building the source checkout is not enough. Repack and reinstall the package globally, then restart the service.

```bash
cd /home/yelixir/workspace/commander-commandcode-bridge
npm run verify
TGZ=$(npm pack --silent | tail -n1)
npm install -g "./$TGZ"
rm -f "$TGZ"
systemctl --user restart commander-commandcode-bridge
systemctl --user status commander-commandcode-bridge --no-pager
```

Then run smoke:

```bash
set -a
. "$HOME/.config/commander-commandcode-bridge/env"
set +a
npm run smoke
```

## Configuration options

### Server and client-auth options

| Variable                   | Default     | Description                                                                                                 |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `HOST`                     | `127.0.0.1` | Bind address. Use `127.0.0.1` for local-only, `0.0.0.0` for Tailscale/VPN/reverse-proxy exposure.           |
| `PORT`                     | `9992`      | HTTP listen port.                                                                                           |
| `BRIDGE_API_KEY`           | unset       | Client-facing bearer key. Strongly recommended; required for admin endpoints.                               |
| `REQUEST_BODY_LIMIT_BYTES` | `1048576`   | Fastify request body limit. Increase only for unusually large prompts/tool schemas.                         |
| `RATE_LIMIT_MAX`           | `60`        | Max requests per rate-limit window per client.                                                              |
| `RATE_LIMIT_WINDOW`        | `1 minute`  | Rate-limit window string accepted by `@fastify/rate-limit`.                                                 |
| `LOG_LEVEL`                | `info`      | Pino/Fastify log level. Common values: `debug`, `info`, `warn`, `error`, `silent`.                          |
| `CORS_ORIGIN`              | unset       | Enables CORS for a specific browser origin. Leave unset for non-browser clients.                            |
| `INCLUDE_REASONING`        | `false`     | If `true`, reasoning deltas are appended to visible content. Keep `false` for normal OpenAI-compatible use. |

### CommandCode upstream options

| Variable                           | Default                      | Description                                                                                                              |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `COMMANDCODE_API_KEY`              | unset                        | Single upstream CommandCode API key. If unset, the bridge can read the normal CommandCode auth file.                     |
| `COMMANDCODE_API_KEYS`             | unset                        | Comma-separated multi-key `id=key` list, for example `primary=...,secondary=...`. Takes precedence over single-key mode. |
| `COMMANDCODE_CREDENTIALS`          | unset                        | JSON credential array/object or comma-separated multi-key list. Useful for structured deployment systems.                |
| `COMMANDCODE_CREDENTIALS_FILE`     | unset                        | Path to a JSON credentials file. Highest upstream credential precedence. Recommended for complex multi-key setups.       |
| `COMMANDCODE_API_BASE`             | `https://api.commandcode.ai` | Upstream CommandCode API base URL. Change only for testing or if CommandCode changes endpoint base.                      |
| `COMMANDCODE_DEFAULT_MODEL`        | `deepseek/deepseek-v4-pro`   | Upstream model used by `model: "default"`.                                                                               |
| `COMMANDCODE_ALLOWED_MODELS`       | Pro + Flash                  | Comma-separated allowlist. Requests outside this list are rejected unless unknown models are allowed.                    |
| `COMMANDCODE_ALLOW_UNKNOWN_MODELS` | `false`                      | Allows arbitrary model IDs to pass through. Not recommended for production.                                              |
| `COMMANDCODE_CLI_VERSION`          | `0.25.12`                    | Version header sent upstream to match the tested CommandCode CLI behavior.                                               |
| `COMMANDCODE_TIMEOUT_MS`           | `300000`                     | Upstream generation timeout.                                                                                             |

Credential file shape:

```json
{
  "credentials": [
    { "id": "primary", "apiKey": "cmd_key_one", "weight": 1 },
    {
      "id": "flash-only",
      "apiKey": "cmd_key_two",
      "weight": 1,
      "allowedModels": ["deepseek/deepseek-v4-flash"]
    }
  ]
}
```

### Multi-key routing options

| Variable                             | Default           | Description                                                                                           |
| ------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `COMMANDCODE_ROUTING_POLICY`         | `depletion_aware` | `depletion_aware` routes by billing/expiry pressure; `round_robin` rotates eligible keys by weight.   |
| `COMMANDCODE_BILLING_REFRESH_MS`     | `300000`          | Billing/usage cache TTL per credential.                                                               |
| `COMMANDCODE_BILLING_TIMEOUT_MS`     | `10000`           | Timeout for billing probes. On probe failure, routing falls back safely rather than hanging requests. |
| `COMMANDCODE_CREDENTIAL_COOLDOWN_MS` | `60000`           | Cooldown after 429/5xx/timeouts. 402 uses at least this and the billing refresh window.               |

Routing behavior:

- `depletion_aware` prefers keys whose expiring/monthly credits need to be consumed before reset.
- depleted or failing keys are cooled down and skipped when alternatives exist.
- application-level stream errors before visible output can fail over to another eligible credential.
- once visible output has been sent, the bridge surfaces the error rather than retrying and duplicating output.

### Empty visible-content policy

| Variable                                    | Default           | Description                                                                                                                                                                                    |
| ------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY` | `error_on_length` | If upstream finishes with `finish_reason: length` before any visible content, return `commandcode_empty_visible_response` instead of blank success. Use `allow` only for legacy compatibility. |

This protects clients from treating hidden-token exhaustion as a valid empty answer.

### Balance alert options

Balance alerts are disabled by default.

| Variable                                            | Default             | Description                                                                              |
| --------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `COMMANDCODE_BALANCE_ALERT_ENABLED`                 | `false`             | Enables periodic alert checks. Default is intentionally off.                             |
| `COMMANDCODE_BALANCE_ALERT_MIN_CURRENT_BALANCE`     | `1`                 | Alert when current total balance drops below this threshold. Set `0` to disable.         |
| `COMMANDCODE_BALANCE_ALERT_MIN_EXPIRING_BALANCE`    | `0`                 | Alert when monthly/free expiring balance drops below this threshold. Set `0` to disable. |
| `COMMANDCODE_BALANCE_ALERT_MAX_REQUIRED_DAILY_BURN` | `0`                 | Alert when required daily burn exceeds this threshold. Set `0` to disable.               |
| `COMMANDCODE_BALANCE_ALERT_INTERVAL_MS`             | billing refresh TTL | Periodic alert check interval.                                                           |
| `COMMANDCODE_BALANCE_ALERT_REPEAT_MS`               | `3600000`           | Duplicate-notification throttle per credential/alert type.                               |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL`             | unset               | Optional JSON webhook target. Alerts are logged even without a webhook.                  |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_BEARER`          | unset               | Optional bearer token for the alert webhook.                                             |

## Multi-key canary checklist

Run this only after adding enough balance/top-up for real content generation.

1. Configure at least two credentials with distinct IDs using `COMMANDCODE_API_KEYS` or `COMMANDCODE_CREDENTIALS_FILE`.
2. Restart the service.
3. Confirm admin diagnostics show all expected IDs:

   ```bash
   set -a
   . "$HOME/.config/commander-commandcode-bridge/env"
   set +a
   curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true' \
     -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
   ```

4. Confirm every canary key has positive usable balance.
5. Run `npm run smoke` without `SMOKE_ACCEPT_UPSTREAM_ERRORS`.
6. Send several low-token requests.
7. Check admin metrics again and confirm selection/routing movement according to `COMMANDCODE_ROUTING_POLICY`.
8. If using Tailscale or another non-localhost path, repeat `/v1/models` and one chat request through that path.

## Troubleshooting

### `/health` works but smoke returns 401

The bridge is running and requires client auth, but the smoke process did not receive the correct `BRIDGE_API_KEY`.

Fix:

```bash
set -a
. "$HOME/.config/commander-commandcode-bridge/env"
set +a
npm run smoke
```

### Source checkout verifies but live behavior does not change

The live service probably uses a global npm install. Run `npm pack`, `npm install -g`, and restart the actual service manager.

### Port 9992 is already in use

```bash
ss -ltnp '( sport = :9992 )'
systemctl --user status commander-commandcode-bridge --no-pager
```

Stop the manual process or change `PORT` in the env file.

### Service does not start at boot

Check linger and enablement:

```bash
loginctl show-user "$USER" -p Linger
systemctl --user is-enabled commander-commandcode-bridge
```

If linger is disabled:

```bash
sudo loginctl enable-linger "$USER"
```

### Upstream balance/credit failure

Use routing-only smoke only to prove fail-closed behavior:

```bash
SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

For real generation readiness, top up the account and run smoke without that flag.
