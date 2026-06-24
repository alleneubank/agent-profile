---
name: linear-issue-triage
description: Use when triaging Linear issues and syncing issue state with verified codebase reality
---

# Linear Issue Triage

Use Linear issue state as a hypothesis until codebase evidence confirms it.

## Workflow

1. List relevant assigned issues with `linear`.
2. Group by project, priority, and state.
3. For each selected issue, fetch details before judging implementation status.
4. Verify in the target codebase by reading code and tests.
5. Report one of:
   - implemented and tested
   - partially implemented
   - not found
   - blocked by missing context
6. Update Linear only when the state change is supported by evidence.

## Rules

- Do not mark an issue done from title or memory alone.
- Prefer code and tests over comments as the source of truth.
- Batch questions for the user when multiple issues need decisions.
- Treat Linear mutations as user-visible actions; summarize them explicitly.

