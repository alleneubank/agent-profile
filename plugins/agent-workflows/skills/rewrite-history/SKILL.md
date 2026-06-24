---
name: rewrite-history
description: Use when the user asks to rebuild a feature branch into a clean, reviewable git history
---

# Rewrite History

Rewrite branch history only when the user explicitly asks. History rewriting is
high-risk and requires confirmation before destructive commands.

## Workflow

1. Confirm the current branch and default branch.
2. Require a clean worktree before continuing.
3. Fetch and inspect the diff against the default branch.
4. Sync with the latest default branch before rewriting.
5. Create a local backup tag before any reset or rebase.
6. Triage changes into core feature work and independent changes.
7. Rebuild commits into a narrative-quality sequence with focused messages.
8. Verify the final tree matches the intended final state.

## Guardrails

- Print exact destructive commands and wait for user confirmation before running them.
- Use a local annotated backup tag and do not push backup refs unless asked.
- Use `git push --force-with-lease` only after explicit confirmation.
- If syncing with the default branch conflicts, abort and stop.
- Do not mix unrelated independent changes into the rewritten feature history.

