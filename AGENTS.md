# PARAFFINE

This repository is the tracked home for PARAFFINE planning and implementation work.

## Repository Layout

- `README.md` explains the final PARAFFINE operating model.
- `features/paraffine-operating-model.md` is the source of truth for how PARAFFINE behaves.
- `features/paraffine-executor-contract.md` defines the local script contract.
- `features/paraffine-runtime.md` defines runtime entrypoints and automation flows.
- `.pi/skills/paraffine/SKILL.md` is the repo-local assistant skill for Pi or another CLI runtime.
- `features/00-IMPLEMENTATION-CHECKLIST.md` is the local sprint checklist and final sign-off ledger.
- the current global skill links also point at this repo-local skill source:
  - `~/.pi/skills/paraffine`
  - `~/.codex/skills/paraffine`
  - `~/.agents/skills/paraffine`

## Affine MCP Status

- Codex is wired to AFFiNE through `affine-mcp-server`
- `AFFINE_BASE_URL` is set to `https://app.affine.pro`
- `AFFINE_WORKSPACE_ID` is set to `b5e4daae-7c9e-4196-a48e-b46b2dee15c9`
- Auth is configured with the existing AFFiNE token from the local secure environment

## Verified Behavior

- MCP initialization succeeds
- Current user lookup succeeds
- Workspace listing succeeds
- Document create succeeds
- Paragraph append succeeds
- Document delete succeeds

## Notes

- The hosted AFFiNE workspace MCP endpoint exposed only read/search tools
- The standalone `affine-mcp-server` package is the write-capable path now configured for Codex
- Final changes for this repository should be created in the governed worktree, not in the primary checkout
- This repo is the clean tracked home for the PARAFFINE skill, executor, and final docs

## PARAFFINE Runtime

- the current local executor is `scripts/paraffine-affine-inbox.js`
- Pi or another CLI is the instigator
- the PARAFFINE skill owns the reasoning and workflow
- the executor script performs validated AFFiNE operations
- the AFFiNE transport layer remains the write path unless implementation proves a cleaner direct route
- the primary assistant surface is `/paraffine`
- use `scripts/paraffine-pi-run.sh` for repeatable Pi launch
- use `scripts/paraffine-pi-smoke.sh` for runtime checks
- use `scripts/paraffine-hourly-cron.sh` for scheduled maintenance launch
- use `scripts/install-paraffine-hooks.sh` to install the managed post-commit hook path
- the current machine-wide git hook path is `~/.githooks`
- repos without a local `core.hooksPath` override inherit the PARAFFINE post-commit hook automatically

## Operating Rules

- note-taking writes or updates working notes in `Inbox`
- retrieval finds existing knowledge through the same assistant surface
- curation is the only place that decides PARA residence
- `Inbox/Quarantine` belongs to curation only
- commit-hook updates should create low-friction change notes without forcing the user to ask every time
