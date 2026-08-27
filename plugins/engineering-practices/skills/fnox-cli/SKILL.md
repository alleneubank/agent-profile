---
name: fnox-cli
description: Use when reading, writing, or piping secrets with fnox — authoring fnox.toml, resolving a secret that comes back empty, diagnosing the caching daemon, or running a program with secrets in its environment.
---

# fnox (`fnox`)

fnox resolves secrets from a committed `fnox.toml` that holds **references,
never values**, and caches the resolved values in a per-user daemon. Three
laws govern every call. Everything else is mechanics.

Read `op-cli` alongside this: fnox's usual backend is 1Password, so an fnox
failure is often an `op` failure one layer down.

## Law 1 — A secret value never enters the transcript

fnox prints the value on **stdout**, plain, with no masking anywhere.

```bash
fnox get KEY | wc -c                  # length only — the one safe inspection
fnox exec -- ./deploy.sh              # value reaches the program, not the terminal
TOKEN="$(fnox get KEY)"; curl -H "Authorization: Bearer $TOKEN" ...   # same tool call
```

**`fnox exec` does not mask, and this is where it differs from `op run`.**
`op run` rewrites a leaked value in the child's output as `<concealed by
1Password>`; fnox passes it through untouched on both streams. Verified:

```bash
fnox exec -- sh -c 'echo "$KEY"'      # prints the value verbatim
```

So `fnox exec` is the right default for *running a program* — it keeps the
value out of argv and out of your own commands — but it is not a safety net.
A child that echoes a secret leaks it.

### The zsh MULTIOS trap — this is how a key actually gets leaked

**In zsh, you cannot suppress stdout with a redirect inside a pipeline.**
MULTIOS is on by default and treats the pipe as an *additional* destination
rather than a replacement, so the value is teed to the pipe anyway:

```bash
# zsh, MULTIOS on (the default) — ALL of these LEAK:
fnox get KEY 2>&1 >/dev/null | head        # the classic "show me only stderr"
fnox get KEY >/dev/null 2>&1 | cat         # reordering does not save you

# Same commands are safe in bash, and safe in zsh with `unsetopt multios`,
# and safe in zsh with no pipeline at all. None of that is worth relying on.
```

This is a property of the shell, not of fnox — it applies equally to `op
read`, `aws`, and anything else that prints a credential. The lesson is not
"get the redirection right." It is: **never construct a command whose stdout
could reach a viewer.** Pipe to `wc -c`, or to the consumer, and nothing else.

Never `fnox export`, `fnox get` bare, or anything else that puts a value on a
terminal. `fnox list` and `fnox check` show keys, types, provider keys, and
descriptions — value-free **only while every provider key is a reference**.
For a `plain` or encrypted-inline secret the provider key *is* the value, and
`fnox list` prints it. Check the provider type before treating `list` as safe.

## Law 2 — An empty read is a diagnosis, not an answer

The daemon caches resolved values for `idle_timeout`. When the backing store
changes underneath it, fnox keeps serving the old value — including an old
*empty*, which is how "I just filled that field and it still reads blank"
happens.

**A stale read and a missing secret are indistinguishable: both return empty,
rc=0, no error.** So `fnox get` returning nothing is never evidence that the
vault is empty. Walk down the layers:

```bash
fnox get KEY | wc -c                                    # 1. what fnox serves
fnox --no-daemon get KEY | wc -c                        # 2. fnox, cache bypassed
op read "op://VAULT/ITEM/FIELD" --account ACCT | wc -c  # 3. the backing store
```

- **1 differs from 2** → stale cache. The daemon is the problem.
- **2 differs from 3** → wrong reference in `fnox.toml`, or wrong provider vault.
- **3 is empty** → the secret genuinely is not there. Now it is a vault problem,
  and `op-cli` takes over.

`--no-daemon` is the right remedy for a one-off check: it is a global flag,
it bypasses the cache for that invocation only, and it disturbs nothing else.

`fnox daemon clear` **does work** — verified against a provider whose backing
value was changed out from under a warm cache. It is easy to believe otherwise,
because `fnox daemon status` reports `cached_entries: N` immediately after a
successful clear: **the very next read repopulates the cache.** Entries present
after a clear are not evidence the clear failed.

Reach for `fnox daemon stop` only when you want the daemon gone, not as a
stronger `clear`. It is the bigger hammer and it affects every other shell
using fnox.

Caching is the whole reason fnox is preferred over alternatives whose
resolvers hit the vault on every call and re-prompt for approval each time.
Staleness is what that buys; it is a trade, not a defect.

## Law 3 — `fnox.toml` is committed, and holds references only

The file is checked into git. That only works because it contains no secret
values — either references to a vault, or ciphertext for encrypted-inline
secrets. A plaintext value in `fnox.toml` defeats the entire design.

```toml
[daemon]
enabled = true
idle_timeout = "8h"

