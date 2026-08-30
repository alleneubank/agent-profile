#!/usr/bin/env bash
# Report current-catalog skill usage from Recall's fail-closed fleet census.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SINCE=""
PLUGIN=""
FORMAT="text"
LOCAL="false"
FLEET_CONFIG=""
SOURCES=()

usage() {
  cat <<'EOF'
usage: skill-usage.sh [--since <N>d|<N>h] [--plugin <name>] [--source <harness>]...
                      [--local] [--fleet-config <path>] [--json]

  --since         only count invocations in this window (e.g. 7d, 36h)
  --plugin        restrict declared catalog skills to one plugin
  --source        restrict Recall coverage to one harness; repeat as needed
  --local         query only this host instead of the configured fleet
  --fleet-config  use an alternate Recall fleet inventory
  --json          emit machine-readable JSON instead of a table

The wrapper fails before emitting never_fired when Recall is missing, its
query fails, fleet/source coverage is incomplete, the all-time control is
empty, or a bare Recall skill name ambiguously matches the current catalog.
EOF
}

require_value() {
  local option="$1"
  local value="${2:-}"
  if [[ -z "$value" ]]; then
    echo "missing value for $option" >&2
    usage >&2
    exit 64
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since)
      require_value "$1" "${2:-}"
      SINCE="$2"
      shift 2
      ;;
    --plugin)
      require_value "$1" "${2:-}"
      PLUGIN="$2"
      shift 2
      ;;
    --source)
      require_value "$1" "${2:-}"
      SOURCES+=("$2")
      shift 2
      ;;
    --local)
      LOCAL="true"
      shift
      ;;
    --fleet-config)
      require_value "$1" "${2:-}"
      FLEET_CONFIG="$2"
      shift 2
      ;;
    --json)
      FORMAT="json"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if ! command -v recall >/dev/null 2>&1; then
  echo "FAIL: recall executable not found; no never_fired result is available" >&2
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "FAIL: python3 executable not found; cannot validate Recall coverage" >&2
  exit 2
fi

RECALL_ARGS=(stats skills --json)
if [[ -n "$SINCE" ]]; then
  RECALL_ARGS+=(--since "$SINCE")
fi
for source in "${SOURCES[@]}"; do
  RECALL_ARGS+=(--source "$source")
done
if [[ "$LOCAL" == "true" ]]; then
  RECALL_ARGS+=(--local)
fi
if [[ -n "$FLEET_CONFIG" ]]; then
  RECALL_ARGS+=(--fleet-config "$FLEET_CONFIG")
fi

ERROR_FILE="$(mktemp "${TMPDIR:-/tmp}/skill-usage-recall-error.XXXXXX")"
PAYLOAD_FILE="$(mktemp "${TMPDIR:-/tmp}/skill-usage-recall-payload.XXXXXX")"
cleanup() {
  rm -f "$ERROR_FILE" "$PAYLOAD_FILE"
}
trap cleanup EXIT

set +e
recall "${RECALL_ARGS[@]}" >"$PAYLOAD_FILE" 2>"$ERROR_FILE"
RECALL_STATUS=$?
set -e
if [[ $RECALL_STATUS -ne 0 ]]; then
  echo "FAIL: recall stats skills failed; no never_fired result is available" >&2
  if [[ -s "$ERROR_FILE" ]]; then
    cat "$ERROR_FILE" >&2
  fi
  if [[ -s "$PAYLOAD_FILE" ]]; then
    cat "$PAYLOAD_FILE" >&2
  fi
  exit 2
fi

python3 - "$ROOT" "$PAYLOAD_FILE" "$SINCE" "$PLUGIN" "$FORMAT" "$LOCAL" "${SOURCES[@]}" <<'PY'
import json
import sys
from pathlib import Path

repo_root = Path(sys.argv[1])
payload_path = Path(sys.argv[2])
since_arg = sys.argv[3]
plugin_filter = sys.argv[4]
output_format = sys.argv[5]
local_only = sys.argv[6] == "true"
source_args = sys.argv[7:]

ALL_SOURCES = ("claude_code", "codex", "pi_agent", "grok", "kimi_code")
SOURCE_ALIASES = {
    "claude-code": "claude_code",
    "claude_code": "claude_code",
    "codex": "codex",
    "pi": "pi_agent",
    "pi-agent": "pi_agent",
    "pi_agent": "pi_agent",
    "grok": "grok",
    "grok-build": "grok",
    "grok_build": "grok",
    "grokbuild": "grok",
    "kimi": "kimi_code",
    "kimi-code": "kimi_code",
    "kimi_code": "kimi_code",
}
POPULATION_FIELDS = (
    "considered_sessions",
    "attributed_invocations",
    "unattributed_candidates",
)


def fail(message):
    print(f"FAIL: {message}; no never_fired result is available", file=sys.stderr)
    raise SystemExit(2)


def string_list(value, field):
    if not isinstance(value, list) or not value:
        fail(f"Recall coverage {field} must be a non-empty array")
    if any(not isinstance(item, str) or not item.strip() for item in value):
        fail(f"Recall coverage {field} must contain non-empty strings")
    if len(value) != len(set(value)):
        fail(f"Recall coverage {field} contains duplicates")
    return value


