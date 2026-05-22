# CommandCode Bridge 배포 가이드

이 문서는 CommandCode CLI 환경에서 CommandCode Bridge를 재부팅 후에도 계속 살아 있는 OpenAI-compatible API 서비스로 배포·운영하는 방법을 정리합니다.

> **CommandCode CLI 환경 전제:** 공식 CLI 다운로드/설치는 [commandcode.ai/install](https://commandcode.ai/install) (공식 사이트: [commandcode.ai](https://commandcode.ai/))에서 진행한 뒤, CLI 인증을 완료하거나 동등한 `COMMANDCODE_*` credential을 제공하십시오. 이 브리지는 공개 독립형 DeepSeek 프록시가 아니라 CommandCode 계정/upstream API를 이용합니다.

영문 기본 문서: [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## 권장 운영 구조

개인 워크스테이션, 홈서버, tailnet 호스트 기준 권장 구조는 다음과 같습니다.

```text
OpenAI-compatible client
  -> http://127.0.0.1:9992 또는 http://<tailscale-ip>:9992
  -> commandcode-bridge systemd service
  -> CommandCode /alpha/generate upstream
```

보안 기준:

- 로컬 단발 테스트가 아니라면 `BRIDGE_API_KEY`를 반드시 켜십시오.
- local-only면 `HOST=127.0.0.1`이 안전합니다.
- Tailscale/WireGuard/VPN/reverse proxy 뒤에서 쓸 때만 `HOST=0.0.0.0`을 사용하십시오.
- 실제 env 파일, CommandCode CLI auth 파일, API key, credential JSON은 Git에 커밋하지 마십시오.
- CommandCode CLI auth 파일과 key는 개인 upstream credential로 취급하십시오.
- `/admin/*` endpoint는 bridge 인증 뒤에서만 접근해야 합니다.

## 현재 이 머신의 배포 상태

현재 이 워크스테이션의 public/tailnet endpoint는 **user systemd router**가 앞단에서 받습니다. local bridge는 별도 user service로 남아 있으며, router가 사용하는 내부 포트에서 listen합니다.

현재 경로:

- bridge user systemd unit: `~/.config/systemd/user/commandcode-bridge.service`
- router user systemd unit: `~/.config/systemd/user/commandcode-router.service`
- bridge runtime env file: `~/.config/commandcode-bridge/env`
- router runtime env file: `~/.config/commandcode-bridge/router.env`
- bridge 실행 파일: `~/.local/bin/commandcode-bridge`
- router 실행 파일: `~/.local/bin/commandcode-router`
- 외부/Tailscale endpoint: router `0.0.0.0:9992`
- local backend endpoint: router 설정 기준 bridge `127.0.0.1:19992`
- client용 Tailscale URL base: `http://100.122.162.75:9992`

상태 확인:

```bash
systemctl --user status commandcode-bridge --no-pager
systemctl --user status commandcode-router --no-pager
systemctl --user is-enabled commandcode-bridge
systemctl --user is-enabled commandcode-router
loginctl show-user "$USER" -p Linger
```

정상 기대값:

- 두 service 모두 `active (running)`
- 두 service 모두 `enabled`
- linger: `Linger=yes`

운영 명령:

```bash
systemctl --user restart commandcode-bridge
systemctl --user restart commandcode-router
journalctl --user -u commandcode-bridge -f
journalctl --user -u commandcode-router -f
```

Router health check:

```bash
curl -sS http://127.0.0.1:9992/health | jq
```

Router를 우회한 local backend health check:

```bash
curl -sS http://127.0.0.1:19992/health | jq
```

Router 경유 `/v1/models` 확인:

```bash
set -a
. "$HOME/.config/commandcode-bridge/env"
set +a
curl -sS http://127.0.0.1:9992/v1/models   -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

Router backend 상태:

```bash
set -a
. "$HOME/.config/commandcode-bridge/env"
set +a
curl -sS http://127.0.0.1:9992/admin/router/backends   -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

외부 endpoint를 유지한 smoke test:

```bash
set -a
. "$HOME/.config/commandcode-bridge/env"
set +a
BRIDGE_BASE_URL=http://127.0.0.1:9992 npm run smoke
```

CommandCode 계정은 도달 가능하지만 balance/credit 문제로 실제 generation이 막힌 경우에는 routing-only smoke를 사용할 수 있습니다.

```bash
set -a
. "$HOME/.config/commandcode-bridge/env"
set +a
BRIDGE_BASE_URL=http://127.0.0.1:9992 SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

주의: `SMOKE_ACCEPT_UPSTREAM_ERRORS=1`은 generation canary가 아닙니다. 이 모드는 `commandcode_event_error`, `commandcode_empty_response`, `commandcode_empty_visible_response` 같은 명시적 upstream/fail-closed 오류를 잘 드러내는지만 확인합니다.

Router 경유 admin credential metrics:

```bash
set -a
. "$HOME/.config/commandcode-bridge/env"
set +a
curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true'   -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

Admin endpoint는 credential ID, routing state, billing 기반 metric, alert 설정을 반환합니다. raw CommandCode API key나 bridge key를 반환하면 안 됩니다.

## 여러 bridge host를 위한 router mode

각 PC마다 `commandcode-bridge`를 하나씩 실행하고, 그 앞에 `commandcode-router` 하나를 둡니다. router는 agent들이 쓰는 단일 OpenAI-compatible endpoint를 보존하면서, in-flight 요청 수가 가장 적은 정상 backend를 선택합니다.

최소 router env:

```env
HOST=0.0.0.0
PORT=9992
COMMANDCODE_ROUTER_BACKENDS=local=http://127.0.0.1:19992,pc2=http://100.x.y.z:9992
COMMANDCODE_ROUTER_BACKEND_MAX_INFLIGHT=1
COMMANDCODE_ROUTER_BACKEND_TIMEOUT_MS=300000
COMMANDCODE_ROUTER_HEALTH_TIMEOUT_MS=3000
COMMANDCODE_ROUTER_COOLDOWN_MS=60000
```

모든 bridge backend가 같은 `BRIDGE_API_KEY`를 쓰면 router가 client auth와 backend auth에 같은 값을 재사용할 수 있습니다. backend마다 다른 key를 쓰는 경우에는 private env file 안에서 JSON backend entry별 `apiKey`를 지정하십시오. 해당 값은 절대 commit하지 않습니다.

단일 streaming 요청은 출력이 시작된 뒤 다른 PC로 이동할 수 없습니다. failover와 load distribution은 서로 독립된 요청 경계에서만 일어납니다.

## 원클릭 user systemd 설치/제거 스크립트

라즈베리파이 또는 일반 Linux host에서 현재 사용자 권한으로 bridge를 서비스 등록하려면 저장소 루트에서 다음을 실행합니다.

```bash
./install.sh
```

설치 중 bind 주소를 `127.0.0.1` 또는 `0.0.0.0` 중에서 고르고 port를 입력할 수 있습니다. 기본값은 안전한 `127.0.0.1:9992`입니다.

사전 조건은 Linux user systemd, Node.js >= 20, npm, 그리고 `~/.commandcode/auth.json`의 CommandCode CLI 인증 또는 `COMMANDCODE_API_KEY`입니다. headless host에서 로그인 전에도 떠야 하면 한 번 `sudo loginctl enable-linger "$USER"`를 실행하십시오. `0.0.0.0`은 LAN/Tailscale/VPN/firewall 뒤에서만 사용하고 강한 `BRIDGE_API_KEY`를 유지하십시오.

비대화형 설치:

```bash
./install.sh --yes --host 127.0.0.1 --port 9992
```

서비스와 설치 파일 제거, credential/env 보존:

```bash
./uninstall.sh
```

credential/env까지 제거:

```bash
./uninstall.sh --purge-config
```

## User systemd 배포 방식

root 권한이 없거나, 현재 사용자 계정의 `~/.commandcode/auth.json`을 그대로 읽게 하려면 user systemd 방식이 가장 적합합니다.

사전 확인:

```bash
command -v node
command -v npm
command -v commandcode-bridge
systemctl --user is-system-running
```

재부팅 후 로그인 전에도 사용자 서비스가 올라오려면 linger가 필요합니다.

```bash
sudo loginctl enable-linger "$USER"
loginctl show-user "$USER" -p Linger
```

환경 파일 생성:

```bash
mkdir -p ~/.config/commandcode-bridge
chmod 700 ~/.config/commandcode-bridge
nano ~/.config/commandcode-bridge/env
chmod 600 ~/.config/commandcode-bridge/env
```

최소 env 예시:

```env
HOST=0.0.0.0
PORT=9992
NODE_ENV=production
BRIDGE_API_KEY=replace-with-long-random-client-key
COMMANDCODE_ROUTING_POLICY=depletion_aware
COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=error_on_length
COMMANDCODE_BALANCE_ALERT_ENABLED=false
```

CommandCode CLI의 일반 auth 파일을 사용할 경우 다음 위치를 유지하면 됩니다.

```text
~/.commandcode/auth.json
```

upstream key를 명시적으로 env 파일에 둘 수도 있습니다.

```env
# Single-key mode
COMMANDCODE_API_KEY=cmd_key_here

# Multi-key mode
COMMANDCODE_API_KEYS=primary=cmd_key_one,secondary=cmd_key_two
```

User unit은 직접 만들거나 `release/systemd/commandcode-bridge.user.service` 템플릿을 복사해서 사용할 수 있습니다.

직접 생성 예시:

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/commandcode-bridge.service <<'EOF'
[Unit]
Description=CommandCode Bridge - OpenAI-compatible API for CommandCode DeepSeek
After=default.target

[Service]
Type=simple
WorkingDirectory=%h
EnvironmentFile=%h/.config/commandcode-bridge/env
ExecStart=%h/.local/bin/commandcode-bridge
Restart=always
RestartSec=5
TimeoutStopSec=20
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=default.target
EOF
```

활성화 및 시작:

```bash
systemctl --user daemon-reload
systemctl --user enable --now commandcode-bridge
systemctl --user status commandcode-bridge --no-pager
```

## System-level systemd 배포 방식

서버처럼 `/opt/commandcode-bridge` 아래에 전용 service user를 두고 운영하려면 system-level unit을 사용합니다.

저장소에는 다음 unit 예시가 들어 있습니다.

```text
release/systemd/commandcode-bridge.service
```

source checkout에서 설치:

```bash
sudo useradd --system --home /opt/commandcode-bridge --shell /usr/sbin/nologin commandcode-bridge || true
sudo mkdir -p /opt/commandcode-bridge
sudo rsync -a --delete ./ /opt/commandcode-bridge/
cd /opt/commandcode-bridge
sudo npm ci
sudo npm run verify
sudo npm run build
sudo npm prune --omit=dev
```

환경 파일 생성:

```bash
sudo cp release/env.production.example /etc/commandcode-bridge.env
sudo chmod 600 /etc/commandcode-bridge.env
sudoedit /etc/commandcode-bridge.env
```

Unit 시작:

```bash
sudo cp release/systemd/commandcode-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now commandcode-bridge
sudo systemctl status commandcode-bridge --no-pager
```

운영:

```bash
sudo journalctl -u commandcode-bridge -f
sudo systemctl restart commandcode-bridge
sudo systemctl stop commandcode-bridge
```

## Docker Compose 배포 방식

container 경계를 두고 싶고 full source checkout이 있는 경우 Docker Compose를 사용할 수 있습니다.

```bash
cd /opt/commandcode-bridge
cp release/env.production.example release/env.production
chmod 600 release/env.production
nano release/env.production
cd release
docker compose up -d --build
```

검증:

```bash
export BRIDGE_API_KEY='<same value as release/env.production>'
./smoke-curl.sh http://127.0.0.1:9992
```

주의:

- container 내부 process는 `HOST=0.0.0.0`으로 떠야 Docker port publishing이 됩니다.
- host 노출은 `127.0.0.1:9992:9992`로 local-only 제한할 수 있습니다.
- `release/env.production`은 절대 커밋하지 마십시오.

## 글로벌 npm 설치본 업데이트 절차

현재 live service가 globally installed package를 사용한다면, source checkout에서 `npm run build`만 하는 것으로는 운영 중인 서비스가 바뀌지 않습니다. package를 다시 pack/install하고 service를 재시작해야 합니다.

```bash
cd /home/yelixir/workspace/commandcode-bridge
npm run verify
TGZ=$(npm pack --silent | tail -n1)
npm install -g "./$TGZ"
rm -f "$TGZ"
systemctl --user restart commandcode-bridge
systemctl --user status commandcode-bridge --no-pager
```

이후 smoke:

```bash
set -a
. "$HOME/.config/commandcode-bridge/env"
set +a
npm run smoke
```

## 설정 옵션 설명

### 서버와 client auth 옵션

| 변수                       | 기본값      | 설명                                                                                                                  |
| -------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `HOST`                     | `127.0.0.1` | bind 주소입니다. local-only면 `127.0.0.1`, Tailscale/VPN/reverse proxy 뒤에서 접근하려면 `0.0.0.0`을 사용합니다.      |
| `PORT`                     | `9992`      | HTTP listen port입니다.                                                                                               |
| `BRIDGE_API_KEY`           | 미설정      | client-facing bearer key입니다. 강력 권장합니다. Admin endpoint는 이 값이 설정되어 있어야 접근 가능합니다.            |
| `REQUEST_BODY_LIMIT_BYTES` | `1048576`   | Fastify request body limit입니다. 매우 큰 prompt/tool schema를 받을 때만 늘리십시오.                                  |
| `RATE_LIMIT_MAX`           | `60`        | client별 rate-limit window 안에서 허용할 최대 request 수입니다.                                                       |
| `RATE_LIMIT_WINDOW`        | `1 minute`  | `@fastify/rate-limit`이 이해하는 window 문자열입니다.                                                                 |
| `LOG_LEVEL`                | `info`      | Pino/Fastify log level입니다. 보통 `debug`, `info`, `warn`, `error`, `silent`를 사용합니다.                           |
| `CORS_ORIGIN`              | 미설정      | browser client 특정 origin에 CORS를 열 때 사용합니다. CLI/server client만 쓰면 비워두십시오.                          |
| `INCLUDE_REASONING`        | `false`     | `true`면 reasoning delta를 visible content에 붙입니다. 일반 OpenAI-compatible client에서는 `false` 유지가 안전합니다. |

### CommandCode upstream 옵션

| 변수                               | 기본값                       | 설명                                                                                                                     |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `COMMANDCODE_API_KEY`              | 미설정                       | single upstream CommandCode API key입니다. 비워두면 일반 CommandCode auth file을 읽을 수 있습니다.                       |
| `COMMANDCODE_API_KEYS`             | 미설정                       | multi-key용 comma-separated `id=key` 목록입니다. 예: `primary=...,secondary=...`. single-key보다 우선합니다.             |
| `COMMANDCODE_CREDENTIALS`          | 미설정                       | JSON credential 배열/객체 또는 comma-separated multi-key 목록입니다. 구조화된 배포 시스템에서 유용합니다.                |
| `COMMANDCODE_CREDENTIALS_FILE`     | 미설정                       | JSON credentials 파일 경로입니다. upstream credential source 중 최우선입니다. 복잡한 multi-key에는 이 방식을 권장합니다. |
| `COMMANDCODE_API_BASE`             | `https://api.commandcode.ai` | upstream CommandCode API base URL입니다. 테스트나 upstream 변경 대응 외에는 바꾸지 마십시오.                             |
| `COMMANDCODE_DEFAULT_MODEL`        | `deepseek/deepseek-v4-pro`   | `model: "default"` 요청이 실제로 사용할 upstream model입니다.                                                            |
| `COMMANDCODE_ALLOWED_MODELS`       | Pro + Flash                  | 허용할 model ID 목록입니다. 이 목록 밖 요청은 unknown model 허용 옵션을 켜지 않는 한 거부됩니다.                         |
| `COMMANDCODE_ALLOW_UNKNOWN_MODELS` | `false`                      | 임의 model ID를 upstream으로 통과시킵니다. 운영에서는 권장하지 않습니다.                                                 |
| `COMMANDCODE_CLI_VERSION`          | `0.26.21`                    | 테스트된 CommandCode CLI 동작과 맞추기 위해 upstream에 보내는 version header입니다.                                      |
| `COMMANDCODE_TIMEOUT_MS`           | `300000`                     | upstream generation timeout입니다.                                                                                       |

Credential JSON 파일 예시:

```json
{
  "credentials": [
    { "id": "primary", "apiKey": "cmd_key_one", "weight": 1 },
    {
      "id": "flash-only",
      "apiKey": "cmd_key_two",
      "weight": 1,
      "allowedModels": ["deepseek/deepseek-v4-flash"]
    }
  ]
}
```

### Multi-key routing 옵션

| 변수                                 | 기본값            | 설명                                                                                                                          |
| ------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `COMMANDCODE_ROUTING_POLICY`         | `depletion_aware` | `depletion_aware`는 billing/expiry pressure 기준으로 라우팅합니다. `round_robin`은 eligible key를 weight 기준으로 순환합니다. |
| `COMMANDCODE_BILLING_REFRESH_MS`     | `300000`          | credential별 billing/usage cache TTL입니다.                                                                                   |
| `COMMANDCODE_BILLING_TIMEOUT_MS`     | `10000`           | billing probe timeout입니다. probe 실패 시 요청이 멈추지 않도록 안전하게 fallback합니다.                                      |
| `COMMANDCODE_CREDENTIAL_COOLDOWN_MS` | `60000`           | 429/5xx/timeout 이후 cooldown입니다. 402는 최소 이 값과 billing refresh window 중 큰 값을 사용합니다.                         |

라우팅 동작 요약:

- `depletion_aware`는 reset 전에 소진해야 하는 monthly/free credit 압력이 높은 key에 더 많은 traffic을 보냅니다.
- 고갈되었거나 실패한 key는 cooldown 동안 제외됩니다.
- visible output 전 application-level stream error가 오면 다른 credential로 failover할 수 있습니다.
- 이미 visible output을 보낸 뒤에는 중복 출력을 피하기 위해 retry하지 않고 error를 표면화합니다.

### 빈 visible content 방어 정책

| 변수                                        | 기본값            | 설명                                                                                                                                                                                     |
| ------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY` | `error_on_length` | upstream이 visible content 없이 `finish_reason: length`로 끝나면 blank success 대신 `commandcode_empty_visible_response`를 반환합니다. legacy 호환이 필요할 때만 `allow`를 사용하십시오. |

이 정책은 reasoning-heavy model이 hidden token만 쓰다가 끝난 응답을 client가 정상 빈 답변으로 오인하지 않게 막습니다.

### Balance alert 옵션

Balance alert는 기본적으로 꺼져 있습니다.

| 변수                                                | 기본값              | 설명                                                                                     |
| --------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `COMMANDCODE_BALANCE_ALERT_ENABLED`                 | `false`             | 주기적 alert check 활성화 여부입니다. 기본값은 의도적으로 off입니다.                     |
| `COMMANDCODE_BALANCE_ALERT_MIN_CURRENT_BALANCE`     | `1`                 | 현재 전체 balance가 이 threshold 아래로 내려가면 alert합니다. `0`이면 비활성화입니다.    |
| `COMMANDCODE_BALANCE_ALERT_MIN_EXPIRING_BALANCE`    | `0`                 | monthly/free expiring balance가 이 threshold 아래면 alert합니다. `0`이면 비활성화입니다. |
| `COMMANDCODE_BALANCE_ALERT_MAX_REQUIRED_DAILY_BURN` | `0`                 | required daily burn이 이 threshold를 넘으면 alert합니다. `0`이면 비활성화입니다.         |
| `COMMANDCODE_BALANCE_ALERT_INTERVAL_MS`             | billing refresh TTL | periodic alert check 간격입니다.                                                         |
| `COMMANDCODE_BALANCE_ALERT_REPEAT_MS`               | `3600000`           | credential/alert type별 중복 알림 throttle입니다.                                        |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL`             | 미설정              | 선택적 JSON webhook URL입니다. webhook이 없어도 alert는 log로 남습니다.                  |
| `COMMANDCODE_BALANCE_ALERT_WEBHOOK_BEARER`          | 미설정              | alert webhook용 bearer token입니다.                                                      |

## Multi-key canary checklist

실제 content generation 가능한 balance/top-up이 준비된 뒤에만 실행하십시오.

1. `COMMANDCODE_API_KEYS` 또는 `COMMANDCODE_CREDENTIALS_FILE`에 서로 다른 ID의 credential을 최소 2개 설정합니다.
2. service를 재시작합니다.
3. admin diagnostics에서 모든 ID가 보이는지 확인합니다.

   ```bash
   set -a
   . "$HOME/.config/commandcode-bridge/env"
   set +a
   curl -sS 'http://127.0.0.1:9992/admin/commandcode/credentials?refresh=true' \
     -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
   ```

4. 모든 canary key에 positive usable balance가 있는지 확인합니다.
5. `SMOKE_ACCEPT_UPSTREAM_ERRORS` 없이 `npm run smoke`를 실행합니다.
6. low-token 요청을 여러 번 보냅니다.
7. admin metrics를 다시 보고 `COMMANDCODE_ROUTING_POLICY`에 따라 selection/routing movement가 있는지 확인합니다.
8. Tailscale 같은 non-localhost path를 쓴다면 그 경로에서도 `/v1/models`와 chat request를 반복합니다.

## 문제 해결

### `/health`는 되는데 smoke가 401을 반환함

bridge는 살아 있고 client auth를 요구하지만, smoke process에 올바른 `BRIDGE_API_KEY`가 들어가지 않은 상태입니다.

해결:

```bash
set -a
. "$HOME/.config/commandcode-bridge/env"
set +a
npm run smoke
```

### source checkout 검증은 통과했는데 live 동작이 안 바뀜

운영 서비스가 globally installed npm package를 쓰고 있을 가능성이 큽니다. `npm pack`, `npm install -g`, 실제 service manager restart가 필요합니다.

### 9992 포트가 이미 사용 중임

```bash
ss -ltnp '( sport = :9992 )'
systemctl --user status commandcode-bridge --no-pager
```

manual process를 멈추거나 env 파일에서 `PORT`를 바꾸십시오.

### 재부팅 후 service가 안 올라옴

linger와 enable 상태를 확인하십시오.

```bash
loginctl show-user "$USER" -p Linger
systemctl --user is-enabled commandcode-bridge
```

linger가 꺼져 있으면:

```bash
sudo loginctl enable-linger "$USER"
```

### upstream balance/credit 실패

fail-closed 동작만 확인하려면 routing-only smoke를 사용할 수 있습니다.

```bash
SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke
```

진짜 generation readiness는 top-up 후 이 flag 없이 smoke를 통과해야 합니다.
