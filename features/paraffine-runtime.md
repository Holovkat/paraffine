# PARAFFINE Runtime

## Entry Points

The system has one assistant surface:

- `/paraffine`

That surface is invoked by:

- Pi
- another CLI agent
- scheduled maintenance
- git hook automation

Repo-local skill path:

- `.pi/skills/paraffine/SKILL.md`

Installed global skill paths:

- `~/.pi/skills/paraffine`
- `~/.codex/skills/paraffine`
- `~/.agents/skills/paraffine`

Installation and prerequisites:

- see [paraffine-installation.md](paraffine-installation.md)

## Runtime Flows

### Interactive write or update

1. user calls `/paraffine`
2. PARAFFINE skill decides whether to create or update
3. skill sends a write payload to the executor
4. executor writes into `Inbox`

### Interactive retrieval

1. user calls `/paraffine`
2. PARAFFINE skill decides retrieval is needed
3. skill requests note lookup from the executor
4. result is returned to the user or used to target an update

### Scheduled curation

1. cron starts Pi or another CLI agent
2. the assistant surface invokes the PARAFFINE skill
3. the skill inspects `Inbox` material
4. the skill emits curation payloads
5. the executor applies grouped placement, archive, discard, or quarantine actions

### Commit-driven update

1. a git hook fires after commit
2. the hook builds a concise commit summary payload
3. the executor writes the update into `Inbox`
4. curation handles final placement later

Current machine-wide hook path:

- `~/.githooks/post-commit`

Behavior:

- repos inherit the PARAFFINE post-commit flow unless they define a local `core.hooksPath` override
- the current hook delegates to the PARA executor in `/Users/tonyholovka/workspace/PARA`
- `scripts/install-paraffine-globals.sh` is the canonical installer for the global skill links and machine-wide git hook path
- automatic commit notes are intentionally human-readable and avoid file-by-file dumps
- commit-driven note content must be provided by the committing agent in the commit body
- the hook is only the formatter and delivery path
- preferred commit body fields are:
  - `Changed:`
  - `Why:`
  - `How:`
  - `Validated:`

## Runtime Defaults

- note-taking defaults to `Inbox`
- retrieval searches the current PARAFFINE corpus
- curation owns PARA placement
- quarantine exists only for curation

## Verification Targets

The final runtime should be considered healthy when it can prove:

- `/paraffine` can create a working note in `Inbox`
- `/paraffine` can retrieve a relevant existing note
- scheduled curation can place grouped notes correctly
- scheduled curation can quarantine ambiguous material
- commit-hook automation can append a simple update note without manual prompting

## Operational Guidance

- keep the assistant surface singular
- keep the executor strict
- keep the runtime wrappers thin
- prefer visible failures over silent fallback
