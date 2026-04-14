#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_EXTENSIONS_DIR="${PI_EXTENSIONS_DIR:-/Users/tonyholovka/workspace/pi-extensions}"
PARAFFINE_ROOT="${PARAFFINE_ROOT:-$ROOT_DIR}"
PARAFFINE_MODEL="${PARAFFINE_MODEL:-ollama/gemma4:31b-cloud}"

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/paraffine-pi-run.sh \"/paraffine-status\"" >&2
  exit 1
fi

COMMAND_TEXT="$1"
shift || true

export PARAFFINE_ROOT

exec pi -p \
  -e "$PI_EXTENSIONS_DIR/extensions/ollama-provider.ts" \
  -e "$PI_EXTENSIONS_DIR/extensions/paraffine.ts" \
  --model "$PARAFFINE_MODEL" \
  "$COMMAND_TEXT" \
  "$@"
