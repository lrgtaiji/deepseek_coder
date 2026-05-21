---
name: simplify
description: Review changed code for reuse, quality, and efficiency, then fix any issues found
metadata:
  type: builtin
  version: "1.0"
trigger:
  - /simplify
  - simplify
  - 简化
  - 代码审查清理
---

# Simplify: Code Review and Cleanup

Review all changed files for reuse, quality, and efficiency. Fix any issues found.

## Phase 1: Identify Changes

Run `git diff` (or `git diff HEAD` if there are staged changes) to see what changed. If there are no git changes, review the most recently modified files that the user mentioned or that you edited earlier in this conversation.

## Phase 2: Three Review Passes

Perform ALL three reviews yourself on the changed code:

### Review 1: Code Reuse

For each change:
1. Search for existing utilities and helpers that could replace newly written code. Look for similar patterns elsewhere in the codebase — common locations are utility directories, shared modules, and files adjacent to the changed ones.
2. Flag any new function that duplicates existing functionality. Suggest the existing function to use instead.
3. Flag any inline logic that could use an existing utility — hand-rolled string manipulation, manual path handling, custom environment checks, ad-hoc type guards, and similar patterns are common candidates.

### Review 2: Code Quality

Review the same changes for hacky patterns:
1. Redundant state: state that duplicates existing state, cached values that could be derived
2. Copy-paste with slight variation: near-duplicate code blocks that should be unified
3. Leaky abstractions: exposing internal details that should be encapsulated
4. Stringly-typed code: using raw strings where constants or enums already exist
5. Nested conditionals: ternary chains, nested if/else 3+ levels deep
6. Unnecessary comments: comments explaining WHAT the code does (well-named identifiers already do that)

### Review 3: Efficiency

Review the same changes for efficiency:
1. Unnecessary work: redundant computations, repeated file reads, duplicate calls
2. Missed concurrency: independent operations running sequentially
3. Hot-path bloat: blocking work added to startup or per-request paths
4. Memory issues: unbounded data structures, missing cleanup, event listener leaks
5. Unnecessary existence checks (TOCTOU anti-pattern)
6. Overly broad operations: reading entire files when only a portion is needed

## Phase 3: Fix Issues

After completing all three reviews:
1. Aggregate all findings into a prioritized list
2. Fix each HIGH severity issue directly — bugs, dead code, type safety violations
3. Fix MEDIUM severity issues — code duplication, magic numbers, performance problems
4. Skip LOW severity false positives or cosmetic issues — don't argue, just skip
5. After fixing, run `bun run typecheck` and `bun test` to verify nothing broke

## Output Format

Present findings as a table:

| # | Severity | File:Line | Issue | Status |
|---|----------|-----------|-------|--------|
| 1 | HIGH | file.ts:42 | Dead code `getCompactRange` | Fixed |
| 2 | MEDIUM | file.ts:88 | Magic number should be constant | Fixed |
| 3 | LOW | file.ts:15 | Redundant comment | Skipped |

Then summarize: "X issues found, Y fixed, Z skipped."
