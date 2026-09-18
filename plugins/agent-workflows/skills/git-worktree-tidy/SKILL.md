---
name: git-worktree-tidy
description: Use when fetching and pruning a worktree-based repository, removing stale local branches or worktrees, or bringing its important branches up to date.
---

# git-worktree-tidy

Routine hygiene for bare-repo + worktree layouts. Fetches origin, prunes
gone branches and orphaned worktrees, restores a missing default-branch
checkout, and fast-forwards important branches.

## When to use

User asks to "fetch prune", "clean up stale branches/worktrees", or
"update main/dev to latest" in a worktree-based repo.

## Hard Rules

- Verified-merged branches (merged PR + head == tip, step 3a) and clean
  worktrees are recoverable interior work: delete them without asking, and
  report what was removed.
- At-risk branches and dirty worktrees hold potentially unshipped work: batch
  them into the single confirmation in step 5. Never force-delete a dirty
  worktree without explicit approval.
- Use `--ff-only` when updating branches. If ff-only fails, stop and ask.
- Operate from the `.bare` directory (or repo root) for branch/worktree
  management commands.
- Never infer "merged/shipped" from `git rev-list origin/main..<branch>` or
  `git merge-base --is-ancestor` alone. Squash- and rebase-merges land the
  work under a new SHA, so a fully-shipped branch still shows commits "not in
  main" and a non-ancestor tip. Verify ship status against the forge's PR
  merge state (step 3a) before classifying a gone branch as unmerged.
- Never switch a live or dirty worktree onto the default branch to restore
  a checkout. Add a new worktree at the conventional path, or skip.
- Auto-create a missing default-branch worktree only as a sibling of `.bare`
  named after that branch (`../<default>` from `.bare`). In any other layout,
  report the missing checkout and do not invent a path.

## Workflow

### 1) Locate the bare root

Determine the bare repo directory:
- If cwd contains `.bare/`, use it
- Otherwise: `git rev-parse --git-common-dir`

All branch and worktree management commands run from this directory.

### 2) Fetch + prune

```bash
git fetch --prune origin
```

Report what was pruned (deleted remote-tracking branches, updated refs).

### 3) Discover stale branches

```bash
git branch -vv | grep ': gone]'
```

Collect branch names whose upstream is gone.

### 3a) Verify ship status (gone upstream ≠ merged)

A deleted upstream ("gone") does NOT prove the work shipped, and git ancestry
is unreliable here: squash- and rebase-merges land the work under a new SHA, so
a fully-shipped branch still shows commits "not in main" and a non-ancestor tip.
Verify against the forge before deleting — gone-but-unmerged branches are the
only ones that lose real work.

For each gone-upstream branch (GitHub example; substitute your forge CLI):

```bash
# Was there a merged PR from this head?
gh pr list --state all --head <branch> \
  --json number,state,mergedAt,mergeCommit \
  --jq '.[] | "#\(.number) \(.state) merged=\(.mergedAt // "no")"'

# If merged, confirm nothing was added to the branch AFTER the merge:
# the local tip should equal the PR head at merge.
gh pr view <pr> --json commits --jq '.commits[-1].oid'   # vs: git rev-parse <branch>
```

Classify each gone branch:
- **Merged (verified)** — a MERGED PR exists AND its head == local tip → shipped,
  safe to delete.
- **At risk** — no merged PR, or the tip has commits dated after the merge
  (`git show -s --format=%ci <tip>`) → genuine unshipped work. Flag it; do not
  delete without explicit approval.

If `gh`/the forge CLI is unavailable, say so and treat unverifiable branches as
**at risk** rather than assuming merged.

### 4) Discover stale worktrees

```bash
git worktree list
git worktree prune --dry-run
```

Cross-reference worktrees against the gone-branch list. Check each stale
worktree for dirty state:

```bash
cd <worktree-path> && git status --short
```

Categorize:
- **Clean + gone**: safe to remove
- **Dirty + gone**: flag for user review
- **Prunable metadata**: orphaned worktree entries (directory already gone)

### 5) Report, then confirm only the at-risk class

Present a summary table:

```
Stale worktrees to remove:
  <path> (<branch>) [clean]
  <path> (<branch>) [dirty — N uncommitted changes]

Stale branches:
  <branch>  [merged — PR #N, safe to delete]
  <branch>  [AT RISK — no merged PR / commits after merge; review first]

Prunable worktree metadata:
  <entry>
```

Proceed with the verified-merged branches and clean worktrees immediately —
they are recoverable interior deletions. Batch the **at risk** branches and
**dirty** worktrees into one confirmation, with the ship-status evidence in
front of the user; only that class waits.

### 6) Remove stale worktrees

For each removable worktree:

```bash
git worktree remove <name>
```

If removal fails (dirty), report and skip unless user approved force.

### 7) Delete stale branches

```bash
git branch -D <branch1> <branch2> ...
```

### 8) Prune worktree metadata

```bash
git worktree prune -v
```

### 9) Restore and update important branches

Discover the default branch from the remote, not by guessing `main`:

```bash
git rev-parse --abbrev-ref origin/HEAD    # origin/dev
# if missing:
git remote set-head origin -a
```

The branch name is the part after `origin/`. If `origin/HEAD` is still
unknown, report and skip restore rather than guessing.

Restore a missing checkout only for the default branch. Fast-forward every
worktree already on the default, `main`, `dev`, or a branch the user named.

Inspect `git worktree list`:

- Default (or other important) branch already checked out →
  `cd <path> && git pull --ff-only origin <branch>`.
  If that path is not the conventional `.bare` sibling, say so; do not try
  to add a second checkout (git will refuse).
- Default branch not checked out, git-common-dir is `.bare`, and
  `../<default>` (relative to `.bare`) does not exist:
  - local ref exists: `git worktree add ../<default> <default>`
  - no local ref: `git worktree add ../<default> -b <default> origin/<default>`
  - then ff-only pull
  Creating that checkout is interior; report the path.
- Default branch not checked out, but the conventional path exists or this
  is not a `.bare` sibling layout → skip and report. Do not `git switch`
  some other worktree onto the branch.

If ff-only fails, report the divergence and ask for guidance.

### 10) Final status

Show a summary: what was removed, what checkouts were restored, what was
updated, any items skipped.
