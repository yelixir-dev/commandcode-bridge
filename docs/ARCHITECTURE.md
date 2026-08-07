# Architecture

## Components

```text
Client
  ├─ OpenAI SDK
  ├─ LiteLLM
  ├─ custom curl client
  └─ local/tailnet agents
        │
        ▼
CommandCode Bridge
  ├─ Fastify server
  ├─ authentication guard
  ├─ request validation (Zod)
  ├─ model alias/allowlist resolver
  ├─ CommandCode credential router
  ├─ CommandCode billing/usage snapshot cache
  ├─ Provider API client (native OpenAI, default)
  ├─ CommandCode /alpha client (Claude + legacy mode)
  ├─ OpenAI → CommandCode converter (alpha path only)
  ├─ CommandCode upstream HTTP client
  ├─ CommandCode stream parser (alpha path only)
  └─ CommandCode → OpenAI response converter (alpha path only)
        │
        ▼
CommandCode API
  ├─ POST /provider/v1/chat/completions  (Provider API, non-Claude)
  └─ POST /alpha/generate                (Claude + alpha mode)
        │
        ▼
DeepSeek V4 Pro / Flash etc.
```

## Request Flow

1. Client calls `POST /v1/chat/completions`.
2. Bridge optionally checks `Authorization: Bearer` or `x-api-key` against `BRIDGE_API_KEY`.
3. Zod validates the OpenAI-style request body.
4. Model aliases are resolved and checked against the allowlist.
5. The credential router selects one upstream key:
   - `round_robin` uses configured weights.
   - `depletion_aware` refreshes cached billing/usage snapshots and scores expiring credits by current balance pressure over the remaining period: `(monthlyCredits + freeCredits) / max(days until renewal, 0.25)`. Purchased credits are reserve capacity.
   - `drain_first` drains the eligible credential with the least remaining time first (unknown-expiry credentials trail known ones).
   - Credentials can be scoped to specific upstream models with `allowedModels`.
6. OpenAI messages are converted:
   - system messages → `params.system`
   - non-system messages → `params.messages`
   - function tools → CommandCode-style `input_schema`
   - `tool_choice: "none"` → no tools forwarded
   - forced `tool_choice` values → HTTP 400 `unsupported_tool_choice`
7. Bridge posts to `COMMANDCODE_API_BASE/alpha/generate` with `params.stream: true`.
8. CommandCode newline/SSE-like events are parsed.
9. If a selected credential fails before visible output, retryable 401/402/429/5xx/timeouts can fail over to another available credential.
10. For `stream=false`, text deltas and tool-call events are aggregated into one OpenAI `chat.completion`.
11. For `stream=true`, text deltas and tool-call events are emitted as OpenAI `chat.completion.chunk` SSE frames. When `stream_options.include_usage` is true, the bridge emits a final usage-only chunk with `choices: []` before `[DONE]`.

## Why direct upstream HTTP instead of `cmd -p` subprocess?

| Aspect         | Direct HTTP bridge       | CLI subprocess wrapper                            |
| -------------- | ------------------------ | ------------------------------------------------- |
| Latency        | Lower                    | Higher, process startup per call                  |
| Streaming      | Native stream conversion | stdout parsing required                           |
| Token overhead | Minimal bridge body      | CLI may inject local context/tools/memory         |
| Safety         | No local tool execution  | CLI can be dangerous if run with permissive flags |
| Reliability    | One API surface          | CLI prompt/TTY behavior can change                |

## Upstream Compatibility

`COMMANDCODE_UPSTREAM_MODE` selects the upstream per plan. The default `auto` probes `POST /provider/v1/chat/completions` at startup with one minimal `deepseek/deepseek-v4-flash` request (`max_tokens: 1`): a 2xx response proves the key is accepted and the plan has API access (Provider plan at $15/mo or higher — Max, Team Pro, and Enterprise tiers included), while `403 upgrade_required` means the account is on a Go/GOAT/Pro subscription plan without API access. A valid body is required because body validation runs before the plan check — an empty body returns 400 even without API access. `provider` forces the official API; `alpha` forces the legacy tunnel for every model. In `auto` mode a mid-run `403 upgrade_required` on a chat request falls back to the `/alpha/generate` tunnel for that request and marks the Provider API unavailable.

Provider mode calls the official `POST /provider/v1/chat/completions` with a native OpenAI body and streams the provider's OpenAI SSE through with the public model id; `stream: false` requests are answered with a single JSON completion. Claude model ids are served through `POST /alpha/generate` in every mode because the Provider API exposes Claude only via the Anthropic `/messages` format. Legacy `alpha` mode keeps the old tunnel: `/alpha/generate` requires `params.stream: true`, so the bridge always calls upstream streaming there, even for OpenAI non-streaming clients.

The Provider API emits token usage in the final chunk with no opt-in required; `x-cmd-zdr: 1` is sent when `COMMANDCODE_ZDR` is enabled. Billing and usage snapshots (`/alpha/whoami`, `/alpha/billing/*`, `/alpha/usage/summary`) are shared by both modes and remain the routing and balance-alert data source.

## Error Strategy

- Invalid OpenAI request → HTTP 400 OpenAI-style error.
- Disallowed model → HTTP 400 OpenAI-style error.
- Missing upstream API key → HTTP 500 configuration error.
- Transient upstream failures (429, 5xx, timeouts, empty bodies) are retried with exponential backoff up to `COMMANDCODE_RETRY_MAX_ATTEMPTS` (default 5, base `COMMANDCODE_RETRY_BACKOFF_MS` doubled per attempt, capped at 2s). A credential that fails with 401/402/403 is excluded for the rest of the request so other keys are preferred; retries stop once any visible output has been emitted.
- Provider API HTTP failure → upstream status and OpenAI-style error body forwarded (for example `403 upgrade_required` or `429 rate_limit_error`); credential cooldown/disable rules are applied.
- `/alpha` HTTP failure → HTTP 502 with upstream status and sanitized body.
- `/alpha` stream `error` event → fail over first if no visible output has been emitted and another credential is available; otherwise map to HTTP 502 or SSE error frame plus `[DONE]`.
- No available upstream credential → HTTP 503 OpenAI-style upstream error.
- Unknown server failure → HTTP 500 generic error.

## Secrets

The bridge never returns raw secrets from `/health`. Production logs should be handled as sensitive operational data, but the implementation does not log Authorization headers explicitly.
