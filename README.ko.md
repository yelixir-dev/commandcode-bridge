<p align="center">
<img src="docs/assets/banner.svg" alt="CommandCode Bridge — 신뢰 환경용 OpenAI-compatible CommandCode 게이트웨이" width="880">

</p>

<p align="center">
  <strong>신뢰 네트워크 안에서 CommandCode 모델, credential, routing을 OpenAI-compatible API로 사용합니다.</strong>
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-1.14.0-b57920?style=flat-square" alt="Version 1.14.0"></a>
  <a href="src/model-catalog.ts"><img src="https://img.shields.io/badge/models-52-1f6f78?style=flat-square" alt="52 models"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-20%2B-9f4d2e?style=flat-square" alt="Node.js 20+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-28231f?style=flat-square" alt="MIT License"></a>
</p>

<!-- README-I18N:START -->

[English](./README.md) | **한국어** | [中文](./README.zh.md)

<!-- README-I18N:END -->

CommandCode Bridge는 CommandCode 계정을 위한 신뢰 환경용 HTTP 게이트웨이입니다. 표준 OpenAI-compatible 모델·채팅 endpoint를 제공하고 eligible upstream credential 사이에서 요청을 라우팅하며, CommandCode/bridge **1.14.0**에 맞춘 정확한 **52-model** catalog를 게시합니다.

