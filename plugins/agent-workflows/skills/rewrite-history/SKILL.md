---
name: rewrite-history
description: Use when the user asks to rebuild a feature branch into a clean, reviewable git history
---

# Rewrite History

Rewrite branch history only when the user explicitly asks. That invocation
authorizes the local rewrite: resets and rebases behind the backup tag are
reversible interior work — print each command as status and proceed.

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

- Print each destructive command as a one-line status before running it; the
  backup tag keeps every local step reversible.
- Use a local annotated backup tag and do not push backup refs unless asked.
- Push per-ref (rules of engagement): a `--force-with-lease` push to your own
  non-deploying feature branch is a proposal needing no extra authorization;
  a shared (other authors, collaborative PR) or deploy-tracked ref is a
  publish — restate the ref and leave it to the user.
- If syncing with the default branch conflicts, resolve via the
  `git-rebase-sync` skill's conflict ladder; if genuinely stuck, stop with an
  honest block: what was tried, why it cannot converge, and a proposed path.
- Do not mix unrelated independent changes into the rewritten feature history.

