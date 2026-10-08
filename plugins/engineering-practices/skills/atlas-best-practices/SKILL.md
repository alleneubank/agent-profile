---
name: atlas-best-practices
description: Use when working with atlas.hcl, Atlas CLI commands, schema HCL/SQL files, or migration planning and reviews.
---

# Atlas Best Practices

## Versioned migrations

After `atlas migrate diff`, run `atlas migrate lint --env <env> --latest 1` and
`atlas migrate validate --env <env>` before calling the migration done. Lint
reports destructive and data-dependent changes; validate checks the directory
checksum and replays the SQL on the dev database.

## Current facts

Answer flag and feature questions from the installed CLI first:
`atlas version` and `atlas <command> --help`. Fetch a docs page only when the
installed help does not settle it:

- Docs index: https://atlasgo.io/llms.txt
- CLI reference: https://atlasgo.io/cli-reference
- Lint analyzers: https://atlasgo.io/lint/analyzers
