# PARAFFINE Installation

## Purpose

This document describes the prerequisites and setup needed before PARAFFINE can be used from Pi, Codex, cron, or git hooks.

## Prerequisites

You need:

- an AFFiNE workspace
- an AFFiNE account, either cloud-hosted or local/self-hosted
- write-capable AFFiNE MCP access
- the PARA repo checked out locally
- Pi if you want the `/paraffine` assistant surface

## AFFiNE Setup

### 1. Create or choose a workspace

You need one AFFiNE workspace that will store the PARAFFINE notes.

Required top-level structure:

- `Inbox`
- `Projects`
- `Areas`
- `Resources`
- `Archives`

Recommended root document structure:

- `PARA`
  - `Projects`
  - `Areas`
  - `Resources`
  - `Archives`

### 2. Create an AFFiNE token

PARAFFINE needs:

- `AFFINE_BASE_URL`
- `AFFINE_API_TOKEN`
- `AFFINE_WORKSPACE_ID`

The repo executor already looks for these in the local secure env chain. The important point is that those values must exist before the scripts will work.

## MCP Setup

### What matters

The write-capable path is the standalone package:

- `affine-mcp-server`

The older hosted workspace MCP endpoint only exposed read/search tools and is not the supported PARAFFINE write path.

### Current executor behavior

The PARA executor launches AFFiNE MCP through:

- `npx -y -p affine-mcp-server affine-mcp`

That means there is no long-lived custom daemon you must start manually for normal use. The executor starts the MCP process when it needs it.

### Customization we rely on

The important customization is not a forked MCP server. It is the local runtime contract around it:

- the secure env chain for AFFiNE credentials
- the repo-owned PARA executor script
- the Pi bridge calling `/paraffine`
- the global git hook delegating commit updates into the PARA executor

So the required setup is mostly path wiring and environment wiring, not patching the MCP package itself.

## Global Deployment

Run:

```bash
bash /Users/tonyholovka/workspace/PARA/scripts/install-paraffine-globals.sh
```

That installs:

- global skill links in:
  - `~/.pi/skills/paraffine`
  - `~/.codex/skills/paraffine`
  - `~/.agents/skills/paraffine`
- global git hook path:
  - `~/.githooks/post-commit`

After that:

- `skill:paraffine` should resolve from Pi/Codex
- repos inherit the PARAFFINE post-commit hook unless they define a local `core.hooksPath`
- post-commit notes are written as short human-readable change notes, not file inventories

If you want better automatic notes from commits, use optional commit message sections like:

```text
feat: improve PARAFFINE note formatting

Why: Make automatic notes readable without opening GitHub.
Outcome: Commit notes now summarise the change in plain language.
Validation: Tested with the global post-commit hook dry run and a live note write.
```

## Pi Runtime

The Pi extension bridge is in:

- `/Users/tonyholovka/workspace/pi-extensions/extensions/paraffine.ts`

Primary entrypoint:

- `/paraffine`

Preferred model:

- `ollama/gemma4:31b-cloud`

## Cron

Cron is machine-wide, not repo-local.

Current scheduled wrapper:

- `/Users/tonyholovka/workspace/PARA/scripts/paraffine-hourly-cron.sh`

Current cron entry:

- `0 * * * * /Users/tonyholovka/workspace/PARA/scripts/paraffine-hourly-cron.sh >> $HOME/.paraffine/logs/hourly.log 2>&1`

## Why Set It Up

Typical reasons to use PARAFFINE:

- capture working notes quickly into `Inbox`
- retrieve existing notes before writing duplicates
- maintain a practical PARA-based knowledge base inside AFFiNE
- keep commit-driven change notes flowing automatically
- build a reusable wiki-like corpus rather than leaving knowledge trapped in chat or git history

## References

- Tiago Forte, PARA method: [fortelabs.com/blog/para/](https://fortelabs.com/blog/para/)
- PARAFFINE uses a Karpathy-style wiki discipline as an internal operating pattern: keep notes reusable, linked, and compounding over time
