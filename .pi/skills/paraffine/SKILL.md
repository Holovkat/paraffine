---
name: paraffine
description: Use this skill for PARAFFINE note writing, retrieval, and background curation over the AFFiNE-backed executor.
---

# PARAFFINE

Use this skill whenever the user wants to:

- write a new working note
- update an existing note
- retrieve knowledge from the PARAFFINE corpus
- run PARAFFINE background curation
- process commit-derived change notes

## Commit Notes

When this skill is committing work in any repo that uses the PARAFFINE post-commit hook, it must provide the note content explicitly in the commit body instead of expecting the hook to infer it.

Use this structure in the commit body:

```text
Changed: Short human-readable change title
Why: Why the change was needed
How: How the change was implemented
Validated: How the change was checked
```

Rules:

- keep each field short and human-readable
- do not list changed files
- do not rely on GitHub issue or PR text as the primary note source
- treat the hook as a formatter and delivery path, not the reasoning layer

## Operating Model

PARAFFINE has one assistant surface.

The control chain is:

`CLI or Pi -> PARAFFINE skill -> PARAFFINE executor -> AFFiNE`

Responsibilities:

- this skill owns intent interpretation
- the executor script owns validated AFFiNE operations
- note-taking writes to `Inbox`
- retrieval searches the PARAFFINE corpus
- only curation decides PARA residence
- `Inbox/Quarantine` belongs only to curation

## Executor

Use the local executor at:

`/Users/tonyholovka/workspace/PARA/scripts/paraffine-affine-inbox.js`

Primary command:

```bash
node /Users/tonyholovka/workspace/PARA/scripts/paraffine-affine-inbox.js execute-action --payload-stdin
```

The executor accepts:

- one JSON action
- an array of JSON actions
- an envelope with `actions`

## Modes

### Write

Use write mode when the user wants to take a note or update a working note.

Rules:

- create new notes in `Inbox`
- update existing notes only when the target is clear
- do not assign final PARA residence
- do not quarantine

Example payload:

```json
{
  "mode": "write",
  "operation": "create",
  "title": "Working note title",
  "body": "The note body goes here.",
  "audit_note": "Created from PARAFFINE skill.",
  "source": "skill",
  "source_ref": "paraffine",
  "domain_hint": "shared",
  "kind_hint": "resource"
}
```

### Retrieve

Use retrieve mode when the user wants to find existing knowledge or identify a note to update.

Rules:

- search first when update targets are unclear
- return the strongest matching notes
- do not change note placement during retrieval

Example payload:

```json
{
  "mode": "retrieve",
  "query": "PARA method",
  "limit": 5,
  "audit_note": "Retrieve notes for the current request."
}
```

### Curate

Use curate mode only for background maintenance.

Rules:

- decide PARA residence here, not in write mode
- group related notes when needed
- quarantine conflicting or ambiguous notes when needed
- use batch execution when applying multiple curation actions

## Working Style

- keep outputs concise
- prefer deterministic executor actions over vague instructions
- if note intent is unclear, retrieve first
- if permanent residence is unclear, keep the note in `Inbox`
- if curation cannot resolve a safe home, quarantine it during curation only
