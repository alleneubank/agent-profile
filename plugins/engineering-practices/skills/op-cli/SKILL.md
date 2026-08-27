---
name: op-cli
description: Use when reading, writing, or piping secrets with the 1Password CLI (op) — resolving op:// references, choosing an account, finding an item, or handling an op auth failure.
---

# 1Password CLI (`op`)

Three laws govern every `op` call. Everything else is mechanics.

## Law 1 — Attempt the call; never preflight auth

`op` authorizes on the *request*, through the desktop app. A failing
status probe is not evidence the request will fail.

```bash
# Signed out, several accounts configured:
op whoami                                        # rc=1  "account is not signed in"
op read "op://Vault/item/password" | consumer    # SUCCEEDS — the app authorizes it
op whoami                                        # rc=0  now signed in
```

Run the real command and diagnose only from *its* failure. Never run
`op signin` to "fix" things: in a non-interactive agent shell it is a
no-op (rc=0, empty stdout) when integration is on and a help dump when it
is off, and it leaves nothing behind for the next call. `eval "$(op
signin)"` is worse — each tool call is a fresh shell, so the session token
never reaches the command that needs it.

Unlocking 1Password is biometric: the human's boundary. When the real
command fails to authorize, report it and stop.

## Law 2 — A secret value never enters the transcript

Preference order, strongest first:

```bash
# 1. BEST — op run masks the value in the child's stdout AND stderr
TOKEN="op://Vault/item/credential" op run -- ./deploy.sh
#    a leak prints as: <concealed by 1Password>

# 2. Pipe straight to the consumer
op read "op://Vault/item/password" | kubectl create secret generic s --from-file=password=/dev/stdin

# 3. Shell variable, consumed in the SAME tool call
TOKEN="$(op read "op://Vault/item/credential")"; curl -H "Authorization: Bearer $TOKEN" ...

# Verify without exposing: length only
op read "op://Vault/item/password" | wc -c
```

`op run` is the default for anything that runs a program — it converts
"remember not to print it" into a property of the process. Masking matches
the literal value, so a secret the child re-encodes (base64, URL escape)
is not covered; still don't echo. It covers the *child's* streams only — a
pipeline you build around `op read` yourself is not masked at all.

**The `--format json` trap:** `op item get --format json` prints CONCEALED
values in plaintext, with or without `--reveal`. Use the plain form to
inspect an item — it lists every field label and redacts concealed values
natively.

```bash
op item get ITEM --vault V --format json   # WRONG — dumps the password
op item get ITEM --vault V                 # RIGHT — "password: [use ... --reveal]"
```

`--reveal` gates only human-readable and `--fields` output: `op item get
--fields` needs it to emit a value at all, and `op read` never needs it.

### The zsh MULTIOS trap

**In zsh, a redirect cannot suppress stdout inside a pipeline — in any
order.** MULTIOS is on by default (including in the non-interactive `zsh -c`
that an agent tool call gets) and treats the pipe as an *additional*
destination rather than a replacement, so the value is teed to the pipe
anyway. Reproduce it with a throwaway value — four lines, four results,
observed on zsh 5.9 and bash 3.2:

```bash
zsh -c 'echo LEAKED 2>&1 >/dev/null | head'                    # LEAKED
zsh -c 'echo LEAKED >/dev/null 2>&1 | cat'                     # LEAKED
zsh -c 'unsetopt multios; echo LEAKED 2>&1 >/dev/null | head'  # (nothing)
bash -c 'echo LEAKED 2>&1 >/dev/null | head'                   # (nothing)
```

This is a property of the shell, not of any one tool: it applies to `op
read`, `fnox get`, `aws`, and anything else that prints a credential on
stdout. On 2026-08-27 it put a live Stripe test key into a session
transcript, and the key had to be rotated.

The lesson is not "get the redirection right" — that framing invites another
attempt, and the safe form differs per shell. It is: **never construct a
command whose stdout could reach a viewer.** `| wc -c` for a length,
`cmp -s <(one) <(other)` for equality, pipe to the consumer otherwise.
Nothing else.

