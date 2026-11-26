---
description: Use when invoking the GitHub CLI for repository inspection, issues, opening or stacking pull requests (dependent PRs), attachments, release assets, projects, or API access.
metadata:
    github-path: skills/gh
    github-ref: refs/tags/v2.101.0
    github-repo: https://github.com/cli/cli
    github-tree-sha: 5cf8c343d459cc0fdd839100c02b6fbb1ddda8e1
name: gh
---
# Reference

Checked against GitHub CLI **2.101.0** on 2026-09-25, incorporating the
[upstream skill](https://github.com/cli/cli/blob/v2.101.0/skills/gh/SKILL.md)
with local delivery guidance. The metadata identifies that upstream source,
not a byte-identical copy. Check `gh version` and the relevant command's
`--help` before assuming a capability is unavailable. For a refresh, resolve
[the latest release](https://github.com/cli/cli/releases/latest) and merge its
changes into this source; preserve local additions.

## Interactivity policy

`gh` already does the right thing in non-TTY contexts: it skips the pager,
strips ANSI color, and errors out fast with a helpful message instead of
prompting (e.g. `must provide --title and --body when not running interactively`).
You don't need to defensively set `GH_PAGER` or pass `--no-pager` (no such
flag exists).

## Flag catalogues

Read [references/upstream.md](references/upstream.md) when the task needs
`--json`/`--jq`/`--template` output, list limits and pagination, issue types,
sub-issues or blocked-by relationships, `gh discussion`, `gh repo
read-file`/`read-dir`, project fields, or `gh auth status` and `api_host`.
List commands cap results (usually 30): pass `-L N` before counting.

## Repo targeting

`gh` infers the repo from the cwd's git remotes. 

Pass `--repo OWNER/REPO` (`-R`) to override the resolved CWD repo.

## Search vs list

- `gh search issues|prs|code|repos|commits|users` uses GitHub's search
  index and accepts the full search syntax (`is:open`, `author:`,
  `label:`, `repo:owner/name`, `in:title`, ...). Pass raw qualifiers as
  separate arguments: `gh search issues repo:cli/cli is:open`. Quoting that
  entire query as one argument can turn it into `repo:"cli/cli is:open"`
  and fail. Quote multi-word free text or an individual qualifier value;
  dedicated flags such as `--repo` and `--author` also work. Prefer search for
  anything cross-repo or filtered by author/label.
- `gh issue list --search "..."` and `gh pr list --search "..."` accept
  the query as one quoted flag value and are scoped to one repo.
- For GitHub App authors use `--app dependabot` on issue/PR list and search,
  or `--author 'dependabot[bot]'`; `--author dependabot` targets a different
  identity.
- `gh search issues --search-type semantic` searches natural-language meaning;
  `hybrid` blends semantic and keyword ranking, and `lexical` is the default.
  Semantic/hybrid search is issues-only on GitHub.com/GHEC, returns one page,
  and cannot combine with `--sort` or `--order`. It is not an exhaustive
  inventory; use lexical queries and account for result limits when counting.

## Attachments and evidence archives

### Images and videos (`--attach`, 2.99+)

Use native `--attach` on `gh issue` / `gh pr` **create, edit, and comment**
when the file and host are supported:

```sh
gh issue comment 12 --repo OWNER/REPO --body-file comment.md \
  --attach './before.png#Before the fix' --attach ./after.mp4
```

- Accepts `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `mp4`, `mov`, `webm`,
  with at most 50 attachments per invocation. **ZIP, JSON, text, and PDF are
  not accepted by this flag**, even when GitHub's web uploader accepts them.
- A matching local Markdown path in the body is replaced with its uploaded
  URL; otherwise the attachment is appended. Paths resolve from the command's
  working directory. Image alt text follows `#`; videos cannot take alt text.
- Uploads require GitHub.com/GHEC, an OAuth token or classic/fine-grained PAT,
  and repository write/maintain/admin permission. GHES and GitHub App tokens
  are unsupported. Do not change credential configuration to work around this.
- `gh pr review` has no `--attach`; put review media in a `gh pr comment`.
- `--attach` cannot combine with `--web`; PR creation also disallows
  `--dry-run`. Issue edit accepts one issue when attaching. Comment attachment
  works with `--edit-last`, but not `--delete-last`.
- A later upload failure can leave earlier attachments **posted despite a
  non-zero exit**. Inspect the returned issue/PR and current body before
  retrying; resume only the missing work.

### ZIPs and other files (release assets)

For durable evidence in an authorized repository, `gh release create` and
`gh release upload` accept ZIPs and other asset files. If release storage fits
the requested outcome and audience, use it and link the returned release URL
from the issue. If the user specifically needs an issue attachment, use the
web uploader instead; a release asset is a different storage location.

A dedicated **draft** can preserve evidence without publishing a software
release. Drafts require repository **push access** to view, so they do not
serve read-only collaborators. Resolve the repository, intended audience,
unused archive identifier, and exact source commit first. For an authorized
archive and notes, with `archive_tag` and `source_commit` set to those values:

```sh
shasum -a 256 evidence.zip > evidence.zip.sha256
gh release create "$archive_tag" evidence.zip evidence.zip.sha256 \
  --repo OWNER/REPO --draft --latest=false --target "$source_commit" \
  --title 'Evidence archive (keep unpublished)' --notes-file archive-notes.md
gh release view "$archive_tag" --repo OWNER/REPO \
  --json url,isDraft,tagName,targetCommitish,assets
gh release download "$archive_tag" --repo OWNER/REPO \
  --pattern 'evidence.zip*' --dir fresh-download
cmp evidence.zip.sha256 fresh-download/evidence.zip.sha256
(cd fresh-download && shasum -a 256 -c evidence.zip.sha256)
```

- Draft URLs can contain `untagged-…`; use the returned `url`, not a URL
  guessed from the requested tag. Verify `isDraft` and the uploaded assets.
- Without `--draft`, creation publishes; a missing tag can be created from
  `--target` or the default branch. Inspect tag/deploy triggers before a
  published release. `--latest=false` alone does not prevent publication.
- For an existing authorized release use `gh release upload TAG FILE...`.
  `--clobber` deletes the old asset before uploading and can lose it if upload
  fails; inspect existing assets and prefer a new name for new evidence.
- Compare the fresh download's digest against the independently retained local
  digest, then run the archive's integrity/manifest checks. Linking a release
  proves location, not byte integrity or the claims inside its evidence.
- Published assets in public repositories can be downloaded without login
  (2.96+); private repositories and drafts retain their access requirements.

References: [media attachment rules](https://github.com/cli/cli/blob/v2.101.0/skills/gh/SKILL.md#attaching-images-and-videos),
[release creation](https://cli.github.com/manual/gh_release_create),
[release upload](https://cli.github.com/manual/gh_release_upload), and
[draft visibility](https://docs.github.com/en/rest/releases/releases#list-releases).

## Stacked PRs (`gh stack`)

GitHub supports native stacked PRs: an ordered chain of branches rooted on a
trunk, one PR per layer, each based on the layer below, merged bottom-up. The
`github/gh-stack` extension drives them (checked against v0.1.1).

A set of dependent PRs is a native stack, created and maintained with
`gh stack` (`init`/`link`, `push`, `submit`, `sync`, `merge`). Never
approximate one by chaining `gh pr create --base <parent-branch>`.

- Detect: `gh extension list` shows `github/gh-stack`; exit code 9 means
  stacked PRs are not enabled on the repository. Report either gap and ask;
  do not install the extension, change repository settings, or fall back to
  hand-chained bases unasked.
- It branches on stdout being a TTY, and agent harnesses vary, so always use
  the non-interactive form: `view --json`, `submit --auto` (drafts; `--open`
  marks them ready), `init <branch>...`, `add <branch>`, `checkout <target>`,
  `up`/`down`/`top`/`bottom`, `merge <pr-or-stack> --yes`. Never run bare
  `view`, `submit`, `init`, `add`, `checkout`, or `switch`/`modify` (TUI only).
- With more than one remote, pass `--remote <name>` to `push`, `submit`,
  `sync`, `rebase`, and `link`, or rely on `remote.pushDefault`.
- Put each change in the layer that owns it: check out that layer, commit,
  then `gh stack rebase --upstack` and `gh stack push`. Do not commit a lower
  layer's concern on the top branch.
- `gh stack sync` fetches, rebases, pushes, and refreshes PR state; it prunes
  merged branches only with `--prune`. On divergence it prints both chains,
  changes nothing, and still exits 0 with `Sync aborted`; check its output.
- `gh stack merge 42 --yes` merges #42 and every unmerged PR below it,
  all-or-nothing. `gh pr merge` cannot merge a stack. Merge and `submit`
  publish per the usual publish rules.
- A request to merge a stack "as one" or "all at once" means that single
  `gh stack merge <top-pr> --yes` with the repository's merge method passed
  explicitly (`--squash` lands one commit per layer; without a flag it reuses
  the last-used method), once every layer is ready with required checks green. It never means retargeting the
  top PR to the trunk and squashing the stack into one commit; do that only
  when the human asks for one commit or one PR.
- `gh stack link <branch|pr>...` (bottom to top) stacks PRs whose branches
  another tool (jj, git-town, `git rebase --update-refs`) manages.
- Exit codes: 2 not in a stack, 3 rebase conflict (resolve, `git add`,
  `gh stack rebase --continue`; after `sync`, rerun `gh stack rebase` first),
  7 rebase in progress, 8 stack file locked (retry). Stacks are strictly
  linear; restructure with `unstack` then `init`.

`gh stack <command> --help` is authoritative (`gh stack help <command>` prints
top-level help). For layer design and troubleshooting, see the
[upstream gh-stack skill](https://github.com/github/gh-stack/tree/v0.1.1/skills/gh-stack)
and [GitHub stacks docs](https://gh.io/stacks).

## Fall back to `gh api` for anything `--json` doesn't expose

Sometimes useful data isn't on the typed commands. Examples:

- Review-thread comments on a PR: `gh api repos/{owner}/{repo}/pulls/{n}/comments`
  (the `--comments` flag on `gh pr view` shows issue-level comments only).
- Arbitrary GraphQL: `gh api graphql -f query='...' -F var=value`.
- REST shortcuts: `gh api repos/{owner}/{repo}/...` - note the
  `{owner}/{repo}` placeholder is filled in for you when run from a repo
  with detected remotes; pass them literally if you want determinism.

## PR state and destructive edits

- A PR is not mergeable while unresolved review threads remain, whatever the
  checks say. `gh pr view --json` does not expose thread resolution — query it
  before claiming a PR is ready:

  ```bash
  gh api graphql -F owner='{owner}' -F repo='{repo}' -F pr=<n> -f query='
    query($owner:String!,$repo:String!,$pr:Int!){
      repository(owner:$owner,name:$repo){
        pullRequest(number:$pr){
          reviewThreads(first:100){nodes{isResolved}}}}}' \
    --jq '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)]|length'
  ```
- Never volunteer `gh pr merge --admin` (or any protection bypass) as a way
  past failing checks or branch rules; use it only when the human explicitly
  orders the bypass.
- Closing keywords ignore negation: "close", "fix", or "resolve" in any form
  before `#N` in a PR body or squash message closes issue N on merge, even in
  "does not close #N". Reference an issue that must stay open as "Refs #N",
  and check its state after merging a partial fix.
- `gh pr edit --body` replaces the description wholesale — treat it as
  destructive. Fetch the current body (`gh pr view --json body`), merge your
  change additively, and show the proposed body before writing.

## Outward text discipline

Issue bodies, PR descriptions, review comments, and release notes are published
claims: apply `sitrep`'s verification floor. Each factual statement comes from a
source verified this session or is labeled as inference, and referenced issue/PR
numbers and commit SHAs resolve before they are linked.

## Other notes

- `gh pr checkout <n>` switches branches. Use `gh pr diff <n>` or
  `gh pr view <n>` if you only need to read.
- `gh pr checkout <n> --worktree <path>` (2.98+) checks the PR out in a
  worktree instead of switching the current checkout.
- `gh issue develop <n> --checkout --worktree <path>` (2.99+) creates a
  linked branch and checks it out in a worktree. `--worktree` requires
  `--checkout`, a nonblank path, and cannot combine with `--list`.
- `NO_COLOR`, `CLICOLOR_FORCE`, and `GH_FORCE_TTY` are honored. Set
  `GH_FORCE_TTY=1` if you want TTY-style output (colors, tables, the
  pager, interactivity) inside an agent harness; leave it unset unless needed.
