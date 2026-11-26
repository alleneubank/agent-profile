---
name: playwright-best-practices
description: Use when writing or modifying Playwright tests (.spec.ts, .test.ts with @playwright/test imports).
---

# Playwright Best Practices

- **Use `--reporter=line` or `--reporter=dot` for CLI test runs** from an agent; the default reporter's verbose output consumes the context window.

## Anti-Patterns

- Asserting a `page.route` handler fired — a change detector; assert the DOM the user sees (`testing-best-practices`)
- Registering `page.route` mocks after navigation — set them up before `goto`
- Retry loops around assertions — web-first assertions already retry
