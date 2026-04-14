#!/usr/bin/env bash
set -euo pipefail

PARAFFINE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_REPO="${1:-$PARAFFINE_ROOT}"
HOOKS_DIR="$TARGET_REPO/.githooks"
HOOK_PATH="$HOOKS_DIR/post-commit"

mkdir -p "$HOOKS_DIR"

cat >"$HOOK_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
PARAFFINE_ROOT="$PARAFFINE_ROOT" "$PARAFFINE_ROOT/scripts/paraffine-post-commit.sh" "$TARGET_REPO"
EOF

chmod +x "$HOOK_PATH"
git -C "$TARGET_REPO" config core.hooksPath .githooks

echo "Configured core.hooksPath=.githooks for $TARGET_REPO"
echo "Installed PARAFFINE post-commit hook at $HOOK_PATH"