def nonnegative_int(value, field):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        fail(f"Recall coverage {field} must be a non-negative integer")
    return value


try:
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
except (OSError, UnicodeError, json.JSONDecodeError) as error:
    fail(f"invalid Recall JSON: {error}")

if not isinstance(payload, dict):
    fail("invalid Recall JSON: top-level value must be an object")
rows = payload.get("rows")
coverage = payload.get("coverage")
if not isinstance(rows, list) or not isinstance(coverage, dict):
    fail("invalid Recall JSON: rows array and coverage object are required")

expected_scope = "local" if local_only else "local+fleet"
if coverage.get("scope") != expected_scope:
    fail(
        f"incomplete Recall host coverage: scope {coverage.get('scope')!r} "
        f"does not match {expected_scope!r}"
    )
expected_hosts = string_list(coverage.get("expected_hosts"), "expected_hosts")
successful_hosts = string_list(coverage.get("successful_hosts"), "successful_hosts")
if set(expected_hosts) != set(successful_hosts):
    fail("incomplete Recall host coverage: expected and successful hosts differ")
if local_only and len(expected_hosts) != 1:
    fail("incomplete Recall host coverage: local scope must contain one host")
if not local_only and len(expected_hosts) < 2:
    fail("incomplete Recall host coverage: fleet scope requires a remote host")

requested_sources = []
for raw_source in source_args:
    canonical_source = SOURCE_ALIASES.get(raw_source.strip().lower())
    if canonical_source is None:
        fail(f"unsupported source {raw_source!r}")
    if canonical_source not in requested_sources:
        requested_sources.append(canonical_source)
if not requested_sources:
    requested_sources = list(ALL_SOURCES)
covered_sources = string_list(coverage.get("covered_sources"), "covered_sources")
if set(covered_sources) != set(requested_sources):
    fail(
        "incomplete Recall source coverage: "
        f"reported {sorted(covered_sources)!r}, expected {sorted(requested_sources)!r}"
    )

window_population = {
    field: nonnegative_int(coverage.get(field), field) for field in POPULATION_FIELDS
}
control = coverage.get("control")
if not isinstance(control, dict):
    fail("Recall coverage control must be an object")
control_population = {
    field: nonnegative_int(control.get(field), f"control.{field}")
    for field in POPULATION_FIELDS
}
if (
    control_population["considered_sessions"] == 0
    or control_population["attributed_invocations"] == 0
):
    fail("empty Recall control population")
for field in POPULATION_FIELDS:
    if control_population[field] < window_population[field]:
        fail(f"Recall control {field} is smaller than the requested window")
    if not since_arg and control_population[field] != window_population[field]:
        fail(f"Recall all-time control {field} does not equal the unbounded window")

normalized_rows = []
invocation_total = 0
for index, row in enumerate(rows):
    if not isinstance(row, dict):
        fail(f"Recall row {index} must be an object")
    skill_name = row.get("skill_name")
    source = row.get("source")
    host = row.get("host")
    if not isinstance(skill_name, str) or not skill_name.strip():
        fail(f"Recall row {index} has no skill_name")
    if source not in covered_sources:
        fail(f"Recall row {index} source is outside covered_sources")
    if host not in successful_hosts:
        fail(f"Recall row {index} host is outside successful_hosts")
    invocations = nonnegative_int(row.get("invocations"), f"row {index} invocations")
    sessions = nonnegative_int(row.get("sessions"), f"row {index} sessions")
    if invocations == 0 or sessions == 0 or sessions > invocations:
        fail(f"Recall row {index} has inconsistent invocation/session counts")
    if sessions > window_population["considered_sessions"]:
        fail(f"Recall row {index} session count exceeds the considered-session population")
    invocation_total += invocations
    normalized_rows.append(
        {
            "skill_name": skill_name.strip(),
            "source": source,
            "host": host,
            "invocations": invocations,
            "sessions": sessions,
        }
    )
if invocation_total != window_population["attributed_invocations"]:
    fail("Recall attributed invocation total does not equal the row sum")

declared = set()
for skill_md in sorted(repo_root.glob("plugins/*/skills/*/SKILL.md")):
    plugin = skill_md.parents[2].name
    declared.add(f"{plugin}:{skill_md.parent.name}")
if not declared:
    fail(f"declared skill catalog is empty under {repo_root}")

suffixes = {}
for skill in sorted(declared):
    suffixes.setdefault(skill.split(":", 1)[1], []).append(skill)

canonical_rows = []
unmatched_rows = []
canonical_groups = {}
for row in normalized_rows:
    reported_name = row["skill_name"]
    if reported_name in declared:
        canonical_name = reported_name
    elif ":" not in reported_name:
        matches = suffixes.get(reported_name, [])
        if len(matches) > 1:
            fail(
                f"ambiguous bare skill name {reported_name!r} matches "
                f"{', '.join(matches)}"
            )
        canonical_name = matches[0] if len(matches) == 1 else None
    else:
        canonical_name = None
    if canonical_name is None:
        unmatched_rows.append(row)
        continue
    group = (canonical_name, row["source"], row["host"])
    canonical_groups.setdefault(group, []).append(row)

