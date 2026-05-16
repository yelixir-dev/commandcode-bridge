#!/usr/bin/env bash
set -euo pipefail

APP_NAME="commandcode-bridge"
INSTALL_DIR="$HOME/.local/share/commandcode-bridge"
BIN_DIR="$HOME/.local/bin"
CONFIG_DIR="$HOME/.config/commandcode-bridge"
ENV_FILE="$CONFIG_DIR/env"
USER_UNIT_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$USER_UNIT_DIR/commandcode-bridge.service"
REMOVE_CONFIG=0
ASSUME_YES=0

usage() {
  cat <<'USAGE'
CommandCode Bridge rootless Linux uninstaller.

Usage:
  ./uninstall.sh [options]

Options:
  --purge-config    Also remove ~/.config/commandcode-bridge/env and config dir.
                    By default credentials and env files are preserved.
  --yes             Non-interactive; do not prompt
  -h, --help        Show this help
USAGE
}

log() { printf '[%s] %s\n' "$APP_NAME" "$*"; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --purge-config)
      REMOVE_CONFIG=1
      shift
      ;;
    --yes|-y)
      ASSUME_YES=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf '[%s] ERROR: unknown option: %s\n' "$APP_NAME" "$1" >&2
      exit 1
      ;;
  esac
done

confirm() {
  [ "$ASSUME_YES" -eq 0 ] || return 0
  [ -t 0 ] || return 0

  printf 'Uninstall CommandCode Bridge user service and installed files? [y/N]: '
  read -r answer || true
  case "${answer:-}" in
    y|Y|yes|YES) ;;
    *) log "Aborted."; exit 0 ;;
  esac
}

confirm

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now commandcode-bridge >/dev/null 2>&1 || true
else
  log "systemctl not found; removing files only."
fi

rm -f "$SERVICE_FILE"
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload >/dev/null 2>&1 || true
  systemctl --user reset-failed commandcode-bridge >/dev/null 2>&1 || true
fi

rm -f "$BIN_DIR/commandcode-bridge" "$BIN_DIR/commandcode-router"
rm -rf "$INSTALL_DIR"

if [ "$REMOVE_CONFIG" -eq 1 ]; then
  rm -rf "$CONFIG_DIR"
  log "Removed config directory: $CONFIG_DIR"
else
  log "Preserved config and credentials: $ENV_FILE"
  log "Run './uninstall.sh --purge-config' to remove them too."
fi

cat <<EOF

Uninstalled CommandCode Bridge service and installed files.

Removed:
  $SERVICE_FILE
  $BIN_DIR/commandcode-bridge
  $BIN_DIR/commandcode-router
  $INSTALL_DIR

Config preserved by default:
  $ENV_FILE
EOF
