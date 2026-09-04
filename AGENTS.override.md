# agent-profile maintainer guidance

The shared `AGENTS.md` in this repository is normally already present as the
user-level instruction through the installed profile symlink. Do not load it a
second time when its `Agent Teammates Guidelines` heading is already in the
instruction chain. If it is absent, read `AGENTS.md` before working here.

- Edit repository-managed sources, never installed plugin-cache copies.
- Run `npm run check` and `./scripts/validate.sh` after a material change.
- Version bumps, tags, pushes, releases, and marketplace publication remain
  separate publish actions unless the user names them in the request.
