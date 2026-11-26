---
name: zig-best-practices
description: Use when reading or writing Zig files (.zig, build.zig, build.zig.zon).
---

# Zig Best Practices

Follows the type, error, and assertion law in `code-law`. This skill covers Zig-specific idioms only.

## Type System Patterns

**Tagged unions for mutually exclusive states** — prevents invalid combinations that a struct with multiple nullable fields would allow:
```zig
const RequestState = union(enum) {
    idle,
    loading,
    success: []const u8,
    failure: anyerror,
};
```

**Explicit error sets** — documents exactly what can fail; `anyerror` hides failure modes:
```zig
const ParseError = error{ InvalidSyntax, UnexpectedToken, EndOfInput };
fn parse(input: []const u8) ParseError!Ast { ... }
```

**Distinct types for domain IDs** — compiler prevents mixing up different ID types:
```zig
const UserId = enum(u64) { _ };
const OrderId = enum(u64) { _ };
```

**Comptime validation** — catch invalid configurations at compile time, not runtime:
```zig
fn Buffer(comptime size: usize) type {
    if (size == 0) @compileError("buffer size must be greater than 0");
    return struct { data: [size]u8 = undefined, len: usize = 0 };
}
```

**Restrict who can do it** — when only one scope may perform an effect, keep its functions non-`pub` and expose only the scope that performs it; an opaque capability that the scope alone constructs makes an out-of-scope call a compile error. Correct types are the proof.

## Memory Management

- Pass allocators explicitly to every function that allocates; no global allocator state.
- Place `defer resource.deinit()` immediately after acquisition — keeps cleanup co-located with creation.
- Use `errdefer` for cleanup on error paths; `defer` for unconditional cleanup.
- Use arena allocators for batch/temporary work; they free everything at once.
- Use `std.testing.allocator` in tests — reports leaks with stack traces.

```zig
fn createResource(allocator: std.mem.Allocator) !*Resource {
    const resource = try allocator.create(Resource);
    errdefer allocator.destroy(resource);  // runs only on error
    resource.* = try initializeResource();
    return resource;
}
```

## Safety Idioms

Runs on the assertions-and-bounds law in `code-law`; these are the Zig-specific levers.

- `std.debug.assert` for invariants; `comptime` asserts check design relationships between constants (type sizes, layout invariants) before the program even runs.
- Prefer explicitly-sized integers (`u32`, `u64`) where the domain owns the type; keep `usize` at the std-lib seam (slice lengths, indices) instead of propagating it inward through `@intCast` chains.
- Decide allocation up front: arenas or fixed buffers sized at init for the data plane; every long-lived cache or pool carries an explicit upper bound.
- Construct large structs in place via an out-pointer (`fn init(target: *T) !void`) for pointer stability and no intermediate copy-moves; in-place init is viral — if a field needs it, the container does too.

## Key Conventions

- Prefer `const` over `var`; prefer slices over raw pointers.
- Prefer `comptime T: type` over `anytype`; explicit types produce clearer errors. Use `anytype` only for genuinely polymorphic cases (callbacks, `std.debug.print`-style).
- Exhaustive `switch`: include an `else` returning an error or `unreachable` for truly impossible cases.
- Use `std.log.scoped(.module_name)` for namespaced logging; define a module-level `const log` constant.
- Larger cohesive files are idiomatic — tests alongside implementation, comptime generics at file scope.

## Current facts

The fleet pins the Zig version (`zig version`); std APIs change between
releases, so read the installed std source (`zig env` prints `std_dir`) before
relying on a remembered name. Renames that bite on 0.16: the leak-checking
allocator is `std.heap.DebugAllocator` (no `GeneralPurposeAllocator`), the C
calling convention is `callconv(.c)`, and `std.ArrayList` methods take the
allocator.

## Build caching

- A run step declares the files it reads at run time (`addFileInput`, or a
  declared source tree), so `zig build` can skip it and reruns it when one
  changes.
- Keep `has_side_effects` for steps that change something outside the cache;
  a step that only reads declares its inputs instead.
- No options module holds an absolute path: a second checkout of the same
  commit cannot reuse what was built or run against it.

## Tooling

`ziglint` (static analysis, configured by `.ziglint.zon`) runs where the
project pins it.

## References

- Language reference and std docs for the pinned version:
  `https://ziglang.org/documentation/<zig version>/`
