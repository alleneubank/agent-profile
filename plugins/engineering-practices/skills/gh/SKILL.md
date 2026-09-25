---
description: Use when invoking the GitHub CLI for repository inspection, issues, pull requests, stacked pull requests, attachments, release assets, projects, or API access.
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

## Parsing JSON

Human output from `gh` is column-formatted. If you want structured data:

- Add `--json field1,field2,...` for structured output.
- Run a command with `--json` and **no field list** to print the full set of
  available fields, then pick what you need.
- Use `--jq '<expr>'` for filtering without piping through a separate `jq`.
- Use `--template '<go-template>'` (alongside `--json`) when you want shaped
  text output. Note that `--template`/`-T` collides with a body-template flag
  on a few commands (e.g. `gh pr create -T`, `gh issue create -T`); always
  check `--help` before assuming which one you're hitting.

## Pagination and silent truncation

List commands cap results.

- `gh issue list`, `gh pr list`, `gh search ...`: pass `-L N` (`--limit N`).
  The default is usually 30.
- `gh issue list` / `gh pr list` do not expose aggregate totals like
  `totalCount` via `--json`. If you need a true total, use `gh api graphql`
  to query `totalCount`; otherwise, treat `-L` as the cap for the current call.
- For raw API calls use `gh api --paginate <path>`. Combine with
  `--jq` and (optionally) `--slurp` to assemble one array.

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

## Issue types, sub-issues, and relationships

Newer `gh issue` subcommands model issue types, sub-issue hierarchy, and
blocked-by/blocking relationships.

- `gh issue create`: `--type <name>`, `--parent <number|url>` (creates the
  new issue as a sub-issue), `--blocked-by <number|url,...>`, `--blocking <number|url,...>`.
- `gh issue edit` (edits one or more issues in the same repo, e.g.
  `gh issue edit 23 34`): `--type <name>` / `--remove-type`,
  `--parent <n|url>` / `--remove-parent`,
  `--add-sub-issue <n,n>` / `--remove-sub-issue <n,n>`,
  `--add-blocked-by <n,n>` / `--remove-blocked-by <n,n>`,
  `--add-blocking <n,n>` / `--remove-blocking <n,n>`. Relationship and parent
  refs are issue numbers or URLs; a URL may point to another repo on the same
  host, but a different host is rejected. `--add-sub-issue` cannot be used
  when editing more than one issue.
- `gh issue list --type <name>` filters by issue type.
- `gh issue view` and `gh issue list` accept these as `--json` fields (prefer
  them over scraping the default text output): `issueType`, `parent`,
  `subIssues`, `subIssuesSummary`, `blockedBy`, `blocking`. `subIssues`,
  `blockedBy`, and `blocking` are objects shaped
  `{"nodes": [...], "totalCount": N}` (not flat arrays), and `nodes` is capped
  (`subIssues` at 100, `blockedBy`/`blocking` at 50), so compare the node count
  against `totalCount` to detect truncation.
- GHES: issue types and sub-issues need 3.17+; blocked-by/blocking
  relationships need 3.19+.

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

