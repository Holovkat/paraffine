# PARAFFINE Executor Contract

## Purpose

The local PARAFFINE script is an executor.

It receives validated instructions from the PARAFFINE skill and performs AFFiNE operations safely and deterministically.

It is not the primary reasoning layer.

Primary entrypoint:

- `node scripts/paraffine-affine-inbox.js execute-action --payload-file <file>`
- `node scripts/paraffine-affine-inbox.js execute-action --payload '<json>'`
- `node scripts/paraffine-affine-inbox.js execute-action --payload-stdin`

## Executor Responsibilities

The executor may:

- create a note in `Inbox`
- append to an existing note
- update an existing note
- retrieve candidate notes for the skill
- apply a curation payload
- perform grouped moves or relinking
- create or use `Inbox/Quarantine` during curation

The executor must not:

- invent intent on its own
- decide the full user workflow from raw prompts
- behave like the assistant surface

## Payload Families

### Write Payload

Use for creating or updating working notes.

Required fields:

```json
{
  "mode": "write",
  "operation": "create|append|update",
  "title": "string",
  "body": "string",
  "target_doc_id": "optional",
  "target_location": "Inbox",
  "audit_note": "string"
}
```

Rules:

- default target location is `Inbox`
- write payloads do not assign final PARA residence
- write payloads do not quarantine

### Retrieve Payload

Use for note lookup.

Required fields:

```json
{
  "mode": "retrieve",
  "query": "string",
  "limit": 10,
  "audit_note": "string"
}
```

Rules:

- retrieval is read-first
- the result may be passed back into a later write payload

### Curation Payload

Use for background maintenance.

Required fields:

```json
{
  "mode": "curate",
  "operation": "place|group|quarantine|archive|discard|refine",
  "source_doc_ids": ["doc-id"],
  "target_para_home": "Projects|Areas|Resources|Archives|Quarantine",
  "grouping": {
    "pack_name": "optional",
    "members": ["doc-id"]
  },
  "audit_note": "string"
}
```

Rules:

- curation is the only mode allowed to decide PARA residence
- grouped notes must stay grouped when the payload says they belong together
- `Quarantine` is valid only in curation mode

## Validation Rules

The executor must reject payloads that:

- omit required fields
- attempt to assign PARA residence during write mode
- attempt quarantine during write mode
- reference unknown operations
- mix incompatible modes in one payload

## Batch Execution

The executor may accept either:

- one action object
- an array of action objects
- an envelope object with `actions`

Example:

```json
{
  "label": "daily-curation-pass",
  "audit_note": "Apply the skill-generated curation plan.",
  "actions": [
    {
      "mode": "curate",
      "operation": "group",
      "source_doc_ids": ["doc-a", "doc-b"],
      "target_para_home": "Resources",
      "grouping": {
        "pack_name": "PARA"
      },
      "audit_note": "Group the related reference notes."
    },
    {
      "mode": "curate",
      "operation": "quarantine",
      "source_doc_ids": ["doc-c"],
      "target_para_home": "Quarantine",
      "audit_note": "Conflicting material requires manual review."
    }
  ]
}
```

## Transport Assumption

Until proven otherwise during implementation, AFFiNE MCP remains the executor transport.

If a direct AFFiNE CLI or API path later proves cleaner, it must preserve this contract rather than changing the user-facing model.
