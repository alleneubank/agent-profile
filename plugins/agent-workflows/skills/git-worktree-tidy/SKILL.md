---
name: git-worktree-tidy
description: Use when fetching and pruning a worktree-based repository, removing stale local branches, worktrees, or stashes, or bringing its important branches up to date.
---

# git-worktree-tidy

Routine hygiene for bare-repo + worktree layouts. Fetches origin, prunes
gone branches and orphaned worktrees, reviews stashes, restores a missing
default-branch checkout, and fast-forwards important branches.

## When to use

User asks to "fetch prune", "clean up stale branches/worktrees", or
"update main/dev to latest" in a worktree-based repo. Stash review applies to
any repository.

## Hard Rules

- Verified-merged branches (step 3a) and clean, owner-free worktrees are
  recoverable interior work: delete them and report what was removed.
- Dirty or owned worktrees, unverifiable owners, and at-risk branches go into
  the single confirmation in step 5. Force never bypasses the owner guard.
- Every stash is at risk: nothing proves its content landed, so each one goes
  into the step 5 confirmation. Keep a stash the user wants by committing it
  to a `wip/<topic>` branch, not by leaving it stashed.
- Use `--ff-only` when updating branches. If ff-only fails, stop and ask.
- Operate from the `.bare` directory (or repo root) for branch/worktree
  management commands.
- Never infer ship status from ancestry alone; verify the forge's PR state
  and head at merge (step 3a).
- A clean checkout whose branch is verified merged is stale. Switch the
  primary (non-bare) working tree back to the default branch; remove any other
  such worktree (step 9). Never switch a dirty checkout, or one whose branch is
  not verified merged; add a new worktree at the conventional path, or skip.
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

Collect branch names whose upstream is gone. Also collect every other local
branch except the default: a merged PR whose remote branch was never deleted
leaves no `gone` marker, including on branches checked out in a worktree.
Step 3a classifies them all.

### 3a) Verify ship status (gone upstream ≠ merged)

A deleted upstream does not prove shipping. Squash- and rebase-merges change
SHAs, so ancestry cannot prove it either. Verify against the forge.

For each collected branch (GitHub example; substitute your forge CLI):

```bash
# Was there a merged PR from this head?
gh pr list --state all --head <branch> \
  --json number,state,mergedAt,mergeCommit \
  --jq '.[] | "#\(.number) \(.state) merged=\(.mergedAt // "no")"'

# If merged, confirm nothing was added to the branch AFTER the merge:
# the local tip should equal the PR head at merge.
gh pr view <pr> --json commits --jq '.commits[-1].oid'   # vs: git rev-parse <branch>
```

Classify each collected branch:
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

Cross-reference branches and check each candidate for dirty state:

```bash
cd <worktree-path> && git status --short
```

From the management directory, run the mandatory owner guard, including paths
whose directories are already gone:

```bash
bash <skill-dir>/scripts/worktree.sh check <worktree-path> ...
```

It emits schema-1 JSONL: path, status, session/PID owners and discovery errors.
Exit 0 means owner-free, 3 means owned, 4 means unknown (2 is usage).
It requires Python 3.9+, lsof and zmx; `SOX_BIN` selects a sox CLI outside
PATH. It checks process cwds, sox's current cwd and zmx's initial cwd,
including descendants, deleted cwds and the sox backing namespace. Set
`SOX_HOME`/`ZMX_DIR` for the host's actual namespaces; repeat for other homes.
Run on the worktree's host. OS-inaccessible processes remain unverified.
Each discovery query has a 15-second timeout. On a loaded host, set
`WORKTREE_QUERY_TIMEOUT_SECONDS` to a positive number of seconds, at most 300;
timeouts still refuse removal and prune. This limit applies to each query,
so a caller's overall deadline must also allow the remaining discovery queries.

Categorize:
- **Clean + merged + owner-free**: safe to remove (primary: step 9)
- **Dirty, branch at risk, owned or unknown**: flag with each owner/error
- **Prunable metadata**: directory gone; the same owner gate applies

### 4a) Review stashes

```bash
git stash list --format='%gd %ci %gs'
git stash show --stat --include-untracked stash@{N}
git log -1 --format='%h %s' stash@{N}^1        # the commit it was taken on
```

For each stash, record its age, base commit, and files, then read enough of
the diff to say whether that content now exists on the default branch
(`git stash show -p stash@{N} | git apply --reverse --check -` passing is
strong evidence; failing proves nothing, because later edits to the same lines
defeat it). Label each **likely landed**, **superseded** (the files or feature
were rewritten or removed since), or **unshipped**, with the evidence.

### 5) Report, then confirm only the at-risk class

Present a summary table:

```
Stale worktrees to remove:
  <path> (<branch>) [clean]
  <path> (<branch>) [AT RISK — dirty / session tool:id / PID command / unknown: error]

Stale branches:
  <branch>  [merged — PR #N, safe to delete]
  <branch>  [AT RISK — no merged PR / commits after merge; review first]

Prunable worktree metadata:
  <entry> [owner-free / AT RISK — owners or errors]

Stashes:
  stash@{N}  <age> on <base>  <files>  [likely landed | superseded | unshipped — evidence]
```

Proceed with verified-merged branches and clean, owner-free worktrees.
Batch all **at-risk** items and stashes into one confirmation with ship status
and the exact owners and teardown proposed. An owned worktree is never interior.

### 6) Remove stale worktrees

For an approved owned worktree, stop owners through their own tools first (the project's
stack-down command, `sox kill <backing-id>`, or `zmx kill <name>` in the reported
namespace). Signal only individually attributed PIDs; never a process-table
selector. Approval does not turn a discovery error into an empty inventory:
resolve it or skip. Recheck until owner-free, then remove through the guard:

```bash
bash <skill-dir>/scripts/worktree.sh remove <worktree-path>
```

The guard rechecks immediately before Git. A hit or error refuses removal;
report and skip. Add `--force` only for approved dirty state.

### 7) Delete stale branches

```bash
git branch -D <branch1> <branch2> ...
```

A merged branch still checked out in the primary working tree is deleted
after step 9 switches it off.

### 7a) Resolve stashes

Drop the stashes the user approved, highest index first so the remaining
indexes stay valid (`git stash drop stash@{N}`). For each stash the user keeps,
commit it to a `wip/<topic>` branch in a clean worktree, then drop the stash.

### 8) Prune worktree metadata

```bash
bash <skill-dir>/scripts/worktree.sh prune
```

This guards every prunable entry, including deleted directories. If any is
owned or unknown, no prune runs: report it, obtain approval for teardown, and
retry after owners are gone. Never substitute a destructive Git remove/prune.

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
- Default branch not checked out, and the primary (non-bare) working tree is
  clean on a verified-merged branch → `git switch <default>`, ff-only pull,
  then delete the merged branch.
- Default branch not checked out, git-common-dir is `.bare`, and
  `../<default>` (relative to `.bare`) does not exist:
  - local ref exists: `git worktree add ../<default> <default>`
  - no local ref: `git worktree add ../<default> -b <default> origin/<default>`
  - then ff-only pull
  Creating that checkout is interior; report the path.
- Otherwise (the conventional path exists, or the only checkouts are dirty or
  on unmerged branches) → skip and report. Do not `git switch` such a
  checkout onto the branch.

If ff-only fails, report the divergence and ask for guidance.

### 10) Final status

Show a summary: what was removed, which stashes were dropped or kept as
branches, what checkouts were restored, what was updated, any items skipped.
