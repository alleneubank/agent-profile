---
name: typescript-best-practices
description: Use when writing or changing TypeScript or JavaScript files (.ts, .tsx, .js, tsconfig.json).
---

# TypeScript Best Practices

Follows the type, error, and assertion law in `code-law`. This skill covers language-specific idioms only.

**Restrict who can do it** — when only one scope may perform an effect, keep its functions unexported and export only the scope that performs it; a branded capability that the scope alone creates makes an out-of-scope call a type error. Hold module boundaries with ESLint's shipped `no-restricted-imports` rule. Correct types are the proof.

## Runtime Validation with Zod

- Define schemas as single source of truth; infer TypeScript types with `z.infer<>`. Avoid duplicating types and schemas.
- Use `safeParse` for user input where failure is expected; use `parse` at trust boundaries where invalid data is a bug.
- Zod's method names changed between major versions. Read the installed version from `package.json` and its types under `node_modules` before relying on remembered APIs.

## Test Doubles

`toHaveBeenCalledWith` / `toHaveBeenNthCalledWith` on a `vi.fn()` standing in for your own module assert the call sequence, not the result — the change-detector shape in `testing-best-practices`. Mock at the network edge (`msw`) and assert the value the caller receives.
