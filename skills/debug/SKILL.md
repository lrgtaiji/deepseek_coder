---
name: debug
description: Debug runtime errors, logical bugs, and unexpected behavior systematically
metadata:
  type: builtin
  version: "1.0"
---

## Instructions

When a user asks to debug an issue, you should:

1. **Reproduce** — understand the exact steps to trigger the bug
2. **Read** all relevant source files, error logs, and stack traces
3. **Hypothesize** — form a theory before making changes:
   - What's expected vs actual behavior?
   - What changed recently?
   - Is it data, logic, timing, or environment?
4. **Diagnose** systematically:
   - Trace data flow from input to output
   - Check type mismatches (TypeScript strict mode)
   - Look for async issues: race conditions, unawaited promises
   - Check null/undefined handling
   - Verify API contracts (wrong parameters, unexpected responses)
   - Look for off-by-one, inverted conditions, wrong operators
   - Check environment: Node/Bun version, OS, file permissions
5. **Verify fix** with minimal change:
   - Apply the smallest possible fix
   - Explain why the fix works
   - Consider if the root cause has other occurrences (search with Grep)
6. **Test** — run relevant tests or create a repro script

## Debugging Techniques

| Symptom | Common Causes |
|---------|---------------|
| `undefined is not ...` | Missing null check, wrong property name, async timing |
| `Cannot find module` | Wrong path, missing dependency, case sensitivity |
| Silent failure | Uncaught promise, swallowed error, missing await |
| Wrong output | Type coercion, mutation side-effect, stale closure |
| Infinite loop | Wrong termination condition, missing increment |
| Crash on edge case | Missing boundary check, off-by-one, empty input |

## Principles

- **Read before write** — understand the code fully before changing it
- **Root cause** — fix the cause, not the symptom
- **Minimal change** — the smallest diff that fixes the bug
- **Explain your reasoning** — show the diagnosis path, not just the fix
