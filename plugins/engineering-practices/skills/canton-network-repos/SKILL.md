---
name: canton-network-repos
description: Use when working with Canton Network participants, DAML smart contracts, Splice applications, or debugging LF version and package ID issues.
---

# Canton Network Repositories

## Current facts

Version pairings between Splice, Canton, the Daml SDK, and Daml-LF targets
change every release, so confirm them against these sources:

- The repo's pins: `sdk-version` and `--target` in each `daml.yaml`, and any
  build-level compiler pin.
- The installed SDKs: `dpm version` (older installs: `daml version`). A
  `dpm build` reports a `--target` the selected SDK does not support, and
  `dpm inspect-dar` shows a built DAR's package IDs.
- Release notes, for which versions pair and what each release removed:
  https://github.com/digital-asset/daml/releases,
  https://github.com/digital-asset/canton/releases, and
  https://github.com/hyperledger-labs/splice/releases
- Splice and Global Synchronizer docs: https://docs.sync.global/

## SDK upgrades

A newer SDK can reject build options an older one accepted: SDK 3.4 no longer
knows `-Wno-ledger-time-is-alpha`. When moving `sdk-version`, drop options the
new SDK does not accept, even if no build can run to prove it.
