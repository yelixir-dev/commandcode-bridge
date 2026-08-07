# Security Notes

## Threat Model

The bridge controls a CommandCode account API key. Any caller who can access it can spend credits and send arbitrary prompts to the upstream model.

## Controls

- Default bind host: `127.0.0.1`.
- Optional `BRIDGE_API_KEY` accepted through `Authorization: Bearer` or `x-api-key`.
- Rate limiting via `@fastify/rate-limit`.
- Request body size limit.
- Model allowlist enabled by default.
- No local shell/file tools are exposed to upstream by default.
- Logs redact common secret-bearing headers.

## Dashboard Write Authentication

- `PUT /admin/config` and `POST /admin/restart` require the current runtime `BRIDGE_API_KEY` whenever one is configured.
- `Origin`, `Referer`, and `Host` are not authentication credentials. CORS checks remain browser controls only.
- A keyless runtime may bootstrap through the dashboard only when both the TCP peer address and HTTP Host are loopback. This preserves default local installs while blocking LAN and DNS-rebinding takeover.
- Existing users opening a fresh browser enter the current key once in **Current Admin API Key**. Key rotation continues to authenticate with the old key until restart activates the new key.
- Generated keys contain 24 random bytes. Existing keys are never rotated automatically during upgrade.

## Deployment Recommendation

- `PUT /admin/config` and `POST /admin/restart` require the current runtime `BRIDGE_API_KEY` whenever one is configured.
- `Origin`, `Referer`, and `Host` are not authentication credentials. CORS checks remain browser controls only.
- A keyless runtime may bootstrap through the dashboard only when both the TCP peer address and HTTP Host are loopback. This preserves default local installs while blocking LAN and DNS-rebinding takeover.
- Existing users opening a fresh browser enter the current key once in **Current Admin API Key**. Key rotation continues to authenticate with the old key until restart activates the new key.
- Generated keys contain 24 random bytes. Existing keys are never rotated automatically during upgrade.

## Deployment Recommendation

Use one of:

1. `127.0.0.1` only for local clients.
2. Tailscale/VPN bind with `BRIDGE_API_KEY` set.
3. Reverse proxy with TLS and authentication.

Do not run as a public anonymous endpoint.
