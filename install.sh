#!/usr/bin/env bash
set -euo pipefail

APP_NAME="commandcode-bridge"
DEFAULT_HOST="127.0.0.1"
DEFAULT_PORT="9992"
DEFAULT_ALLOWED_MODELS="deepseek/deepseek-v4-pro,deepseek/deepseek-v4-flash,MiniMaxAI/MiniMax-M2.7,Qwen/Qwen3.6-Plus,zai-org/GLM-5.1,moonshotai/Kimi-K2.6"

INSTALL_DIR="$HOME/.local/share/commandcode-bridge"
BIN_DIR="$HOME/.local/bin"
CONFIG_DIR="$HOME/.config/commandcode-bridge"
ENV_FILE="$CONFIG_DIR/env"
# Default private env location: ~/.config/commandcode-bridge/env
USER_UNIT_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$USER_UNIT_DIR/commandcode-bridge.service"
INSTALL_MARKER="$INSTALL_DIR/.commandcode-bridge-install"

HOST="$DEFAULT_HOST"
PORT="$DEFAULT_PORT"
BRIDGE_API_KEY=""
COMMANDCODE_API_KEY=""
ASSUME_YES=0
NO_START=0

usage() {
  cat <<'USAGE'
CommandCode Bridge rootless Linux installer.

Usage:
  ./install.sh [options]

Options:
  --host 127.0.0.1|0.0.0.0   Bind address. Default: 127.0.0.1
  --port PORT                 Listen port. Default: 9992
  --bridge-api-key KEY        Client-facing Bearer token. Default: generated
                              Prefer the interactive prompt; CLI args may be
                              visible in process lists.
  --commandcode-api-key KEY   Optional upstream CommandCode API key. If omitted,
                              the bridge can use ~/.commandcode/auth.json.
                              Prefer the interactive prompt for secrets.
  --yes                       Non-interactive; accept defaults for omitted values
  --no-start                  Install files and service but do not start it
  -h, --help                  Show this help

Examples:
  ./install.sh
  ./install.sh --host 0.0.0.0 --port 9992
  ./install.sh --yes --host 127.0.0.1 --port 9992
USAGE
}

log() { printf '[%s] %s\n' "$APP_NAME" "$*"; }
fail() { printf '[%s] ERROR: %s\n' "$APP_NAME" "$*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      [ "$#" -ge 2 ] || fail "--host requires a value"
      HOST="$2"
      shift 2
      ;;
    --port)
      [ "$#" -ge 2 ] || fail "--port requires a value"
      PORT="$2"
      shift 2
      ;;
    --bridge-api-key)
      [ "$#" -ge 2 ] || fail "--bridge-api-key requires a value"
      BRIDGE_API_KEY="$2"
      shift 2
      ;;
    --commandcode-api-key)
      [ "$#" -ge 2 ] || fail "--commandcode-api-key requires a value"
      COMMANDCODE_API_KEY="$2"
      shift 2
      ;;
    --yes|-y)
      ASSUME_YES=1
      shift
      ;;
    --no-start)
      NO_START=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

prompt_if_interactive() {
  [ "$ASSUME_YES" -eq 0 ] || return 0
  [ -t 0 ] || return 0

  printf '\nBind host 선택:\n'
  printf '  1) 127.0.0.1  local-only, 가장 안전함 [default]\n'
  printf '  2) 0.0.0.0    LAN/Tailscale/VPN에서 접근 가능; BRIDGE_API_KEY 필수\n'
  printf 'Bind host [%s]: ' "$HOST"
  read -r host_input || true
  case "${host_input:-}" in
    "" ) ;;
    1|127.0.0.1) HOST="127.0.0.1" ;;
    2|0.0.0.0) HOST="0.0.0.0" ;;
    127.0.0.0)
      log "127.0.0.0은 일반적인 loopback bind 주소가 아니어서 127.0.0.1로 보정합니다."
      HOST="127.0.0.1"
      ;;
    *) HOST="$host_input" ;;
  esac

  printf 'Port [%s]: ' "$PORT"
  read -r port_input || true
  [ -z "${port_input:-}" ] || PORT="$port_input"

  if [ -z "$BRIDGE_API_KEY" ]; then
    printf 'BRIDGE_API_KEY [auto-generate; input hidden]: '
    read -rs key_input || true
    printf '\n'
    BRIDGE_API_KEY="${key_input:-}"
  fi

  if [ -z "$COMMANDCODE_API_KEY" ]; then
    printf 'COMMANDCODE_API_KEY [blank = use ~/.commandcode/auth.json if present; input hidden]: '
    read -rs cc_key_input || true
    printf '\n'
    COMMANDCODE_API_KEY="${cc_key_input:-}"
  fi
}

