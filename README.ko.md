<p align="right">
  🌐 <a href="README.md">English</a> · 한국어
</p>

# CommandCode Bridge

<p align="center">
  <img src="docs/assets/readme/commandcode-bridge-overview.png" alt="CommandCode Bridge 구조 개요" width="760">
</p>

<p align="center">
  <strong>신뢰 환경에서 CommandCode를 OpenAI-compatible API로 쓰기 위한 게이트웨이.</strong>
</p>

<p align="center">
  <a href=".github/workflows/ci.yml"><img src="https://img.shields.io/badge/CI-GitHub%20Actions-5865f2?style=flat-square" alt="CI workflow"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2ea44f?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-20%2B-5fa04e?style=flat-square" alt="Node.js 20+">
  <img src="https://img.shields.io/badge/API-OpenAI--compatible-6b7280?style=flat-square" alt="OpenAI-compatible API">
</p>

CommandCode Bridge는 CommandCode 계정을 OpenAI-compatible HTTP API로 노출하는 신뢰 환경용 브리지입니다. 로컬, LAN, VPN, tailnet 클라이언트가 표준 `/v1/models`, `/v1/chat/completions` 형식으로 CommandCode-backed 모델을 호출할 수 있게 해줍니다.

> **CommandCode가 필요합니다.** 이 프로젝트는 공개 독립형 DeepSeek 프록시가 아니며, CommandCode CLI 번들을 포함하거나 재배포하지 않습니다. 공식 CommandCode CLI/account 환경(`command-code` npm package의 `cmd`) 또는 동등한 CommandCode API credential이 필요합니다. 공식 설치/인증은 <https://commandcode.ai/install>에서 진행하십시오.

> **상태.** 내부/신뢰 환경용 브리지입니다. upstream CommandCode `/alpha/generate` 경로는 alpha/internal API 성격이므로 변경될 수 있습니다.

## 한눈에 보기

| 영역      | 요약                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------- |
| API 표면  | `/health`, `/dashboard`, `/v1/models`, `/v1/chat/completions`, redacted admin diagnostics.            |
| 핵심 가치 | OpenAI-compatible client가 요청마다 `cmd`를 실행하지 않고 CommandCode-backed model을 호출합니다.      |
| 라우팅    | daily-burn, balance-priority, round-robin, drain-first 정책 기반 multi-key credential 선택.           |
| 운영      | bind, routing, credential, model toggle, diagnostics, save, restart를 다루는 모바일 우선 dashboard.   |
| 안전 경계 | upstream secret은 번들하지 않으며 localhost 또는 신뢰하는 VPN/tailnet/private proxy에서만 노출합니다. |

설치 후 one-shot smoke test:

```bash
BRIDGE=http://127.0.0.1:9992; \
curl -fsS "$BRIDGE/health" && echo && \
curl -fsS "$BRIDGE/v1/models" | head -c 400
```

정상 상태에서는 JSON health/version 정보와 비어 있지 않은 OpenAI-compatible model list가 반환됩니다. 실제 chat completion은 CommandCode 계정에 사용 가능한 credit이 있는지 확인한 뒤 실행하세요.

## 이 브리지가 하는 일

- OpenAI-compatible 엔드포인트 제공:
  - `GET /health`
  - `GET /dashboard`
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - redacted read-only 대시보드 상태용 `GET /admin/config`, `GET /admin/commandcode/credentials`
  - 인증된 대시보드 저장/재시작용 `PUT /admin/config`, `POST /admin/restart`
