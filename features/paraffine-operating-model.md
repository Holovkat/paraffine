# PARAFFINE Operating Model

## Purpose

PARAFFINE is a note assistant over AFFiNE.

It has three jobs:

1. write or update working notes in `Inbox`
2. retrieve existing knowledge from the PARAFFINE corpus
3. curate `Inbox` material into its durable PARA home in the background

## Why This Exists

PARAFFINE is built around two ideas:

- `PARA`
  - notes should end up where they are most useful in the long run: `Projects`, `Areas`, `Resources`, or `Archives`
- `Karpathy-style wiki method`
  - notes should compound into reusable, linkable knowledge instead of remaining one-off chat fragments

In practice that means:

- capture quickly into `Inbox`
- retrieve before rewriting when useful knowledge already exists
- curate later when there is enough context to decide permanent residence
- keep reusable notes durable and linkable so they form a living wiki instead of a disposable scratchpad

## Control Flow

The intended control chain is:

`CLI or Pi -> PARAFFINE skill -> PARAFFINE executor -> AFFiNE transport`

Responsibilities:

- `CLI or Pi`
  - starts the request
  - provides the user prompt or scheduled trigger
- `PARAFFINE skill`
  - decides what the request means
  - decides whether the request is write, retrieve, or curate
  - builds the validated action payload
- `PARAFFINE executor`
  - validates the payload
  - performs the requested AFFiNE operations
  - does not own the reasoning layer
- `AFFiNE`
  - stores the notes and links

## User-Facing Modes

### Write

Write mode is for note-taking and note updates.

Rules:

- new notes go into `Inbox`
- updates may append to or rewrite an existing working note
- retrieval may be used first to identify the correct note to update
- write mode does not decide permanent PARA residence
- write mode does not quarantine

### Retrieve

Retrieve mode is for finding current knowledge.

Rules:

- search the current PARAFFINE corpus
- return the best matching note or notes
- allow the result to be used as the target for an update
- do not change residence during retrieval

### Curate

Curate mode is background maintenance.

Rules:

- evaluate `Inbox` material
- decide PARA residence
- preserve grouping when related notes belong together
- quarantine ambiguous or contradictory material when needed
- this is the only mode that decides final placement

## PARA Rules

PARA residence is decided only during curation.

- `Projects`
  - active outcome-specific material
- `Areas`
  - ongoing responsibility material
- `Resources`
  - reusable reference material
- `Archives`
  - inactive or historical material

`Inbox` is not a permanent PARA home. It is the intake and working surface.

`Quarantine` is not a fifth PARA category. It is an `Inbox` workflow folder used only by curation.

Short PARA summary:

- `Projects`
  - material tied to an active outcome with a finish line
- `Areas`
  - material tied to an ongoing responsibility without a finish line
- `Resources`
  - reusable reference or explainer material worth keeping
- `Archives`
  - inactive or historical material retained for lookup

## Wiki Method

The wiki side of PARAFFINE is intentionally simple:

- write notes so they can be found and reused later
- prefer updating or linking an existing note over creating duplicate fragments
- keep notes readable by humans first
- let retrieval and curation strengthen the corpus over time

This is the reason PARAFFINE is not just an inbox capture tool. It is meant to become a durable working knowledge base.

## Use Cases

- a developer wants commit activity captured automatically into AFFiNE without having to remember to write a note after each change
- an operator wants to ask `/paraffine` for existing project knowledge before writing a new note
- a team wants AFFiNE notes to stay organized by PARA while still behaving like a practical internal wiki
- a personal knowledge setup wants quick inbox capture now and better filing later

## References

- Tiago Forte, PARA method: [fortelabs.com/blog/para/](https://fortelabs.com/blog/para/)
- Andrej Karpathy: PARAFFINE uses a Karpathy-style compounding wiki idea as an operating pattern for reusable notes rather than treating notes as disposable chat output

## Commit-Driven Updates

Routine repo work should not depend on the user remembering to write notes.

The intended commit flow is:

1. a git hook detects a commit
2. the hook builds a concise update payload from the commit metadata
3. the hook sends that payload to the PARAFFINE executor
4. later curation decides where the note belongs

This hook path is convenience automation. It must stay simple and visible.

## Design Rules

- one PARAFFINE assistant surface
- one reasoning layer in the skill
- one execution layer in the executor
- one durable storage layer in AFFiNE
- no duplicate historical docs describing abandoned flows