[기능](#기능) · [설치](#설치) · [사용법](#사용법) · [동작 방식](#동작-방식) · [저장소 구성](#저장소-구성) · [현재 제한](#현재-제한) · [라이선스](#라이선스)

## 기능

- **OpenAI-compatible API.** 요청마다 `cmd`를 실행하지 않고 model list·단건 조회와 streaming/non-streaming chat을 제공합니다.

- **CommandCode stream 변환.** visible text, usage, finish reason, emitted tool call을 OpenAI response shape으로 정규화합니다.

- **Multi-key routing.** `daily_burn_priority`, `balance_priority`, `round_robin`, `drain_first`와 key별 concurrency, cooldown, model scope, pre-output failover를 지원합니다.

- **보편적 만료 우선순위.** 모든 policy에서 알려진 만료까지 **1일 이하**인 eligible credential을 더 오래 남은 credential보다 먼저 선택합니다.

- **Context metadata.** catalog에 공개 context가 있으면 `context_window`, `context_length`, `max_context_length`를 제공합니다.

- **모바일 dashboard.** 한국어·영어·중국어로 bind, routing, credential, model toggle을 관리하고 model을 provider별로 접습니다.

- **Secret 경계.** key나 CommandCode CLI bundle을 배포하지 않고 private credential을 로드하며 diagnostics는 redacted 상태를 유지합니다.

## 설치

### Linux rootless installer

installer는 Linux user systemd용이며 CommandCode CLI 1.14.0 때문에 Node.js 22+를 요구합니다. 가능한 경우 CLI auth를 가져오고 private state는 `~/.config/commandcode-bridge`, 설치본은 `~/.local/share/commandcode-bridge`에 두며 안전한 기본값은 `127.0.0.1:9992`입니다. `0.0.0.0`은 `BRIDGE_API_KEY`를 켠 신뢰 LAN/VPN/tailnet/firewall/reverse proxy 뒤에서만 사용하십시오. 로그인 전 시작에는 `sudo loginctl enable-linger "$USER"`, 제거에는 `./uninstall.sh` 또는 `./uninstall.sh --purge-config`를 사용합니다.

```bash
./install.sh
./install.sh --yes --host 127.0.0.1 --port 9992
./install.sh --host 0.0.0.0 --port 9992
```

### 수동 source 실행

bridge runtime은 Node.js 20+를 지원하지만 현재 CommandCode CLI 설치·사용에는 Node.js 22+가 필요합니다. 공식 `command-code` npm package를 `cmd login`으로 인증하거나 동등한 credential을 제공하십시오. 공식 설치: <https://commandcode.ai/install>.

```bash
git clone <your-commandcode-bridge-repository-url> commandcode-bridge
cd commandcode-bridge
npm install --include=dev
cp .env.example .env
npm run build
npm start
```

### Docker

Docker와 Compose는 full source checkout이 필요하며 Dockerfile은 runtime image 전에 검증·빌드합니다. [배포 가이드](docs/DEPLOYMENT.md)와 [`release/docker-compose.yml`](release/docker-compose.yml)을 참고하십시오.

```bash
docker build -t commandcode-bridge .
docker run --rm -p 127.0.0.1:9992:9992 \
  -e HOST=0.0.0.0 \
  -e COMMANDCODE_API_KEY="$COMMANDCODE_API_KEY" \
  -e BRIDGE_API_KEY="$BRIDGE_API_KEY" \
  commandcode-bridge
```

## 사용법

### API 검증과 호출

```bash
export BRIDGE_API_KEY='<same value as the bridge runtime>'
curl -fsS http://127.0.0.1:9992/health | jq
curl -fsS http://127.0.0.1:9992/v1/models \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
curl -fsS http://127.0.0.1:9992/v1/models/deepseek%2Fdeepseek-v4-pro \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

`/health`는 public이며 secret-free입니다. `GET /v1/models`는 available model을 나열하고 `GET /v1/models/:model`은 단일 available model 또는 `404 model_not_found`를 반환합니다. slash가 있는 ID는 URL-encode해야 합니다. `POST /v1/chat/completions`는 OpenAI completion JSON을 반환하며 `stream: true`이면 SSE, `stream_options.include_usage`이면 마지막 usage chunk를 제공합니다. role은 `developer`, `system`, `user`, `assistant`, `tool`을 지원합니다. Tool schema와 emitted call을 지원하며 forced `tool_choice`는 생략, `"auto"`, `"none"`만 허용합니다.

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

### API 표면

| Method | Path                             | Behavior                                                                                          |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET`  | `/health`                        | Public secret-free health/runtime summary.                                                        |
| `GET`  | `/dashboard`                     | 신뢰 network용 public read-only shell.                                                            |
| `GET`  | `/v1/models`                     | `BRIDGE_API_KEY` 설정 시 인증; available model 목록.                                              |
| `GET`  | `/v1/models/:model`              | 설정 시 인증; 단일 available model 조회.                                                          |
| `POST` | `/v1/chat/completions`           | 설정 시 인증; streaming/non-streaming chat.                                                       |
| `GET`  | `/admin/config`                  | 신뢰 network의 public redacted dashboard state.                                                   |
| `GET`  | `/admin/commandcode/credentials` | Public redacted diagnostics; `?refresh=true`는 billing refresh.                                   |
| `PUT`  | `/admin/config`                  | 현재 `BRIDGE_API_KEY` 인증 필요. key 없는 runtime은 peer와 Host가 모두 loopback일 때만 bootstrap. |
| `POST` | `/admin/restart`                 | 동일한 인증 규칙 적용. restart가 끝날 때까지 기존 key가 current key.                              |

### Model metadata와 정확한 catalog

각 model object는 `id`, `object`, `created`, provider 기반 `owned_by`를 포함합니다. 알려진 context는 `context_window`, `context_length`, `max_context_length`에 동일하게 나옵니다. 정확히 5개 model은 공개 context가 없어 세 capacity field를 모두 생략합니다. 아래는 정확한 1.14.0 canonical catalog이며 “기본 활성화”는 built-in enabled state입니다.

| Provider          | Canonical model ID                    |       Context | 기본 활성화 |
| ----------------- | ------------------------------------- | ------------: | :---------: |
| DeepSeek          | `deepseek/deepseek-v4-pro`            |     1,000,000 |     예      |
| DeepSeek          | `deepseek/deepseek-v4-flash`          |     1,000,000 |     예      |
| Moonshot          | `moonshotai/Kimi-K3`                  |     1,000,000 |   아니요    |
| Moonshot          | `moonshotai/Kimi-K2.7-Code`           |       256,000 |   아니요    |
| Moonshot          | `moonshotai/Kimi-K2.7-Code-Highspeed` |       262,000 |   아니요    |
| Moonshot          | `moonshotai/Kimi-K2.6`                |       256,000 |     예      |
| Moonshot          | `moonshotai/Kimi-K2.5`                |       256,000 |   아니요    |
| Z.ai              | `zai-org/GLM-5.2`                     |     1,000,000 |   아니요    |
| Z.ai              | `zai-org/GLM-5.2-Fast`                |     1,000,000 |   아니요    |
| Z.ai              | `zai-org/GLM-5.1`                     | 공개되지 않음 |     예      |
| Z.ai              | `zai-org/GLM-5`                       |       200,000 |   아니요    |
| MiniMax           | `MiniMaxAI/MiniMax-M3`                |     1,000,000 |   아니요    |
| MiniMax           | `MiniMaxAI/MiniMax-M2.7`              | 공개되지 않음 |     예      |
| MiniMax           | `MiniMaxAI/MiniMax-M2.5`              |       200,000 |   아니요    |
| Xiaomi            | `xiaomi/mimo-v2.5-pro`                |     1,000,000 |   아니요    |
| Xiaomi            | `xiaomi/mimo-v2.5`                    |     1,000,000 |   아니요    |
| Qwen              | `Qwen/Qwen3.8-Max`                    |     1,000,000 |   아니요    |
| Qwen              | `Qwen/Qwen3.7-Max`                    |     1,000,000 |   아니요    |
| Qwen              | `Qwen/Qwen3.7-Plus`                   |     1,000,000 |   아니요    |
| Qwen              | `Qwen/Qwen3.7-Flash`                  |     1,000,000 |   아니요    |
| Qwen              | `Qwen/Qwen3.6-Max-Preview`            | 공개되지 않음 |   아니요    |
| Qwen              | `Qwen/Qwen3.6-Plus`                   | 공개되지 않음 |     예      |
| StepFun           | `stepfun/Step-3.7-Flash`              |       256,000 |   아니요    |
| StepFun           | `stepfun/Step-3.5-Flash`              |     1,000,000 |   아니요    |
| Tencent           | `tencent/hy3-paid`                    |       262,000 |   아니요    |
| NVIDIA            | `nvidia/nemotron-3-ultra-550b-a55b`   |     1,000,000 |   아니요    |
| Thinking Machines | `thinkingmachines/inkling`            |       256,000 |   아니요    |
| Thinking Machines | `thinkingmachines/inkling-small`      |     1,000,000 |   아니요    |
| Poolside          | `poolside/laguna-s-2.1-free`          |       256,000 |   아니요    |
| Anthropic         | `claude-sonnet-5`                     |     1,000,000 |   아니요    |
| Anthropic         | `claude-sonnet-4-6`                   |     1,000,000 |   아니요    |
| Anthropic         | `claude-fable-5`                      |     1,000,000 |   아니요    |
| Anthropic         | `claude-opus-5`                       |     1,000,000 |   아니요    |
| Anthropic         | `claude-opus-4-8`                     |     1,000,000 |   아니요    |
| Anthropic         | `claude-opus-4-7`                     |     1,000,000 |   아니요    |
| Anthropic         | `claude-haiku-4-5-20251001`           |       200,000 |   아니요    |
| OpenAI            | `gpt-5.6-sol`                         |     1,050,000 |   아니요    |
| OpenAI            | `gpt-5.6-terra`                       |     1,050,000 |   아니요    |
| OpenAI            | `gpt-5.6-luna`                        |     1,050,000 |   아니요    |
| OpenAI            | `gpt-5.5`                             | 공개되지 않음 |   아니요    |
| OpenAI            | `gpt-5.4`                             |       400,000 |   아니요    |
| OpenAI            | `gpt-5.3-codex`                       |       400,000 |   아니요    |
| OpenAI            | `gpt-5.4-mini`                        |       400,000 |   아니요    |
| Google            | `google/gemini-3.6-flash`             |     1,000,000 |   아니요    |
| Google            | `google/gemini-3.5-flash`             |     1,000,000 |   아니요    |
| Google            | `google/gemini-3.5-flash-lite`        |     1,000,000 |   아니요    |
| Google            | `google/gemini-3.1-flash-lite`        |     1,000,000 |   아니요    |
| Sakana            | `sakana/fugu-ultra`                   |     1,000,000 |   아니요    |
| Meta              | `meta/muse-spark-1.1`                 |     1,050,000 |   아니요    |
| Meta              | `meta/muse-spark-1.2`                 |     1,050,000 |   아니요    |
| Meta              | `meta/muse-spark-1.2-contributor`     |     1,050,000 |   아니요    |
| xAI               | `xai/grok-4.5`                        |       500,000 |   아니요    |

### Dashboard와 credential routing

`http://127.0.0.1:9992/dashboard`를 여십시오. 모바일 우선 UI는 한국어 fallback과 한국어/영어/중국어 locale을 `localStorage`에 저장합니다. online/version 상태를 보여주고 bind, client key, routing, key별 concurrency를 수정하며 redacted credential을 관리·refresh합니다. Model catalog는 provider별 fold와 enabled/total count로 표시됩니다. 빈 secret field는 기존 key를 보존합니다. Save는 JSON을 쓰고 restart가 적용합니다. Raw upstream key는 반환하지 않습니다.

`daily_burn_priority`는 required daily burn을 가중하는 기본값이며 `depletion_aware`는 legacy alias입니다. `balance_priority`는 usable balance, `round_robin`은 smooth weight rotation, `drain_first`는 남은 기한이 가장 적은 eligible key를 먼저 소진합니다. 모든 policy는 먼저 1일 안에 만료되는 eligible credential로 범위를 좁힙니다. Manual disable, `allowedModels`, in-flight cap, exhausted/expired balance, auth failure, 429/5xx/timeout cooldown은 key를 제외할 수 있습니다. 요청 하나는 key 하나에 고정되고 visible output 전까지만 failover합니다.

### 설정과 운영

저장된 1.3.1 dashboard catalog에서 업그레이드하면 현재 model의 enabled state와 모든 custom model은 보존하고, built-in metadata는 1.14.0 canonical 정의로 갱신합니다. 제거된 1.3.1 ID 6개는 unknown upstream model로 전달하지 않으며, 제거된 default가 설정돼 있으면 `deepseek/deepseek-v4-pro`로 안전하게 fallback합니다.

브라우저에 key가 저장된 기존 사용자는 그대로 동작합니다. 새 브라우저에서는 저장·재시작 전에 **현재 Admin API Key**에 기존 key를 한 번 입력합니다. key 없는 runtime은 실제 loopback 연결이며 Host도 loopback인 경우에만 bootstrap할 수 있습니다.

Credential 우선순위는 `COMMANDCODE_CREDENTIALS_FILE`, `COMMANDCODE_CREDENTIALS`/`COMMANDCODE_API_KEYS`, `COMMANDCODE_API_KEY`, CLI auth file 순입니다. 핵심 기본값은 `HOST=127.0.0.1`, `PORT=9992`, `COMMANDCODE_ROUTING_POLICY=daily_burn_priority`, `COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL=4`, `COMMANDCODE_CLI_VERSION=1.14.0`, `COMMANDCODE_TIMEOUT_MS=300000`, `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=error_on_length`입니다. `BRIDGE_API_KEY`는 설정 시 `/v1/*`를 보호하며 client는 Bearer 또는 `x-api-key`를 쓸 수 있습니다. Credential JSON은 `chmod 600`으로 보호하십시오. Balance alert는 기본 off입니다. 선택적 `commandcode-router`는 여러 bridge host의 least-in-flight routing용입니다.

## 동작 방식

1. OpenAI-shaped request를 인증하고 검증합니다.

2. Enabled catalog에서 model alias를 resolve합니다.

3. Disabled, scoped, saturated, cooldown, expired, exhausted credential을 거릅니다.

4. 1일 안에 만료되는 eligible credential을 우선한 뒤 configured policy를 적용합니다.

5. 한 credential에 고정해 CommandCode `POST /alpha/generate`를 직접 호출합니다.

6. Stream event를 supported tool과 optional usage를 포함한 OpenAI JSON/SSE로 변환합니다.

7. test, `npm run verify`, `/health`, model discovery, `npm run smoke`로 검증합니다.

## 저장소 구성

```text
src/                 bridge, catalog, routing, dashboard, and API implementation
tests/               deterministic contract and behavior tests
docs/                architecture, deployment, security, and documentation assets
release/             Compose and production deployment material
install.sh           Linux rootless user-systemd installer
```

개발 검증은 `npm run verify`, runtime 검증은 `npm run smoke`입니다. `SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke`는 credit이 generation을 막을 때 fail-closed routing을 검증하지만 generation-readiness canary는 아닙니다.

## 현재 제한

- **신뢰 network 경계.** Read-only dashboard endpoint도 redacted 운영 metadata를 보이므로 localhost 또는 trusted VPN/tailnet에 두고 localhost 밖에서는 `BRIDGE_API_KEY`를 설정하십시오.

- **Alpha upstream 의존성.** CommandCode `/alpha/generate`와 billing path는 바뀔 수 있으므로 `COMMANDCODE_CLI_VERSION`을 고정하고 upgrade를 smoke-test하십시오.

- **Account limit 우회 없음.** billing, credit, rate limit, terms가 그대로 적용되므로 diagnostics와 eligible credential을 관찰하십시오.

- **Capacity 발명 없음.** 5개 model context는 unknown이며 field 부재는 unlimited가 아니라 unknown입니다.

`.env`, CLI auth file, credential JSON, key, billing detail, private topology, dashboard export를 commit하지 마십시오. Public proxy나 internet control plane이 아닙니다. [보안 가이드](docs/SECURITY.md)를 참고하십시오.

## 라이선스

CommandCode Bridge는 [MIT License](LICENSE)를 사용합니다. CommandCode는 자체 terms가 있는 별도 software이며 이 repository는 proprietary CLI bundle을 포함하거나 재배포하지 않습니다.

<p align="center"><em>CommandCode Bridge · OpenAI-compatible CommandCode access를 위한 신뢰 경계.</em></p>