- CommandCode streaming event를 OpenAI chat completion 응답 또는 SSE chunk로 변환합니다.
- non-streaming/streaming OpenAI 클라이언트를 모두 지원합니다. `stream_options.include_usage`도 지원합니다.
- CommandCode가 emit한 tool call을 OpenAI `tool_calls`로 다시 매핑합니다.
- `developer`, `system`, `user`, `assistant`, `tool` 메시지를 지원합니다.
- reasoning delta는 기본적으로 숨깁니다(`INCLUDE_REASONING=false`).
- visible output 없이 `finish_reason: length`로 끝난 응답은 기본적으로 빈 성공이 아니라 fail-closed 오류로 반환합니다.
- CommandCode upstream credential을 CLI auth file, 단일 API key, multi-key env, JSON credentials file에서 로드합니다.
- 여러 CommandCode key를 안전하게 돌려 쓰는 multi-key credential router를 포함합니다.
- 서버 bind, routing policy, key 관리, model toggle, diagnostics, JSON 저장, restart를 관리하는 모바일 우선 `/dashboard`를 포함합니다.
- 선택적 balance alert와, 여러 bridge host를 묶는 선택적 `commandcode-router` 프로세스를 포함합니다.

## 버전

현재 bridge version: **v0.26.8**.

버전은 `/health` 응답과 웹 대시보드 오른쪽 위에 표시됩니다.

### v0.26.8 CommandCode 호환성 업데이트

이번 bridge release는 공식 `command-code` npm package `0.26.8`에 맞췄습니다.

- 기본 upstream `x-command-code-version` header는 `COMMANDCODE_CLI_VERSION`으로 덮어쓰지 않는 한 `0.26.8`을 보냅니다.
- bridge package/runtime version도 `0.26.8`이라 `/health`, dashboard, npm metadata가 대상 CommandCode CLI version과 일치합니다.
- `command-code@0.26.8` bundle을 직접 확인한 결과 bridge 핵심 API path(`/alpha/generate`, `/alpha/whoami`, `/alpha/billing/credits`, `/alpha/billing/subscriptions`, `/alpha/usage/summary`)는 기존 bridge 경로와 호환됩니다.
- model catalog를 `0.26.8` CLI bundle 기준으로 갱신했습니다. 기존 enabled default는 보수적으로 유지하고, Qwen 3.6 Max Preview, MiniMax M2.5, Kimi K2.5, Step 3.5 Flash, Gemini 3.1 Flash Lite, GLM-5, GPT 5.4/5.3 Codex/5.4 Mini, 구 Claude variant 등 추가 발견 모델은 operator가 켤 때까지 disabled 상태로 포함했습니다.

## 구조

```text
OpenAI-compatible client
  -> CommandCode Bridge :9992
  -> POST https://api.commandcode.ai/alpha/generate
  -> CommandCode stream events
  -> OpenAI chat.completion 또는 chat.completion.chunk
```

브리지는 요청마다 `cmd`를 실행하지 않습니다. CommandCode CLI가 사용하는 upstream API 경로를 직접 호출하고 응답 형식만 OpenAI-compatible 형태로 정규화합니다. 그래서 CLI stdout 파싱을 피하고 지연시간을 줄이며, CLI-side local tools/memory로 인한 토큰 낭비를 막습니다.

하나의 chat-completion 요청은 시작부터 끝까지 하나의 upstream credential에 고정됩니다. 병렬성은 독립 요청을 여러 eligible key, 필요 시 여러 bridge host로 분산해서 확보합니다.

## 요구 사항

- Node.js **20+**
- npm **10+**
- 수동/source 실행은 Linux, macOS, WSL 지원
- 번들 `install.sh` 사용 시 Linux user systemd 필요
- 공식 CommandCode CLI(`cmd`, npm package `command-code`) 또는 동등한 CommandCode upstream API key
- 실제 generation에는 usable balance/credit이 있는 CommandCode 계정 필요

### CommandCode 사전 상태별 동작

설치/수동 설정은 다음 세 상태를 기준으로 설계되어 있습니다.

1. **CommandCode CLI가 이미 설치·인증되어 있음**
   - 브리지가 기존 `~/.commandcode/auth.json` credential을 첫 upstream key로 가져올 수 있습니다.
2. **CommandCode CLI는 설치되어 있지만 인증되지 않음**
   - `cmd login`을 실행한 뒤 브리지를 재시작하십시오.
3. **CommandCode CLI가 없음**
   - 먼저 설치·인증하십시오.
     ```bash
     npm install -g command-code
     cmd login
     ```
   - Linux installer는 CLI가 없을 때 `npm install -g command-code`를 실행할지 물어볼 수 있습니다.

