# PARAFFINE AI Maintenance Verification

## Purpose

This runbook records the repeatable smoke flow for Sprint 2 runtime validation
and the Sprint 3 pack-aware inbox regression checks.

It proves:

- the Pi runtime boundary launches cleanly with the dormant `paraffine` bridge
- the preferred Pi model reference is `ollama/gemma4:31b-cloud`
- malformed or contradictory notes can fall into `Inbox/Quarantine`
- scoped PARAFFINE maintenance can be triggered through Pi
- retrieval can confirm the resulting AFFiNE state
- deterministic fallback remains runnable when the model path is skipped
- smoke artifacts can be cleaned up afterward

## Smoke Scope

Use a narrow unique prefix such as:

- `T19-SMOKE-<run-id>`

Recommended cases:

1. one note intended for refinement or retention
2. one note intended for archive/discard review

## Commands

Preferred wrapper:

```bash
scripts/paraffine-pi-smoke.sh
```

The helper performs:

1. `capture-note` for one grouped resource pack fixture
2. `capture-note` for one duplicate-conflict quarantine fixture
2. Pi `/paraffine-status`
3. Pi `/paraffine-cycle`
4. `inspect-structure` assertions for `Resources/PARA` and `Inbox/Quarantine`
5. `retrieve-notes` assertions for the scoped retained notes
6. direct CLI fallback cycle assertion
7. automatic cleanup by smoke prefix

## Expected Outcomes

- Pi reports the preferred model and resolved CLI path
- the Pi-scoped cycle returns a clean deterministic packet
- retrieval returns the updated retained note state
- the direct CLI fallback run returns the same deterministic packet shape
- no unrelated workspace notes are touched
- grouped reference notes stay together under `Resources/PARA` instead of being
  flattened
- contradictory duplicate notes fall into `Inbox/Quarantine`
- the helper fails immediately if any of the required grouping, quarantine, or
  cycle-packet assertions do not hold

## Cleanup Rule

Smoke note titles must stay uniquely prefixed per run so they can be found and
removed after validation without colliding with aborted prior runs.

The helper now performs cleanup automatically through:

- `delete-notes --query <prefix> --prefix <prefix>`

This keeps the AFFiNE workspace clean even when a smoke run fails mid-flow.
