---
name: go-best-practices
description: Use when writing or changing Go files (.go, go.mod).
---

# Go Best Practices

Follows the type, error, and assertion law in `code-law`. This skill covers language-specific idioms only.

**Restrict who can do it** — when only one scope may perform an effect, unexport its functions and export only the scope that performs it; put packages that other modules must not import under `internal/`. A capability with an unexported field can be created only by its own package. Correct types are the proof.

## Test Doubles

`gomock.InOrder(...)` and `mock.EXPECT().Fetch(id).Times(n)` (`go.uber.org/mock`) standing in for your own collaborator assert which calls happened, not what the code produced — the change-detector shape in `testing-best-practices`. Accept the interface, pass a hand-written fake, and assert the return value in a table test; keep the call assertion only where the count *is* the contract, such as a retry budget.