## 설치 방법

### Option A — Linux rootless installer

source checkout 또는 package root에서 실행합니다.

```bash
./install.sh
```

installer가 하는 일:

- Node.js, npm, user systemd, CommandCode CLI 확인;
- CLI가 없으면 npm으로 `command-code` 설치를 제안;
- 기존 CommandCode CLI auth key가 있으면 가져오기;
- 입력하지 않으면 client-facing `BRIDGE_API_KEY` 생성;
- 브리지를 `~/.local/share/commandcode-bridge`에 설치;
- private runtime env를 `~/.config/commandcode-bridge/env`에 작성;
- `commandcode-bridge` user systemd service 생성;
- `--no-start`가 없으면 service 시작.

예시:

```bash
# 대화형, 안전한 local-only 기본값: 127.0.0.1:9992
./install.sh

# 비대화형 local 설치
./install.sh --yes --host 127.0.0.1 --port 9992

# Tailnet/LAN 노출; BRIDGE_API_KEY 유지 필수
./install.sh --host 0.0.0.0 --port 9992
```

유용한 service 명령:

```bash
systemctl --user status commandcode-bridge --no-pager
systemctl --user restart commandcode-bridge
journalctl --user -u commandcode-bridge -f
curl -fsS http://127.0.0.1:9992/health | jq
```

Linux host에서 로그인 전에도 service가 떠야 하면:

```bash
sudo loginctl enable-linger "$USER"
```

private config는 보존하고 제거:

```bash
./uninstall.sh
```

service, 설치 파일, private config까지 제거:

```bash
./uninstall.sh --purge-config
```

### Option B — source 수동 실행

```bash
git clone <your-commandcode-bridge-repository-url> commandcode-bridge
cd commandcode-bridge
npm install --include=dev
cp .env.example .env
```

`.env`를 편집하거나 환경 변수를 export합니다. CommandCode CLI auth file을 쓰는 최소 local-only 설정:

```env
HOST=127.0.0.1
PORT=9992
BRIDGE_API_KEY=replace-with-a-long-random-client-key
COMMANDCODE_ROUTING_POLICY=daily_burn_priority
COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=error_on_length
```

upstream key를 명시하려면:

```env
COMMANDCODE_API_KEY=your_commandcode_api_key
```

빌드 및 실행:

```bash
npm run build
npm start
```

### Option C — Docker / Compose

Docker는 full source checkout이 있는 배포에서 지원됩니다. Dockerfile은 runtime image를 만들기 전에 검증/빌드 파이프라인을 실행합니다.

```bash
docker build -t commandcode-bridge .
docker run --rm -p 127.0.0.1:9992:9992 \
  -e HOST=0.0.0.0 \
  -e COMMANDCODE_API_KEY="$COMMANDCODE_API_KEY" \
  -e BRIDGE_API_KEY="$BRIDGE_API_KEY" \
  commandcode-bridge
```

또는:

```bash
cd release
docker compose up -d --build
```

운영 세부 사항은 `docs/DEPLOYMENT.ko.md`와 `release/docker-compose.yml`을 참고하십시오.

## 첫 검증

Health check:

```bash
curl -fsS http://127.0.0.1:9992/health | jq
```

`BRIDGE_API_KEY`가 설정되어 있다면 인증된 model list:

```bash
export BRIDGE_API_KEY='<bridge env와 같은 값>'
curl -fsS http://127.0.0.1:9992/v1/models \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

Non-streaming chat completion:

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

Streaming:

```bash
curl -N http://127.0.0.1:9992/v1/chat/completions \
  -H "Authorization: Bearer $BRIDGE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek/deepseek-v4-pro",
    "stream": true,
    "messages": [{"role": "user", "content": "Count to three."}],
    "stream_options": {"include_usage": true}
  }'
