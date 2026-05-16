# Release Deployment Assets

This directory contains copy-ready deployment assets for operating CommandCode Bridge from a **source checkout** in a CommandCode CLI/account environment. The npm package is runtime-oriented and does not contain the full Docker build context.

> **CommandCode CLI environment required:** download/install the official CLI from [commandcode.ai/install](https://commandcode.ai/install) (official site: [commandcode.ai](https://commandcode.ai/)), then authenticate the CLI or provide equivalent `COMMANDCODE_*` credentials.

For the full deployment and option reference, see:

- `../docs/DEPLOYMENT.md` — primary English deployment guide.
- `../docs/DEPLOYMENT.ko.md` — detailed Korean deployment guide.

## Files

- `docker-compose.yml` — production-oriented Compose service. It publishes `127.0.0.1:9992` on the host and overrides the container process to `HOST=0.0.0.0` so Docker port publishing works.
- `env.production.example` — production environment template. Track this file only; never commit `env.production`.
- `systemd/commandcode-bridge.service` — system-level systemd unit for a direct host install.
- `systemd/commandcode-bridge.user.service` — user-systemd unit for rootless installs with linger.
- `systemd/commandcode-router.user.service` — optional user-systemd router in front of one or more bridge backends.
- `nginx/commandcode-bridge.conf` — optional authenticated/TLS reverse proxy example.
- `smoke-curl.sh` — health and chat-completion smoke test.

## Security Baseline

- Do **not** expose this service to the public internet without TLS and `BRIDGE_API_KEY`.
- Prefer localhost, Tailscale, WireGuard, VPN, or a private reverse proxy.
- Treat CommandCode CLI auth files, `COMMANDCODE_API_KEY` / `COMMANDCODE_API_KEYS`, and credential files as personal upstream credentials.
- Keep real env files out of Git and Docker build context: `.gitignore` and `.dockerignore` intentionally ignore `env.production` and `release/env.production`.

## One-command User systemd Install

For Raspberry Pi or Linux hosts that should run the bridge as the current user:

```bash
./install.sh
```

The installer asks whether to bind to `127.0.0.1` or `0.0.0.0` and which port to use. Defaults are safe: `127.0.0.1:9992`.

Prerequisites: Linux with user systemd, Node.js >= 20, npm, and either CommandCode CLI auth at `~/.commandcode/auth.json` or a `COMMANDCODE_API_KEY`. On headless hosts that should start before login, enable linger once with `sudo loginctl enable-linger "$USER"`. Use `0.0.0.0` only behind LAN/Tailscale/VPN/firewall controls and keep a strong `BRIDGE_API_KEY`.

Non-interactive example:

```bash
./install.sh --yes --host 127.0.0.1 --port 9992
```

Remove the service and installed files while preserving credentials:

```bash
./uninstall.sh
```

Remove credentials/env as well:

```bash
./uninstall.sh --purge-config
```

## Docker Compose Deployment

Start from the repository root. The Dockerfile intentionally runs the full verification pipeline, so it requires the full source checkout (`src/`, `tests/`, `tsconfig*.json`, lockfile, and config files), not the npm runtime package.

```bash
cd /opt/commandcode-bridge
cp release/env.production.example release/env.production
chmod 600 release/env.production
```

Edit `release/env.production`:

```env
COMMANDCODE_API_KEY=...
BRIDGE_API_KEY=...
COMMANDCODE_DEFAULT_MODEL=deepseek/deepseek-v4-pro
COMMANDCODE_ALLOWED_MODELS=deepseek/deepseek-v4-pro,deepseek/deepseek-v4-flash
```

Start:

```bash
cd release
docker compose up -d --build
```

Verify:

```bash
export BRIDGE_API_KEY='<same value as release/env.production>'
./smoke-curl.sh http://127.0.0.1:9992
```

Inspect credential/balance diagnostics without exposing raw keys:

```bash
curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true' \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

If the upstream CommandCode account is reachable but blocked by credits/balance, verify routing and fail-closed behavior instead:

```bash
SMOKE_ACCEPT_UPSTREAM_ERRORS=1 ./smoke-curl.sh http://127.0.0.1:9992
```

Operate:

```bash
cd /opt/commandcode-bridge/release
docker compose ps
docker compose logs -f --tail=200
docker compose restart
# After updating the source checkout:
docker compose up -d --build
# Use `docker compose pull` only if you change the service to a registry image instead of local build.
```

Stop/rollback:

```bash
docker compose down
# then check out the previous Git revision or restore the previous image tag and run up again
```

## systemd Host Deployment

Create a service user if desired:

```bash
sudo useradd --system --home /opt/commandcode-bridge --shell /usr/sbin/nologin commandcode-bridge || true
```

Install the app from a source checkout:

```bash
sudo mkdir -p /opt/commandcode-bridge
sudo rsync -a --delete ./ /opt/commandcode-bridge/
cd /opt/commandcode-bridge
sudo npm ci
sudo npm run build
sudo npm prune --omit=dev
```

Create the environment file:

```bash
sudo cp release/env.production.example /etc/commandcode-bridge.env
sudo chmod 600 /etc/commandcode-bridge.env
sudoedit /etc/commandcode-bridge.env
```

For direct host/systemd installs, `HOST=127.0.0.1` is the safe default. Use a private interface only when an authenticated reverse proxy or VPN controls access.

Install and start the unit:

```bash
sudo cp release/systemd/commandcode-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now commandcode-bridge
sudo systemctl status commandcode-bridge --no-pager
```

Verify:

```bash
export BRIDGE_API_KEY='<same value as /etc/commandcode-bridge.env>'
release/smoke-curl.sh http://127.0.0.1:9992
```

Inspect credential/balance diagnostics:

```bash
curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true' \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

Operate:

```bash
sudo journalctl -u commandcode-bridge -f
sudo systemctl restart commandcode-bridge
sudo systemctl stop commandcode-bridge
```

## Nginx Reverse Proxy

Use `nginx/commandcode-bridge.conf` only after setting TLS and client auth policy appropriate for the environment. The bridge should still require `BRIDGE_API_KEY` for non-localhost clients.

## Balance Alerts

Balance alerts are opt-in. The production env template keeps `COMMANDCODE_BALANCE_ALERT_ENABLED=false`, so no periodic alert timer or webhook is active unless explicitly enabled.

To enable structured warning logs and optional webhook delivery, set:

```env
COMMANDCODE_BALANCE_ALERT_ENABLED=true
COMMANDCODE_BALANCE_ALERT_MIN_CURRENT_BALANCE=1
COMMANDCODE_BALANCE_ALERT_MIN_EXPIRING_BALANCE=0
COMMANDCODE_BALANCE_ALERT_MAX_REQUIRED_DAILY_BURN=0
COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL=https://example.invalid/hook
COMMANDCODE_BALANCE_ALERT_WEBHOOK_BEARER=optional-secret
```

Set any numeric threshold to `0` to disable that threshold. `COMMANDCODE_BALANCE_ALERT_REPEAT_MS` throttles duplicate notifications per credential/alert type.

## Deferred Live Multi-Key Canary

Do not treat `SMOKE_ACCEPT_UPSTREAM_ERRORS=1` as a generation canary. It proves routing/auth/fail-closed behavior only. Real multi-key canary is deferred until the CommandCode accounts have enough paid/top-up balance for content generation.

After payment/top-up:

1. Configure at least two distinct credential IDs.
2. Run `/admin/commandcode/credentials?refresh=true` and verify positive balance on every canary key.
3. Run `./smoke-curl.sh` without `SMOKE_ACCEPT_UPSTREAM_ERRORS`.
4. Send multiple low-token requests and confirm routing movement in the admin metrics response.
5. Keep `BRIDGE_API_KEY` configured for any non-localhost path.

## Compatibility Notes

- Upstream `/alpha/generate` is always called with `params.stream: true`; non-streaming OpenAI responses are aggregated locally.
- Upstream application-level stream errors, such as `Insufficient Balance`, are mapped to explicit OpenAI-style upstream errors instead of blank successful completions.
- Empty visible-content responses with `finish_reason: length` return `commandcode_empty_visible_response` by default; set `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=allow` only for legacy compatibility.
- Function `tools` are best-effort supported. OpenAI `tool_choice` is honored only for omitted/`auto` and `none`; forced tool selection is rejected with `unsupported_tool_choice` because the upstream API has no stable forced-tool selector.
- `stream_options.include_usage` emits a final usage-only OpenAI chunk with `choices: []` before `[DONE]`.