validate_host() {
  case "$HOST" in
    127.0.0.1|0.0.0.0) ;;
    127.0.0.0)
      log "127.0.0.0은 일반적인 loopback bind 주소가 아니어서 127.0.0.1로 보정합니다."
      HOST="127.0.0.1"
      ;;
    *) fail "HOST must be either 127.0.0.1 or 0.0.0.0; got '$HOST'" ;;
  esac
}

validate_port() {
  case "$PORT" in
    ''|*[!0-9]*) fail "PORT must be a number between 1 and 65535; got '$PORT'" ;;
  esac
  if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    fail "PORT must be between 1 and 65535; got '$PORT'"
  fi
}

validate_env_value() {
  local name="$1"
  local value="$2"
  case "$value" in
    *$'\n'*|*$'\r'*) fail "$name must not contain newlines" ;;
  esac
}

systemd_quote() {
  local value="$1"
  local escaped="${value//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  printf '"%s"' "$escaped"
}

write_env_line() {
  local key="$1"
  local value="$2"
  printf '%s=%s\n' "$key" "$(systemd_quote "$value")"
}

generate_key() {
  if command -v node >/dev/null 2>&1; then
    node -e "console.log('sk-cmdbridge-'+require('crypto').randomBytes(3).toString('hex'))"
  elif command -v openssl >/dev/null 2>&1; then
    printf 'sk-cmdbridge-%s\n' "$(openssl rand -hex 3)"
  else
    fail "need node or openssl to generate BRIDGE_API_KEY"
  fi
}

commandcode_bin() {
  if command -v cmd >/dev/null 2>&1; then
    command -v cmd
    return 0
  fi
  if command -v command-code >/dev/null 2>&1; then
    command -v command-code
    return 0
  fi
  return 1
}