```

프로젝트 smoke script:

```bash
npm run smoke
```

smoke script는 `.env`를 읽은 뒤 installed-service env file(`~/.config/commandcode-bridge/env`, Yorha macOS bridge host에서는 `/Users/yorha/.config/commandcode-bridge/env`)을 읽고, 마지막으로 shell에서 직접 지정한 값을 우선합니다. 다른 설치본을 검증할 때는 `BRIDGE_ENV_FILE=/path/to/env`를 지정하십시오. `BRIDGE_BASE_URL`, `BRIDGE_API_KEY` 같은 shell 값이 항상 파일 값보다 우선합니다.

계정은 도달 가능하지만 balance/credit 때문에 일시적으로 generation이 막힌 경우 routing-only fail-closed smoke mode를 사용할 수 있습니다.

```bash
SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

이 모드는 브리지가 빈 성공을 반환하지 않고 명시적 upstream/fail-closed 오류를 보여주는지만 확인합니다. 실제 generation readiness canary는 아닙니다.

## 웹 대시보드

열기:

```text
http://127.0.0.1:9992/dashboard
```

브리지를 Tailscale/VPN/LAN 뒤에서 `0.0.0.0`으로 bind했다면:

```text
http://<host-or-tailnet-ip>:9992/dashboard
```

대시보드는 의도적으로 모바일 우선입니다. 같은 trusted tailnet의 휴대폰에서도 운영하기 좋게 설계되어 있습니다.

### 대시보드 섹션

- **Header**
  - bridge online/offline 상태 표시.
  - `v0.26.8` 같은 bridge version 표시.
- **Server Bind**
  - local-only면 `127.0.0.1`.
  - LAN/Tailscale/VPN/reverse proxy 뒤에서만 `0.0.0.0`.
  - port 수정.
  - 인증 write용 Admin API Key를 브라우저 local storage에 저장/복사.
- **Routing Policy**
  - eligible upstream key 선택 정책 변경.
  - key당 동시 요청 수 수정. 운영 기본값은 **key당 in-flight 4회**입니다.
- **Credentials**
  - upstream CommandCode key 추가, 이름 변경, enable/disable, 삭제, refresh.
  - key 이름을 바꾸거나 secret field를 비워도 기존 secret을 보존합니다.
  - billing/diagnostics는 redacted operator summary로 표시합니다.
- **Models**
  - configured model catalog를 on/off.
  - 변경 후 restart 필요.
- **Footer**
  - `Save JSON`은 대시보드 JSON config를 저장합니다.
  - `Restart Bridge`는 지원되는 LaunchAgent/system service 경로로 브리지를 재시작합니다.

### 대시보드 인증 모델

- `GET /dashboard`, `GET /admin/config`, redacted `GET /admin/commandcode/credentials`는 trusted network에서 휴대폰 브라우저가 상태와 저장된 redacted config를 바로 볼 수 있도록 `BRIDGE_API_KEY` 없이도 읽을 수 있습니다.
- 단, public read-only 대시보드 endpoint도 metadata-bearing입니다. service version, bind/port, configured model ID, credential ID/preview, 개수, redacted balance summary가 보일 수 있으므로 localhost 또는 신뢰하는 VPN/tailnet 안에서만 노출하십시오.
- write/restart는 `BRIDGE_API_KEY`가 필요합니다.
  - `PUT /admin/config`
  - `POST /admin/restart`
  - `BRIDGE_API_KEY`가 설정된 경우 모든 `/v1/*` inference call
- 대시보드는 raw CommandCode upstream key를 반환하지 않습니다.
- 대시보드는 public internet control plane으로 설계되지 않았습니다. Cookie session이 아니라 trusted network boundary와 bearer-token-protected write를 전제로 합니다.

### 저장/재시작 흐름

1. bind host, port, routing policy, credentials, models를 변경합니다.
2. **Save JSON**을 누릅니다.
3. **Restart Bridge**를 누릅니다.
4. `/health`, `/v1/models`로 확인합니다.

client-facing bridge key를 회전했다면 그 key를 쓰는 모든 client를 갱신해야 합니다. Hermes의 경우 bridge의 `BRIDGE_API_KEY`와 Hermes 쪽 `COMMANDCODE_BRIDGE_API_KEY`를 함께 맞추고, bridge/Hermes gateway 또는 해당 session을 재시작하십시오.

## Upstream CommandCode 인증

