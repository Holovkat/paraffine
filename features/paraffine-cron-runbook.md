# PARAFFINE Cron Runbook

## Reference Index

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [Pi runtime contract](paraffine-pi-runtime-contract.md)
- [AI curation contract](paraffine-ai-curation-contract.md)

## Purpose

This runbook defines how scheduled PARAFFINE maintenance should be triggered,
scoped, and audited.

The scheduler contract is intentionally simple:

- cron launches Pi with the dormant `paraffine` extension
- Pi resolves the repo-owned PARAFFINE CLI
- PARAFFINE performs a bounded maintenance command
- deterministic fallback remains available when model-driven behavior is
  unavailable or intentionally skipped

## Recommended Cadence

Default starting cadence:

- every hour for inbox and review maintenance

Reason:

- frequent enough to keep `Inbox` from accumulating stale captures
- not so frequent that it creates excessive review churn

Suggested split:

- hourly scoped cycle for inbox/review maintenance
- optional daily broader retrieval/review audit for operator inspection

## Recommended Cron Command

Cron should use an explicit environment and an explicit Pi bridge launch:

```bash
PARAFFINE_ROOT=/Users/tonyholovka/workspace/PARA \
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" \
/Users/tonyholovka/workspace/PARA/scripts/paraffine-pi-run.sh \
  "/paraffine-cycle --query Inbox --limit 10"
```

If direct scripting is preferred, the equivalent form is:

```bash
PARAFFINE_ROOT=/Users/tonyholovka/workspace/PARA \
pi -p \
  -e /Users/tonyholovka/workspace/pi-extensions/extensions/ollama-provider.ts \
  -e /Users/tonyholovka/workspace/pi-extensions/extensions/paraffine.ts \
  --model ollama/gemma4:31b-cloud \
  "/paraffine-cycle --query Inbox --limit 10"
```

## Scoped Execution Rules

Scheduled maintenance must stay bounded.

Use one or more of:

- `--query`
- `--limit`
- `--statuses`

Recommended examples:

- inbox-first cycle:
  - `"/paraffine-cycle --query Inbox --limit 10"`
- review queue for active retained notes:
  - `"/paraffine-review --query PARA --limit 10 --statuses curated,refined,canonical,archived"`
- scoped retrieval check:
  - `"/paraffine-retrieve --query PARA --limit 5 --statuses curated,canonical,refined"`

Do not schedule unbounded full-workspace traversals as the default cron mode.

## Operator-Triggered vs Scheduled Runs

| Run Type | Purpose | Behavior |
|---------|---------|----------|
| Operator-triggered | Exploration, inspection, targeted repair | Human chooses scope interactively |
| Cron-triggered | Routine inbox/review maintenance | Must run with explicit bounded scope and machine-readable output |

Cron should favor predictable, narrow commands. Operator runs can be broader.

## Failure Policy

### Missing Model

If the preferred local model is missing:

- Pi may still run with a different model if explicitly configured
- otherwise the operator should treat the cycle as deterministic fallback only

The run must not silently pretend the preferred model was used.

### Missing Pi Bridge

If the `paraffine` extension is not available:

- the cron job should fail visibly
- operators may temporarily fall back to direct CLI execution

### Missing CLI Path

If the bridge cannot resolve the CLI:

- fail the run
- set `PARAFFINE_ROOT` or `PARAFFINE_CLI_PATH`
- do not rely on temporary task worktree discovery

### AFFiNE Failure

If the underlying PARAFFINE CLI cannot read or write AFFiNE:

- the command must exit non-zero
- stderr must be preserved in cron logs
- notes must not be left in a partially mutated state

## Deterministic Fallback

Deterministic fallback remains the safe scheduler path when:

- the preferred model is unavailable
- model-driven action selection is intentionally skipped
- the AI action payload is invalid

The fallback path must:

- preserve auditability
- keep note state consistent
- record deterministic fallback where the workflow already supports it
- preserve knowledge packs instead of flattening them
- route malformed or contradictory notes into `Inbox/Quarantine`

For explicit fallback verification, operators may run the underlying CLI
directly:

```bash
node /Users/tonyholovka/workspace/PARA/scripts/paraffine-affine-inbox.js \
  run-cycle --query Inbox --limit 10
```

## Auditability Requirements

Scheduled maintenance must preserve:

- note status transitions
- retained or discard reasons
- deterministic fallback markers when used
- retrievable resulting state

Cron should never treat maintenance as fire-and-forget. Logs must be sufficient
to prove what command ran and whether it succeeded.
