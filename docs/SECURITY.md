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

## Deployment Recommendation

Use one of:

1. `127.0.0.1` only for local clients.
2. Tailscale/VPN bind with `BRIDGE_API_KEY` set.
3. Reverse proxy with TLS and authentication.

Do not run as a public anonymous endpoint.
