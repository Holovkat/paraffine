# PARAFFINE

PARAFFINE is a skill-driven note assistant over AFFiNE.

It combines:

- the PARA method for durable residence decisions
- a Karpathy-style wiki approach for compounding, reusable notes
- an AFFiNE-backed executor for actual storage and linking

The final model is simple:

- write or update working notes in `Inbox`
- retrieve existing knowledge from the PARAFFINE corpus
- curate `Inbox` material into PARA in the background

## Operating Chain

The intended control flow is:

`CLI or Pi -> PARAFFINE skill -> PARAFFINE executor -> AFFiNE transport`

That means:

- the skill owns reasoning
- the script owns execution
- AFFiNE stores the notes

## User Model

PARAFFINE should feel like one assistant surface.

- writing creates or updates working notes in `Inbox`
- retrieval finds the best matching existing notes
- curation decides permanent PARA residence later

`Quarantine` is part of curation only. It is not part of note-taking.

## Runtime Surface

Current local executor:

- `scripts/paraffine-affine-inbox.js`

Current runtime wrappers:

- `scripts/paraffine-pi-run.sh`
- `scripts/paraffine-pi-smoke.sh`
- `scripts/paraffine-hourly-cron.sh`
- `scripts/paraffine-post-commit.sh`
- `scripts/install-paraffine-hooks.sh`

The current preferred Pi model is:

- `ollama/gemma4:31b-cloud`

Repo-local skill surface:

- `.pi/skills/paraffine/SKILL.md`

Installed global skill surfaces:

- `~/.pi/skills/paraffine`
- `~/.codex/skills/paraffine`
- `~/.agents/skills/paraffine`

Primary Pi assistant entrypoint:

- `/paraffine`

Managed hook entrypoint:

- `bash scripts/install-paraffine-hooks.sh`

Current machine-wide git hook path:

- `~/.githooks/post-commit`

The post-commit hook writes short human-readable change notes into `Inbox` and can use optional commit message fields such as `Why:`, `How:`, and `Validation:`.

Installation and setup:

- [Installation guide](features/paraffine-installation.md)

## Final Docs

- [Workspace guidance](AGENTS.md)
- [Installation guide](features/paraffine-installation.md)
- [Operating model](features/paraffine-operating-model.md)
- [Executor contract](features/paraffine-executor-contract.md)
- [Runtime](features/paraffine-runtime.md)
- [Implementation checklist](features/00-IMPLEMENTATION-CHECKLIST.md)
