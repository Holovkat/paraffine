# PARAFFINE AI Curation Contract

## Reference Index

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [PARAFFINE architecture](paraffine-architecture.md)
- [Implementation checklist](00-IMPLEMENTATION-CHECKLIST.md)

## Purpose

This contract defines what an AI-assisted PARAFFINE maintenance pass is allowed
to decide, what payload shape PARAFFINE will accept, and when the workflow must
fall back to deterministic behavior.

The contract is intentionally narrower than general note editing. The model is
not allowed to invent new lifecycle states, delete notes silently, or bypass the
existing audit and retention model.

## Design Boundaries

- The AI layer operates on top of the existing PARAFFINE lifecycle and routing
  model.
- PARA classification remains the organizing framework.
- Karpathy-style wiki compilation is the refinement behavior layered on top of
  PARA, not a replacement for PARA.
- Every accepted AI output must map to a known workflow action.
- Invalid or unavailable AI output must fall back to deterministic handling.

## Lifecycle Baseline

The contract assumes the current PARAFFINE state model:

`captured -> inbox -> curated -> refined -> canonical -> archived / discarded`

Operational hold state:

- `quarantined`

The contract also assumes the current curation signals:

- `confidence`
- `complexity`
- `relevance`
- `duplication`
- `freshness`

Band thresholds remain:

- `low = 0-39`
- `medium = 40-69`
- `high = 70-100`

## Allowed Actions

The model may emit only one of the following `action` values.

| Action | Purpose | Allowed Typical Outcome |
|--------|---------|-------------------------|
| `retain` | Keep the note in its current retained state | No content rewrite required |
| `reword` | Improve clarity without changing PARA destination | Cleaner wording, same routing |
| `move` | Keep the note but change PARA placement | Project -> Area, Project -> Resource, Area -> Archive |
| `refine` | Convert rough note content into durable compiled knowledge | `curated -> refined` |
| `canonicalize` | Promote or merge a stable note into canonical reusable knowledge | `refined -> canonical` or duplicate -> canonical target |
| `archive` | Preserve historical value while removing from active work | `curated/refined/canonical -> archived` |
| `discard` | Explicitly reject the note from active knowledge | `curated/refined -> discarded` |
| `quarantine` | Hold malformed, contradictory, or ambiguous material for manual review | `inbox/curated -> quarantined` |

The model is not allowed to emit:

- `delete`
- `remove`
- `merge` as a standalone action
- `supersede` as a standalone action
- new state names outside the lifecycle

If the model wants a merge-style outcome, it must use `canonicalize` with a
`canonical_target` and rationale.

## Common Payload Contract

Every accepted AI response must conform to this logical shape:

```json
{
  "action": "retain | reword | move | refine | canonicalize | archive | discard | quarantine",
  "reason": "Short operator-readable explanation",
  "confidence_score": 0,
  "status": "curated | refined | canonical | archived | discarded | quarantined",
  "kind": "project | area | resource | archive",
  "domain": "software | business | personal | shared",
  "audit_note": "Short summary of why this action is safe",
  "changes": {}
}
```

Required fields for every action:

- `action`
- `reason`
- `confidence_score`
- `status`
- `kind`
- `domain`
- `audit_note`

Validation rules:

- `confidence_score` must be an integer `0-100`
- `status` must be one of the known lifecycle states allowed after curation
- `kind` must map to a PARA destination class
- `reason` and `audit_note` must be non-empty
- `changes` may be empty only for `retain`

## Pre-Decision Requirements

Before choosing an action, the AI layer must evaluate:

- whether the material is a standalone note or part of a related knowledge pack
- whether an existing canonical note or pack already exists in the workspace
- whether parent-child structure should be preserved or created
- whether the permanent PARA home differs from the currently active project
  linkage
- whether the note is malformed, contradictory, or too ambiguous for safe
  automatic placement

The model must not treat every inbox item as an isolated singleton. If multiple
notes clearly belong together, the model should preserve that grouping rather
than flattening them into a PARA folder.

## Action-Specific Requirements

### `retain`

Use when the note should remain in its current retained state.

Required `changes` fields:

- none

Forbidden:

- rewritten note body
- PARA move
- canonical target

### `reword`

Use when the note should stay in the same PARA class but needs clearer wording.

Required `changes` fields:

- `title`
- `summary`
- `body`

Rules:

- must not change `kind`
- must not change `status` outside its current active retained band
- must preserve source trail and existing note intent

### `move`

Use when the note should be kept but placed in a different PARA destination.

Required `changes` fields:

- `target_kind`
- `move_reason`

Optional:

- `title`
- `summary`
- `body`

Rules:

- target kind must be one of `project`, `area`, `resource`, `archive`
- `move` does not by itself imply canonical status
- if the note is a finished project with durable value, prefer `move` to
  `resource` plus optional `reword` or `refine`

### `refine`

Use when a note has useful content but requires synthesis into a more durable
wiki-style form.

Required `changes` fields:

