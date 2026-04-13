# PARAFFINE Template MCP Boundary

The write-capable `affine-mcp-server` used by PARAFFINE can manage a canonical source template document and instantiate notes from it.

## What MCP Can Do

- ensure the canonical `PARAFFINE Note Template` document exists
- keep that source template under the workspace tree
- instantiate new notes from that template
- optionally place instantiated notes into a chosen organize folder

## What MCP Cannot Yet Do Cleanly

- toggle the AFFiNE page-level `Template` property for a normal document
- register the document into the AFFiNE UI template menu through a dedicated property-write tool

## Operational Rule

1. The script creates or reuses the canonical source template doc.
2. A one-time manual step in the AFFiNE UI turns on the `Template` property for that doc.
3. After that, the same doc can be used both:
   - from the AFFiNE UI template menu
   - from MCP template instantiation commands

## Canonical Template

- Title: `PARAFFINE Note Template`
- Current doc id should be discovered at runtime, not hardcoded in docs

## Script Commands

- `ensure-template`
- `create-note-from-template --title ... [--folder Inbox]`

The `create-note-from-template` flow no longer defaults new docs into `Inbox`. Folder placement must be explicit to avoid accidental smoke-test residue in the live intake queue.
