# PARAFFINE AI Maintenance Verification

## Purpose

This runbook records the repeatable smoke flow for Sprint 2 runtime validation.

It proves:

- the Pi runtime boundary launches cleanly with the dormant `paraffine` bridge
- scoped PARAFFINE maintenance can be triggered through Pi
- retrieval can confirm the resulting AFFiNE state
- deterministic fallback remains runnable when the model path is skipped
- smoke artifacts can be cleaned up afterward

## Smoke Scope

Use a narrow prefix such as:

- `T19-SMOKE`

Recommended cases:

1. one note intended for refinement or retention
2. one note intended for archive/discard review

## Commands

Preferred wrapper:

```bash
scripts/paraffine-pi-smoke.sh
```

The helper performs:

1. `capture-note` for scoped smoke notes
2. Pi `/paraffine-status`
3. Pi `/paraffine-cycle`
4. Pi `/paraffine-retrieve`
5. direct CLI fallback cycle
6. automatic cleanup by smoke prefix

## Expected Outcomes

- Pi reports the preferred model and resolved CLI path
- the scoped cycle completes against only the smoke notes
- retrieval returns the updated note state
- the direct CLI fallback run succeeds for the same scope
- no unrelated workspace notes are touched

## Cleanup Rule

Smoke note titles must stay uniquely prefixed so they can be found and removed
after validation.

The helper now performs cleanup automatically through:

- `delete-notes --query <prefix> --prefix <prefix>`

This keeps the AFFiNE workspace clean even when a smoke run fails mid-flow.