for (canonical_name, source, host), group_rows in sorted(canonical_groups.items()):
    session_minimum = max(row["sessions"] for row in group_rows)
    session_maximum = min(
        sum(row["sessions"] for row in group_rows),
        window_population["considered_sessions"],
    )
    canonical_rows.append(
        (
            canonical_name,
            {
                "source": source,
                "host": host,
                "invocations": sum(row["invocations"] for row in group_rows),
                "session_minimum": session_minimum,
                "session_maximum": session_maximum,
            },
        )
    )

selected_declared = declared
if plugin_filter:
    selected_declared = {
        skill for skill in declared if skill.startswith(f"{plugin_filter}:")
    }
    if not selected_declared:
        fail(f"plugin {plugin_filter!r} declares no skills")

fired_totals = {}
for skill, row in canonical_rows:
    aggregate = fired_totals.setdefault(
        skill,
        {"invocations": 0, "session_minimum": 0, "session_maximum": 0},
    )
    aggregate["invocations"] += row["invocations"]
    aggregate["session_minimum"] += row["session_minimum"]
    aggregate["session_maximum"] += row["session_maximum"]

fired = []
for skill, totals in fired_totals.items():
    if totals["session_minimum"] > window_population["considered_sessions"]:
        fail(
            f"canonical skill {skill!r} session minimum exceeds the "
            "considered-session population"
        )
    totals["session_maximum"] = min(
        totals["session_maximum"],
        window_population["considered_sessions"],
    )
    if skill not in selected_declared:
        continue
    fired_row = {
        "skill": skill,
        "invocations": totals["invocations"],
        "sessions": (
            totals["session_minimum"]
            if totals["session_minimum"] == totals["session_maximum"]
            else None
        ),
    }
    if fired_row["sessions"] is None:
        fired_row["session_bounds"] = {
            "minimum": totals["session_minimum"],
            "maximum": totals["session_maximum"],
        }
    fired.append(fired_row)
fired.sort(key=lambda row: (-row["invocations"], row["skill"]))
never_fired = sorted(selected_declared - set(fired_totals))

unmatched_totals = {}
for row in unmatched_rows:
    aggregate = unmatched_totals.setdefault(
        row["skill_name"],
        {"invocations": 0, "sessions": 0, "sources": set(), "hosts": set()},
    )
    aggregate["invocations"] += row["invocations"]
    aggregate["sessions"] += row["sessions"]
    aggregate["sources"].add(row["source"])
    aggregate["hosts"].add(row["host"])
unmatched = [
    {
        "skill": skill,
        "invocations": totals["invocations"],
        "sessions": totals["sessions"],
        "sources": sorted(totals["sources"]),
        "hosts": sorted(totals["hosts"]),
    }
    for skill, totals in sorted(unmatched_totals.items())
]

window = since_arg or "all time"
report = {
    "window": window,
    "control_total": control_population["attributed_invocations"],
    "fired": fired,
    "never_fired": never_fired,
    "coverage": coverage,
    "unmatched": unmatched,
}

if output_format == "json":
    print(json.dumps(report, indent=2))
    raise SystemExit(0)

print(f"window      : {window}")
print(f"coverage    : {coverage['scope']}")
print(
    f"hosts       : {len(successful_hosts)}/{len(expected_hosts)} "
    f"({', '.join(successful_hosts)})"
)
print(f"sources     : {', '.join(covered_sources)}")
print(
    "control     : "
    f"{control_population['considered_sessions']} sessions, "
    f"{control_population['attributed_invocations']} attributed invocations, "
    f"{control_population['unattributed_candidates']} unattributed candidates"
)
print()
if fired:
    width = max(len(row["skill"]) for row in fired)
    print(f"{'skill'.ljust(width)}  invocations  sessions")
    for row in fired:
        session_label = (
            str(row["sessions"])
            if row["sessions"] is not None
            else (
                f"{row['session_bounds']['minimum']}-"
                f"{row['session_bounds']['maximum']}"
            )
        )
        print(
            f"{row['skill'].ljust(width)}  {row['invocations']:>11d}  "
            f"{session_label:>8s}"
        )
else:
    print("(no catalog invocations in window)")
print()
if unmatched:
    print(f"UNMATCHED RECALL NAMES ({len(unmatched)}):")
    for row in unmatched:
        print(
            f"  {row['skill']} ({row['invocations']} invocations, "
            f"{row['sessions']} sessions)"
        )
    print()
scope = plugin_filter or "this repo"
if never_fired:
    print(
        f"NEVER FIRED in {window} "
        f"({len(never_fired)} of {len(selected_declared)} skills in {scope}):"
    )
    for skill in never_fired:
        print(f"  {skill}")
else:
    print(f"every skill in {scope} fired at least once in {window}")
PY