- `title`
- `summary`
- `body`
- `knowledge_shape`
- `reuse_guidance`

Rules:

- target status must be `refined`
- refinement must preserve provenance to the original note/source
- refinement is the Karpathy-style compilation step: condense, structure,
  clarify, and keep what is reusable

### `canonicalize`

Use when a note is stable enough to become the authoritative reusable version or
when a duplicate should point at a canonical target.

Required `changes` fields:

- `canonical_target`
- `canonical_strategy`

Conditional:

- if promoting the current note, also require `title`, `summary`, and `body`
- if merging toward an existing canonical target, `canonical_target` must be a
  real note reference and rewritten content is optional

Rules:

- only valid when `confidence` is not low
- high duplication plus low confidence must not canonicalize directly
- `canonical_strategy` must be one of:
  - `promote_current`
  - `merge_into_existing`
  - `supersede_duplicate`

### `archive`

Use when the note still has historical or audit value but should not remain
active working knowledge.

Required `changes` fields:

- `archive_reason`

Optional:

- `review_due_at`

Rules:

- target status must be `archived`
- archived notes stay retrievable outside default active retrieval

### `discard`

Use when the note is not useful enough to retain as active knowledge.

Required `changes` fields:

- `discard_reason`

Rules:

- target status must be `discarded`
- discard is auditable and not equivalent to deletion
- discarded notes do not re-enter automatic review

### `quarantine`

Use when the note or note set is not safe to place automatically.

Required `changes` fields:

- `quarantine_reason`

Optional:

- `related_note_refs`
- `suggested_resolution`

Rules:

- target status must be `quarantined`
- quarantined notes are routed to `Inbox/Quarantine`
- quarantine is preferred over speculative placement when the note is malformed,
  contradictory, or lacks a safe canonical target
- quarantine is an Inbox workflow construct, not a fifth PARA destination

## Decision Rubric

### High-Level Routing Matrix

| Condition | Preferred Action | Why |
|-----------|------------------|-----|
| High confidence, low complexity, useful current note | `retain` or `reword` | Keep active note stable without unnecessary synthesis |
| High complexity, medium/high relevance | `refine` | Convert rough material into durable compiled knowledge |
| Finished project with reusable lessons | `move` to `resource` then `refine` or `canonicalize` | Project execution notes become reusable reference material |
| Finished project with historical value only | `archive` | Keep history, remove from active work |
| High duplication, medium/high confidence | `canonicalize` | Collapse knowledge sprawl toward a canonical resource |
| High duplication, low confidence | `retain`, `archive`, or `discard` | Unsafe to canonicalize uncertain material |
| Low relevance, low freshness, still useful historically | `archive` | Retain for audit and future reference |
| Low confidence, low relevance, high duplication/noise | `discard` | Avoid preserving low-value clutter |
| Related notes form one explainer set | `retain` or `move` as a pack | Preserve structure instead of flattening siblings |
| Contradiction, malformed capture, or no safe canonical target | `quarantine` | Hold for manual review instead of forcing placement |

### Project -> Resource Rule

Project notes should not remain projects forever. Use this rule:

- keep the note in `project` while it is tied to an active outcome
- when the project is complete, inspect whether the note contains durable
  methods, decisions, patterns, or reusable lessons
- if yes, move/refine it into a `resource`
- if no, archive it as project history

This is the clearest place where the Karpathy-style wiki pattern applies:

- Project notes are operational and messy.
- Refinement extracts reusable knowledge.
- Resource notes become the durable reference output.

### Areas Rule

Areas hold ongoing responsibilities. An area note is not simply a completed
project that lingered.

Use `area` when the note supports ongoing stewardship such as:

- keeping a system healthy
- maintaining an operating process
- recurring responsibility or standard

Use `move` from `project` to `area` only if the note becomes continuing
responsibility material rather than reusable reference.

### Pack Preservation Rule

If several notes clearly describe one subject together, the model should treat
them as one pack and avoid flattening them.

Use this rule:

- choose the permanent PARA home for the pack first
- preserve or create the parent-child structure inside that home
- keep example notes, comparison notes, or supporting notes attached to the main
  explainer rather than placing them as unrelated peers
- if the pack resolves to multiple incompatible homes, quarantine it instead of
  splitting it speculatively

## Deterministic Fallback Contract

Deterministic fallback must be used when:

- the model is unavailable
- the model emits an invalid action
- required fields are missing
- the payload conflicts with hard lifecycle rules
- the runtime intentionally disables AI assistance

Fallback behavior:

1. reject the AI payload
2. evaluate the note with the existing deterministic rubric
3. preserve or append audit state showing fallback was used
4. never leave the note in a partially mutated state

Required fallback audit fields:

- `fallback = deterministic`
- `fallback_reason`
- `fallback_at`

## Example Valid Payloads

### `retain`

