---
name: onboard
description: Use when preparing a repository for agent work, or when work stalls because a repository does not say how to run or try its product, what a change must demonstrate, which paths are high-risk, or what its brand, design system, and other customer-facing basics are.
---

# Onboard a repository

The verification loop (`done`) only travels if each repository carries its own
part: most agents and people working in it never see this profile. Write
ordinary repository files that help a human contributor as much as an agent.
Fill gaps; leave what already works alone, and link to it instead of copying
it.

Read what the repository has first: its agent instructions file (`AGENTS.md`
or the harness's equivalent), README, contributing guide, issue and pull
request templates, scripts, CI, and existing end-to-end harnesses. Then
interview the maintainer only about what you could not find, through the
harness's question tool when there is one. Propose each artifact as a diff the
maintainer approves.

## What to write

1. **How to run it.** A surface ladder in the agent instructions file, from
   the cheapest check to the most production-like environment an agent can
   reach (unit tests, local stack, localnet, testnet, vendor sandbox,
   simulator), each with the command that starts it and what it proves.
   Mark the rungs only a human can reach, and mark each rung disposable
   (resettable, freely funded) or live and shared (append-only, funded from a
   budget, shared with deployed services or vendors). For a live rung, say who
   funds it, the budget, how leftovers are returned, and what must never be
   reset or deleted; record a missing rule as missing rather than invent one.
2. **How to try it.** For someone who did not build it: getting a running
   build, an account, and test funds or data, and where each feature lives.
   This is a guest's entry point and doubles as beta-tester docs. It assumes
   a capable user and gives what a real beta would, such as a faucet, not a
   wrapper around the product.
3. **Acceptance scenarios.** A section in the issue or brief template:
   what a user or calling agent does, and what they see when it works.
4. **Pull request template.** Written for the operator who ships and rolls
   back the change, in `git-best-practices`' shape (What, Why, How, Rollout,
   Risk, Verify after deploy, Rollback), with an Evidence section in `done`'s
   shape and a checklist of the repository's own deploy hazards. The
   instructions file says PR bodies follow it.
5. **High-risk paths.** Which paths hold migrations, auth or security
   boundaries, public APIs or contracts, and deploy configuration, so a
   change's diff picks its specialist.
6. **Branding and design system.** For a customer-facing product: the
   brand (name and how it is written, logo and its uses, color, type, voice
   and tone for copy) and the design system (tokens, components, design
   files, and the canonical screens new work should match). Without these,
   design findings stay notes.
7. **Customer-facing basics.** Where each lives, or that it is missing: the
   accessibility target; legal pages (terms, privacy, required notices);
   a support path and contact; a status or incident page; how errors, empty
   states and outages are worded to customers; store listings, metadata and
   share previews; and supported platforms, browsers and locales.

Record a missing item as missing, with who owns it. Never invent a brand,
policy, or legal text to fill a gap.

## Finish

Drive the result once as a newcomer would: follow "how to run it" and "how to
try it" from a clean checkout, or have a guest do it, and fix what that
finds. Report which artifacts were written, which already existed, and what
the maintainer still owes.
