# PARAFFINE Note Format Review

This file exists so the note shape can be reviewed before the AFFiNE writer is adjusted again.

## Current Generated Shape

This reflects the structure currently written by `scripts/paraffine-affine-inbox.js` after curation.

```md
# Inbox Capture
- status: inbox
- captured_at: 2026-04-13T01:38:38Z
- source: agent-cli
- source_ref: smoke-curate-1
- domain_hint: software
- kind_hint: project

## Raw Capture

Implement the PARAFFINE curation workflow for active project notes. This is current sprint work and should be delivered next.

## Capture Updates

Expanded the scoring rules after testing the first curation pass.

## Curation
- status: curated
- kind: project
- domain: software
- summary: Implement the PARAFFINE curation workflow for active project notes. This is current sprint work and should be delivered next.
- confidence: 65
- confidence_band: medium
- complexity: 27
- complexity_band: low
- relevance: 98
- relevance_band: high
- duplication: 18
- duplication_band: low
- freshness: 90
- freshness_band: high
- review_due_at: 2026-04-20T01:39:24Z
- last_reviewed_at: 2026-04-13T01:39:24Z
- retained_reason: Retained as curated material.
- discard_reason:
- canonical_ref:
- refined_at:
- archived_at:
- discarded_at:

## Audit Trail

### 2026-04-13T01:39:24Z

- action: curated
- status: curated
- kind: project
- domain: software
- confidence: 65 (medium)
- complexity: 27 (low)
- relevance: 98 (high)
- duplication: 18 (low)
- freshness: 90 (high)
- retained_reason: Retained as curated material.
- discard_reason:
- canonical_ref:
```

## Proposed Review Shape

This is a cleaner baseline for discussion. It preserves the same data, but separates human-facing content from machine-facing metadata more clearly.

```md
# PARAFFINE Curation Workflow

## Summary

Implement the PARAFFINE curation workflow for active project notes. This is current sprint work and should be delivered next.

## Placement

- status: curated
- kind: project
- domain: software
- canonical_ref:

## Scores

| Dimension | Score | Band |
|-----------|-------|------|
| confidence | 65 | medium |
| complexity | 27 | low |
| relevance | 98 | high |
| duplication | 18 | low |
| freshness | 90 | high |

## Review

- captured_at: 2026-04-13T01:38:38Z
- last_reviewed_at: 2026-04-13T01:39:24Z
- review_due_at: 2026-04-20T01:39:24Z
- retained_reason: Retained as curated material.
- discard_reason:

## Source

- source: agent-cli
- source_ref: smoke-curate-1
- domain_hint: software
- kind_hint: project

## Raw Capture

Implement the PARAFFINE curation workflow for active project notes. This is current sprint work and should be delivered next.

## Capture Updates

Expanded the scoring rules after testing the first curation pass.

## Audit Trail

### 2026-04-13T01:39:24Z

- action: curated
- status: curated
- kind: project
- domain: software
- confidence: 65 (medium)
- complexity: 27 (low)
- relevance: 98 (high)
- duplication: 18 (low)
- freshness: 90 (high)
- retained_reason: Retained as curated material.
```

## What Changed In The Proposed Shape

- The note title becomes the actual note title instead of a generic `Inbox Capture` heading.
- The summary moves to the top so the note opens with the useful content first.
- Placement, scores, review metadata, and source metadata are split into separate sections.
- The five scores are shown as a table instead of a long metadata list.
- Raw capture remains preserved lower in the note so the original material is still available.
- Audit trail stays explicit, but the high-signal note content is easier to scan first.
