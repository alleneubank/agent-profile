# gh flag catalogues

Checked with the skill body; `gh <command> --help` is authoritative.

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
