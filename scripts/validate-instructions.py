#!/usr/bin/env python3
"""Check the runtime instruction catalog, links, and universal context budget."""

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
AGENTS_WORD_LIMIT = 1300


def main() -> int:
    errors: list[str] = []
    skill_roots = [
        ROOT / "plugins/agent-workflows/skills",
        ROOT / "plugins/engineering-practices/skills",
    ]
    runtime_docs = [ROOT / "AGENTS.md", ROOT / "README.md"]
    for skill_root in skill_roots:
        skills = sorted(skill_root.glob("*/SKILL.md"))
        if not skills:
            errors.append(f"empty skill catalog: {skill_root.relative_to(ROOT)}")
        runtime_docs.extend(sorted(skill_root.rglob("*.md")))

    if (skill_roots[0] / "loop-brief").exists():
        errors.append("retired loop-brief directory is still in the skill catalog")

    for path in runtime_docs:
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(ROOT)
        for line_number, line in enumerate(text.splitlines(), 1):
            if re.search(r"\brl\b|loop-brief", line, re.IGNORECASE):
                errors.append(f"{rel}:{line_number}: retired default instruction")
        # External URLs, anchors, and illustrative template placeholders are not
        # shipped local dependencies. Check actual Markdown link destinations.
        for match in re.finditer(r"\]\(([^\s)]+)(?:\s+\"[^\"]*\")?\)", text):
            target = match.group(1).strip("<>")
            url = urlsplit(target)
            if url.scheme or url.netloc or not url.path or "<" in target:
                continue
            if url.path.startswith(("/", "~")):
                continue
            if not (path.parent / unquote(url.path)).exists():
                errors.append(f"{rel}: broken local link: {target}")

    words = len((ROOT / "AGENTS.md").read_text(encoding="utf-8").split())
    if words > AGENTS_WORD_LIMIT:
        errors.append(f"AGENTS.md: {words} words exceeds {AGENTS_WORD_LIMIT}-word budget")

    if errors:
        print("instruction catalog check FAILED:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    print(f"instruction catalog ok: {len(runtime_docs)} documents, AGENTS.md {words} words")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
