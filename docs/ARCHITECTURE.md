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
Commander CommandCode Bridge
  ├─ Fastify server
  ├─ authentication guard
  ├─ request validation (Zod)
  ├─ model alias/allowlist resolver
  ├─ CommandCode credential router
  ├─ CommandCode billing/usage snapshot cache
  ├─ OpenAI → CommandCode converter
  ├─ CommandCode upstream HTTP client
  ├─ CommandCode stream parser
  └─ CommandCode → OpenAI response converter
        │
        ▼
CommandCode API
  └─ POST /alpha/generate
        │
        ▼
DeepSeek V4 Pro
```

## Request Flow

1. Client calls `POST /v1/chat/completions`.
2. Bridge optionally checks `Authorization: Bearer` or `x-api-key` against `BRIDGE_API_KEY`.
3. Zod validates the OpenAI-style request body.
4. Model aliases are resolved and checked against the allowlist.
5. The credential router selects one upstream key:
   - `round_robin` uses configured weights.
   - `depletion_aware` refreshes cached billing/usage snapshots and scores expiring credits by current balance pressure over the remaining period: `(monthlyCredits + freeCredits) / max(days until renewal, 0.25)`. Purchased credits are reserve capacity.
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

CommandCode's `/alpha/generate` requires `params.stream: true`. The bridge therefore always calls upstream streaming, even for OpenAI non-streaming clients.

## Error Strategy

- Invalid OpenAI request → HTTP 400 OpenAI-style error.
- Disallowed model → HTTP 400 OpenAI-style error.
- Missing upstream API key → HTTP 500 configuration error.
- CommandCode HTTP failure → HTTP 502 with upstream status and sanitized body; selected credential cooldown/disable rules are applied.
- CommandCode stream `error` event → fail over first if no visible output has been emitted and another credential is available; otherwise map to HTTP 502 or SSE error frame plus `[DONE]`.
- No available upstream credential → HTTP 503 OpenAI-style upstream error.
- Unknown server failure → HTTP 500 generic error.

## Secrets

The bridge never returns raw secrets from `/health`. Production logs should be handled as sensitive operational data, but the implementation does not log Authorization headers explicitly.
