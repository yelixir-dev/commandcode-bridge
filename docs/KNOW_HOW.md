# Know-How Notes

## CommandCode API Shape

CommandCode's API is not OpenAI-compatible directly. The bridge must send:

```json
{
  "config": { "workingDir": "/tmp", "date": "YYYY-MM-DD", "environment": "linux-x64, Node.js v24" },
  "memory": "",
  "taste": "",
  "skills": null,
  "permissionMode": "standard",
  "params": {
    "model": "deepseek/deepseek-v4-pro",
    "messages": [],
    "tools": [],
    "system": "",
    "max_tokens": 1024,
    "temperature": 0.3,
    "stream": true
  },
  "threadId": "uuid"
}
```

## Stream Events

Important event types:

- `text-delta`: append to assistant content.
- `reasoning-delta`: optional internal reasoning; hidden by default.
- `tool-call`: convert to OpenAI `tool_calls` if tools are used.
- `finish`: contains finish reason and usage.
- `error`: application-level upstream failure transported inside an HTTP 200 event stream. The bridge maps this to `502` for non-streaming clients and an SSE error frame for streaming clients.

## Live Smoke Lessons

CommandCode may return HTTP `200 OK` with an event stream that contains an error payload, for example:

```json
{
  "type": "error",
  "error": { "type": "server_error", "message": "Insufficient Balance", "statusCode": 402 }
}
```

A bridge must treat this as upstream failure, not as a successful empty completion. It must also fail closed when the stream ends after non-completion events such as `start` without any `text-delta`, `finish`, usage, or error event. If the upstream async stream throws after the HTTP response has already started, streaming clients must receive an SSE error frame plus `[DONE]` rather than a reset connection.

Smoke-test modes:

- Default smoke expects real generated content containing `COMMANDCODE_BRIDGE_SMOKE_OK`.
- `SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke` additionally accepts explicit `commandcode_event_error` or `commandcode_empty_response` as a routing/auth smoke pass. This is useful when the account is reachable but blocked by balance/credit state.

## Billing and Multi-Key Routing

CommandCode CLI 0.26.12 `/usage` uses these account endpoints with the same bearer token:

- `GET /alpha/whoami` to discover the organization id.
- `GET /alpha/billing/credits?orgId=...`
- `GET /alpha/billing/subscriptions?orgId=...`
- `GET /alpha/usage/summary?orgId=...&since=<currentPeriodStart>`

The bridge caches these snapshots per credential (`COMMANDCODE_BILLING_REFRESH_MS`, default 5 minutes). Each billing probe is bounded by `COMMANDCODE_BILLING_TIMEOUT_MS` (default 10 seconds) and in-flight refreshes are deduplicated per credential.

The explicit routing metric is current balance pressure over the remaining subscription period:

- `expiringBalance = monthlyCredits + freeCredits`
- `currentBalance = expiringBalance + purchasedCredits`
- `daysRemaining = max((currentPeriodEnd - now) / 1 day, 0)`
- `requiredDailyBurn = expiringBalance / max(daysRemaining, 0.25)`
- `routingScore = requiredDailyBurn * credential.weight`

`depletion_aware` routing uses smooth weighted selection over that routing score, so accounts with more expiring balance per remaining day receive more traffic. Purchased credits are treated as reserve capacity (`purchasedCredits / 365`) only when monthly/free credits are unavailable. If billing probes fail, routing falls back to configured weights/round-robin rather than blocking generation.

Credential health rules:

- 401: disable the credential for the process lifetime.
- 402: cooldown at least the billing refresh interval, then re-probe later.
- confirmed zero remaining credits: do not select the credential until a later billing refresh proves capacity has returned.
- 429/5xx/timeout/opaque retryable errors: cooldown for `COMMANDCODE_CREDENTIAL_COOLDOWN_MS`.
- Application-level stream errors before visible output can fail over to another credential. After visible output, the error is forwarded to the client instead of retrying and duplicating content. A single client request also excludes credentials it already attempted, so a high-weight failing key cannot be retried in the same request.

## Security Rule

Never expose this bridge on the public Internet without an outer auth layer. `BRIDGE_API_KEY` is mandatory for any non-localhost deployment.
