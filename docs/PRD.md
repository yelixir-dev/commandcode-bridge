# CommandCode Bridge PRD

> Product Requirement Document for an OpenAI-compatible HTTP proxy over CommandCode's `/alpha/generate` endpoint.

## Mission

Expose the local CommandCode account's DeepSeek V4 Pro route as a clean, OpenAI-compatible API for trusted local or tailnet clients.

## Default Model

`deepseek/deepseek-v4-pro` is the default upstream model.

## Goals

1. Provide `/v1/chat/completions` compatible with OpenAI Chat Completions.
2. Provide `/v1/models` with stable aliases for DeepSeek V4 Pro and Flash.
3. Support both streaming and non-streaming clients while always calling CommandCode with `params.stream: true`.
4. Avoid invoking the `cmd` CLI per request.
5. Keep the implementation safe for internal deployment: optional bridge API key, rate limits, request size limit, secret redaction, and no local tool execution.
6. Be publication-ready for GitHub/GitLab with English and Korean documentation.

## Non-Goals

- No public hosted service.
- No resale, multi-tenant billing, or third-party credential brokerage.
- No execution of CommandCode local tools from incoming API requests.
- No copying of CommandCode's UNLICENSED npm bundle source.

## Users

- Primary: CommandCode Bridge workstation owner using trusted local agents.
- Secondary: Tailnet clients that need an OpenAI-compatible endpoint.

## Acceptance Criteria

- `npm run verify` passes.
- `/health` reports configuration without leaking secrets.
- `/v1/models` lists the default model.
- `/v1/chat/completions` returns OpenAI-style JSON for `stream=false`.
- `/v1/chat/completions` returns OpenAI-style SSE chunks for `stream=true`.
- Direct upstream smoke test can return a known token from DeepSeek V4 Pro.
- README.md and README.ko.md are complete.
- `release/` contains deployment assets for Docker Compose and systemd.

## Risks

| Risk                                              | Mitigation                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| CommandCode `/alpha/generate` is unofficial/alpha | Isolate upstream client, pin CLI-version header, document breakage risk.       |
| API key exposure                                  | Never log Authorization; support BRIDGE_API_KEY; default bind to localhost.    |
| Token waste                                       | Minimal CommandCode body: no tools, empty memory/taste/skills by default.      |
| Streaming schema drift                            | Parser accepts plain JSON lines and `data:` SSE lines; unknown events ignored. |
| Cost surprises                                    | Model allowlist, rate limit, and usage passthrough.                            |

## Source Evidence

- Local CommandCode 0.32.2 bundle calls `https://api.commandcode.ai/alpha/generate` and billing/usage endpoints under `/alpha/billing/*` and `/alpha/usage/summary`.
- Direct Node fetch to `/alpha/whoami` and `/alpha/generate` succeeded.
- `params.stream=false` is rejected by CommandCode; bridge must always call upstream streaming.
- Community `pi-commandcode-provider` independently uses the same API path.
