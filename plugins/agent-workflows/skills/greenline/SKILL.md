---
name: greenline
description: Use when improving an end-to-end test baseline after bootstrapping a Tilt-backed dev environment
---

# Greenline

Use this for Tilt-backed projects where the goal is to bootstrap the dev
environment and improve the e2e baseline through verified iterations.

## Workflow

1. Load `tiltup` and bring the local environment to a healthy baseline.
2. Discover the canonical e2e test command.
3. Run the selected e2e suite or filter and record the first-run baseline.
4. Categorize failures using the `e2e` skill taxonomy.
5. Fix actionable failures in priority order:
   - product bugs
   - stale tests
   - flakes with clear stabilization paths
6. Re-run targeted tests after each fix.
7. Stop when the baseline improves and no locally actionable failures remain.

## Report

Include Tilt health, e2e pass counts before and after, fixed failures, remaining
unverified failures, and any commits created.

