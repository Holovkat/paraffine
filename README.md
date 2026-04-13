# PARAFFINE

PARAFFINE is an open-source knowledge workflow built around the PARA method, using AFFiNE as the durable workspace backend and external agent tooling for curation, refinement, and scheduled maintenance.

## Purpose

This project explores a structured note system that:

- captures raw information into an inbox
- curates that information into PARA destinations: `Projects`, `Areas`, `Resources`, and `Archives`
- refines selected notes into cleaner durable knowledge
- periodically reviews, archives, or discards lower-value information
- makes curated project memory retrievable by agents through the existing MCP-backed AFFiNE integration

The initial focus is an external workflow layer around AFFiNE. A later phase may integrate these ideas more deeply into the AFFiNE Community Edition codebase.

## Core Model

The working model for PARAFFINE is:

1. Inbox capture
2. PARA curation and placement
3. Scheduled refinement for selected notes
4. Archive and discard review
5. Retrieval of curated knowledge by agents

AFFiNE is the source of truth for stored knowledge. Pi extensions, skills, and scheduled jobs are intended to provide the AI-assisted curation and refinement layer.

## Runtime Surface

The canonical PARAFFINE CLI now lives in this repository:

- `scripts/paraffine-affine-inbox.js`

This script is the stable runtime entrypoint for:

- direct operator use from the PARA checkout
- Pi extension bridging with `-e`
- cron or other scheduled maintenance runs

Pi and cron should target this repo-owned path instead of any temporary task worktree location.

Example local invocation:

```bash
node scripts/paraffine-affine-inbox.js retrieve-notes --query "PARA" --limit 5
```

## Core Specs

The current repo-owned standards surface is:

- `features/paraffine-ai-curation-contract.md`
- `features/paraffine-architecture.md`
- `features/paraffine-pi-runtime-contract.md`
- `features/paraffine-cron-runbook.md`
- `features/paraffine-ai-maintenance-verification.md`

These documents define the allowed AI maintenance actions, deterministic
fallback rules, and the architecture boundary between PARAFFINE, AFFiNE, Pi,
and cron.

## Pi Runtime

Recommended Pi launch:

```bash
PARAFFINE_ROOT=/Users/tonyholovka/workspace/PARA \
pi -e /Users/tonyholovka/workspace/pi-extensions/extensions/ollama-provider.ts \
   -e /Users/tonyholovka/workspace/pi-extensions/extensions/paraffine.ts \
   --model ollama/gemma4:e2b
```

Convenience wrappers in this repo:

- `scripts/paraffine-pi-run.sh`
- `scripts/paraffine-pi-smoke.sh`

Use the run wrapper for cron/non-interactive launch and the smoke helper for a
scoped runtime verification pass.

## Inspirations and Attribution

This project builds on and is inspired by:

- Tiago Forte and the PARA method
- Andrej Karpathy and the recent wiki-style knowledge compilation pattern
- the AFFiNE open-source project and community

PARAFFINE is not an official project of Tiago Forte, Andrej Karpathy, or the AFFiNE maintainers. It is an independent open-source experiment that adapts and extends ideas influenced by their work.

## Current Direction

The current MVP direction is:

- use AFFiNE as the durable note and workspace backend
- create a shared inbox for agent and CLI-driven capture
- apply PARA classification rules during curation
- use scheduled refinement passes to turn messy notes into more useful durable knowledge
- keep archive and discard decisions explicit so the system does not accumulate unchecked noise

## Project Docs

- [Workspace guidance](AGENTS.md)
- [Architecture and standards](features/paraffine-architecture.md)
- [Runtime and orchestration](features/paraffine-runtime-orchestration.md)
- [Implementation checklist](features/00-IMPLEMENTATION-CHECKLIST.md)
- [Seed reference docs](features/reference-seed-docs.md)

## Repository Status

This repository is being prepared as the tracked home for the PARAFFINE planning and implementation work.
