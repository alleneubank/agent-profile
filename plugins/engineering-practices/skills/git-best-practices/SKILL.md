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

## Agent Git Workflow

1. **Check state** — run `git status` and `git diff HEAD`
2. **Discover branches** — identify default/current/(optional) production branch names (see Branch Discovery)
3. **Stage by name** — `git add path/to/file` for each file; verify with `git status`
4. **Write a conventional commit** — `type(scope): description` with optional body
5. **Push safely** — discover which refs deploy pipelines track before pushing (CI/CD config, repo docs). Pushes to non-deploying branches are routine proposals; a push to a deploy-tracked ref — or any push in a direct-push repo — is a publish and belongs to the user (rules of engagement). Use `git push --force-with-lease origin {branch}` only for rewritten history

### Checkpoint Commits

Agents may create WIP checkpoint commits during long-running tasks, cleaned up before PR.

- Prefix with `wip:` or use standard conventional commit format
- Keep changes logically grouped even in WIP state
- Run the `rewrite-history` skill before opening a PR to craft a clean narrative

### Commit Discipline

- Stage files explicitly by name: `git add src/auth.ts src/auth.test.ts`
- Verify staged content with `git status` before committing
- Keep secrets and large binaries out of commits (secret handling: rules of engagement) — warn the user if staged files look sensitive
- Target one logical change per commit in final PR-ready state

### Force Push

Use `--force-with-lease` exclusively to protect against overwriting upstream changes:

```bash
git push --force-with-lease origin feat/my-branch
```

Apply per-ref publish semantics: a force-with-lease push to your own non-deploying feature branch, with a backup ref in place, is a proposal — routine when the ordered work (a rebase, a history rewrite) requires it. A ref that is shared (other authors, a collaborative PR) or deploy-tracked is the user's: restate the ref and wait.

### Rebasing a Stack

When rebasing a branch that other branches are stacked on (e.g. phased `NN-description` chains), use `git rebase --update-refs` so the stacked branches follow the rewrite instead of being orphaned on the old commits. `--update-refs` moves **local** refs only — each moved branch that also exists on the remote still needs its own `--force-with-lease` push (per-ref publish semantics), and any branch checked out in another worktree is skipped. For the full conflict-resolution and safety workflow, use the `git-rebase-sync` skill.

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

The deploy annotations in the diagram are the publish map: merging into a deploy-tracked ref IS a publish to that environment, and publish is the user's, per-artifact (rules of engagement). Opening a PR against a tracked ref is still a proposal; the merge is the publish.

### Merge Strategy

Use repository merge policy first (required in many organizations).

If no policy exists, these defaults are reasonable:

| PR target | Strategy | Rationale |
|-----------|----------|-----------|
| Feature → default branch | Squash merge | Clean history, one commit per feature |
| Default → production | Merge commit | Preserves the release boundary; visible deploy points |
| Hotfix → production | Squash merge | Single atomic fix on production |

Executing any of these merges into a deploy-tracked ref is a publish: restate the concrete artifact (branch, PR) before acting, and act only on the user's per-artifact order. A promotion merge (default → production) always needs its own explicit order — authorization to land work on the default branch never covers it.

## PR Workflow

### Sizing

Prefer small, focused changes without imposing arbitrary line or file limits.
When a change cannot be small, it must still tell one coherent story. If existing
structure fights the feature, separate a behavior-preserving prefactor from the
behavior change when each can remain independently green and reversible; do not
split an inherently atomic change into invalid intermediate states.

### PR Creation

Use repo-native PR tooling (`gh pr create`, GitLab CLI, or web UI) with:
- Short title under 70 characters
- Summary section with 1-3 bullet points
- Test plan as a bulleted checklist

### Merge Readiness

- A PR is "mergeable" only with zero unresolved review threads; query them via
  the API before claiming it (see the `gh` skill for mechanics) — green checks
  alone do not clear it.
- Never volunteer an admin/bypass merge; branch protection is the human's gate.
- PR description edits are destructive by default (`gh pr edit --body`
  replaces wholesale): fetch the current body, merge additively, show the
  proposed body before writing.

### History Rewriting Before PR

For branches with messy WIP history, use the `rewrite-history` skill to:
1. Backup the branch
2. Reset to the base branch tip
3. Recommit changes as a clean narrative sequence
4. Verify byte-for-byte match with backup
5. Force-push the feature branch with `--force-with-lease` (backed up in step 1; your own non-deploying branch is a proposal per the rules of engagement)
6. Open PR with link to backup branch

Each rewritten commit introduces one coherent idea, building on the previous — like a tutorial teaching the reader how the feature was built.
