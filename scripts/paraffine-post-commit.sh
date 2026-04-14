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
COMMIT_BODY="$(git -C "$TARGET_REPO" log -1 --pretty=%b)"
BRANCH_NAME="$(git -C "$TARGET_REPO" rev-parse --abbrev-ref HEAD)"
REPO_NAME="$(basename "$TARGET_REPO")"
export COMMIT_SHA COMMIT_SUBJECT COMMIT_BODY BRANCH_NAME

BODY="$(python3 <<'PY'
import os
import re

commit_sha = os.environ["COMMIT_SHA"].strip()
subject_raw = os.environ["COMMIT_SUBJECT"].strip()
body = os.environ.get("COMMIT_BODY", "").replace("\r", "").strip()
branch = os.environ["BRANCH_NAME"].strip()

prefix_re = re.compile(r"^[a-z]+(?:\([^)]+\))?!?:\s*", re.IGNORECASE)
type_match = re.match(r"^([a-z]+)(?:\([^)]+\))?!?:", subject_raw, re.IGNORECASE)
commit_type = type_match.group(1).lower() if type_match else ""
subject = prefix_re.sub("", subject_raw).strip() or "Updated the project."
subject = subject[:1].upper() + subject[1:]
if subject[-1:] not in ".!?":
    subject += "."

def parse_sections(text: str):
    sections = {"why": [], "outcome": [], "validation": []}
    freeform = []
    current_key = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            current_key = None
            continue
        matched = False
        for key, labels in {
            "why": ("why", "reason", "context"),
            "outcome": ("outcome", "result", "impact"),
            "validation": ("validation", "validated", "verified", "test", "tests", "testing"),
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

    if not sections["why"] and paragraphs:
        sections["why"].append(paragraphs[0])
    if not sections["outcome"] and len(paragraphs) > 1:
        sections["outcome"].append(paragraphs[1])
    if not sections["validation"] and len(paragraphs) > 2:
        sections["validation"].append(paragraphs[2])
    return sections

sections = parse_sections(body)

default_why = {
    "fix": "This change addresses a specific problem in the current workflow.",
    "feat": "This change adds requested capability to the current workflow.",
    "docs": "This change makes the operating guidance clearer and easier to follow.",
    "refactor": "This change improves the implementation shape without changing the intended outcome.",
    "chore": "This change keeps the project setup and maintenance flow in good order.",
}.get(commit_type, "The commit message did not include extra rationale.")

default_outcome = {
    "fix": "The affected workflow should now behave more reliably.",
    "feat": "The new behavior is now available for normal use.",
    "docs": "The updated guidance is now available for future setup and day-to-day use.",
    "refactor": "The implementation is now cleaner to maintain and easier to build on.",
    "chore": "The project maintenance state is now cleaner and more consistent.",
}.get(commit_type, "The change has been committed and is ready for the next normal follow-up step.")

why = " ".join(sections["why"]).strip() or default_why
outcome = " ".join(sections["outcome"]).strip() or default_outcome
validation = " ".join(sections["validation"]).strip() or "Validation details were not recorded in the commit message."

parts = [
    f"Commit: {commit_sha}",
    f"Branch: {branch}",
    "",
    "## What Changed",
    "",
    subject,
    "",
    "## Why",
    "",
    why,
    "",
    "## Outcome",
    "",
    outcome,
    "",
    "## Validation",
    "",
    validation,
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
