# PARAFFINE Pi Runtime Contract

## Reference Index

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [PARAFFINE architecture](paraffine-architecture.md)
- [AI curation contract](paraffine-ai-curation-contract.md)

## Purpose

This document defines the supported runtime boundary between the PARA repo and
the dormant Pi extension used to operate PARAFFINE from Pi.

PARA owns the workflow contract, the AFFiNE-backed CLI, and the supported launch
shape. The `pi-extensions` repo owns the dormant bridge implementation in
`extensions/paraffine.ts`.

## Ownership Boundary

| Concern | Owning Repo | Artifact |
|--------|-------------|----------|
| AFFiNE-backed workflow logic | `Holovkat/paraffine` | `scripts/paraffine-affine-inbox.js` |
| Allowed AI maintenance actions | `Holovkat/paraffine` | `features/paraffine-ai-curation-contract.md` |
| Pi runtime contract | `Holovkat/paraffine` | `features/paraffine-pi-runtime-contract.md` |
| Dormant Pi bridge code | `Holovkat/pi-extensions` | `extensions/paraffine.ts` |
| Ollama provider integration | `Holovkat/pi-extensions` | `extensions/ollama-provider.ts` |

The bridge implementation is a companion dependency. It must not redefine the
PARAFFINE contract inside `pi-extensions`.

## Supported Launch Contract

Recommended interactive launch:

```bash
PARAFFINE_ROOT=/Users/tonyholovka/workspace/PARA \
pi \
  -e /Users/tonyholovka/workspace/pi-extensions/extensions/ollama-provider.ts \
  -e /Users/tonyholovka/workspace/pi-extensions/extensions/paraffine.ts \
  --model ollama/gemma4:26b
```

Recommended non-interactive launch:

```bash
PARAFFINE_ROOT=/Users/tonyholovka/workspace/PARA \
pi -p \
  -e /Users/tonyholovka/workspace/pi-extensions/extensions/ollama-provider.ts \
  -e /Users/tonyholovka/workspace/pi-extensions/extensions/paraffine.ts \
  --model ollama/gemma4:26b \
  "/paraffine-status"
```

Supported characteristics:

- the extension is dormant unless explicitly loaded with `-e`
- the preferred model is `ollama/gemma4:26b`
- non-interactive runs must emit plain-text command output suitable for cron
- runtime calls target the repo-owned PARAFFINE CLI only

## CLI Resolution Rules

The supported CLI resolution order is:

1. `PARAFFINE_CLI_PATH`
2. `PARAFFINE_ROOT/scripts/paraffine-affine-inbox.js`
3. `cwd/scripts/paraffine-affine-inbox.js`
4. stable PARA repo path: `/Users/tonyholovka/workspace/PARA/scripts/paraffine-affine-inbox.js`

Unsupported:

- temporary task worktree fallbacks
- hidden implicit repo discovery outside the paths above

This keeps Pi and cron tied to a stable runtime contract rather than a transient
implementation branch.

## Supported Pi Commands

| Command | Purpose |
|--------|---------|
| `/paraffine-status` | Show model, resolved CLI path, runtime root, and launch contract |
| `/paraffine-retrieve <query> [--limit N] [--statuses a,b,c]` | Query curated PARAFFINE knowledge |
| `/paraffine-cycle [query] [--limit N]` | Run one scoped curation and review cycle |
| `/paraffine-review [query] [--limit N] [--statuses a,b,c]` | Run the PARAFFINE review queue directly |

The bridge currently invokes the repo-owned CLI surface. It does not become the
source of truth for note mutations.

## Model Preference Policy

Preferred model:

- `ollama/gemma4:26b`

Behavior:

- if Pi is launched with the preferred model, PARAFFINE reports a healthy
  preferred runtime
- if Pi is launched with another model, the bridge warns but remains usable
- if the local Ollama model is unavailable, the operator should either pull the
  preferred model or intentionally proceed using deterministic fallback behavior

The preferred-model warning is advisory. It must not silently change the model.

## Runtime Readiness Contract

A healthy runtime session should prove:

- the `paraffine` extension was explicitly loaded
- the model line resolves
- the PARAFFINE CLI path resolves
- the root path resolves to the PARA repo or an explicit override

Expected `/paraffine-status` output includes:

- `Workspace: ...`
- `Model: ollama/gemma4:26b (preferred)` or an explicit non-preferred warning
- `CLI: .../scripts/paraffine-affine-inbox.js`
- `Root: ...`
- the recommended launch command

## Failure Handling

### Missing CLI

If the bridge cannot resolve the CLI, it must fail with a direct runtime error
and not silently search task worktrees.

Expected message:

- `PARAFFINE CLI not found. Set PARAFFINE_CLI_PATH or PARAFFINE_ROOT...`

### Missing Preferred Model

If `ollama/gemma4:26b` is not available:

- Pi launch may still succeed with another model
- the bridge must make that drift visible
- deterministic CLI behavior remains the safe fallback path

### AFFiNE/CLI Failure

If the underlying CLI command fails:

- the Pi bridge must surface stderr
- the error must remain visible in non-interactive runs
- the runtime contract must not claim success

## Notes for Later Tasks

- This contract intentionally keeps PARA as the owner of the behavior spec.
- Later tasks may add richer AI-assisted action selection, but they must still
  pass through the constrained contract in
  [paraffine-ai-curation-contract.md](paraffine-ai-curation-contract.md).
