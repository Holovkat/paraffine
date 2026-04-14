#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT_DIR/scripts/paraffine-affine-inbox.js"
PI_RUN="$ROOT_DIR/scripts/paraffine-pi-run.sh"
BASE_PREFIX="${PARAFFINE_SMOKE_PREFIX:-PARAFFINE-SMOKE}"
RUN_SUFFIX="${PARAFFINE_SMOKE_RUN_ID:-$(date +%s)}"
PREFIX="${BASE_PREFIX}-${RUN_SUFFIX}"
TMP_DIR="$(mktemp -d)"

pack_title_one="$PREFIX PARA Method In Detail"
pack_title_two="$PREFIX Projects Examples"
pack_title_three="$PREFIX Areas Examples"
quarantine_title="$PREFIX Conflict Candidate"

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

json_run() {
  local outfile="$1"
  shift
  run_with_timeout 180 "$@" >"$outfile"
  cat "$outfile"
}

cleanup() {
  node "$CLI" delete-notes --query "$PREFIX" --prefix "$PREFIX" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

read_doc_ids() {
  node - "$1" <<'NODE'
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const results = Array.isArray(payload.results) ? payload.results : [];
const ids = results.map((item) => item?.doc?.docId).filter(Boolean);
if (ids.length < 3) {
  throw new Error(`Expected at least 3 created docs, found ${ids.length}.`);
}
console.log(ids.join("\n"));
NODE
}

read_quarantine_doc_id() {
  node - "$1" <<'NODE'
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const docId = payload?.doc?.docId;
if (!docId) throw new Error("Missing created quarantine doc id.");
console.log(docId);
NODE
}

assert_batch_write() {
  node - "$1" <<'NODE'
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (payload.action !== "batch-executed") throw new Error(`Unexpected action: ${payload.action}`);
if (!Array.isArray(payload.results) || payload.results.length < 3) {
  throw new Error(`Expected at least 3 write results, found ${payload.results ? payload.results.length : 0}.`);
}
console.log(JSON.stringify({ action: payload.action, count: payload.results.length }, null, 2));
NODE
}

assert_retrieve() {
  node - "$1" <<'NODE'
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (payload.action !== "retrieved") throw new Error(`Unexpected action: ${payload.action}`);
if (!Array.isArray(payload.notes) || payload.notes.length < 3) {
  throw new Error(`Expected at least 3 retrieved notes, found ${payload.notes ? payload.notes.length : 0}.`);
}
console.log(JSON.stringify({ action: payload.action, count: payload.notes.length }, null, 2));
NODE
}

assert_grouping() {
  node - "$1" "$PREFIX" <<'NODE'
const fs = require("fs");
const [structurePath, prefix] = process.argv.slice(2);
const structure = JSON.parse(fs.readFileSync(structurePath, "utf8"));
const nodes = structure.organizeNodes || [];
const findFolder = (name, parentId = null) =>
  nodes.find((node) => node.type === "folder" && String(node.data || "") === name && node.parentId === parentId);
const docsIn = (parentId) =>
  nodes.filter((node) => node.type === "doc" && node.parentId === parentId).map((node) => node.data);

const resources = findFolder("Resources");
if (!resources) throw new Error("Missing Resources folder.");
const para = findFolder("PARA", resources.id);
if (!para) throw new Error("Missing Resources/PARA pack.");
const grouped = docsIn(para.id);
if (grouped.length < 3) throw new Error(`Expected at least 3 grouped docs, found ${grouped.length}.`);
console.log(JSON.stringify({ grouped: grouped.length, pack: para.id, prefix }, null, 2));
NODE
}

assert_quarantine() {
  node - "$1" <<'NODE'
const fs = require("fs");
const structure = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const nodes = structure.organizeNodes || [];
const findFolder = (name, parentId = null) =>
  nodes.find((node) => node.type === "folder" && String(node.data || "") === name && node.parentId === parentId);
const docsIn = (parentId) =>
  nodes.filter((node) => node.type === "doc" && node.parentId === parentId).map((node) => node.data);

const inbox = findFolder("Inbox");
if (!inbox) throw new Error("Missing Inbox folder.");
const quarantine = findFolder("Quarantine", inbox.id);
if (!quarantine) throw new Error("Missing Inbox/Quarantine folder.");
const quarantined = docsIn(quarantine.id);
if (quarantined.length < 1) throw new Error("Expected at least 1 quarantined doc.");
console.log(JSON.stringify({ quarantined: quarantined.length, folder: quarantine.id }, null, 2));
NODE
}

echo "== Pi runtime readiness =="
run_with_timeout 180 "$PI_RUN" "/paraffine-status"

echo
echo "== Seed working notes through executor =="
cat >"$TMP_DIR/write-pack.json" <<JSON
{
  "label": "paraffine-smoke-pack",
  "actions": [
    {
      "mode": "write",
      "operation": "create",
      "title": "$pack_title_one",
      "body": "PARA method explainer. This note groups Projects Examples and Areas Examples into one reusable PARA reference pack.",
      "audit_note": "Create grouped smoke note one.",
      "source": "smoke-script",
      "source_ref": "smoke-pack-1",
      "domain_hint": "software",
      "kind_hint": "resource"
    },
    {
      "mode": "write",
      "operation": "create",
      "title": "$pack_title_two",
      "body": "Projects Examples note for the PARA method pack. This belongs with PARA Method In Detail.",
      "audit_note": "Create grouped smoke note two.",
      "source": "smoke-script",
      "source_ref": "smoke-pack-2",
      "domain_hint": "software",
      "kind_hint": "resource"
    },
    {
      "mode": "write",
      "operation": "create",
      "title": "$pack_title_three",
      "body": "Areas Examples note for the PARA method pack. This belongs with PARA Method In Detail.",
      "audit_note": "Create grouped smoke note three.",
      "source": "smoke-script",
      "source_ref": "smoke-pack-3",
      "domain_hint": "software",
      "kind_hint": "resource"
    }
  ]
}
JSON
json_run "$TMP_DIR/write-pack-result.json" node "$CLI" execute-action --payload-file "$TMP_DIR/write-pack.json" >/dev/null
assert_batch_write "$TMP_DIR/write-pack-result.json"
mapfile -t PACK_DOC_IDS < <(read_doc_ids "$TMP_DIR/write-pack-result.json")

echo
echo "== Retrieval through executor =="
cat >"$TMP_DIR/retrieve.json" <<JSON
{
  "mode": "retrieve",
  "query": "$PREFIX",
  "limit": 10,
  "audit_note": "Retrieve smoke notes."
}
JSON
json_run "$TMP_DIR/retrieve-result.json" node "$CLI" execute-action --payload-file "$TMP_DIR/retrieve.json" >/dev/null
assert_retrieve "$TMP_DIR/retrieve-result.json"

echo
echo "== Group curated pack =="
node - "$TMP_DIR/group.json" "${PACK_DOC_IDS[@]}" <<'NODE'
const fs = require("fs");
const [outFile, ...docIds] = process.argv.slice(2);
const payload = {
  mode: "curate",
  operation: "group",
  source_doc_ids: docIds,
  target_para_home: "Resources",
  grouping: { pack_name: "PARA" },
  audit_note: "Group the related PARA smoke notes."
};
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
NODE
json_run "$TMP_DIR/group-result.json" node "$CLI" execute-action --payload-file "$TMP_DIR/group.json" >/dev/null

echo
echo "== Create and quarantine ambiguous note =="
cat >"$TMP_DIR/quarantine-write.json" <<JSON
{
  "mode": "write",
  "operation": "create",
  "title": "$quarantine_title",
  "body": "Conflicting smoke note. This should be routed into Inbox Quarantine during curation.",
  "audit_note": "Create quarantined smoke note.",
  "source": "smoke-script",
  "source_ref": "smoke-quarantine",
  "domain_hint": "software",
  "kind_hint": "resource"
}
JSON
json_run "$TMP_DIR/quarantine-write-result.json" node "$CLI" execute-action --payload-file "$TMP_DIR/quarantine-write.json" >/dev/null
QUARANTINE_DOC_ID="$(read_quarantine_doc_id "$TMP_DIR/quarantine-write-result.json")"
cat >"$TMP_DIR/quarantine.json" <<JSON
{
  "mode": "curate",
  "operation": "quarantine",
  "source_doc_ids": ["$QUARANTINE_DOC_ID"],
  "target_para_home": "Quarantine",
  "audit_note": "Quarantine the conflicting smoke note."
}
JSON
json_run "$TMP_DIR/quarantine-result.json" node "$CLI" execute-action --payload-file "$TMP_DIR/quarantine.json" >/dev/null

echo
echo "== Live structure assertions =="
json_run "$TMP_DIR/structure.json" node "$CLI" inspect-structure >/dev/null
assert_grouping "$TMP_DIR/structure.json"
assert_quarantine "$TMP_DIR/structure.json"

echo
echo "== Smoke complete =="
