---
name: react-best-practices
description: Use when writing or changing React components (.tsx, .jsx files with React imports).
---

# React Best Practices

## Effects Are Escape Hatches

Effects synchronize with external systems. Derived values, responses to user events, state resets, and parent notifications do not use one.

- Avoid lifecycle hooks (`useMount`, `useEffectOnce`) — use `useEffect` directly so the linter catches missing deps
- When an effect fires twice in development, fix its cleanup; do not guard it with a ran-once ref

## Component Patterns

- Treat boolean props that switch large component trees (`isEditing`, `isThread`, `hideAttachments`) as a composition smell; prefer separate composed components for distinct use cases
- For complex reusable UI, prefer compound components with provider-scoped state/actions over monolithic components with many optional props
- Use Context for scoped component families as well as truly global state, when it defines a local interface consumed by descendants
- Render JSX directly for UI variation; avoid config-array mini-frameworks unless the config is real domain data
- Lift the provider boundary when sibling or external controls need access to the same state/actions
- Never `vi.mock` a child and assert on the props it received — that grades the parent's implementation, not what renders; assert on the real tree with `screen.getByRole` (the change-detector shape in `testing-best-practices`)
