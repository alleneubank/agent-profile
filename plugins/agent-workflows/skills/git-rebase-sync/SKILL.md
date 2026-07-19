---
name: git-rebase-sync
description: Use when syncing a feature branch onto the latest origin base branch via git rebase.
---

# git-rebase-sync

Use this skill when you need to sync a feature branch onto the latest `origin/{base_branch}` via **git rebase**, including deliberate conflict resolution. Invoking this skill is the order to rebase: the local rebase runs behind a backup tag as reversible interior work — print each history-rewriting command as a status line, do not wait for confirmation. Pushes follow per-ref publish semantics (step 9).

## Goals
- Rebase the current branch onto a specified base branch (often the repo default branch like `dev` or `main`).
- Resolve conflicts deliberately, without guesswork.
- Keep safety rails: backup ref, `--force-with-lease`, per-ref push semantics.

## Hard Rules
- Do not create or switch to a different feature branch. Operate on the current branch unless the user explicitly asks otherwise.
- Print each history-rewriting command (`git rebase ...`, `git push --force*`) as a one-line status before running it.
- Create a local backup ref (prefer an annotated tag) before starting the rebase. Do not push backup refs unless the user explicitly asks.
- Prefer `git push --force-with-lease`, never plain `--force`.
- Pushing a deploy-tracked ref is a publish and stays with the user (rules of engagement); discover which refs pipelines track before pushing. A ref that is shared (other authors, a collaborative PR) stays with the user as well.
- Resolve conflicts via the interior-decision ladder (step 7). Do not invent product behavior.

## Workflow

### 1) Identify base + branch
- Determine the current branch:
  - `git branch --show-current`
- Determine the base branch you will rebase onto:
  - If not provided, use the remote default branch:
    - `git symbolic-ref --short refs/remotes/origin/HEAD` (strip the `origin/` prefix; if unset, use your forge CLI or `git remote show origin`)
- Fetch latest:
  - `git fetch origin`

### 2) Preflight safety checks
- Ensure the working tree is clean and there is no operation in progress:
  - `git status`
- If `git status` indicates an in-progress merge/rebase/cherry-pick, do not stack a rebase on top: investigate what it is and finish or abort it first; surface it to the user only if its state is genuinely unclear.

### 3) Create a local backup ref (do not push)
- Create an annotated tag at current `HEAD`:
  - `git tag -a {branch_name}-rebase-backup-$(date +%Y%m%d-%H%M%S) -m "pre-rebase backup" HEAD`
- Record the tag name as `{backup_ref}` for recovery.

### 4) Choose rebase mode (normal vs preserve merges)
- Check whether the branch contains merge commits:
  - `git rev-list --count --merges origin/{base_branch}..HEAD`
- If merge commits exist, decide the mode yourself: preserve them (`--rebase-merges`) when the merge structure carries meaning, flatten (plain rebase) when it is noise. Log the call as a provisional decision.

### 5) Detect stacked branches (will they follow the rebase?)
Other local branches may point at intermediate commits in the range being rewritten (`origin/{base_branch}..HEAD`) — common with phased `NN-description` stacks. A plain rebase rewrites those commits and **orphans** the stacked branches on the old, pre-rebase commits (along with every open PR built on them). `--update-refs` (the default in step 6) moves them onto the rewritten commits instead. Enumerate them so you can report what the rebase will carry along:

```bash
# Branches pointing into the range being rewritten — these get orphaned by a
# plain rebase and require --update-refs to follow the rewrite.
cur=$(git branch --show-current)
git for-each-ref --format='%(refname:short)' refs/heads | while read -r br; do
  [ "$br" = "$cur" ] && continue
  if git merge-base --is-ancestor "$br" HEAD \
     && ! git merge-base --is-ancestor "$br" origin/{base_branch}; then
    echo "stacked: $br ($(git rev-parse --short "$br"))"
  fi
done
```