References: [media attachment rules](https://github.com/cli/cli/blob/v2.100.0/skills/gh/SKILL.md#attaching-images-and-videos),
[release creation](https://cli.github.com/manual/gh_release_create),
[release upload](https://cli.github.com/manual/gh_release_upload), and
[draft visibility](https://docs.github.com/en/rest/releases/releases#list-releases).

## Stacked PRs (`gh stack`)

GitHub supports native stacked PRs: an ordered chain of branches rooted on a
trunk, one PR per layer, each based on the layer below, merged bottom-up. The
`github/gh-stack` extension drives them (checked against v0.1.1). Prefer it
over hand-chained `--base` PRs when the repository has stacks enabled.

- Detect: `gh extension list` shows `github/gh-stack`; exit code 9 means
  stacked PRs are not enabled on the repository. Report that rather than
  installing the extension or changing repository settings unasked.
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

## Discussions (`gh discussion`)

Preview command set, subject to change. Subcommands:

- `gh discussion list [--state open|closed|all] [--category <name>] [--author <handle>] [--label <name>,...] [--answered] [--search <query>] [--sort created|updated] [--order asc|desc] [--limit N] [--after <cursor>] [--json <fields>] [--web]`
  lists a repo's discussions. `--state` defaults to open, `--sort` to updated,
  `--order` to desc. `--answered` is tri-state (`--answered=false` for
  unanswered) for Q&A categories.
- `gh discussion view {<number>|<url>|<comment-id>|<comment-url>} [--comments] [--order oldest|newest] [--limit N] [--after <cursor>] [--json <fields>] [--web]`
  shows a discussion's body; add `--comments` for its comments, or pass a
  comment ID/URL as the argument to list that comment's replies (no
  `--replies` flag; `--comments` is rejected with a comment argument).
  `--order` (default newest), `--limit`, and `--after` apply only to comment
  and reply listings.
- `gh discussion create [--title <t>] [--body <b> | --body-file <path>] [--category <name>] [--label <name>,...]`
  creates a discussion. `--title`, a body (`--body` or `--body-file`), and
  `--category` are required non-interactively; omitting any will prompt on a
  terminal.
- `gh discussion edit {<number>|<url>} [--title <t>] [--body <b>] [--body-file <path>] [--category <name>] [--add-label <name>,...] [--remove-label <name>,...]`
  edits title, body, category, or labels.
- `gh discussion comment {<number>|<discussion-url>|<comment-id>|<comment-url>} [--body <b>] [--body-file <path>] [--edit] [--delete] [--yes]`
  adds a top-level comment (when given a discussion) or a reply (when given a
  comment); `--edit` or `--delete` updates or removes a comment/reply and
  needs a comment ID or URL. `--yes` skips the `--delete` confirmation.
- `--json`/`--jq`/`--template` are available on `list` and `view` only;
  `create` and `edit` print the discussion URL. `comment` prints the discussion comment (or reply) URL.

## Read repository contents without cloning (2.95+)

`gh repo read-file` and `gh repo read-dir` are preview commands. Both accept
`--repo` and `--ref <branch|tag|commit>`; omission means the default branch.

```sh
gh repo read-file README.md --repo OWNER/REPO --ref "$source_commit"
gh repo read-dir docs --repo OWNER/REPO --ref "$source_commit" \
  --json name,path,type,gitSHA
```

- `read-file --output PATH` saves bytes (`--clobber` permits overwrite);
  `--output` and `--json` are mutually exclusive. JSON `content` is base64,
  alongside `name`, `path`, `gitSHA`, `size`, `type`, and `encoding`.
- `read-dir --json` returns an object with `entries`, not a bare entry array;
  use `.entries[]` with `--jq`. Fields include file type, mode, size, Git SHA,
  and submodule information. Non-TTY text output is tab-separated.
- `read-file` rejects terminal escape sequences by default; `--output` writes
  raw bytes. Use file output when exact bytes matter rather than weakening
  terminal-output protection. Binary stdout is allowed when piped, not on a TTY.

## Projects by field name (2.97+)

- `gh project item-edit 1 --owner OWNER --url ISSUE_OR_PR_URL --field Status
  --value 'In Progress'` selects the project by owner/number and the item by
  its issue/PR URL. The item URL's owner can differ from the project's owner.
- `gh project item-list 1 --owner OWNER --field Status --field Priority`
  adds named columns; `--query` filters with Projects syntax. Projects use
  `--format json`, not `--json`.
- Node-ID flags remain available for scripts. An edit changes one field at a
  time; do not confuse a project URL with the item URL.

## Fall back to `gh api` for anything `--json` doesn't expose

Sometimes useful data isn't on the typed commands. Examples:

- Review-thread comments on a PR: `gh api repos/{owner}/{repo}/pulls/{n}/comments`
  (the `--comments` flag on `gh pr view` shows issue-level comments only).
- Arbitrary GraphQL: `gh api graphql -f query='...' -F var=value`.
- REST shortcuts: `gh api repos/{owner}/{repo}/...` - note the
  `{owner}/{repo}` placeholder is filled in for you when run from a repo
  with detected remotes; pass them literally if you want determinism.

## Authentication

- `gh auth status` prints the active host(s), user, and which env var (if
  any) is being honored.
- `gh auth status --json` is supported.
- Experimental `api_host` routing (2.100+) can be inspected with
  `gh config get api_host --host github.com`. It routes API requests through
  a configured gateway while the original host still owns auth, Git remotes,
  and browser URLs. It is not a security boundary: some requests may still
  reach the original host. Change it only for an intended gateway setup, not
  as an authentication repair. See the [2.100 release notes](https://github.com/cli/cli/releases/tag/v2.100.0).

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
- `gh pr edit --body` replaces the description wholesale — treat it as
  destructive. Fetch the current body (`gh pr view --json body`), merge your
  change additively, and show the proposed body before writing.

## Outward text discipline

Issue bodies, PR descriptions, review comments, and release notes are published
claims. Every factual statement in them — counts, "CI is green", "fixed X",
file/line references, benchmark deltas — must come from a source verified this
session (command output, file read, API response) or be explicitly labeled as
inference ("likely", "appears to"). Verify referenced identifiers (issue/PR
numbers, commit SHAs) resolve before linking them.

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
