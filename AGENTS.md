# PARA

This workspace was created as a separate project folder for AFFiNE-backed notes work.

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
- This folder can be used as the clean starting point for PARA note workflows and future PI wiring

## PARAFFINE CLI Ownership

- The canonical PARAFFINE workflow script is `scripts/paraffine-affine-inbox.js`
- Pi extensions should call this repo-owned script path directly or via `PARAFFINE_CLI_PATH`
- Scheduled maintenance jobs should use this same script path as the stable entrypoint
- Do not treat temporary task worktrees as part of the supported runtime contract
