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

---

## Sprint 3: Pack-Aware Inbox and Quarantine Bugfix
**Goal**: Fix inbox maintenance so related knowledge packs are preserved as grouped structures, ambiguous material is quarantined safely, and the Pi guidance matches the intended PARAFFINE operating model.
**Epic**: [GitHub issue #20](https://github.com/Holovkat/paraffine/issues/20)

### Phase 1: Placement and Safety
- [x] [GitHub issue #21](https://github.com/Holovkat/paraffine/issues/21) - Implement pack-aware inbox grouping and placement
- [x] [GitHub issue #22](https://github.com/Holovkat/paraffine/issues/22) - Add `Inbox/Quarantine` routing for ambiguous or conflicting notes

### Phase 2: Pi Contract
- [x] [GitHub issue #23](https://github.com/Holovkat/paraffine/issues/23) - Define and wire the Pi curation prompt and decision contract

### Phase 3: Verification
- [x] [GitHub issue #24](https://github.com/Holovkat/paraffine/issues/24) - Add grouped-pack and quarantine regression verification

---

## Sprint 4: PARAFFINE Clean-Slate Assistant Rewrite
**Goal**: Rebuild PARAFFINE around a skill-driven assistant surface where Pi or another CLI invokes the skill, the skill drives the workflow, the local script acts as the executor, and the docs describe only the final operating model.
**Epic**: [GitHub issue #25](https://github.com/Holovkat/paraffine/issues/25)

### Phase 1: Reset The Contract
- [ ] [GitHub issue #26](https://github.com/Holovkat/paraffine/issues/26) - Replace PARAFFINE docs with the final assistant-driven operating model
- [ ] [GitHub issue #27](https://github.com/Holovkat/paraffine/issues/27) - Rewrite the PARAFFINE script as an executor over validated actions

### Phase 2: Assistant Surface
- [ ] [GitHub issue #28](https://github.com/Holovkat/paraffine/issues/28) - Wire the single PARAFFINE assistant surface through Pi and the skill layer
- [ ] [GitHub issue #29](https://github.com/Holovkat/paraffine/issues/29) - Add commit-hook driven automatic PARAFFINE note updates

### Phase 3: Verification
- [ ] [GitHub issue #30](https://github.com/Holovkat/paraffine/issues/30) - Rebuild PARAFFINE verification and runtime wrappers around the rewritten flow
