#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT_DIR/scripts/paraffine-affine-inbox.js"
PI_RUN="$ROOT_DIR/scripts/paraffine-pi-run.sh"
PREFIX="${PARAFFINE_SMOKE_PREFIX:-T19-SMOKE}"

title_one="$PREFIX Resource Candidate"
title_two="$PREFIX Archive Candidate"

retry() {
  local attempts="$1"
  shift
  local try=1
  while true; do
    if "$@"; then
      return 0
    fi
    if [[ "$try" -ge "$attempts" ]]; then
      return 1
    fi
    try=$((try + 1))
    sleep 2
  done
}

cleanup() {
  echo
  echo "== Cleanup =="
  retry 3 node "$CLI" delete-notes --query "$PREFIX" --prefix "$PREFIX" || true
}

trap cleanup EXIT

echo "== Seed smoke notes =="
retry 3 node "$CLI" capture-note \
  --title "$title_one" \
  --body "PARAFFINE runtime contract smoke note. Stable knowledge about Pi launch and CLI ownership." \
  --source "smoke-script" \
  --source-ref "t19-smoke:resource" \
  --domain-hint "software" \
  --kind-hint "resource"

retry 3 node "$CLI" capture-note \
  --title "$title_two" \
  --body "Old archive-style smoke note. Obsolete duplicate archive material for deterministic review." \
  --source "smoke-script" \
  --source-ref "t19-smoke:archive" \
  --domain-hint "software" \
  --kind-hint "archive"

echo
echo "== Pi runtime readiness =="
retry 3 "$PI_RUN" "/paraffine-status"

echo
echo "== Pi scoped maintenance cycle =="
retry 3 "$PI_RUN" "/paraffine-cycle $PREFIX --limit 10"

echo
echo "== Pi scoped retrieval =="
retry 3 "$PI_RUN" "/paraffine-retrieve $PREFIX --limit 10 --statuses curated,canonical,refined,archived,discarded"

echo
echo "== Deterministic fallback verification =="
retry 3 node "$CLI" run-cycle --query "$PREFIX" --limit 10
