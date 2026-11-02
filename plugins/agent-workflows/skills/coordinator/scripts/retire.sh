#!/usr/bin/env bash
# Retire a stopped lane on its host, after its resources have been torn down.
#   retire.sh --root PATH --delete --charter NAME --lane NAME [--keep RELATIVE_PATH ...]
# Kept paths (unpushed work, evidence records and bundles) are copied with
# metadata into the lane directory's kept/ folder under the coordination home,
# $COORDINATION_HOME/<charter>/<lane>/kept (~/.handoffs by default), then
# compared before the root is deleted. There is no other destination, so
# nothing kept stays under ~/Work. Use --keep . for the whole root. Every kept
# path must exist; on failure the root survives, and a partial kept/ stays for
# inspection, not reuse. Stop all writers first.
# Exit: 0 retired, 2 usage, 3 copy/verification failure (root kept).
set -e
shopt -s dotglob nullglob

fail() { echo "retire.sh: $1" >&2; exit "$2"; }
root="" charter="" lane="" delete=no
kept=()
while [ $# -gt 0 ]; do
  case "$1" in
    --delete) delete=yes; shift; continue ;;
    --root|--charter|--lane|--keep)
      [ $# -ge 2 ] || fail "missing value for $1" 2
      case "$1" in
        --root) root=$2 ;;
        --charter) charter=$2 ;;
        --lane) lane=$2 ;;
        --keep) kept[${#kept[@]}]=$2 ;;
      esac ;;
    *) fail "unknown argument: $1" 2 ;;
  esac
  shift 2
done
[ "$delete" = yes ] || fail "--delete is required" 2
case "$root" in /*) ;; *) fail "--root must be an absolute lane directory" 2 ;; esac
[ -d "$root" ] && [ ! -L "$root" ] || fail "root must be a directory, not a symlink" 2
root=$(cd "$root" && pwd -P)
[ "$root" != / ] && [ "$root" != "$HOME" ] || fail "root cannot be / or HOME" 2
[ ${#kept[@]} -le 128 ] || fail "at most 128 kept paths" 2
for name in "$charter" "$lane"; do
  case "$name" in ''|.|..|*/*) fail "--charter and --lane must each name one directory" 2 ;; esac
done
lane_directory="${COORDINATION_HOME:-$HOME/.handoffs}/$charter/$lane"
[ -d "$lane_directory" ] || fail "no lane directory: $lane_directory" 2
destination=$(cd "$lane_directory" && pwd -P)/kept
case "$destination/" in "$root/"*) fail "the lane directory must be outside the root" 2 ;; esac

# Compare bytes, symlink targets, entry sets, and types without following links.
verify() {
  local source=$1 target=$2 depth=$3 entry
  local -a sources targets
  [ "$depth" -le 128 ] || return 1
  if [ -L "$source" ]; then
    [ -L "$target" ] && [ "$(readlink "$source")" = "$(readlink "$target")" ]
  elif [ -f "$source" ]; then
    [ -f "$target" ] && [ ! -L "$target" ] && cmp -s "$source" "$target"
  elif [ -d "$source" ]; then
    [ -d "$target" ] && [ ! -L "$target" ] || return 1
    sources=("$source"/*) targets=("$target"/*)
    [ ${#sources[@]} -eq ${#targets[@]} ] || return 1
    for entry in "${sources[@]}"; do
      verify "$entry" "$target/${entry##*/}" "$((depth + 1))" || return 1
    done
  else
    return 1
  fi
}

if [ ${#kept[@]} -gt 0 ]; then
  [ ! -e "$destination" ] && [ ! -L "$destination" ] ||
    fail "$destination already exists; inspect it before retiring again" 2
  for path in "${kept[@]}"; do
    case "$path" in ''|/*|..|../*|*/../*|*/..) fail "keep paths must stay inside the root" 2 ;; esac
    parent=$(cd "$(dirname "$root/$path")" && pwd -P) || fail "missing kept parent: $path" 2
    case "$parent/" in "$root/"*) ;; *) fail "kept parent escapes the root: $path" 2 ;; esac
    [ -e "$root/$path" ] || [ -L "$root/$path" ] || fail "missing kept path: $path" 2
  done
  mkdir "$destination" || fail "cannot create $destination; root kept" 3
  for path in "${kept[@]}"; do
    mkdir -p "$(dirname "$destination/$path")" &&
      cp -a "$root/$path" "$destination/$path" || fail "copy failed: $path; root kept" 3
  done
  for path in "${kept[@]}"; do
    verify "$root/$path" "$destination/$path" 0 || fail "verification failed: $path; root kept" 3
  done
fi
rm -rf "$root"
if [ ${#kept[@]} -gt 0 ]; then
  printf '%s\tretired\tkept in %s\n' "$root" "$destination"
else
  printf '%s\tretired\n' "$root"
fi
