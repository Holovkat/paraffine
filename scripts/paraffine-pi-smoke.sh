#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT_DIR/scripts/paraffine-affine-inbox.js"
PI_RUN="$ROOT_DIR/scripts/paraffine-pi-run.sh"
BASE_PREFIX="${PARAFFINE_SMOKE_PREFIX:-T19-SMOKE}"
RUN_SUFFIX="${PARAFFINE_SMOKE_RUN_ID:-$(date +%s)}"
PREFIX="${BASE_PREFIX}-${RUN_SUFFIX}"
TMP_DIR="$(mktemp -d)"

pack_title_one="$PREFIX PARA Method In Detail"
pack_title_two="$PREFIX Projects Examples"
pack_title_three="$PREFIX Areas Examples"
quarantine_title="$PREFIX Conflict Candidate"

retry() {
  local attempts="$1"
  shift
  local try=1
  while true; do
    if run_with_timeout 180 "$@"; then
      return 0
    fi
    if [[ "$try" -ge "$attempts" ]]; then
      return 1
    fi
    try=$((try + 1))
    sleep 2
  done
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  python3 - "$timeout_seconds" "$@" <<'PY'
import subprocess
import sys

timeout_seconds = float(sys.argv[1])
command = sys.argv[2:]

completed = subprocess.run(command, timeout=timeout_seconds, check=False)
sys.exit(completed.returncode)
PY
}

cleanup() {
  echo
  echo "== Cleanup =="
  retry 3 node "$CLI" delete-notes --query "$PREFIX" --prefix "$PREFIX" || true
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

json_run() {
  local outfile="$1"
  shift
  retry 3 "$@" >"$outfile"
  cat "$outfile"
}

assert_grouping_and_quarantine() {
  node - "$1" "$PREFIX" <<'NODE'
const fs = require("fs");
const [structurePath, prefix] = process.argv.slice(2);
const structure = JSON.parse(fs.readFileSync(structurePath, "utf8"));
const nodes = structure.organizeNodes || [];

const findFolder = (name, parentId = null) =>
  nodes.find((node) => node.type === "folder" && String(node.data || "") === name && node.parentId === parentId);
const childrenOf = (parentId) =>
  nodes.filter((node) => node.parentId === parentId);

const inbox = findFolder("Inbox");
const resources = findFolder("Resources");
if (!inbox) throw new Error("Missing Inbox folder in structure.");
if (!resources) throw new Error("Missing Resources folder in structure.");

const quarantine = findFolder("Quarantine", inbox.id);
if (!quarantine) throw new Error("Missing Inbox/Quarantine folder.");

const paraPack = findFolder("PARA", resources.id);
if (!paraPack) throw new Error("Missing Resources/PARA pack folder.");

const groupedDocs = childrenOf(paraPack.id).filter((node) => node.type === "doc" && String(node.data || "").length > 0);
const quarantinedDocs = childrenOf(quarantine.id).filter((node) => node.type === "doc" && String(node.data || "").length > 0);

if (groupedDocs.length < 3) {
  throw new Error(`Expected at least 3 grouped smoke docs under Resources/PARA, found ${groupedDocs.length}.`);
}
if (quarantinedDocs.length < 3) {
  throw new Error(`Expected at least 3 quarantined smoke docs under Inbox/Quarantine, found ${quarantinedDocs.length}.`);
}

console.log(JSON.stringify({
  groupedDocs: groupedDocs.length,
  quarantinedDocs: quarantinedDocs.length,
  packFolderId: paraPack.id,
  quarantineFolderId: quarantine.id,
}, null, 2));
NODE
}

assert_retrieval() {
  node - "$1" <<'NODE'
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (payload.action !== "retrieved") throw new Error(`Unexpected retrieval action: ${payload.action}`);
if (!Array.isArray(payload.notes) || payload.notes.length < 3) {
  throw new Error(`Expected at least 3 retrieved notes, found ${payload.notes ? payload.notes.length : 0}.`);
}
console.log(JSON.stringify({ retrieved: payload.notes.length }, null, 2));
NODE
}

assert_cycle_packet() {
  node - "$1" <<'NODE'
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (payload.action !== "cycle-complete") throw new Error(`Unexpected cycle action: ${payload.action}`);
if (payload.deterministicFallback !== true) throw new Error("Expected deterministicFallback=true.");
if (!Array.isArray(payload.placements)) throw new Error("Missing placements array.");
if (!Array.isArray(payload.quarantined)) throw new Error("Missing quarantined array.");
console.log(JSON.stringify({
  action: payload.action,
  deterministicFallback: payload.deterministicFallback,
  placements: payload.placements.length,
  quarantined: payload.quarantined.length,
  processedInbox: payload.processedInbox,
}, null, 2));
NODE
}

echo "== Seed grouped pack fixture =="
echo "Smoke prefix: $PREFIX"
retry 3 node "$CLI" capture-note \
  --lightweight \
  --title "$pack_title_one" \
  --body "PARA method explainer. This note groups Projects Examples and Areas Examples into one reusable PARA reference pack." \
  --source "smoke-script" \
  --source-ref "t19-smoke:pack" \
  --domain-hint "software" \
  --kind-hint "resource"

retry 3 node "$CLI" capture-note \
  --lightweight \
  --title "$pack_title_two" \
  --body "Projects Examples note for the PARA method pack. This belongs with PARA Method In Detail." \
  --source "smoke-script" \
  --source-ref "t19-smoke:pack" \
  --domain-hint "software" \
  --kind-hint "resource"

retry 3 node "$CLI" capture-note \
  --lightweight \
  --title "$pack_title_three" \
  --body "Areas Examples note for the PARA method pack. This belongs with PARA Method In Detail." \
  --source "smoke-script" \
  --source-ref "t19-smoke:pack" \
  --domain-hint "software" \
  --kind-hint "resource"

echo
echo "== Seed quarantine fixture =="
for duplicate_ref in one two three; do
  retry 3 node "$CLI" capture-note \
    --lightweight \
    --allow-duplicate \
    --title "$quarantine_title" \
    --body "Conflicting smoke note variant $duplicate_ref. This contradicts the other conflict candidate versions and should be quarantined." \
    --source "smoke-script" \
    --source-ref "t19-smoke:duplicate-$duplicate_ref" \
    --domain-hint "software" \
    --kind-hint "resource"
done

echo
echo "== Pi runtime readiness =="
retry 3 "$PI_RUN" "/paraffine-status"

echo
echo "== Pi scoped maintenance cycle =="
json_run "$TMP_DIR/pi-cycle.json" "$PI_RUN" "/paraffine-cycle $PREFIX --limit 20"
assert_cycle_packet "$TMP_DIR/pi-cycle.json"

echo
echo "== Live structure assertions =="
json_run "$TMP_DIR/structure.json" node "$CLI" inspect-structure > /dev/null
assert_grouping_and_quarantine "$TMP_DIR/structure.json"

echo
echo "== Retrieval assertions =="
json_run "$TMP_DIR/retrieve.json" node "$CLI" retrieve-notes --query "$PREFIX" --limit 20 --statuses curated,canonical,refined,archived,discarded > /dev/null
assert_retrieval "$TMP_DIR/retrieve.json"

echo
echo "== Deterministic fallback verification =="
json_run "$TMP_DIR/fallback.json" node "$CLI" run-cycle --query "$PREFIX" --limit 20 > /dev/null
assert_cycle_packet "$TMP_DIR/fallback.json"
