---
name: python-best-practices
description: Use when writing or changing Python files (.py, pyproject.toml, requirements.txt).
---

# Python Best Practices

Follows the type, error, and assertion law in `code-law`. This skill covers language-specific idioms only.

**Restrict who can do it** — Python cannot hide a call, so keep an effect that needs a scope (a lock, a transaction) inside that scope: a context manager or a method of the object that owns the state, not a free function callers must remember to guard. Correct types are the proof where the type checker can see them.

## Test Doubles

`assert_has_calls` and `mock_calls` on a `MagicMock` standing in for your own collaborator grade the order of the calls, not the result — the change-detector shape in `testing-best-practices`. Prefer a small class satisfying the `Protocol` and assert its return value; `autospec=True` binds the signature, not the behavior. Reach for `assert_called_once_with` only where firing exactly once *is* the contract.
