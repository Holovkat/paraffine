#!/usr/bin/env bash
set -euo pipefail

PARAFFINE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$HOME/.pi/skills" "$HOME/.codex/skills" "$HOME/.githooks"

if [[ -L "$HOME/.agents/skills" || -d "$HOME/.agents/skills" ]]; then
  ln -sfn "$PARAFFINE_ROOT/.pi/skills/paraffine" "$HOME/.agents/skills/paraffine"
fi

ln -sfn "$PARAFFINE_ROOT/.pi/skills/paraffine" "$HOME/.pi/skills/paraffine"
ln -sfn "$PARAFFINE_ROOT/.pi/skills/paraffine" "$HOME/.codex/skills/paraffine"

cat > "$HOME/.githooks/post-commit" <<EOF
#!/usr/bin/env bash
set -euo pipefail
PARAFFINE_ROOT="$PARAFFINE_ROOT"
export PARAFFINE_ROOT
"\$PARAFFINE_ROOT/scripts/paraffine-post-commit.sh" "\$(git rev-parse --show-toplevel)"
EOF

chmod +x "$HOME/.githooks/post-commit"
git config --global core.hooksPath "$HOME/.githooks"

echo "Installed PARAFFINE global skill links."
echo "Installed PARAFFINE global post-commit hook."
echo "Global hooks path: $(git config --global --get core.hooksPath)"
