# Implementation Checklist

Track implementation progress. Each local item uses a full GitHub issue URL.
Check off items here as the final sign-off that work is complete.

---

## Sprint 1: PARAFFINE External Workflow Layer
**Goal**: Build the external PARA-AFFiNE workflow layer around AFFiNE inbox capture, PARA curation, selective refinement, archive review, and scheduled retrieval orchestration.
**Epic**: [GitHub issue #7](https://github.com/Holovkat/paraffine/issues/7)

### Phase 1: Foundation
- [x] [GitHub issue #8](https://github.com/Holovkat/paraffine/issues/8) - Repository bootstrap and architecture framing
- [x] [GitHub issue #9](https://github.com/Holovkat/paraffine/issues/9) - Define PARAFFINE note lifecycle and scoring model
- [x] [GitHub issue #10](https://github.com/Holovkat/paraffine/issues/10) - Build AFFiNE inbox adapter and intake contract

### Phase 2: Core Workflow
- [x] [GitHub issue #11](https://github.com/Holovkat/paraffine/issues/11) - Implement PARA curation workflow
- [x] [GitHub issue #12](https://github.com/Holovkat/paraffine/issues/12) - Implement refinement and archive review workflow

### Phase 3: Integration
- [x] [GitHub issue #13](https://github.com/Holovkat/paraffine/issues/13) - Implement retrieval surface plus Pi or cron orchestration

---

## Sprint 2: PARAFFINE Pi-Driven AI Curation
**Goal**: Add the Pi-driven AI maintenance layer so PARAFFINE can inspect AFFiNE note content, choose allowed curation actions with the local Ollama Gemma model, and run the same maintenance loop through Pi and cron.
**Epic**: [GitHub issue #14](https://github.com/Holovkat/paraffine/issues/14)

### Phase 1: Foundation
- [x] [GitHub issue #15](https://github.com/Holovkat/paraffine/issues/15) - Stabilize PARAFFINE CLI ownership and repo script path
- [x] [GitHub issue #16](https://github.com/Holovkat/paraffine/issues/16) - Define the AI curation action contract and note decision rubric

### Phase 2: Runtime Integration
- [x] [GitHub issue #17](https://github.com/Holovkat/paraffine/issues/17) - Specify and wire the Pi extension runtime boundary for PARAFFINE
- [x] [GitHub issue #18](https://github.com/Holovkat/paraffine/issues/18) - Define cron maintenance entrypoints and failure handling

### Phase 3: Verification
- [x] [GitHub issue #19](https://github.com/Holovkat/paraffine/issues/19) - Add end-to-end smoke fixtures and verification for AI-driven maintenance