[providers]
# Pin the account. Vault names are scoped per 1Password account and collide
# across them, so an unpinned provider silently resolves the wrong vault when
# more than one account is signed in.
op = { type = "1password", vault = "myapp-dev", account = "ACCOUNT.1password.com" }

[secrets]
# Comment WHY each secret exists and what consumes it. This file is the only
# durable record of that; the vault item cannot hold it.
STRIPE_SECRET_KEY = { provider = "op", value = "op://myapp-dev/stripe-dev/STRIPE_SECRET_KEY" }
```

Two references may point at the same field. That is an alias, not a second
credential, and it is the clean way to satisfy a tool that insists on its own
variable name:

```toml
STRIPE_API_KEY = { provider = "op", value = "op://myapp-dev/stripe-dev/STRIPE_SECRET_KEY" }
```

1Password references take three forms — item title alone (resolves the
password field), `Item/field`, or a full `op://VAULT/ITEM/FIELD` URI. Prefer
the full URI: it is the only one that states the vault at the point of use, so
a reader does not have to look up the provider to know what is being read.

`provider add` accepts: `1password, age, aws, aws-kms, aws-ps, azure-ac,
azure-kms, azure-sm, gcp, gcp-kms, fido2, bitwarden, doppler, foks,
bitwarden-sm, infisical, keepass, keeper-sm, keychain, password-store,
passwordstate, plain, proton-pass, vault, yubikey`.

## Mechanics

```bash
fnox get KEY | wc -c            # read (see Law 1 before piping anywhere else)
fnox set KEY VALUE              # write — argv, so only for values that are not secret
fnox exec -- CMD                # run CMD with secrets in its environment
fnox list                       # keys, types, provider keys (see Law 1 caveat)
fnox check                      # are all declared secrets resolvable
fnox doctor                     # diagnostic state
fnox config-files               # which fnox.toml files are in play
fnox profiles                   # available profiles
fnox provider test              # provider connectivity, no values
fnox scan                       # look for secrets committed to the repo
```

Config is discovered by walking up from the working directory, so **which
directory you run from decides which secrets exist**. `fnox config-files`
answers that; run it before concluding a key is undefined.

Secrets live under a profile. `-P/--profile` selects one, `FNOX_PROFILE` sets
it, and later profiles overlay earlier ones. The not-found error names the
profile it searched — `not found in profile 'default'` — which is usually the
answer: right key, wrong profile, or wrong directory.

`fnox activate <shell>` installs a hook that loads secrets on directory change.
Convenient for humans; irrelevant to an agent, since each tool call is a fresh
shell and the hook never fires. Use `fnox exec` instead.

`--if-missing <error|warn|ignore>` decides what a missing secret does. Leave it
at the default; a run that silently proceeds without a credential fails later
and further from the cause.

## Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| A value appeared in your output | zsh MULTIOS teed stdout into the pipeline | Treat the secret as compromised and rotate it. Only `\| wc -c` is safe |
| `fnox get` returns empty, rc=0 | Stale cache **or** genuinely absent — indistinguishable | Walk the three layers in Law 2; never conclude from fnox alone |
| Value correct via `op read`, empty via `fnox` | Daemon serving a pre-change cache | `fnox --no-daemon get KEY \| wc -c` to confirm, then `fnox daemon clear` |
| `cached_entries: N` right after a clear | The next read repopulated it | Not a failure — clear works; re-check the value instead |
| `not found in profile 'default'` | Wrong profile, or wrong directory | `fnox config-files` and `fnox profiles` |
| `No configuration file found in ... or any parent` | Running outside the project | cd into the tree that owns `fnox.toml` |
| Resolution prompts for approval every call | Daemon disabled or not running | `fnox daemon status`; check `[daemon] enabled` |
| Wrong environment's secret resolved, no error | Provider vault unpinned across accounts | Add `account = ` to the provider — see `op-cli` Law 3 |
| Child program leaked the secret | `fnox exec` does not mask, unlike `op run` | Fix the child; fnox cannot conceal for you |
