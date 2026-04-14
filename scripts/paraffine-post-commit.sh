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
COMMIT_DATE="$(git -C "$TARGET_REPO" log -1 --pretty=%cI)"
COMMIT_SUBJECT="$(git -C "$TARGET_REPO" log -1 --pretty=%s)"
COMMIT_BODY="$(git -C "$TARGET_REPO" log -1 --pretty=%b)"
BRANCH_NAME="$(git -C "$TARGET_REPO" rev-parse --abbrev-ref HEAD)"
REPO_NAME="$(basename "$TARGET_REPO")"
export COMMIT_SHA COMMIT_DATE COMMIT_SUBJECT COMMIT_BODY BRANCH_NAME

BODY="$(python3 <<'PY'
import os
import re

commit_sha = os.environ["COMMIT_SHA"].strip()
commit_date = os.environ["COMMIT_DATE"].strip()
subject_raw = os.environ["COMMIT_SUBJECT"].strip()
body = os.environ.get("COMMIT_BODY", "").replace("\r", "").strip()
branch = os.environ["BRANCH_NAME"].strip()

prefix_re = re.compile(r"^[a-z]+(?:\([^)]+\))?!?:\s*", re.IGNORECASE)
subject = prefix_re.sub("", subject_raw).strip() or "Updated the project."
subject = subject[:1].upper() + subject[1:]
if subject[-1:] not in ".!?":
    subject += "."

def parse_sections(text: str):
    sections = {"changed": [], "why": [], "how": [], "validation": []}
    freeform = []
    current_key = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            current_key = None
            continue
        matched = False
        for key, labels in {
            "changed": ("paraffine-changed", "changed", "change", "title"),
            "why": ("why", "reason", "context"),
            "how": ("how", "implementation", "approach", "outcome", "result", "impact"),
            "validation": ("validated", "validation", "verified", "test", "tests", "testing"),
        }.items():
            for label in labels:
                prefix = f"{label}:"
                if line.lower().startswith(prefix):
                    value = line[len(prefix):].strip()
                    if value:
                        sections[key].append(value)
                    current_key = key
                    matched = True
                    break
            if matched:
                break
        if matched:
            continue
        if current_key:
            sections[current_key].append(line)
        else:
            freeform.append(line)

    paragraphs = []
    current = []
    for line in freeform:
        if line:
            current.append(line)
        elif current:
            paragraphs.append(" ".join(current).strip())
            current = []
    if current:
        paragraphs.append(" ".join(current).strip())

    if not sections["changed"] and paragraphs:
        sections["changed"].append(paragraphs[0])
    if not sections["why"] and len(paragraphs) > 1:
        sections["why"].append(paragraphs[1])
    if not sections["how"] and len(paragraphs) > 2:
        sections["how"].append(paragraphs[2])
    if not sections["validation"] and len(paragraphs) > 3:
        sections["validation"].append(paragraphs[3])
    return sections

def clean_markdown(text: str):
    value = str(text or "")
    value = re.sub(r"```[\s\S]*?```", " ", value)
    value = re.sub(r"`([^`]*)`", r"\1", value)
    value = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"^#{1,6}\s*", "", value, flags=re.MULTILINE)
    value = re.sub(r"^\s*[-*+]\s*", "", value, flags=re.MULTILINE)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()

sections = parse_sections(body)
changed = clean_markdown(" ".join(sections["changed"]).strip()) or subject
why = clean_markdown(" ".join(sections["why"]).strip())
how = clean_markdown(" ".join(sections["how"]).strip())
validation = clean_markdown(" ".join(sections["validation"]).strip())

narrative_parts = [part for part in (why, how, validation) if part]
narrative = " ".join(narrative_parts).strip()
if not narrative:
    narrative = clean_markdown(body) or changed

parts = [
    f"###### Changed: {changed}",
    "",
    f"- {commit_date}",
    f"- {narrative}",
    "",
    f"Commit `{commit_sha}` on `{branch}`.",
]

print("\n".join(parts))
PY
)"

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
