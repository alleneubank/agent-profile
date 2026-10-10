---
name: onboard
description: Use when preparing a repository for agent work, or when work stalls because a repository does not say how to run or try its product, what a change must demonstrate, which paths are high-risk, or what its design should look like.
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

## The six artifacts

1. **How to run it.** A surface ladder in the agent instructions file, from
   the cheapest check to the most production-like environment an agent can
   reach (unit tests, local stack, localnet, testnet, vendor sandbox,
   simulator), each with the command that starts it and what it proves.
   Mark the rungs only a human can reach.
2. **How to try it.** For someone who did not build it: getting a running
   build, an account, and test funds or data, and where each feature lives.
   This is a guest's entry point and doubles as beta-tester docs. It assumes
   a capable user and gives what a real beta would, such as a faucet, not a
   wrapper around the product.
3. **Acceptance scenarios.** A section in the issue or brief template:
   what a user or calling agent does, and what they see when it works.
4. **Evidence record.** A section in the pull request template in `done`'s
   shape: head and build, a scenario table, changed behavior, verdicts, and
   what was not checked.
5. **High-risk paths.** Which paths hold migrations, auth or security
   boundaries, public APIs or contracts, and deploy configuration, so a
   change's diff picks its specialist.
6. **Design reference.** Where the brand and design system live (tokens,
   component library, design files) and which screens are canonical. Without
   one, design findings stay notes; say so in the file rather than invent one.

## Finish

Drive the result once as a newcomer would: follow "how to run it" and "how to
try it" from a clean checkout, or have a guest do it, and fix what that
finds. Report which artifacts were written, which already existed, and what
the maintainer still owes.