confirm_default_yes() {
  local prompt="$1"
  [ "$ASSUME_YES" -eq 0 ] || return 0
  [ -t 0 ] || return 0
  printf '%s [Y/n]: ' "$prompt"
  read -r answer || true
  case "${answer:-}" in
    ""|y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_commandcode_cli() {
  if commandcode_bin >/dev/null 2>&1; then
    log "Command Code CLI found: $(commandcode_bin)"
    return 0
  fi

  if confirm_default_yes "Command Code CLI가 없습니다. npm i -g command-code 후 계속 진행할까요?"; then
    log "Installing Command Code CLI with npm."
    npm install -g command-code
  else
    fail "Command Code CLI가 필요합니다. 'npm i -g command-code' 후 'cmd login'을 완료하고 다시 설치를 실행하세요."
  fi

  commandcode_bin >/dev/null 2>&1 || fail "Command Code CLI install finished but 'cmd' was not found on PATH. Add npm global bin to PATH and retry."
}

extract_commandcode_api_key() {
  local auth_file="$HOME/.commandcode/auth.json"
  [ -f "$auth_file" ] || return 1
  node -e '
const fs = require("fs");
const file = process.argv[1];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
function stringValue(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
function walk(value) {
  const scalar = stringValue(value);
  if (scalar) return scalar;
  if (!value || typeof value !== "object") return undefined;
  for (const key of ["apiKey", "api_key", "access", "accessToken", "token", "key", "commandcode", "commandCode", "command_code", "auth", "credentials", "oauth", "account"]) {
    const found = walk(value[key]);
    if (found) return found;
  }
  return undefined;
}
const key = walk(data);
if (!key) process.exit(1);
process.stdout.write(key);
' "$auth_file"
}

DETECTED_COMMANDCODE_API_KEY=""
ensure_commandcode_auth() {
  ensure_commandcode_cli
  DETECTED_COMMANDCODE_API_KEY="$(extract_commandcode_api_key 2>/dev/null || true)"
  if [ -n "$DETECTED_COMMANDCODE_API_KEY" ]; then
    if [ -z "$COMMANDCODE_API_KEY" ]; then
      COMMANDCODE_API_KEY="$DETECTED_COMMANDCODE_API_KEY"
      log "기존 Command Code 인증 키를 브릿지 key1로 가져왔습니다."
    else
      log "Command Code 인증은 확인됐고, 입력한 COMMANDCODE_API_KEY를 우선 사용합니다."
    fi
  else
    log "Command Code CLI는 설치되어 있지만 인증 키가 없습니다. 설치 후 'cmd login'을 실행하고 브릿지를 재시작하세요."
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

ensure_safe_install_dir() {
  case "$INSTALL_DIR" in
    "$HOME/.local/share/commandcode-bridge") ;;
    *) fail "refusing unexpected INSTALL_DIR: $INSTALL_DIR" ;;
  esac

  if [ -e "$INSTALL_DIR" ] && [ ! -f "$INSTALL_MARKER" ]; then
    if [ -n "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)" ]; then
      fail "$INSTALL_DIR exists and is not marked as a CommandCode Bridge install; refusing to overwrite"
    fi
  fi
}

prompt_if_interactive
validate_host
validate_port

if [ -z "$BRIDGE_API_KEY" ]; then
  BRIDGE_API_KEY="$(generate_key)"
fi

validate_env_value BRIDGE_API_KEY "$BRIDGE_API_KEY"
validate_env_value COMMANDCODE_API_KEY "$COMMANDCODE_API_KEY"

[ "$(uname -s)" = "Linux" ] || fail "this installer targets Linux user systemd hosts"
[ "${EUID:-$(id -u)}" -ne 0 ] || fail "do not run this rootless installer with sudo/root"

require_command node
require_command npm
require_command systemctl
ensure_commandcode_auth

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js >= 20 is required; found $(node --version)"
fi

if [ ! -f "package.json" ] || ! grep -q '"name": "commandcode-bridge"' package.json; then
  fail "run this script from the commandcode-bridge source checkout or package root"
fi

if ! systemctl --user list-units >/dev/null 2>&1; then
  if [ "$NO_START" -eq 0 ]; then
    fail "user systemd is not reachable. Log in as the target user or run 'sudo loginctl enable-linger \"$USER\"', then retry. Use --no-start to install files only."
  fi
  log "user systemd is not reachable; --no-start will write files without daemon-reload/start."
fi

ensure_safe_install_dir
mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$CONFIG_DIR" "$USER_UNIT_DIR"
chmod 700 "$CONFIG_DIR"

log "Installing files into $INSTALL_DIR"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.vitest-tmp' \
    ./ "$INSTALL_DIR/"
else
  find "$INSTALL_DIR" -mindepth 1 ! -name '.commandcode-bridge-install' -exec rm -rf {} +
  tar --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.vitest-tmp' -cf - . | tar -xf - -C "$INSTALL_DIR"
fi
touch "$INSTALL_MARKER"

if [ -d "$INSTALL_DIR/src" ] && [ -f "$INSTALL_DIR/tsconfig.build.json" ]; then
  log "Installing npm dependencies and building from source"
  if [ -f "$INSTALL_DIR/package-lock.json" ]; then
    npm ci --prefix "$INSTALL_DIR"
  else
    npm install --prefix "$INSTALL_DIR"
  fi
  npm run build --prefix "$INSTALL_DIR"
  npm prune --omit=dev --prefix "$INSTALL_DIR"
elif [ -f "$INSTALL_DIR/dist/index.js" ]; then
  log "Installing runtime npm dependencies from packaged dist"
  if [ -f "$INSTALL_DIR/package-lock.json" ]; then
    npm ci --omit=dev --prefix "$INSTALL_DIR"
  else
    npm install --omit=dev --prefix "$INSTALL_DIR"
  fi
else
  fail "install source has neither src/ build inputs nor dist/ runtime files"
fi

chmod 755 "$INSTALL_DIR/dist/index.js" "$INSTALL_DIR/dist/router-index.js"
ln -sf "$INSTALL_DIR/dist/index.js" "$BIN_DIR/commandcode-bridge"
ln -sf "$INSTALL_DIR/dist/router-index.js" "$BIN_DIR/commandcode-router"

if [ -f "$ENV_FILE" ]; then
  backup="$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  cp "$ENV_FILE" "$backup"
  chmod 600 "$backup"
  log "Existing env file backed up to $backup"
fi

{
  write_env_line HOST "$HOST"
  write_env_line PORT "$PORT"
  write_env_line NODE_ENV production
  write_env_line COMMANDCODE_API_BASE https://api.commandcode.ai
  write_env_line COMMANDCODE_API_KEY "$COMMANDCODE_API_KEY"
  write_env_line COMMANDCODE_API_KEYS ""
  write_env_line COMMANDCODE_CREDENTIALS_FILE ""
  write_env_line COMMANDCODE_ROUTING_POLICY depletion_aware
  write_env_line COMMANDCODE_BILLING_REFRESH_MS 300000
  write_env_line COMMANDCODE_BILLING_TIMEOUT_MS 10000
  write_env_line COMMANDCODE_CREDENTIAL_COOLDOWN_MS 60000
  write_env_line COMMANDCODE_DEFAULT_MODEL deepseek/deepseek-v4-pro
  write_env_line COMMANDCODE_ALLOWED_MODELS "$DEFAULT_ALLOWED_MODELS"
  write_env_line COMMANDCODE_ALLOW_UNKNOWN_MODELS false
  write_env_line COMMANDCODE_CLI_VERSION 0.31.0
  write_env_line COMMANDCODE_TIMEOUT_MS 300000
  write_env_line COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY error_on_length
  write_env_line COMMANDCODE_BALANCE_ALERT_ENABLED false
  write_env_line COMMANDCODE_BALANCE_ALERT_MIN_CURRENT_BALANCE 1
  write_env_line COMMANDCODE_BALANCE_ALERT_MIN_EXPIRING_BALANCE 0
  write_env_line COMMANDCODE_BALANCE_ALERT_MAX_REQUIRED_DAILY_BURN 0
  write_env_line COMMANDCODE_BALANCE_ALERT_INTERVAL_MS 300000
  write_env_line COMMANDCODE_BALANCE_ALERT_REPEAT_MS 3600000
  write_env_line COMMANDCODE_BALANCE_ALERT_WEBHOOK_URL ""
  write_env_line COMMANDCODE_BALANCE_ALERT_WEBHOOK_BEARER ""
  write_env_line BRIDGE_API_KEY "$BRIDGE_API_KEY"
  write_env_line REQUEST_BODY_LIMIT_BYTES 1048576
  write_env_line RATE_LIMIT_MAX 60
  write_env_line RATE_LIMIT_WINDOW "1 minute"
  write_env_line LOG_LEVEL info
  write_env_line CORS_ORIGIN ""
  write_env_line INCLUDE_REASONING false
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

cat > "$SERVICE_FILE" <<'EOF'
[Unit]
Description=CommandCode Bridge - OpenAI-compatible API for CommandCode
After=default.target

[Service]
Type=simple
WorkingDirectory=%h/.local/share/commandcode-bridge
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

if systemctl --user list-units >/dev/null 2>&1; then
  systemctl --user daemon-reload
  if [ "$NO_START" -eq 0 ]; then
    systemctl --user enable --now commandcode-bridge
    systemctl --user status commandcode-bridge --no-pager || true
  else
    log "Skipping service start because --no-start was provided."
  fi
fi

cat <<EOF

Installed CommandCode Bridge.

  Service:      commandcode-bridge user systemd service
  Bind:         http://$HOST:$PORT
  OpenAI base:  http://$HOST:$PORT/v1
  Env file:     $ENV_FILE
  Install dir:  $INSTALL_DIR
  Binary:       $BIN_DIR/commandcode-bridge

Use:
  systemctl --user status commandcode-bridge --no-pager
  journalctl --user -u commandcode-bridge -f
  curl -fsS http://127.0.0.1:$PORT/health

If this machine should serve clients before login, run once:
  sudo loginctl enable-linger "$USER"
EOF