브리지는 다음 순서로 upstream CommandCode credential을 로드합니다.

1. `COMMANDCODE_CREDENTIALS_FILE`
2. `COMMANDCODE_CREDENTIALS` 또는 `COMMANDCODE_API_KEYS`
3. legacy single-key `COMMANDCODE_API_KEY`
4. `~/.commandcode/auth.json`
5. `~/.config/commandcode/auth.json`

credential이 여러 개여도 `/health`는 개수와 routing policy만 반환합니다. Raw key는 포함하지 않습니다.

### Single-key env

```env
COMMANDCODE_API_KEY=your_commandcode_api_key
```

### 간단한 multi-key env

```env
COMMANDCODE_API_KEYS=primary=cmd_key_one,secondary=cmd_key_two
COMMANDCODE_ROUTING_POLICY=daily_burn_priority
```

### JSON credentials file

대시보드로 관리하거나 key가 여러 개인 경우 권장합니다.

```env
COMMANDCODE_CREDENTIALS_FILE=/home/you/.config/commandcode-bridge/credentials.json
```

예시 `credentials.json`:

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 9992
  },
  "routing": {
    "policy": "daily_burn_priority",
    "fallbackPolicy": "round_robin",
    "maxInFlightPerCredential": 4,
    "maxTotalInFlight": null,
    "maxTotalInFlightMultiplier": 3
  },
  "models": [
    { "id": "deepseek/deepseek-v4-pro", "enabled": true },
    { "id": "deepseek/deepseek-v4-flash", "enabled": true },
    { "id": "MiniMaxAI/MiniMax-M2.7", "enabled": true },
    { "id": "Qwen/Qwen3.6-Plus", "enabled": true },
    { "id": "zai-org/GLM-5.1", "enabled": true },
    { "id": "moonshotai/Kimi-K2.6", "enabled": true },
    { "id": "openai/gpt-5.5", "enabled": false },
    { "id": "anthropic/claude-opus-4.7", "enabled": false },
    { "id": "anthropic/claude-sonnet-4.6", "enabled": false }
  ],
  "credentials": [
    { "id": "primary", "apiKey": "cmd_key_one", "weight": 1, "enabled": true },
    {
      "id": "flash-only",
      "apiKey": "cmd_key_two",
      "weight": 1,
      "enabled": true,
      "allowedModels": ["deepseek/deepseek-v4-flash"]
    }
  ]
}
```

파일 권한 보호:

```bash
chmod 600 ~/.config/commandcode-bridge/credentials.json
```

## Multi-key routing — 핵심 장점

CommandCode Bridge는 여러 upstream CommandCode key를 등록하고 요청마다 적절한 key를 선택할 수 있습니다. 이것이 이 브리지의 핵심 운영 기능입니다. 트래픽을 분산하고, 한 key만 두드리는 일을 피하며, 건강하지 않거나 만료된 credential을 자동으로 제외할 수 있습니다.

### Routing policies

| Policy                | 목적                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `daily_burn_priority` | 기본값. 현재 billing/credit 기간이 끝나기 전에 더 많이 써야 하는 key를 우선합니다. Legacy `depletion_aware`는 이 정책으로 정규화됩니다. |
| `balance_priority`    | usable balance가 큰 key를 우선합니다.                                                                                                   |
| `round_robin`         | eligible key를 weight와 availability에 따라 순환합니다.                                                                                 |
| `drain_first`         | 앞 key부터 blocked/exhausted될 때까지 쓰고 다음 key로 이동합니다.                                                                       |

### Eligibility와 failover

Credential은 다음 경우 선택에서 제외될 수 있습니다.

- dashboard/JSON에서 수동 disabled;
- 요청 model이 `allowedModels` 범위 밖;
- key당 in-flight limit 도달;
- 429/5xx/timeout 이후 cooldown 중;
- usable billing balance가 없거나 current period가 만료됨.

Visible output이 나오기 전에 upstream error가 오고 다른 eligible credential이 있으면 bridge는 retry/failover할 수 있습니다. 이미 visible output이 시작된 뒤에는 중복 partial output을 피하기 위해 retry하지 않고 error를 표면화합니다.

### Concurrency

운영 기본값:

```env
COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL=4
```

DeepSeek V4 Flash load test에서는 더 높은 병렬성도 안정적이었지만, 일반 운영 권장값은 **key당 in-flight 4회**입니다. 증설은 diagnostics와 upstream behavior를 관찰한 뒤 진행하십시오.

### Multi-key rotation 증명

1. 서로 다른 ID의 credential을 최소 2개 설정합니다.
2. bridge를 재시작합니다.
3. diagnostics refresh:

   ```bash
   curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true' \
     -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
   ```

4. low-token 요청을 여러 개 동시에 보냅니다.
5. diagnostics를 다시 보고 여러 credential에서 selection/in-flight movement가 보이는지 확인합니다.
6. 모든 응답이 성공 generation이거나 명시적 upstream/fail-closed 오류인지 확인합니다.

## Client authentication

`BRIDGE_API_KEY`를 설정하면 client 인증이 필요합니다.

```env
BRIDGE_API_KEY=replace-with-a-long-random-client-key
```

Client는 둘 중 하나를 보낼 수 있습니다.

```text
Authorization: Bearer <BRIDGE_API_KEY>
```

또는:

```text
x-api-key: <BRIDGE_API_KEY>
```

`/health`는 의도적으로 인증 없이 열려 있으며 secret-free입니다. Admin writes와 `/v1/*` 요청은 key가 설정된 경우 인증이 필요합니다.

## 설정 reference

| 변수                                         | 기본값                       | 설명                                                                                                       |
| -------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `HOST`                                       | `127.0.0.1`                  | bind 주소. VPN, tailnet, reverse proxy 뒤가 아니면 localhost 권장.                                         |
| `PORT`                                       | `9992`                       | HTTP port.                                                                                                 |
| `BRIDGE_API_KEY`                             | 미설정                       | client-facing API key. 강력 권장; admin write에는 필요.                                                    |
| `COMMANDCODE_API_KEY`                        | 미설정                       | legacy single upstream CommandCode key.                                                                    |
| `COMMANDCODE_API_KEYS`                       | 미설정                       | `primary=...,secondary=...` 형태의 comma-separated multi-key 목록.                                         |
| `COMMANDCODE_CREDENTIALS`                    | 미설정                       | JSON credentials 배열/객체 또는 comma-separated multi-key 목록.                                            |
| `COMMANDCODE_CREDENTIALS_FILE`               | 미설정                       | JSON dashboard/credential file. upstream credential 최우선순위.                                            |
| `COMMANDCODE_ROUTING_POLICY`                 | `daily_burn_priority`        | `daily_burn_priority`, `balance_priority`, `round_robin`, `drain_first`. `depletion_aware`는 legacy alias. |
| `COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL`   | `4`                          | key당 동시 요청 상한.                                                                                      |
| `COMMANDCODE_MAX_TOTAL_IN_FLIGHT`            | 미설정                       | 선택적 전체 in-flight 고정 상한.                                                                           |
| `COMMANDCODE_MAX_TOTAL_IN_FLIGHT_MULTIPLIER` | `3`                          | explicit total cap이 없을 때 쓰는 legacy/default multiplier.                                               |
| `COMMANDCODE_BILLING_REFRESH_MS`             | `300000`                     | routing diagnostics용 billing/usage cache TTL.                                                             |
| `COMMANDCODE_BILLING_TIMEOUT_MS`             | `10000`                      | billing probe timeout.                                                                                     |
| `COMMANDCODE_CREDENTIAL_COOLDOWN_MS`         | `60000`                      | upstream failure 이후 cooldown.                                                                            |
| `COMMANDCODE_API_BASE`                       | `https://api.commandcode.ai` | upstream API base. 알려진 대체 upstream 테스트 외에는 바꾸지 마십시오.                                     |
| `COMMANDCODE_DEFAULT_MODEL`                  | `deepseek/deepseek-v4-pro`   | `default`가 사용할 model.                                                                                  |
| `COMMANDCODE_ALLOWED_MODELS`                 | Pro + Flash/catalog defaults | comma-separated allowlist.                                                                                 |
| `COMMANDCODE_ALLOW_UNKNOWN_MODELS`           | `false`                      | 임의 model ID를 upstream으로 통과. 운영 비권장.                                                            |
| `COMMANDCODE_CLI_VERSION`                    | `0.26.8`                     | upstream으로 보내는 version header.                                                                        |
| `COMMANDCODE_TIMEOUT_MS`                     | `300000`                     | upstream request timeout.                                                                                  |
| `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY`  | `error_on_length`            | empty visible `finish_reason: length`를 fail-closed. `allow`는 legacy blank success 유지.                  |
| `REQUEST_BODY_LIMIT_BYTES`                   | `1048576`                    | Fastify body limit.                                                                                        |
| `RATE_LIMIT_MAX`                             | `60`                         | rate-limit window당 요청 수.                                                                               |
| `RATE_LIMIT_WINDOW`                          | `1 minute`                   | rate-limit window 문자열.                                                                                  |
| `LOG_LEVEL`                                  | `info`                       | Fastify/Pino log level.                                                                                    |
| `CORS_ORIGIN`                                | 미설정                       | 선택적 CORS origin.                                                                                        |
| `INCLUDE_REASONING`                          | `false`                      | reasoning delta를 visible output에 붙임. 일반 client는 false 권장.                                         |
| `COMMANDCODE_BALANCE_ALERT_ENABLED`          | `false`                      | periodic balance alert 활성화. 기본 off.                                                                   |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL`      | 미설정                       | alert용 선택적 JSON webhook.                                                                               |

## OpenAI 호환성 메모

지원 요청 필드:

- `model`
- `messages`
- `stream`
- `max_tokens`
- `temperature`
- `top_p`
- `stop`
- function schema 기반 `tools`
- `tool_choice`는 미지정, `"auto"`, `"none"`만 지원
- `response_format` (`json_object` / `json_schema` 요청에는 JSON-only prompt reinforcement 적용)
- `stream_options.include_usage`
- `user`

특정 tool 강제 선택은 `unsupported_tool_choice`를 반환합니다. CommandCode `/alpha/generate`가 안정적인 forced-tool selector를 제공하지 않기 때문입니다.

## 선택적 commandcode-router

`commandcode-router`는 multi-host 배포용 별도 프로세스입니다. 하나의 `/v1` endpoint를 유지하면서 독립 요청을 in-flight가 가장 적은 healthy bridge backend로 라우팅합니다.

```env
COMMANDCODE_ROUTER_BACKENDS=local=http://127.0.0.1:19992,pc2=http://<tailnet-ip>:9992
COMMANDCODE_ROUTER_BACKEND_MAX_INFLIGHT=1
COMMANDCODE_ROUTER_BACKEND_TIMEOUT_MS=300000
COMMANDCODE_ROUTER_HEALTH_TIMEOUT_MS=3000
COMMANDCODE_ROUTER_COOLDOWN_MS=60000
```

bridge host가 여러 대일 때만 사용하십시오. 대부분의 경우 단일 bridge process 안의 built-in multi-key credential router로 충분합니다.

## 개발

```bash
npm install --include=dev
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run verify
```

`npm run verify`는 typecheck, lint, format check, test, build를 모두 실행합니다.

## 보안과 non-goals

- TLS, 인증, trusted network boundary 없이 public internet에 노출하지 마십시오.
- `HOST=0.0.0.0`은 머신의 모든 interface에 listen한다는 뜻입니다. Tailscale/WireGuard/VPN/firewall/reverse proxy 뒤에서만 사용하십시오. 그 자체가 보안 장치는 아닙니다.
- `127.0.0.1`, Tailscale, WireGuard, VPN, private reverse proxy를 권장합니다.
- non-localhost 배포에서는 항상 `BRIDGE_API_KEY`를 설정하십시오.
- Read-only dashboard endpoint도 redacted metadata를 노출할 수 있다고 취급하십시오.
- `.env`, `~/.commandcode/auth.json`, `credentials.json`, upstream API key, bridge key, billing detail, router backend topology, dashboard-exported secret을 commit하지 마십시오.
- CommandCode credential은 개인 upstream credential로 취급하십시오.
- 이 저장소는 CommandCode의 proprietary/UNLICENSED CLI bundle source를 포함하지 않습니다.
- 이 브리지는 CommandCode account limits, billing, rate limits, terms를 우회하지 않습니다.
- 이 브리지는 일반 public proxy service가 아닙니다.

자세한 내용은 `docs/SECURITY.md`를 참고하십시오. 비공개 보안 제보는 GitHub Security Advisory form(`https://github.com/yelixir-dev/commandcode-bridge/security/advisories/new`)을 사용하거나 `yelixir.dev@gmail.com`으로 연락하세요.

## 문제 해결

### `/health`는 되는데 `/v1/models` 또는 chat이 401

`/health`는 public입니다. `BRIDGE_API_KEY`가 설정되어 있으면 `/v1/*`는 인증이 필요합니다.

```bash
export BRIDGE_API_KEY='<bridge env와 같은 값>'
curl -fsS http://127.0.0.1:9992/v1/models \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

### bridge key 회전 뒤 Hermes compression 또는 client가 갑자기 401

bridge의 client-facing key는 바뀌었지만 client가 예전 key를 들고 있는 상태입니다. Hermes에서는 다음 둘을 함께 맞추십시오.

- bridge runtime env: `BRIDGE_API_KEY`
- Hermes env/client setting: `COMMANDCODE_BRIDGE_API_KEY`

둘 다 갱신한 뒤 bridge/Hermes gateway 또는 해당 session을 재시작하십시오.

### CommandCode CLI는 설치됐는데 upstream key가 없다고 generation 실패

실행:

```bash
cmd login
```

그 뒤 bridge를 재시작하십시오. 또는 `COMMANDCODE_API_KEY`, `COMMANDCODE_API_KEYS`, `COMMANDCODE_CREDENTIALS_FILE`을 명시적으로 제공하십시오.

### 계정은 도달하지만 balance/credit 때문에 generation 실패

Diagnostics 확인:

```bash
curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true' \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

브리지 동작 테스트만 할 때:

```bash
SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

진짜 generation readiness는 이 flag 없이 normal smoke가 통과해야 합니다.

### 대시보드에서 저장했는데 적용되지 않음

대부분의 대시보드 변경은 JSON을 저장하고 restart가 필요합니다. **Restart Bridge**를 누르거나 service를 수동 재시작하십시오.

### 9992 포트가 이미 사용 중

```bash
lsof -nP -iTCP:9992 -sTCP:LISTEN
# Linux
ss -ltnp '( sport = :9992 )'
```

충돌 process를 멈추거나 `PORT`를 바꾸십시오.

## Contributing

브리지의 신뢰 경계를 유지하는 변경은 환영합니다. Upstream secret을 번들하지 않고, public internet 기본 노출을 만들지 않으며, CommandCode CLI를 재배포하지 않는 방향이어야 합니다. 변경 전 다음을 실행하십시오.

```bash
npm run verify
```

보안에 민감한 변경은 먼저 `docs/SECURITY.md`를 읽고, issue/log/screenshot/fixture에 credential, local env file, private topology, billing detail이 들어가지 않게 하십시오.

## 문서 지도

- `README.md` — 영어 README.
- `docs/DEPLOYMENT.md` — 배포와 운영 가이드.
- `docs/DEPLOYMENT.ko.md` — 한국어 배포와 운영 가이드.
- `docs/ARCHITECTURE.md` — 구조와 data flow.
- `docs/KNOW_HOW.md` — CommandCode API notes와 운영 노하우.
- `docs/SECURITY.md` — 보안 모델과 배포 가드레일.
- `docs/PRD.md` — product requirements.
- `docs/IMPLEMENTATION_PLAN.md` — implementation plan.
- `docs/PROCESS_LOG.md` — work log.

## License

MIT. CommandCode 자체는 별도 software이며 다른 terms를 가질 수 있습니다.