```json
{
  "action": "retain",
  "reason": "The note is already clear and useful in its current project context.",
  "confidence_score": 81,
  "status": "curated",
  "kind": "project",
  "domain": "software",
  "audit_note": "No rewrite or move needed.",
  "changes": {}
}
```

### `reword`

```json
{
  "action": "reword",
  "reason": "The note is useful but too rough for other agents to read cleanly.",
  "confidence_score": 74,
  "status": "curated",
  "kind": "project",
  "domain": "software",
  "audit_note": "Rewrite keeps the project destination unchanged.",
  "changes": {
    "title": "PARAFFINE CLI Ownership Decision",
    "summary": "Stabilize the repo-owned CLI path before Pi and cron integration.",
    "body": "The PARA repo owns the CLI. Pi and cron should call the stable script path instead of any task worktree fallback."
  }
}
```

### `move`

```json
{
  "action": "move",
  "reason": "The project has ended and the note now serves as recurring operational guidance.",
  "confidence_score": 77,
  "status": "curated",
  "kind": "area",
  "domain": "software",
  "audit_note": "Move from project execution into ongoing stewardship material.",
  "changes": {
    "target_kind": "area",
    "move_reason": "This note now supports ongoing maintenance rather than a bounded project."
  }
}
```

### `refine`

```json
{
  "action": "refine",
  "reason": "The note contains strong material but needs synthesis before durable reuse.",
  "confidence_score": 72,
  "status": "refined",
  "kind": "resource",
  "domain": "software",
  "audit_note": "Apply wiki-style compilation while preserving source references.",
  "changes": {
    "title": "Karpathy Wiki Pattern Applied To PARAFFINE",
    "summary": "Use refinement to turn rough project notes into reusable knowledge artifacts.",
    "body": "Keep the original source trail, extract stable lessons, and rewrite into a concise, structured reusable note.",
    "knowledge_shape": "durable_reference",
    "reuse_guidance": "Use this note to guide future note cleanup and closeout conversion."
  }
}
```

### `canonicalize`

```json
{
  "action": "canonicalize",
  "reason": "This refined note is the most complete stable version and should become the preferred resource.",
  "confidence_score": 88,
  "status": "canonical",
  "kind": "resource",
  "domain": "software",
  "audit_note": "Promote the current note to canonical status.",
  "changes": {
    "canonical_target": "self",
    "canonical_strategy": "promote_current",
    "title": "PARAFFINE AI Curation Workflow",
    "summary": "Canonical guide for AI-assisted note maintenance in PARAFFINE.",
    "body": "This is the authoritative reusable reference for how Pi-driven AI maintenance should classify, refine, canonicalize, archive, and discard notes."
  }
}
```

### `archive`

```json
{
  "action": "archive",
  "reason": "The note is no longer active but still useful as historical context.",
  "confidence_score": 69,
  "status": "archived",
  "kind": "archive",
  "domain": "software",
  "audit_note": "Retain for audit and project history.",
  "changes": {
    "archive_reason": "Completed project context that may be useful for future retrospectives.",
    "review_due_at": "2026-07-01T00:00:00Z"
  }
}
```

### `discard`

```json
{
  "action": "discard",
  "reason": "The note is a low-confidence duplicate with no durable value.",
  "confidence_score": 28,
  "status": "discarded",
  "kind": "resource",
  "domain": "software",
  "audit_note": "Discard is safe because the material is duplicative and not trustworthy enough to preserve.",
  "changes": {
    "discard_reason": "Low-confidence duplicate with low relevance."
  }
}
```

### `quarantine`

```json
{
  "action": "quarantine",
  "reason": "The note is malformed and cannot be safely placed automatically.",
  "confidence_score": 91,
  "status": "quarantined",
  "kind": "resource",
  "domain": "software",
  "audit_note": "Hold in Inbox/Quarantine until the missing capture fields or contradiction are resolved.",
  "changes": {
    "quarantine_reason": "Missing required capture fields and no safe canonical target.",
    "related_note_refs": [],
    "suggested_resolution": "Add the missing intake fields, then rerun curation."
  }
}
```

## Example Invalid Payloads

### Unsupported action

```json
{
  "action": "delete",
  "reason": "Remove it"
}
```

Why invalid:

- `delete` is not an allowed action
- required fields are missing
- it bypasses audit and retention handling

### Missing required fields

```json
{
  "action": "refine",
  "status": "refined",
  "changes": {
    "summary": "Improved"
  }
}
```

Why invalid:

- missing `reason`
- missing `confidence_score`
- missing `kind`
- missing `domain`
- missing `audit_note`
- missing required `refine` body fields

## Runtime Acceptance Rule

PARAFFINE should treat the model as a constrained recommender, not an
unbounded editor.

The runtime should:

1. parse and validate the model output
2. reject payloads that violate this contract
3. apply deterministic fallback when validation fails
4. persist the final accepted action with audit context

The runtime should not:

- accept free-form prose as an action result
- let the model invent new workflow states
- apply archive or discard without a recorded reason
- canonicalize uncertain notes just because duplication is high
