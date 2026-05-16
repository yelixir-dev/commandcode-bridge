# CommandCode Bridge

> **CommandCode CLI 환경 전제:** 이 브리지는 공식 CommandCode CLI(`cmd`, npm package `command-code`)를 사용할 수 있도록 준비된 머신/계정에서 쓰는 내부용 브리지입니다. CLI 다운로드/설치는 [commandcode.ai/install](https://commandcode.ai/install) (공식 사이트: [commandcode.ai](https://commandcode.ai/))에서 진행한 뒤, CLI 인증을 완료하거나 동등한 `COMMANDCODE_*` credential을 제공하십시오. 즉, 공개 독립형 DeepSeek 프록시가 아니라 CommandCode 계정/upstream API를 이용하는 브리지입니다.

CommandCode의 DeepSeek V4 Pro 백엔드를 OpenAI-compatible HTTP API로 노출하는 브리지입니다.

이 프로젝트는 신뢰 가능한 로컬/테일넷 클라이언트가 표준 `/v1/chat/completions` 형식으로 CommandCode-backed DeepSeek 모델을 사용할 수 있도록, CommandCode upstream `/alpha/generate` 엔드포인트를 최소한의 OpenAI Chat Completions API로 변환합니다.

> **상태:** 내부 사용용 브리지입니다. CommandCode `/alpha/generate`는 공식 안정 API가 아니라 alpha 성격의 엔드포인트이므로 변경될 수 있습니다.

## 기능

- OpenAI-compatible 엔드포인트:
  - `GET /health`
  - `GET /admin/commandcode/credentials` (인증된 admin metrics; `BRIDGE_API_KEY` 필요)
  - `GET /v1/models`
  - `POST /v1/chat/completions`
- 기본 모델: `deepseek/deepseek-v4-pro`
- 모델 별칭:
  - `default` → `deepseek/deepseek-v4-pro`
  - `commandcode/deepseek-v4-pro` → `deepseek/deepseek-v4-pro`
  - `deepseek-v4-flash` → `deepseek/deepseek-v4-flash`
- 스트리밍/비스트리밍 OpenAI 클라이언트 지원.
- CommandCode upstream은 항상 `params.stream: true`로 호출합니다. upstream이 non-streaming 생성을 거부하기 때문입니다.
- `COMMANDCODE_API_KEY`, `COMMANDCODE_API_KEYS` / credentials file, 또는 `~/.commandcode/auth.json`에서 upstream 인증을 자동 로드합니다.
- `daily_burn_priority`, `balance_priority`, `round_robin`, `drain_first` multi-key credential pool을 지원합니다. `depletion_aware`는 호환 alias로 `daily_burn_priority`로 정규화됩니다. 기본 정책은 남은 기간 대비 일일 소진 필요량을 우선하는 `daily_burn_priority`입니다.
- `/dashboard` 모바일 우선 admin 대시보드에서 routing policy, key CRUD/rename, per-key concurrency, model on/off, bridge 상태, JSON 저장, LaunchAgent 재시작을 관리할 수 있습니다.
- raw API key를 노출하지 않는 인증된 admin credential metrics를 제공합니다.
- 여러 bridge host/PC로 독립 요청을 least-inflight 방식으로 분산하면서 기존 `/v1` endpoint를 유지할 수 있는 선택적 `commandcode-router` 프로세스를 제공합니다.
- 잔액 threshold alert를 선택적으로 지원합니다. 기본값은 off이며 `COMMANDCODE_BALANCE_ALERT_ENABLED=true`일 때만 활성화됩니다.
- upstream HTTP error 및 `statusCode: 402` 같은 application-level stream error 발생 시 자동 failover/cooldown을 적용합니다.
- visible content가 비어 있고 `finish_reason: length`인 응답은 기본적으로 빈 성공 대신 fail-closed 처리합니다.
- 요청 크기 제한, 모델 allowlist, rate limit, helmet 보안 헤더, 선택적 CORS.
- Strict TypeScript, Vitest, ESLint, Prettier, Docker, systemd, GitHub Actions, GitLab CI 포함.

## 구조

```text
Single-host mode:
OpenAI-compatible client
  → CommandCode Bridge :9992
  → POST https://api.commandcode.ai/alpha/generate
  → CommandCode stream events
  → OpenAI chat.completion 또는 chat.completion.chunk

여러 PC를 쓰는 router mode:
OpenAI-compatible client
  → commandcode-router :9992
  → healthy backend 중 least-inflight 선택
  → PC별 CommandCode Bridge, 예: local :19992 + remote Tailscale :9992
  → CommandCode upstream
```

단일 chat-completion 요청은 시작부터 끝까지 하나의 backend에 고정됩니다. 병렬성은 서로 독립된 요청을 독립 bridge host로 분산하는 방식으로 확보합니다.

이 브리지는 요청마다 `cmd` 프로세스를 실행하지 않습니다. CLI가 사용하는 upstream API를 직접 호출합니다. 따라서 지연시간과 stdout 파싱 문제가 줄고, CLI가 추가하는 로컬 도구/메모리로 인한 토큰 낭비를 피할 수 있습니다.

## 요구 사항

- Node.js 20 이상
- npm 10 이상
- 공식 CommandCode CLI 환경(`cmd`, npm package `command-code`); 다운로드/설치: [commandcode.ai/install](https://commandcode.ai/install)
- 정상 동작하는 CommandCode 계정/API 키 또는 인증된 CommandCode CLI auth 파일
- Linux/macOS/WSL 권장

## 빠른 시작

```bash
git clone http://100.113.251.30:8929/root/commandcode-bridge.git commandcode-bridge
cd commandcode-bridge
npm install --include=dev
cp .env.example .env
```

single-key 모드:

```bash
# 서비스/컨테이너 운영 권장 방식
COMMANDCODE_API_KEY=your_commandcode_api_key
```

또는 multi-key 모드:

```bash
# 단순 id=key 쌍
COMMANDCODE_API_KEYS=primary=cmd_key_one,secondary=cmd_key_two
COMMANDCODE_ROUTING_POLICY=daily_burn_priority
```

weight/model scope가 필요한 credential은 JSON 파일을 만들고 `COMMANDCODE_CREDENTIALS_FILE`을 지정합니다.

```json
{
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
    { "id": "openai/gpt-5.5", "enabled": false },
    { "id": "anthropic/claude-opus-4.7", "enabled": false },
    { "id": "anthropic/claude-sonnet-4.6", "enabled": false }
  ],
  "credentials": [
    { "id": "primary", "apiKey": "cmd_key_one", "weight": 1, "maxInFlight": 4 },
    {
      "id": "flash-only",
      "apiKey": "cmd_key_two",
      "weight": 1,
      "allowedModels": ["deepseek/deepseek-v4-flash"],
      "maxInFlight": 4
    }
  ]
}
```

또는 일반 CommandCode 인증 파일을 유지합니다.

```text
~/.commandcode/auth.json
```

로컬 실행:

```bash
npm run build
npm start
```

상태 확인:

```bash
curl http://127.0.0.1:9992/health | jq
```

Chat completion:

```bash
curl -sS http://127.0.0.1:9992/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Reply exactly: OK"}],
    "max_tokens": 64,
    "temperature": 0
  }' | jq
```

스트리밍:

```bash
curl -N http://127.0.0.1:9992/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek/deepseek-v4-pro",
    "stream": true,
    "messages": [{"role": "user", "content": "Count to three."}]
  }'
```

## 인증

### upstream CommandCode 인증

브리지는 다음 순서로 CommandCode credential을 로드합니다.

1. `COMMANDCODE_CREDENTIALS_FILE` (JSON 배열 또는 `{ "credentials": [...] }`)
2. `COMMANDCODE_CREDENTIALS` / `COMMANDCODE_API_KEYS` (JSON 또는 `id=key,id2=key2`)
3. legacy single-key `COMMANDCODE_API_KEY`
4. `~/.commandcode/auth.json`
5. `~/.config/commandcode/auth.json`

credential이 여러 개여도 `/health`는 개수와 routing policy만 반환하며 raw key는 반환하지 않습니다.

### 클라이언트 인증

`BRIDGE_API_KEY`를 설정하면 클라이언트 인증이 필요합니다.

```bash
BRIDGE_API_KEY=change-me-to-a-long-random-secret
```

클라이언트는 다음 중 하나를 보낼 수 있습니다.

```text
Authorization: Bearer <BRIDGE_API_KEY>
```

또는:

```text
x-api-key: <BRIDGE_API_KEY>
```

`/health`는 의도적으로 인증 없이 열려 있지만, 비밀값은 반환하지 않습니다. Admin endpoint는 항상 `BRIDGE_API_KEY`가 필요합니다. 설정되지 않은 경우 `/admin/*`는 `admin_auth_not_configured`를 반환합니다.

Credential metrics endpoint:

```bash
curl -sS http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

이 응답에는 routing state, billing 기반 credit metrics, alert threshold, credential ID만 포함됩니다. upstream CommandCode API key나 bridge key는 반환하지 않습니다.

## 설정

| 변수                                                | 기본값                           | 설명                                                                                                                                                    |
| --------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`                                              | `127.0.0.1`                      | 바인드 주소. reverse proxy/VPN이 없으면 localhost 유지 권장.                                                                                            |
| `PORT`                                              | `9992`                           | HTTP 포트.                                                                                                                                              |
| `COMMANDCODE_API_KEY`                               | 미설정                           | Legacy single upstream CommandCode API 키.                                                                                                              |
| `COMMANDCODE_API_KEYS`                              | 미설정                           | 선택적 comma-separated multi-key `id=key` 목록. single-key보다 우선.                                                                                    |
| `COMMANDCODE_CREDENTIALS`                           | 미설정                           | 선택적 JSON credentials 배열/객체 또는 comma-separated multi-key 목록.                                                                                  |
| `COMMANDCODE_CREDENTIALS_FILE`                      | 미설정                           | 선택적 JSON credentials 파일. upstream credential 최우선순위.                                                                                           |
| `COMMANDCODE_ROUTING_POLICY`                        | `daily_burn_priority`            | `daily_burn_priority`, `balance_priority`, `round_robin`, `drain_first`. Legacy `depletion_aware`는 `daily_burn_priority` alias.                        |
| `COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL`          | `4`                              | credential별 동시 in-flight 요청 상한. JSON/dashboard에서 변경 가능. DeepSeek V4 Flash 테스트에서 8-way 병렬은 안정적이었지만 운영 기본은 key당 4 권장. |
| `COMMANDCODE_MAX_TOTAL_IN_FLIGHT_MULTIPLIER`        | `3`                              | 전체 in-flight 기본 상한 계산값: `credential_count × multiplier`. 기본은 key 수 × 3.                                                                    |
| `COMMANDCODE_MAX_TOTAL_IN_FLIGHT`                   | 미설정                           | 설정하면 multiplier 계산 대신 고정 전체 in-flight 상한 사용.                                                                                            |
| `COMMANDCODE_BILLING_REFRESH_MS`                    | `300000`                         | depletion-aware routing용 credential별 billing/usage cache TTL.                                                                                         |
| `COMMANDCODE_BILLING_TIMEOUT_MS`                    | `10000`                          | credential별 billing probe timeout. stale/error fallback으로 요청 hang 방지.                                                                            |
| `COMMANDCODE_CREDENTIAL_COOLDOWN_MS`                | `60000`                          | 429/5xx/timeout 이후 cooldown. 402는 이 값과 billing TTL 중 큰 값 사용.                                                                                 |
| `COMMANDCODE_API_BASE`                              | `https://api.commandcode.ai`     | upstream API base.                                                                                                                                      |
| `COMMANDCODE_DEFAULT_MODEL`                         | `deepseek/deepseek-v4-pro`       | 기본 upstream 모델.                                                                                                                                     |
| `COMMANDCODE_ALLOWED_MODELS`                        | Pro + Flash                      | 쉼표 구분 모델 allowlist.                                                                                                                               |
| `COMMANDCODE_ALLOW_UNKNOWN_MODELS`                  | `false`                          | 임의 모델 ID 통과. 권장하지 않음.                                                                                                                       |
| `COMMANDCODE_CLI_VERSION`                           | `0.25.12`                        | upstream으로 보내는 CLI 버전 헤더.                                                                                                                      |
| `COMMANDCODE_TIMEOUT_MS`                            | `300000`                         | upstream 요청 타임아웃.                                                                                                                                 |
| `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY`         | `error_on_length`                | visible content가 비어 있고 `finish_reason: length`이면 fail-closed. `allow`는 legacy 빈 성공 동작 유지.                                                |
| `BRIDGE_API_KEY`                                    | 미설정                           | 선택적 클라이언트 API 키. 강력 권장.                                                                                                                    |
| `REQUEST_BODY_LIMIT_BYTES`                          | `1048576`                        | Fastify 요청 크기 제한.                                                                                                                                 |
| `RATE_LIMIT_MAX`                                    | `60`                             | rate window당 요청 수.                                                                                                                                  |
| `RATE_LIMIT_WINDOW`                                 | `1 minute`                       | rate limit window.                                                                                                                                      |
| `LOG_LEVEL`                                         | `info`                           | Fastify/Pino 로그 레벨. 테스트에서는 `silent`.                                                                                                          |
| `CORS_ORIGIN`                                       | 미설정                           | 설정 시 해당 origin에 CORS 허용.                                                                                                                        |
| `INCLUDE_REASONING`                                 | `false`                          | true면 reasoning delta를 visible output에 붙임. 기본 false 유지 권장.                                                                                   |
| `COMMANDCODE_BALANCE_ALERT_ENABLED`                 | `false`                          | 주기적 잔액 threshold check 활성화. 기본 off.                                                                                                           |
| `COMMANDCODE_BALANCE_ALERT_MIN_CURRENT_BALANCE`     | `1`                              | 현재 전체 balance가 이 값보다 낮으면 alert. `0`이면 비활성화.                                                                                           |
| `COMMANDCODE_BALANCE_ALERT_MIN_EXPIRING_BALANCE`    | `0`                              | monthly/free expiring balance가 이 값보다 낮으면 alert. `0`이면 비활성화.                                                                               |
| `COMMANDCODE_BALANCE_ALERT_MAX_REQUIRED_DAILY_BURN` | `0`                              | required daily burn이 이 값보다 높으면 alert. `0`이면 비활성화.                                                                                         |
| `COMMANDCODE_BALANCE_ALERT_INTERVAL_MS`             | `COMMANDCODE_BILLING_REFRESH_MS` | 주기적 alert check 간격.                                                                                                                                |
| `COMMANDCODE_BALANCE_ALERT_REPEAT_MS`               | `3600000`                        | credential/alert type별 최소 반복 간격.                                                                                                                 |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL`             | 미설정                           | 선택적 JSON webhook 대상. webhook이 없어도 alert는 log로 남습니다.                                                                                      |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_BEARER`          | 미설정                           | alert webhook용 선택적 bearer token.                                                                                                                    |

## Admin Metrics와 Balance Alerts

- `GET /admin/commandcode/credentials`는 운영자용 metrics endpoint입니다. `BRIDGE_API_KEY`가 설정되어 있고 호출자가 이를 제공해야만 접근 가능합니다.
- `?refresh=true`는 응답 전 fresh billing/usage probe를 강제합니다. 생략하면 cached diagnostics를 사용합니다.
- Balance alert는 의도적으로 opt-in입니다. 기본값 `COMMANDCODE_BALANCE_ALERT_ENABLED=false`에서는 timer, webhook, alert 평가가 모두 비활성화됩니다.
- 활성화하면 startup 및 `COMMANDCODE_BALANCE_ALERT_INTERVAL_MS`마다 실행되며, structured warning log를 남기고 선택적으로 `COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL`에 JSON을 POST합니다.

## OpenAI 호환성 메모

지원 요청 필드:

- `model`
- `messages`
- `stream`
- `max_tokens`
- `temperature`
- `top_p`
- `stop`
- function schema 기반 `tools`. CommandCode가 emit한 tool call은 OpenAI `tool_calls`로 다시 매핑합니다.
- `tool_choice`는 미지정, `"auto"`, `"none"`만 지원합니다. CommandCode `/alpha/generate`에 안정적인 forced-tool selector가 없으므로 특정 tool 강제 선택은 `unsupported_tool_choice`로 거부합니다.
- `response_format` (`json_object`, `json_schema` 요청에는 JSON-only 안내를 보강)
- `stream_options.include_usage`; streaming usage는 `[DONE]` 전 `choices: []`인 OpenAI-style usage-only final chunk로 emit합니다.

upstream event 변환:

| CommandCode event                           | OpenAI mapping                                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text-delta`                                | `choices[0].delta.content` 또는 집계된 `message.content`                                                                                                                                 |
| `tool-call`                                 | `choices[0].delta.tool_calls` 또는 집계된 `message.tool_calls`                                                                                                                           |
| `finish.finishReason`                       | `finish_reason`                                                                                                                                                                          |
| `finish.totalUsage.inputTokens`             | `usage.prompt_tokens`                                                                                                                                                                    |
| `finish.totalUsage.outputTokens`            | `usage.completion_tokens`                                                                                                                                                                |
| `finish.totalUsage.totalTokens`             | `usage.total_tokens`                                                                                                                                                                     |
| `error`                                     | 비스트리밍은 upstream error로 반환합니다. 스트리밍은 SSE error frame과 `[DONE]`을 반환합니다. visible output 전 error이고 다른 credential이 있으면 먼저 retry/failover합니다.            |
| 빈 visible content + `finishReason: length` | 기본 `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=error_on_length`에서는 빈 성공 대신 `commandcode_empty_visible_response`를 반환합니다. legacy 호환이 필요할 때만 `allow`를 사용하십시오. |

Reasoning delta는 기본적으로 숨깁니다.

## 개발

```bash
npm install --include=dev
npm test
npm run typecheck
npm run lint
npm run build
npm run verify
```

실행 중인 브리지에 대한 smoke test:

```bash
npm run smoke
```

`BRIDGE_API_KEY`를 설정했다면 smoke script 실행 전 동일한 값을 export하십시오.

CommandCode 계정은 도달 가능하지만 balance/credit 문제로 생성이 막힌 경우, routing-only smoke mode로 브리지가 빈 성공을 반환하지 않고 upstream 실패를 명시적으로 전파하는지 확인할 수 있습니다.

```bash
SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

이 모드는 명시적 `commandcode_event_error`, `commandcode_empty_response`, `commandcode_empty_visible_response`만 허용합니다. 실제 content generation 통과에는 계정 balance가 필요합니다.

실 multi-key canary는 CommandCode 계정에 generation 가능한 balance가 확보될 때까지 의도적으로 보류합니다. 그 전에는 `SMOKE_ACCEPT_UPSTREAM_ERRORS=1`로 routing/auth/fail-closed 동작만 검증하십시오. 결제/top-up 후 checklist:

1. `COMMANDCODE_API_KEYS` 또는 `COMMANDCODE_CREDENTIALS_FILE`에 서로 다른 ID의 credential 최소 2개를 설정합니다.
2. `/admin/commandcode/credentials?refresh=true`에서 canary credential 각각의 positive balance를 확인합니다.
3. `SMOKE_ACCEPT_UPSTREAM_ERRORS` 없이 `npm run smoke`를 실행합니다.
4. low-token 요청을 여러 번 보내고 admin metrics에서 `COMMANDCODE_ROUTING_POLICY`에 따른 selection 회전이 보이는지 확인합니다.
5. tailnet 또는 non-localhost 테스트에서는 `BRIDGE_API_KEY`를 계속 활성화합니다.

## Docker

운영 배포와 관리 절차는 먼저 다음 문서를 보십시오.

- `docs/DEPLOYMENT.md` — 기본 영문 배포 가이드.
- `docs/DEPLOYMENT.ko.md` — 상세 한국어 배포 가이드.
- `release/README_RELEASE.md` — 복사해서 쓰는 release 자산 설명.

Docker 빌드는 전체 source checkout을 기준으로 합니다. Dockerfile이 runtime image 생성 전에 검증/빌드 파이프라인을 실행하므로 `src/`, `tests/`, lockfile, config 파일이 모두 필요합니다. npm package는 runtime 중심이며 전체 Docker build context를 포함하지 않습니다.

```bash
docker build -t commandcode-bridge .
docker run --rm -p 127.0.0.1:9992:9992 \
  -e HOST=0.0.0.0 \
  -e COMMANDCODE_API_KEY="$COMMANDCODE_API_KEY" \
  -e BRIDGE_API_KEY="$BRIDGE_API_KEY" \
  commandcode-bridge
```

컨테이너 내부에서는 `0.0.0.0`으로 listen하지만, 위 예시는 localhost에만 publish합니다. Tailnet 또는 외부 interface에 bind할 경우 `BRIDGE_API_KEY`를 설정하십시오.

또는:

```bash
docker compose up -d --build
```

`release/docker-compose.yml` 참고.

## systemd

권장 user-systemd 배포는 `docs/DEPLOYMENT.ko.md`를 참고하십시오. system-level host unit 예시는 `release/systemd/commandcode-bridge.service`에 있습니다.

권장 설치 경로:

```text
/opt/commandcode-bridge
```

## 보안

- TLS와 인증 없이 공개 인터넷에 노출하지 마십시오.
- `127.0.0.1`, Tailscale, VPN, private reverse proxy를 권장합니다.
- non-localhost 배포에서는 반드시 `BRIDGE_API_KEY`를 설정하십시오.
- CommandCode API 키는 개인 credential로 취급하십시오.
- 이 프로젝트는 CommandCode의 UNLICENSED CLI 번들 소스를 복사하지 않습니다.

자세한 내용은 `docs/SECURITY.md`를 보십시오.

## 문서

- `README.md` — 영어 README.
- `docs/DEPLOYMENT.md` — 배포와 운영 가이드.
- `docs/DEPLOYMENT.ko.md` — 한국어 배포와 운영 가이드.
- `docs/PRD.md` — 제품 요구사항.
- `docs/IMPLEMENTATION_PLAN.md` — 구현 계획.
- `docs/ARCHITECTURE.md` — 구조와 데이터 흐름.
- `docs/KNOW_HOW.md` — CommandCode API 노트와 운영 노하우.
- `docs/SECURITY.md` — 보안 모델과 배포 가드레일.
- `docs/PROCESS_LOG.md` — 작업 로그.

## 라이선스

MIT. CommandCode 자체는 별도 소프트웨어이며 다른 약관을 가질 수 있습니다.
