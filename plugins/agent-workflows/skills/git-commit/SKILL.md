---
name: git-commit
description: Use when preparing clean, logical git commits from an existing working tree
---

# Git Commit

Prepare focused commits that are easy to verify and revert.

Load `git-best-practices`. Group changes by intent, not by file extension, and
stage one logical commit at a time. Use a conventional commit subject when it
fits the repo style. Run the relevant verifier before committing a non-trivial
change.

## Rules

- Never include unrelated drift just because it is present.
- Do not rewrite or discard user changes unless explicitly asked.
- If the tree contains multiple unrelated changes, create multiple commits.
- When a behavior-preserving prefactor and the behavior change are each green on
  their own, keep them as separate logical commits; do not split a change into
  invalid intermediate states merely to make it smaller.
- Mention uncommitted leftovers after committing.
- Keep `.hunk/` out of the commit. A requested `.hunk/agent-context.json` review
  sidecar lands before the commit so its line numbers match the working-tree diff.
