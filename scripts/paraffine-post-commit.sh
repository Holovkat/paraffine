#!/usr/bin/env bash
set -euo pipefail

PARAFFINE_ROOT="${PARAFFINE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TARGET_REPO="${1:-$PWD}"
CLI="$PARAFFINE_ROOT/scripts/paraffine-affine-inbox.js"

if [[ ! -f "$CLI" ]]; then
  echo "PARAFFINE post-commit: executor not found at $CLI" >&2
  exit 0
fi

if ! git -C "$TARGET_REPO" rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "PARAFFINE post-commit: no commit available yet" >&2
  exit 0
fi

COMMIT_SHA="$(git -C "$TARGET_REPO" rev-parse --short HEAD)"
COMMIT_SUBJECT="$(git -C "$TARGET_REPO" log -1 --pretty=%s)"
BRANCH_NAME="$(git -C "$TARGET_REPO" rev-parse --abbrev-ref HEAD)"
REPO_NAME="$(basename "$TARGET_REPO")"
CHANGED_FILES="$(git -C "$TARGET_REPO" diff-tree --no-commit-id --name-only -r HEAD | head -n 20)"

BODY=$(cat <<EOF
Commit: $COMMIT_SHA
Branch: $BRANCH_NAME
Summary: $COMMIT_SUBJECT

Changed files:
${CHANGED_FILES:-"(none)"}
EOF
)

PAYLOAD=$(cat <<EOF
{
  "mode": "write",
  "operation": "create",
  "title": "${REPO_NAME} Change Log",
  "body": $(printf '%s' "$BODY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "audit_note": "Post-commit automatic update.",
  "source": "git-hook",
  "source_ref": "$COMMIT_SHA",
  "domain_hint": "software",
  "kind_hint": "resource"
}
EOF
)

if [[ "${1:-}" == "--dry-run" || "${PARAFFINE_COMMIT_HOOK_DRY_RUN:-0}" == "1" ]]; then
  printf '%s\n' "$PAYLOAD"
  exit 0
fi

if ! printf '%s\n' "$PAYLOAD" | node "$CLI" execute-action --payload-stdin >/dev/null; then
  echo "PARAFFINE post-commit: failed to write automatic update note" >&2
fi