## Law 3 — Fix account and vault before reading

Every secret has three coordinates: **account · vault · item**. An
`op://vault/item/field` reference names only two — the account comes from
`--account`, `OP_ACCOUNT`, or whatever happens to be signed in. An
unstated account is not a default; it is an unknown.

Vault names are scoped per account and collide across them: `Private`,
`Shared`, and `Employee` exist in nearly every account, and environment
vaults are often named alike (the same team vault name in two orgs, or
`ci` in both staging and prod). A vault name alone never identifies a
target.

Source the coordinates in this order, stopping at the first answer:

1. **The request** — the user named an account, vault, or `op://` reference.
2. **The project** — `OP_ACCOUNT` in the environment, `.envrc`, scripts that
   already call `op`, repo instructions. Grep for `op://` and `OP_ACCOUNT`
   before touching `op` at all; it is free and usually decisive.
3. **Earlier in this session** — an account already established carries forward.
4. **Ask**, naming the candidates so the answer is one word:

   > Which account and vault holds the deploy token? Configured accounts:
   > `<personal>.1password.com`, `<org-a>.1password.com`,
   > `<org-b>.1password.com`.

   `op account list` reads local config — no auth, works signed out — so
   building that question costs nothing.

**Never resolve the account by trying accounts.** Each attempt is an auth
event that prompts the human, and a *hit* in the wrong account is worse
than a miss: identically-named vaults mean the read silently succeeds and
returns the wrong environment's secret. Ambiguity here is a question, not
a search.

```bash
op vault get VAULT --account ACCOUNT   # confirm a candidate: metadata only, no values
# "X" isn't a vault in this account.   <- right name, wrong account (or typo)
```

An explicit `--account` beats `OP_ACCOUNT`, and repeated flags are
last-value-wins. Pass `--account` on every call once you know it.

## Finding the item

With the coordinates fixed, spend the fewest lookups that can succeed and
stop at the first hit: read the `op://<vault>/<item-title>/<field>`
reference; then one `op item list --vault VAULT` (metadata only — id,
title, category, timestamps); then `op item get ITEM --vault VAULT` for
field labels; then ask.

Never loop `op item get` over a listing, and never widen the search to
other vaults or accounts to find a missing string — go back and re-resolve
the coordinates instead.

A path-style title (`service/environment/credentials`) cannot appear in an
`op://` reference, since `/` is the delimiter. Use the item ID:

```bash
op item get ITEM_ID --vault VAULT --fields label=PASSWORD --reveal | consumer
```

## Remote hosts

On a host without the 1Password app, `op` may be a forwarding shim that
relays to the operator's machine, where an allowlist admits known commands
and anything else raises a prompt there.

- Keep the argv **exactly** as it will be authorized; a reordered or added
  flag is a different command and misses the allowlist.
- Near-miss retries spam the operator with prompts. One attempt, then report.
- No app and no shim means no `op`. Look for a service-account token
  (`OP_SERVICE_ACCOUNT_TOKEN`) or an out-of-band credential rather than
  trying to sign in.

## Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| `account is not signed in` from `whoami` | Status probe, not a request | Ignore it — run the real command |
| `op` root help text dumped | No configured account / app integration off | Human enables 1Password → Settings → Developer → CLI integration |
| Command hangs ~30-60s then fails | Biometric/approval prompt nobody answered | Report and stop; the human approves |
| `too many '/'` | Item title contains `/` | Use item ID with `op item get` |
| `"X" isn't a vault in this account` | Right vault name, wrong account (or typo) | Re-resolve the account — do not retry other accounts |
| `could not find item` | Wrong vault or title | One `op item list --vault V`, then ask |
| Empty value from `op item get --fields` | Missing `--reveal` | Add `--reveal` and pipe to a consumer |
| `operation not permitted` reading the 1Password group container | macOS TCC / Full Disk Access | Human-side setting; report and stop |
| A value appeared in your output | zsh MULTIOS teed stdout into the pipeline | Treat the secret as compromised and rotate it. Only `\| wc -c` is safe |
