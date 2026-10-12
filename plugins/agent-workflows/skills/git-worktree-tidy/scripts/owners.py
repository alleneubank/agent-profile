"""Guard Git worktree removal and prune with a read-only local owner snapshot.

check PATH... emits JSONL (schema 1); remove PATH [--force] and prune invoke
Git only after the same check. Exit: 0 clear/success, 2 usage, 3 owners,
4 discovery unknown; otherwise Git's exit code. Requires Python 3.9+, lsof,
and zmx. SOX_BIN can name a sox CLI outside PATH; SOX_HOME and ZMX_DIR select
their namespaces. The default sox home is also checked through zmx.
WORKTREE_QUERY_TIMEOUT_SECONDS selects a positive per-query discovery limit
in seconds (default 15, maximum 300); Git mutations retain their 15-second limit.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlsplit


TIMEOUT_SECONDS = 15
QUERY_TIMEOUT_SECONDS_MAX = 300
OUTPUT_BYTES_MAX = 16 * 1024 * 1024
PATHS_MAX = 1024


class DiscoveryError(Exception):
    """The owner snapshot cannot establish whether deletion is safe."""


def query_timeout_seconds():
    message = ("WORKTREE_QUERY_TIMEOUT_SECONDS must be greater than zero "
               f"and at most {QUERY_TIMEOUT_SECONDS_MAX} seconds")
    try:
        value = float(os.environ.get("WORKTREE_QUERY_TIMEOUT_SECONDS", TIMEOUT_SECONDS))
    except ValueError as error:
        raise DiscoveryError(message) from error
    if not 0 < value <= QUERY_TIMEOUT_SECONDS_MAX:
        raise DiscoveryError(message)
    return value


def query(argv, env=None):
    timeout_seconds = query_timeout_seconds()
    try:
        result = subprocess.run(argv, env=env, capture_output=True, timeout=timeout_seconds)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise DiscoveryError(f"{argv[0]}: {error}") from error
    if result.returncode != 0:
        raise DiscoveryError(f"{' '.join(argv)}: exit {result.returncode}: "
                             f"{os.fsdecode(result.stderr).strip()}")
    if len(result.stdout) > OUTPUT_BYTES_MAX:
        raise DiscoveryError(f"{argv[0]}: output exceeds {OUTPUT_BYTES_MAX} bytes")
    return result


def directory(value):
    if value.startswith("file://"):
        value = unquote(urlsplit(value).path)
    if not os.path.isabs(value):
        raise DiscoveryError(f"non-absolute owner directory: {value!r}")
    # Linux lsof retains the pathname after unlinking a cwd.
    if value.endswith(" (deleted)") and not os.path.exists(value):
        value = value[:-10]
    return os.path.realpath(value)


@dataclass(frozen=True)
class Owner:
    directory: str
    detail: dict


def processes():
    raw = query(["lsof", "-w", "-d", "cwd", "-F0pcn"]).stdout
    owners = []
    pid = None
    command = ""
    for field in raw.split(b"\0"):
        field = field.lstrip(b"\n")
        if field.startswith(b"p"):
            try:
                pid = int(field[1:])
            except ValueError as error:
                raise DiscoveryError("lsof: invalid PID field") from error
            command = ""
        elif field.startswith(b"c"):
            command = os.fsdecode(field[1:])
        elif field.startswith(b"n"):
            if pid is None:
                raise DiscoveryError("lsof: cwd without PID")
            cwd = directory(os.fsdecode(field[1:]))
            owners.append(Owner(cwd, {"kind": "process", "pid": pid, "command": command}))
    # Validate the unfiltered query against this known-present process.
    if not any(owner.detail["pid"] == os.getpid() for owner in owners):
        raise DiscoveryError("lsof: this checker's cwd is missing; process inventory is incomplete")
    return owners


def sox_sessions(sox_home):
    binary = os.environ.get("SOX_BIN") or shutil.which("sox")
    if not binary:
        installed = Path(sox_home) / "bin" / "soxd"
        if installed.is_file():
            binary = str(installed)
    if not binary:
        return []
    raw = query([binary, "ls", "localhost", "--json", "--deadline-ms", "1000"],
                {**os.environ, "SOX_HOME": sox_home}).stdout
    try:
        rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
    except (ValueError, UnicodeDecodeError) as error:
        raise DiscoveryError("sox: invalid JSON roster") from error
    if not all(isinstance(row, dict) for row in rows):
        raise DiscoveryError("sox: roster rows must be JSON objects")
    summaries = [row for row in rows if row.get("kind") == "summary"]
    if len(summaries) != 1 or summaries[0].get("complete") is not True:
        raise DiscoveryError("sox: incomplete roster")
    summary = summaries[0]
    if summary.get("has_more") is not False or not summary.get("hosts_answered"):
        raise DiscoveryError("sox: roster is truncated or no daemon answered")
    owners = []
    for row in rows:
        if row.get("kind") != "shell":
            continue
        # Remote paths belong to their own hosts, even when spelled identically.
        if row.get("host") not in (None, "", "localhost"):
            continue
        target = row.get("backing_id")
        cwd = row.get("cwd")
        if not isinstance(target, str) or not isinstance(cwd, str):
            raise DiscoveryError("sox: local shell has no backing_id or cwd")
        owners.append(Owner(directory(cwd), {
            "kind": "session", "tool": "sox", "target": target,
            "home": sox_home,
            "state": row.get("status"), "labels": row.get("labels"),
        }))
    return owners


def zmx_sessions(env):
    result = query(["zmx", "ls"], env)
    raw = os.fsdecode(result.stdout)
    # zmx 0.8.1 writes its empty-inventory message to stderr.
    if not raw and os.fsdecode(result.stderr).startswith("no sessions found in "):
        return []
    owners = []
    for line in raw.splitlines():
        if line.startswith("no sessions found in "):
            continue
        fields = line.split("\t")
        name = re.fullmatch(r"\s*(?:→\s*)?name=(.+)", fields[0])
        if not name:
            raise DiscoveryError(f"zmx: unrecognized roster row: {line!r}")
        values = dict(field.split("=", 1) for field in fields[1:] if "=" in field)
        cwd = values.get("start_dir") or values.get("cwd")
        if not cwd:
            raise DiscoveryError(f"zmx: session {name[1]} has no start_dir/cwd")
        owners.append(Owner(directory(cwd), {
            "kind": "session", "tool": "zmx", "target": name[1],
            "namespace": env.get("ZMX_DIR"),
            "pid": values.get("pid"),
        }))
    if not raw.strip():
        raise DiscoveryError("zmx: empty response, expected sessions or 'no sessions found in ...'")
    return owners


def snapshot():
    sox_home = os.path.realpath(os.environ.get("SOX_HOME", os.path.expanduser("~/.sox")))
    owners = []
    errors = []
    sources = [processes, lambda: sox_sessions(sox_home),
               lambda: zmx_sessions(os.environ.copy())]
    sox_zmx = str(Path(sox_home) / "zmx")
    if os.path.isdir(sox_zmx) and os.path.realpath(os.environ.get("ZMX_DIR", "")) != sox_zmx:
        sources.append(lambda: zmx_sessions({**os.environ, "ZMX_DIR": sox_zmx}))
    for source in sources:
        try:
            owners.extend(source())
        except DiscoveryError as error:
            errors.append(str(error))
    return owners, errors


def check(paths):
    owners, errors = snapshot()
    exit_code = 4 if errors else 0
    for path in paths:
        root = os.path.realpath(path)
        hits = [{**owner.detail, "directory": owner.directory} for owner in owners
                if owner.directory == root or owner.directory.startswith(root + os.sep)]
        state = "at-risk" if hits else "unknown" if errors else "clear"
        print(json.dumps({"schema": 1, "worktree": root, "status": state,
                          "owners": hits, "errors": errors}, ensure_ascii=True), flush=True)
        if hits and not errors:
            exit_code = 3
    return exit_code


def worktrees():
    raw = os.fsdecode(query(["git", "worktree", "list", "--porcelain", "-z"]).stdout)
    records = []
    for block in raw.split("\0\0"):
        if not block:
            continue
        fields = block.split("\0")
        if not fields[0].startswith("worktree "):
            raise DiscoveryError("git: invalid worktree record")
        records.append((fields[0][9:], any(field.startswith("prunable") for field in fields[1:])))
    if len(records) > PATHS_MAX:
        raise DiscoveryError(f"git: more than {PATHS_MAX} worktrees")
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("check", help="report owners without mutation")
    inspect.add_argument("paths", nargs="+")
    remove = commands.add_parser("remove", help="recheck owners, then git worktree remove")
    remove.add_argument("path")
    remove.add_argument("--force", action="store_true", help="approved dirty worktree removal; never bypasses owners")
    commands.add_parser("prune", help="recheck prunable entries, then git worktree prune -v")
    args = parser.parse_args()
    if args.command == "check":
        if len(args.paths) > PATHS_MAX:
            parser.error(f"at most {PATHS_MAX} paths")
        return check(args.paths)
    records = worktrees()
    if args.command == "remove":
        root = os.path.realpath(args.path)
        if root not in [os.path.realpath(path) for path, _ in records]:
            raise DiscoveryError(f"git: {root} is not a registered worktree")
        paths = [root]
        argv = ["git", "worktree", "remove"] + (["--force"] if args.force else []) + ["--", root]
    else:
        paths = [path for path, prunable in records if prunable]
        if not paths:
            print(json.dumps({"schema": 1, "status": "clear", "prunable": []}), flush=True)
            return 0
        argv = ["git", "worktree", "prune", "-v"]
    result = check(paths)
    if result:
        return result
    # WAIVER(owner snapshot atomicity): Git offers no exclusion against another
    # session spawning after discovery. Permanent: recheck immediately before
    # mutation; stopping concurrent launchers belongs to the approved teardown.
    return subprocess.run(argv, timeout=TIMEOUT_SECONDS).returncode


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (DiscoveryError, OSError, subprocess.TimeoutExpired) as error:
        print(f"worktree.sh: {error}", file=sys.stderr)
        sys.exit(4)
