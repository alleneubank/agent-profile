# Releasing

Each plugin is versioned independently; the `version` field in its manifest is the
single source of truth. `scripts/validate.sh` enforces 3-way parity across
`plugins/<name>/.claude-plugin/plugin.json`, `plugins/<name>/.codex-plugin/plugin.json`,
and the plugin's entry in `.claude-plugin/marketplace.json` — `name`/`version`/`description`
must match. The root `marketplace.json` (Codex-style) carries no versions.

Semver, per plugin:

- `MAJOR` — breaking change to a skill's contract (a skill removed/renamed, or its
  invocation/behavior changed in a way callers depend on).
- `MINOR` — a new skill, or a new backward-compatible capability/section.
- `PATCH` — clarifications, fixes, or wording changes to existing guidance.

Release steps:

1. Bump `version` in all three manifests for the plugin (keep them identical).
2. Commit: `chore(release): <plugin> vX.Y.Z`.
3. Tag the release commit, namespaced per plugin:
   `git tag -a <plugin>-vX.Y.Z -m "<plugin> vX.Y.Z — <summary>"`.
4. Push commits and the tag, then bump the submodule pin in the consuming superproject.

Pushing a tag runs `.github/workflows/release.yml`, which checks the tag against the
plugin manifest and publishes a GitHub release titled `<plugin> vX.Y.Z`, with the release
commit's body and a compare link to the plugin's previous tag as notes. For a tag pushed
without a release, run the workflow by hand with that tag; an existing release is left as is.

Tags mirror the manifest version and are human-facing markers only — plugins install by
name from the marketplace (`claude plugin install <plugin>@agent-profile`), which reads the
manifest, not git tags. The legacy unscoped `v1.1.0` tag predates this scheme.
