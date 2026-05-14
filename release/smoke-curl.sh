#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BRIDGE_BASE_URL:-http://127.0.0.1:9992}}"
export BRIDGE_BASE_URL="$BASE_URL"
ACCEPT_UPSTREAM_ERRORS="${SMOKE_ACCEPT_UPSTREAM_ERRORS:-0}"
export SMOKE_ACCEPT_UPSTREAM_ERRORS="$ACCEPT_UPSTREAM_ERRORS"

python3 - <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

base_url = os.environ.get('BRIDGE_BASE_URL', 'http://127.0.0.1:9992')
accept_upstream_errors = os.environ.get('SMOKE_ACCEPT_UPSTREAM_ERRORS') == '1'
bridge_api_key = os.environ.get('BRIDGE_API_KEY')
expected = 'COMMANDCODE_BRIDGE_SMOKE_OK'


def request_json(method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    if bridge_api_key:
        headers['Authorization'] = f'Bearer {bridge_api_key}'
    req = urllib.request.Request(base_url + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            text = response.read().decode()
            return response.status, text
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()

health_status, health_body = request_json('GET', '/health')
print('HEALTH', health_status)
print(health_body)
if health_status != 200:
    sys.exit(1)

chat_status, chat_body = request_json('POST', '/v1/chat/completions', {
    'model': 'default',
    'messages': [{'role': 'user', 'content': f'Reply exactly: {expected}'}],
    # CommandCode reasoning models can spend hidden tokens before visible text.
    # Keep this high enough that smoke does not fail with an empty length response.
    'max_tokens': 128,
    'temperature': 0,
})
print('CHAT', chat_status)
print(chat_body)

if chat_status == 200 and expected in chat_body:
    print('SMOKE_CONTENT_OK')
    sys.exit(0)

try:
    parsed = json.loads(chat_body)
except json.JSONDecodeError:
    parsed = {}
error = parsed.get('error') if isinstance(parsed, dict) else None
code = error.get('code') if isinstance(error, dict) else None
if accept_upstream_errors and chat_status == 502 and code in {'commandcode_event_error', 'commandcode_empty_response', 'commandcode_empty_visible_response'}:
    print(f'SMOKE_UPSTREAM_FAILURE_SURFACED_OK code={code}')
    sys.exit(0)

if accept_upstream_errors:
    print('Smoke failed: expected content success or explicit upstream failure.', file=sys.stderr)
else:
    print('Smoke failed: expected content success. Set SMOKE_ACCEPT_UPSTREAM_ERRORS=1 to accept explicit upstream account/stream failures for routing-only smoke.', file=sys.stderr)
sys.exit(1)
PY
