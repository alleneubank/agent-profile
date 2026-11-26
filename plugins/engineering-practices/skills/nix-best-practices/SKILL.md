---
name: nix-best-practices
description: Use when writing or changing Nix flakes, overlays, shell.nix, or flake.nix files, or resolving their evaluation errors.
---

# Nix Best Practices

## Follows

Point each input's `nixpkgs` at the root one so the lock holds a single
nixpkgs:

```nix
some-overlay.inputs.nixpkgs.follows = "nixpkgs";
# another input's input is a path, not an input name
another-overlay.inputs.nixpkgs.follows = "some-overlay/nixpkgs";
```

`follows = "some-overlay"` substitutes the `some-overlay` flake itself for
nixpkgs. `nix flake metadata` prints what each input resolved to.

## Unfree packages

`nixpkgs.legacyPackages.${system}` refuses unfree packages, and a flake
evaluates purely, so `NIXPKGS_ALLOW_UNFREE=1` is read only with `--impure`
(`.envrc`: `use flake --impure`). To allow them without user setup, import
nixpkgs in the flake:

```nix
pkgs = import nixpkgs {
  inherit system;
  config.allowUnfreePredicate = pkg:
    builtins.elem (nixpkgs.lib.getName pkg) [ "specific-package" ];
};
```

## Overlays and hashes

- Define `overlays.default` once at the flake's top level, outside any
  per-system helper, and read the system inside it as
  `prev.stdenv.hostPlatform.system`; `prev.system` warns as renamed.
- `nix-prefetch-url <url>` prints a base32 hash. Convert it with
  `nix hash convert --hash-algo sha256 --to sri <hash>`; `nix hash to-sri` is
  deprecated.

## Current facts

Answer flag questions from the installed CLI first: `nix --version` and
`nix <command> --help`.