- Report the detected stacked branches as status before rebasing.
- A branch that is **checked out in another worktree** is skipped by `--update-refs` (git will not move a checked-out branch); flag these for manual verification after the rebase.

### 6) Run the rebase
- Default to `--update-refs` so any stacked branch pointing into the rewritten range follows the rewrite instead of being orphaned.
- Print the exact command as status, then run it:
  - Default:
    - `git rebase --update-refs origin/{base_branch}`
  - With merge preservation:
    - `git rebase --rebase-merges --update-refs origin/{base_branch}`
- To make this the permanent default without the flag: `git config --global rebase.updateRefs true`.

### 7) Conflict handling loop
When conflicts happen:
1. Collect context:
   - `git status`
   - Identify conflicted files (from status output).
2. Resolve each conflicted file via the interior-decision ladder (rules of engagement):
   - Investigate first: open the file, read the surrounding code and both sides' intent — most conflicts are located facts, not judgment calls.
   - Prefer minimal, mechanical resolutions: keep upstream changes unless the feature branch deliberately supersedes them; re-run generators (lockfiles, codegen) instead of hand-editing when appropriate.
   - Check the brief's Decisions and the doctrine for a standing answer before treating intent as ambiguous.
   - If intent is genuinely forked, consult an independent model carrying the evidence and candidate resolutions, then decide provisionally and log the call.
3. Apply the resolution, then stage only resolved files:
   - `git add <file...>`
4. Continue:
   - `git rebase --continue`
5. Accumulate any calls that genuinely need the user into one numbered batch delivered at the end — never ask serially. If a conflict is too risky to resolve even provisionally, abort the rebase (`git rebase --abort` is safe) and report an honest block: what was tried, why it cannot converge, and the batched questions.

Helpful commands during conflicts:
- Inspect current conflict hunks: `git diff`
- See the commit being replayed: `git show`
- If you need to back out: `git rebase --abort` (this is safe and should be preferred over destructive resets)

### 8) Post-rebase verification
- Show the new commit range:
  - `git log --oneline --decorate origin/{base_branch}..HEAD`
- Confirm each stacked branch from step 5 moved onto the rewritten range. `git rebase --update-refs` prints an "Updated the following refs with --update-refs" summary; the moved branch refs should also appear as decorations on the new commits in the log above. Note any that did **not** move (e.g. checked out in another worktree) for manual handling.
- Run appropriate repo checks (tests, typecheck, lint) if available.

### 9) Push updated branch(es) — per-ref semantics
- If the branch already exists on origin, rebasing rewrites history, so pushing requires force-with-lease.
- `--update-refs` only moves **local** refs. A normal `git push` updates the current branch only — each stacked branch (from step 5) that also exists on origin must be force-pushed **individually**.
- Discover which refs deploy pipelines track (CI/CD config, repo docs) before pushing.
- Establish ownership for **each** ref about to be pushed — the current branch and every moved stacked branch individually, before its push:
  - Authorship in the rewritten range: `git shortlog -sn origin/{base_branch}..{ref}` — other authors present means the ref is shared.
  - Any open PR on the ref with other participants (forge CLI) also means shared.
  - Shared, deploy-tracked, or ownership unclear → do **not** push that ref; hand it to the user with the exact command. Push the refs that pass; skipping one never blocks the others.
- A force-with-lease push to your own non-deploying feature branch is a proposal: when the invocation ordered the sync, push without extra authorization, printing the exact command(s) as status:
  - Current branch:
    - `git push --force-with-lease origin HEAD:{branch_name}`
  - Each moved stacked branch that passed the ownership check and exists on origin (repeat per branch):
    - `git push --force-with-lease origin {stacked_branch}`
- Pushing or merging a deploy-tracked ref is a publish: restate the concrete ref and leave it to the user.
- Any branch skipped because it is checked out in another worktree was not moved — verify it before pushing.

## Recovery
- If something goes wrong, restore the pre-rebase state:
  - `git reset --hard {backup_ref}`
- The backup tag makes this reversible interior work; print the command as status before running it.
