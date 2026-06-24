---
name: fix-issue
description: Use when the user asks to find and fix a concrete bug, ticket, or issue
---

# Fix Issue

Fix the root cause, not just the visible symptom.

## Workflow

1. Understand the issue from the ticket, error, logs, or reproduction.
2. Locate the relevant code and tests.
3. Build or identify the smallest faithful verifier.
4. Reproduce the failure when feasible.
5. Implement the minimal fix.
6. Add or update tests that would fail without the fix.
7. Run targeted verification, then broader checks when the blast radius warrants it.
8. Prepare a concise summary and PR notes if requested.

## Rules

- Do not hard-code values just to satisfy the observed failing case.
- Preserve existing behavior unless the issue requires changing it.
- Surface unclear product intent before coding around it.

