#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/Users/tonyholovka/workspace/PARA"
LOG_DIR="$HOME/.paraffine/logs"
LOCK_DIR="$HOME/.paraffine/locks/paraffine-hourly.lock"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

mkdir -p "$LOG_DIR" "$HOME/.paraffine/locks"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$STAMP] skip: PARAFFINE hourly run already in progress"
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

trap cleanup EXIT

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export PARAFFINE_ROOT="$ROOT_DIR"
export PARAFFINE_MODEL="${PARAFFINE_MODEL:-ollama/gemma4:31b-cloud}"

echo "[$STAMP] start: PARAFFINE hourly curation"
cd "$ROOT_DIR"
bash "$ROOT_DIR/scripts/paraffine-pi-run.sh" "/paraffine run scheduled inbox curation. inspect current inbox material, preserve related packs, decide para residence, quarantine only when ambiguous, and apply the resulting curation payloads through the executor."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] done: PARAFFINE hourly curation"
