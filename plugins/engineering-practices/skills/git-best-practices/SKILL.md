---
name: git-best-practices
description: Use when creating commits, managing branches, opening PRs, or rewriting history. Not for non-git implementation tasks or repo-specific release policy decisions.
---

# Git Best Practices

## Always Active Principles

When this skill is loaded, follow these directives for all git operations:

1. **Discover before acting** — run branch discovery to determine the repo's default and production branches before branching, merging, or opening PRs
2. **Conventional commits** — every commit uses `type(scope): description` format
3. **Stage explicitly** — add files by name so only intended changes are committed
4. **Protect shared history** — use `--force-with-lease` for force pushes, never plain `--force`; a force push is routine only when the ordered work requires it and a backup ref exists — force-pushing a shared or deploy-tracked ref belongs to the user
5. **Push per-ref** — before pushing, discover which refs deploy pipelines track (CI/CD config, repo docs) and apply the publish law in AGENTS.md

## Agent Git Workflow

### Checkpoint Commits

Agents may create WIP checkpoint commits during long-running tasks, cleaned up before PR.

- Prefix with `wip:` or use standard conventional commit format
- Keep changes logically grouped even in WIP state
- Run the `rewrite-history` skill before opening a PR to craft a clean narrative

### Setting Work Aside

Set uncommitted work aside as a commit on a `wip/<topic>` branch, not a stash.
A branch is listed, pushable, and covered by branch hygiene; a stash is local,
unlabeled, and invisible to later sessions.

- A stash that is popped within the same operation (`--autostash`, a quick
  stash/pop around a checkout) is fine
- When the pop does not apply cleanly, commit the stashed work to a `wip/`
  branch before continuing, and report the branch

### Commit Discipline

- Group changes by intent, not by file extension; when the tree holds several
  unrelated changes, stage and commit them one logical change at a time
- Stage files explicitly by name: `git add src/auth.ts src/auth.test.ts`
- Verify staged content with `git status` before committing, and run the
  relevant verifier before committing a non-trivial change
- Leave unrelated drift out, and never rewrite or discard user changes unless asked
- Keep a behavior-preserving prefactor and the behavior change as separate
  commits when each is green on its own (see Sizing)
- Keep secrets and large binaries out of commits (secret handling: rules of engagement) — warn the user if staged files look sensitive
- Keep `.hunk/` out of the commit; a requested `.hunk/agent-context.json` review
  sidecar lands before the commit so its line numbers match the working-tree diff
- Target one logical change per commit in final PR-ready state
- Mention uncommitted leftovers after committing

### Force Push

Use `--force-with-lease` exclusively to protect against overwriting upstream changes:

```bash
git push --force-with-lease origin feat/my-branch
```

### Rebasing a Stack

When rebasing a branch that other branches are stacked on (e.g. phased `NN-description` chains), use `git rebase --update-refs` so the stacked branches follow the rewrite instead of being orphaned on the old commits. `--update-refs` moves **local** refs only — each moved branch that also exists on the remote still needs its own `--force-with-lease` push (per-ref publish semantics), and any branch checked out in another worktree is skipped. For the full conflict-resolution and safety workflow, use the `git-rebase-sync` skill. When the branches form a GitHub stack (`gh stack view --json` succeeds), use `gh stack rebase` / `gh stack sync` instead so the stack's PR bases stay in step; see the `gh` skill.

## Conventional Commits

Format: `type(scope): description`

Subject line rules:
- Lowercase, imperative mood, no trailing period
- Under 72 characters
- Scope is optional but preferred when a clear subsystem exists

Common types:

| Type | Use for |
|------|---------|
| `feat` | New functionality |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Restructuring without behavior change |
| `perf` | Performance improvement |
| `chore` | Maintenance, dependencies, tooling |
| `test` | Adding or updating tests |
| `ci` | CI/CD pipeline changes |
| `build` | Build system changes |
| `style` | Formatting, whitespace (no logic change) |

### Commit Bodies

Body is optional — only add one when the change is genuinely non-obvious. The subject line carries the "what"; the body explains "why."

Add a body when:
- The motivation or tradeoff is non-obvious
- Multi-part changes benefit from a bullet list
- External context is needed (links, issue references, root cause)

See git-examples.md for commit message examples.

## Branch Discovery

Before branching or opening a PR, discover the repo's branch topology. Run these commands and store the results:

```bash
# Default branch (PR target for most repos)
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'

# Current branch
git branch --show-current

# Production branch (if different from default)
git branch -r --list 'origin/main' 'origin/master' 'origin/production'
```

If `gh` is unavailable or the repo has no remote, see the fallback commands in git-examples.md.

Store the discovered branch name and reference it throughout. Use the actual branch name in all subsequent commands.

### Branch Naming

Use repository branch naming conventions first. If no convention is documented, use:

Format: `type/description-TICKET-ID`

Examples:
- `feat/add-login-SEND-77`
- `fix/pool-party-stall-SEN-68`
- `chore/update-deps`
- `hotfix/auth-bypass`

Include the ticket ID when an issue exists. Omit when there is no ticket.

### Branch Flow

Use repository branch flow policy first. If policy is undocumented, a common baseline is:

```
{production-branch} (production deploys)
 └── {default-branch} (staging/testnet deploys, PR target)
      ├── feat/add-feature-TICKET
      ├── fix/bug-description-TICKET
      └── hotfix/* (branches off production branch for hotfixes)
```

- Feature and fix branches start from the default branch
- Hotfix branches start from the production branch
- PRs target the default branch unless the repo uses a single-branch flow
- When default branch and production branch are the same, all PRs target that branch directly

The deploy annotations in the diagram are the publish map for the AGENTS.md publish law.

### Merge Strategy

Use repository merge policy first (required in many organizations).

If no policy exists, these defaults are reasonable:

| PR target | Strategy | Rationale |
|-----------|----------|-----------|
| Feature → default branch | Squash merge | Clean history, one commit per feature |
| Default → production | Merge commit | Preserves the release boundary; visible deploy points |
| Hotfix → production | Squash merge | Single atomic fix on production |

A promotion merge (default → production) always needs its own explicit order — authorization to land work on the default branch never covers it.

## PR Workflow

### Sizing

Prefer small, focused changes without imposing arbitrary line or file limits.
When a change cannot be small, it must still tell one coherent story. If existing
structure fights the feature, separate a behavior-preserving prefactor from the
behavior change when each can remain independently green and reversible; do not
split an inherently atomic change into invalid intermediate states.

### PR Creation

Use repo-native PR tooling (`gh pr create`, GitLab CLI, or web UI) with a short
title, a summary that says what changed and why, and a test plan as a checklist.
Dependent PRs form a native GitHub stack, never hand-chained `--base` PRs; see
the `gh` skill.

### Merge Readiness and History

Before calling a PR mergeable or editing its description, apply the `gh` skill's
PR-state rules. To turn messy WIP history into a clean narrative before a PR,
use the `rewrite-history` skill.
