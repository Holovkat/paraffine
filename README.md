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
- [Implementation checklist](features/00-IMPLEMENTATION-CHECKLIST.md)

## Repository Status

This repository is being prepared as the tracked home for the PARAFFINE planning and implementation work.
