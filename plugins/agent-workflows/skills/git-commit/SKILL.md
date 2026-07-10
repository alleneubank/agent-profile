---
name: git-commit
description: Use when preparing clean, logical git commits from an existing working tree
---

# Git Commit

Prepare focused commits that are easy to review and revert.

## Workflow

1. Load `git-best-practices`.
2. Inspect `git status`, staged changes, unstaged changes, current branch, and recent commits.
3. Group changes by intent, not by file extension.
4. Stage only the files for one logical commit at a time.
5. Use a conventional commit subject when it fits the repo style.
6. Run the relevant verifier before committing when the change is non-trivial.

## Rules

- Never include unrelated drift just because it is present.
- Do not rewrite or discard user changes unless explicitly asked.
- If the tree contains multiple unrelated changes, create multiple commits or stop and ask.
- Mention uncommitted leftovers after committing.
- If the human will review the working tree in hunk, write the `.hunk/agent-context.json`
  sidecar before committing (see `hunk-notes`), and keep `.hunk/` out of the commit.

