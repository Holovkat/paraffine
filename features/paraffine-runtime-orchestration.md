# PARAFFINE Runtime And Orchestration

## Purpose

This note defines the runnable surface for agent retrieval and scheduled PARAFFINE maintenance.

The MVP keeps orchestration outside AFFiNE itself:

- AFFiNE remains the durable note store
- `scripts/paraffine-affine-inbox.js` is the operational CLI surface
- Pi or cron are responsible for triggering that CLI on a schedule

## Supported Commands

### Retrieval

Use the retrieval surface when agents need curated knowledge without traversing the full AFFiNE workspace.

```bash
node scripts/paraffine-affine-inbox.js retrieve-notes --query "billing" --limit 10
```

Defaults:

- statuses: `curated,canonical,refined`
- sorted to prefer `canonical`, then `curated`, then `refined`

Returned fields:

- `docId`
- `title`
- `status`
- `kind`
- `domain`
- `summary`
- `confidence` and `confidence_band`
- `relevance` and `relevance_band`
- `freshness` and `freshness_band`
- `retained_reason`
- `canonical_ref`
- `source_ref`

### Scheduled Cycle

Use the cycle command for recurring maintenance runs.

```bash
node scripts/paraffine-affine-inbox.js run-cycle --query "fms-glm" --limit 10
```

The cycle performs three steps:

1. Curate any matching notes still linked to `Inbox`
2. Review matching notes in `curated`, `refined`, `canonical`, or `archived`
3. Return the current retrieval payload for matching notes

Defaults:

- review statuses: `curated,refined,canonical,archived`
- retrieval statuses: `curated,canonical,refined`
- deterministic fallback: always on

## Pi Integration

Pi should treat PARAFFINE as a CLI-backed extension boundary.

Expected pattern:

1. Pi resolves runtime config and AFFiNE credentials
2. Pi invokes the PARAFFINE CLI with a scoped query or workflow target
3. Pi reads the JSON result and decides whether to open follow-up work

Recommended Pi responsibilities:

- choose the scoped query for the current project or domain
- invoke `run-cycle`
- consume the returned retrieval payload
- surface failures as inbox tasks instead of silent drops

## Cron Integration

Cron should call the same CLI directly.

Example cadence:

- hourly or several-times-daily:
  - `run-cycle` for the active project scope
- daily:
  - `review-queue` with a broader query or no query
- on-demand:
  - `retrieve-notes` for agent lookup

Example cron command:

```bash
cd /Users/tonyholovka/workspace/PARA && node scripts/paraffine-affine-inbox.js run-cycle --limit 10
```

## Runtime Prerequisites

Required:

- `AFFINE_BASE_URL`
- `AFFINE_API_TOKEN`
- `AFFINE_WORKSPACE_ID`
- local write-capable `affine-mcp-server`

Workspace requirements:

- writable `PARA` doc root
- `Inbox` organize folder
- `Projects`, `Areas`, `Resources`, and `Archives` organize folders

## Failure Handling

The runtime must fail clearly in the following cases:

- AFFiNE environment variables missing
- local `affine-mcp-server` unavailable
- writable `PARA` or `Inbox` surfaces missing
- note missing required capture fields
- AFFiNE write failure during curation, refinement, or review

Deterministic fallback rules:

- refinement does not depend on AI to complete
- review does not depend on AI to archive or discard
- retrieval works from stored note state only

If an AI-assisted layer is added later, it must not change the output contract of these commands.
