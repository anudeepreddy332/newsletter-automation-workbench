#!/usr/bin/env bash
# Start the local demo after loading the WordPress token from
# .wordpress-demo-token and passing a read-only /me/sites preflight.
# Never prints the token. Do not enable bash xtrace.

set -euo pipefail
set +x

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3041}"
TOKEN_FILE="$ROOT/.wordpress-demo-token"

if [[ $# -ge 1 && "$1" != -* ]]; then
  WORDPRESS_SITE_ID="$1"
  shift
fi

if [[ -z "${WORDPRESS_SITE_ID:-}" ]]; then
  echo "Set WORDPRESS_SITE_ID or pass the WordPress.com test-site ID as the first argument." >&2
  echo "See docs/DEMO_RUN.md." >&2
  exit 1
fi

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing $TOKEN_FILE. Save the raw OAuth token there (no quotes) and chmod 600." >&2
  echo "See docs/DEMO_RUN.md." >&2
  exit 1
fi

WORDPRESS_ACCESS_TOKEN="$(cat "$TOKEN_FILE")"
WORDPRESS_ACCESS_TOKEN="${WORDPRESS_ACCESS_TOKEN%$'\r'}"

if [[ -z "$WORDPRESS_ACCESS_TOKEN" ]]; then
  echo "The token file is empty. It must contain only the raw OAuth access token." >&2
  exit 1
fi

if [[ "$WORDPRESS_ACCESS_TOKEN" == \"*\" || "$WORDPRESS_ACCESS_TOKEN" == \'*\' ]]; then
  echo "The token file must contain the raw token with no quotes." >&2
  exit 1
fi

if [[ -f "$ROOT/.env.local" ]] && grep -q '^WORDPRESS_ACCESS_TOKEN=' "$ROOT/.env.local"; then
  echo "Warning: .env.local contains WORDPRESS_ACCESS_TOKEN. Do not source that file." >&2
  echo "This script exports the token from .wordpress-demo-token instead." >&2
fi

export WORDPRESS_SITE_ID
export WORDPRESS_ACCESS_TOKEN

echo "SITE=$WORDPRESS_SITE_ID"
echo "TOKEN_LENGTH=${#WORDPRESS_ACCESS_TOKEN}"
printf '%s' "$WORDPRESS_ACCESS_TOKEN" | shasum -a 256 | cut -c1-12

if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $PORT is already in use. Stop the old project server or set PORT to another clean port." >&2
    exit 1
  fi
fi

set +e
HTTP_CODE="$(
  curl -sS \
    -o /dev/null \
    -w "%{http_code}" \
    "https://public-api.wordpress.com/rest/v1.1/me/sites" \
    -H "Authorization: Bearer ${WORDPRESS_ACCESS_TOKEN}"
)"
CURL_STATUS=$?
set -e

if [[ "$CURL_STATUS" -ne 0 ]]; then
  echo "Read-only WordPress preflight could not run (curl exit $CURL_STATUS). Not starting the demo." >&2
  exit 1
fi

echo "HTTP $HTTP_CODE"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Read-only WordPress preflight failed. Do not continue to live publishing. Not starting the demo." >&2
  exit 1
fi

exec npm run dev -- -p "$PORT"
