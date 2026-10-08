---
name: tamagui-best-practices
description: Use when working with Tamagui projects (tamagui.config.ts, @tamagui imports).
---

# Tamagui Best Practices

## Compiler-friendly styles

Express every conditional style value, including token props such as `size`,
as a `styled()` variant instead of an inline ternary
(`size={large ? '$4' : '$2'}`). The compiler cannot flatten a dynamic prop
value, so the component falls back to runtime styling.

## Current facts

Read the installed Tamagui version from `package.json` and its types under
`node_modules` before relying on remembered APIs. For docs, fetch the single
page as Markdown, e.g. https://tamagui.dev/docs/core/styled.md or
https://tamagui.dev/docs/intro/compiler-install.md. Do not fetch
https://tamagui.dev/llms.txt; it is the entire site in one file of about 1 MB.
