# PARAFFINE Seed Reference Docs

These documents are intended to exist both:

- in the live AFFiNE workspace as initial reference material
- in this repo as canonical seed content for future onboarding, re-seeding, and implementation work

## Purpose

These notes show new users and future agents how PARAFFINE is intended to work before the full automated curation system is complete.

They act as:

- onboarding examples
- reference explanations
- sample linked-note structures
- baseline content that can be recreated if a workspace needs to be reset

## Seed Documents

### Top-Level Reference Notes

- `PARAFFINE Project Overview`
  - explains what PARAFFINE is, why it exists, and how the workflow is intended to operate
- `Karpathy Wiki Pattern`
  - explains the selective refinement layer and how it differs from PARA curation
- `PARA Method In Detail`
  - explains the PARA model, decision rules, and how PARAFFINE uses it

### Child Example Notes Under `PARA Method In Detail`

- `Projects Examples`
  - contains 2-3 example notes that belong in Projects
- `Areas Examples`
  - contains 2-3 example notes that belong in Areas
- `Resources Examples`
  - contains 2-3 example notes that belong in Resources
- `Archives Examples`
  - contains 2-3 example notes that belong in Archives

## Placement Rule

These seed documents should:

- remain logically linked under their intended AFFiNE parent docs
- also be linked into `Inbox` so they are easy to discover without using `All docs`

## Operational Expectation

Future PARAFFINE scripting should preserve the idea of seed/reference documents as first-class workspace content.

That means:

- the repo should continue to treat these notes as canonical examples
- the AFFiNE workspace can be checked against this list
- future bootstrap or repair scripts may recreate them if missing
