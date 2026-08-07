<p align="center">
<img src="docs/assets/banner.svg" alt="CommandCode Bridge — OpenAI-compatible gateway for trusted CommandCode deployments" width="880">

</p>

<p align="center">
  <strong>OpenAI-compatible access to CommandCode models, credentials, and routing inside a trusted network.</strong>
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-1.14.0-b57920?style=flat-square" alt="Version 1.14.0"></a>
  <a href="src/model-catalog.ts"><img src="https://img.shields.io/badge/models-52-1f6f78?style=flat-square" alt="52 models"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-20%2B-9f4d2e?style=flat-square" alt="Node.js 20+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-28231f?style=flat-square" alt="MIT License"></a>
</p>

<!-- README-I18N:START -->

**English** | [한국어](./README.ko.md) | [中文](./README.zh.md)

<!-- README-I18N:END -->

CommandCode Bridge is a trusted-environment HTTP gateway for a CommandCode account. It presents standard OpenAI-compatible model and chat endpoints, routes work across eligible upstream credentials, and publishes an exact **52-model** catalog aligned with CommandCode/bridge **1.14.0**.

[What it does](#what-it-does) · [Install](#install) · [Usage](#usage) · [How it works](#how-it-works) · [Repository layout](#repository-layout) · [Current limitations](#current-limitations) · [License](#license)

## What it does

- **OpenAI-compatible API.** Lists and retrieves models and serves streaming or non-streaming chat without spawning `cmd` per request.

- **CommandCode stream conversion.** Normalizes visible text, usage, finish reasons, and emitted tool calls into OpenAI response shapes.

- **Multi-key routing.** Supports `daily_burn_priority`, `balance_priority`, `round_robin`, and `drain_first`, with per-key concurrency, cooldown, model scope, and pre-output failover.

- **Universal expiry priority.** Under every policy, eligible credentials with a known expiry in **1 day or less** are selected before longer-lived credentials.

- **Context metadata.** Emits `context_window`, `context_length`, and `max_context_length` whenever the catalog has a published context.

- **Mobile dashboard.** Manages bind settings, routing, credentials, and model toggles in Korean, English, and Chinese, with models folded by provider.

- **Secret boundary.** Loads private credentials without shipping keys or the CommandCode CLI bundle; diagnostics remain redacted.

## Install

### Linux rootless installer

The installer targets Linux user systemd, requires Node.js 22+ for CommandCode CLI 1.14.0, imports CLI auth when available, writes private state under `~/.config/commandcode-bridge`, installs under `~/.local/share/commandcode-bridge`, and safely defaults to `127.0.0.1:9992`. Use `0.0.0.0` only behind a trusted LAN/VPN/tailnet/firewall/reverse proxy with `BRIDGE_API_KEY`. Use `sudo loginctl enable-linger "$USER"` for pre-login startup; uninstall with `./uninstall.sh` or `./uninstall.sh --purge-config`.

```bash
./install.sh
./install.sh --yes --host 127.0.0.1 --port 9992
./install.sh --host 0.0.0.0 --port 9992
```

### Manual source run

The bridge runtime supports Node.js 20+, while installing or using the current CommandCode CLI requires Node.js 22+. Authenticate the official `command-code` npm package with `cmd login`, or provide equivalent credentials. Official installation: <https://commandcode.ai/install>.

```bash
git clone <your-commandcode-bridge-repository-url> commandcode-bridge
cd commandcode-bridge
npm install --include=dev
cp .env.example .env
npm run build
npm start
```

### Docker

Docker and Compose require a full source checkout; the Dockerfile verifies and builds before producing the runtime image. See [the deployment guide](docs/DEPLOYMENT.md) and [`release/docker-compose.yml`](release/docker-compose.yml).

```bash
docker build -t commandcode-bridge .
docker run --rm -p 127.0.0.1:9992:9992 \
  -e HOST=0.0.0.0 \
  -e COMMANDCODE_API_KEY="$COMMANDCODE_API_KEY" \
  -e BRIDGE_API_KEY="$BRIDGE_API_KEY" \
  commandcode-bridge
```

## Usage

### Verify and call the API

```bash
export BRIDGE_API_KEY='<same value as the bridge runtime>'
curl -fsS http://127.0.0.1:9992/health | jq
curl -fsS http://127.0.0.1:9992/v1/models \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
curl -fsS http://127.0.0.1:9992/v1/models/deepseek%2Fdeepseek-v4-pro \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

`/health` is public and secret-free. `GET /v1/models` lists available models, while `GET /v1/models/:model` returns one available model or `404 model_not_found`; slash-bearing IDs must be URL-encoded. `POST /v1/chat/completions` returns OpenAI completion JSON or SSE with `stream: true`; `stream_options.include_usage` adds a final usage chunk. Supported roles are `developer`, `system`, `user`, `assistant`, and `tool`. Tool schemas and emitted calls work; forced `tool_choice` accepts only omitted, `"auto"`, or `"none"`.

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

### API surface

| Method | Path                             | Behavior                                                                                                            |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/health`                        | Public, secret-free health and runtime summary.                                                                     |
| `GET`  | `/dashboard`                     | Public read-only shell for trusted networks.                                                                        |
| `GET`  | `/v1/models`                     | Authenticated when `BRIDGE_API_KEY` is configured; lists available models.                                          |
| `GET`  | `/v1/models/:model`              | Authenticated when configured; retrieves one available model.                                                       |
| `POST` | `/v1/chat/completions`           | Authenticated when configured; streaming or non-streaming chat.                                                     |
| `GET`  | `/admin/config`                  | Public redacted dashboard state on the trusted network.                                                             |
| `GET`  | `/admin/commandcode/credentials` | Public redacted diagnostics; `?refresh=true` refreshes billing.                                                     |
| `PUT`  | `/admin/config`                  | Requires the current `BRIDGE_API_KEY`; a keyless runtime may bootstrap only over a loopback peer and loopback Host. |
| `POST` | `/admin/restart`                 | Uses the same authentication rule; the pre-restart key remains current until restart completes.                     |

### Model metadata and exact catalog

Each model object includes `id`, `object`, `created`, and provider-derived `owned_by`. Known context is repeated in `context_window`, `context_length`, and `max_context_length`. Exactly five models have no published context and therefore omit all three capacity fields. This is the exact 1.14.0 canonical catalog; “Default” is the built-in enabled state.

| Provider          | Canonical model ID                    |       Context | Default |
| ----------------- | ------------------------------------- | ------------: | :-----: |
| DeepSeek          | `deepseek/deepseek-v4-pro`            |     1,000,000 |   Yes   |
| DeepSeek          | `deepseek/deepseek-v4-flash`          |     1,000,000 |   Yes   |
| Moonshot          | `moonshotai/Kimi-K3`                  |     1,000,000 |   No    |
| Moonshot          | `moonshotai/Kimi-K2.7-Code`           |       256,000 |   No    |
| Moonshot          | `moonshotai/Kimi-K2.7-Code-Highspeed` |       262,000 |   No    |
| Moonshot          | `moonshotai/Kimi-K2.6`                |       256,000 |   Yes   |
| Moonshot          | `moonshotai/Kimi-K2.5`                |       256,000 |   No    |
| Z.ai              | `zai-org/GLM-5.2`                     |     1,000,000 |   No    |
| Z.ai              | `zai-org/GLM-5.2-Fast`                |     1,000,000 |   No    |
| Z.ai              | `zai-org/GLM-5.1`                     | Not published |   Yes   |
| Z.ai              | `zai-org/GLM-5`                       |       200,000 |   No    |
| MiniMax           | `MiniMaxAI/MiniMax-M3`                |     1,000,000 |   No    |
| MiniMax           | `MiniMaxAI/MiniMax-M2.7`              | Not published |   Yes   |
| MiniMax           | `MiniMaxAI/MiniMax-M2.5`              |       200,000 |   No    |
| Xiaomi            | `xiaomi/mimo-v2.5-pro`                |     1,000,000 |   No    |
| Xiaomi            | `xiaomi/mimo-v2.5`                    |     1,000,000 |   No    |
| Qwen              | `Qwen/Qwen3.8-Max`                    |     1,000,000 |   No    |
| Qwen              | `Qwen/Qwen3.7-Max`                    |     1,000,000 |   No    |
| Qwen              | `Qwen/Qwen3.7-Plus`                   |     1,000,000 |   No    |
| Qwen              | `Qwen/Qwen3.7-Flash`                  |     1,000,000 |   No    |
| Qwen              | `Qwen/Qwen3.6-Max-Preview`            | Not published |   No    |
| Qwen              | `Qwen/Qwen3.6-Plus`                   | Not published |   Yes   |
| StepFun           | `stepfun/Step-3.7-Flash`              |       256,000 |   No    |
| StepFun           | `stepfun/Step-3.5-Flash`              |     1,000,000 |   No    |
| Tencent           | `tencent/hy3-paid`                    |       262,000 |   No    |
| NVIDIA            | `nvidia/nemotron-3-ultra-550b-a55b`   |     1,000,000 |   No    |
| Thinking Machines | `thinkingmachines/inkling`            |       256,000 |   No    |
| Thinking Machines | `thinkingmachines/inkling-small`      |     1,000,000 |   No    |
| Poolside          | `poolside/laguna-s-2.1-free`          |       256,000 |   No    |
| Anthropic         | `claude-sonnet-5`                     |     1,000,000 |   No    |
| Anthropic         | `claude-sonnet-4-6`                   |     1,000,000 |   No    |
| Anthropic         | `claude-fable-5`                      |     1,000,000 |   No    |
| Anthropic         | `claude-opus-5`                       |     1,000,000 |   No    |
| Anthropic         | `claude-opus-4-8`                     |     1,000,000 |   No    |
| Anthropic         | `claude-opus-4-7`                     |     1,000,000 |   No    |
| Anthropic         | `claude-haiku-4-5-20251001`           |       200,000 |   No    |
| OpenAI            | `gpt-5.6-sol`                         |     1,050,000 |   No    |
| OpenAI            | `gpt-5.6-terra`                       |     1,050,000 |   No    |
| OpenAI            | `gpt-5.6-luna`                        |     1,050,000 |   No    |
| OpenAI            | `gpt-5.5`                             | Not published |   No    |
| OpenAI            | `gpt-5.4`                             |       400,000 |   No    |
| OpenAI            | `gpt-5.3-codex`                       |       400,000 |   No    |
| OpenAI            | `gpt-5.4-mini`                        |       400,000 |   No    |
| Google            | `google/gemini-3.6-flash`             |     1,000,000 |   No    |
| Google            | `google/gemini-3.5-flash`             |     1,000,000 |   No    |
| Google            | `google/gemini-3.5-flash-lite`        |     1,000,000 |   No    |
| Google            | `google/gemini-3.1-flash-lite`        |     1,000,000 |   No    |
| Sakana            | `sakana/fugu-ultra`                   |     1,000,000 |   No    |
| Meta              | `meta/muse-spark-1.1`                 |     1,050,000 |   No    |
| Meta              | `meta/muse-spark-1.2`                 |     1,050,000 |   No    |
| Meta              | `meta/muse-spark-1.2-contributor`     |     1,050,000 |   No    |
| xAI               | `xai/grok-4.5`                        |       500,000 |   No    |

### Dashboard and credential routing

Open `http://127.0.0.1:9992/dashboard`. The mobile-first UI stores its Korean/English/Chinese locale in `localStorage` with Korean fallback. It shows online/version state; edits bind, client key, routing and per-key concurrency; manages and refreshes redacted credentials; and folds the model catalog by provider with enabled/total counts. Secret fields left blank preserve existing keys. Save writes JSON and restart applies changes. Raw upstream keys are never returned.

`daily_burn_priority` is the default and weights required daily burn (`depletion_aware` is its legacy alias); `balance_priority` prefers usable balance; `round_robin` rotates smoothly by weight; `drain_first` drains the eligible key with the least remaining time, then moves to the next. Every policy first narrows to eligible credentials expiring within 1 day. Manual disablement, `allowedModels`, in-flight caps, exhausted/expired balance, auth failure, and 429/5xx/timeout cooldown can exclude a key. Each request stays on one key; failover occurs only before visible output.

### Configuration and operations

Upgrades from a persisted 1.3.1 dashboard catalog preserve each current model's enabled state and all custom models, while refreshing built-in metadata from the 1.14.0 canonical definitions. Six retired 1.3.1 IDs are removed rather than forwarded as unknown upstream models; a retired configured default falls back to `deepseek/deepseek-v4-pro`.

Existing browsers with a saved key continue without interruption. On a fresh browser, enter the current key in **Current Admin API Key** before saving or restarting. A runtime with no key can bootstrap only from a real loopback connection whose Host is also loopback.

Credential precedence is `COMMANDCODE_CREDENTIALS_FILE`, `COMMANDCODE_CREDENTIALS`/`COMMANDCODE_API_KEYS`, `COMMANDCODE_API_KEY`, then CLI auth files. Core defaults are `HOST=127.0.0.1`, `PORT=9992`, `COMMANDCODE_ROUTING_POLICY=daily_burn_priority`, `COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL=4`, `COMMANDCODE_CLI_VERSION=1.14.0`, `COMMANDCODE_TIMEOUT_MS=300000`, and `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=error_on_length`. `BRIDGE_API_KEY` protects `/v1/*` when set; clients may use Bearer or `x-api-key`. Protect credential JSON with `chmod 600`. Optional balance alerts are off. Optional `commandcode-router` is for least-in-flight routing across multiple bridge hosts.

## How it works

1. Authenticate and validate the OpenAI-shaped request.

2. Resolve model aliases against the enabled catalog.

3. Filter disabled, scoped, saturated, cooled-down, expired, and exhausted credentials.

4. Prioritize any eligible credential expiring within 1 day, then apply the configured policy.

5. Call CommandCode `POST /alpha/generate` directly with one bound credential.

6. Convert stream events into OpenAI JSON or SSE, including supported tools and optional usage.

7. Verify with tests, `npm run verify`, `/health`, model discovery, and `npm run smoke`.

## Repository layout

```text
src/                 bridge, catalog, routing, dashboard, and API implementation
tests/               deterministic contract and behavior tests
docs/                architecture, deployment, security, and documentation assets
release/             Compose and production deployment material
install.sh           Linux rootless user-systemd installer
```

Development verification is `npm run verify`; runtime verification is `npm run smoke`. `SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke` verifies explicit fail-closed routing when credit blocks generation, but is not a generation-readiness canary.

## Current limitations

- **Trusted network boundary.** Read-only dashboard endpoints reveal redacted operational metadata; keep them on localhost or a trusted VPN/tailnet and set `BRIDGE_API_KEY` outside localhost.

- **Alpha upstream dependency.** CommandCode `/alpha/generate` and billing paths may change; pin `COMMANDCODE_CLI_VERSION` and smoke-test upgrades.

- **No account-limit bypass.** Billing, credits, rate limits, and terms still apply; monitor diagnostics and eligible credentials.

- **No invented capacity.** Five model contexts are unknown; absent capacity fields mean unknown, not unlimited.

Do not commit `.env`, CLI auth files, credential JSON, keys, billing details, private topology, or dashboard exports. This is not a public proxy or internet control plane. See [the security guide](docs/SECURITY.md).

## License

CommandCode Bridge uses the [MIT License](LICENSE). CommandCode is separate software with its own terms; this repository does not include or repackage its proprietary CLI bundle.

<p align="center"><em>CommandCode Bridge · a trusted boundary for OpenAI-compatible CommandCode access.</em></p>
