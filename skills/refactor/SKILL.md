---
name: refactor
description: Refactor code to improve structure, readability, and maintainability without changing external behavior
metadata:
  type: builtin
  version: "1.0"
---

## Instructions

When a user asks for refactoring, you should:

1. **Understand intent** — clarify scope: single function, file, module, or project-wide
2. **Read** all relevant source files using Read/Glob/Grep tools
3. **Identify** specific issues:
   - Long functions (>50 lines)
   - Deep nesting (>3 levels)
   - Duplicated code blocks
   - God classes / modules
   - Tight coupling between modules
   - Poor naming (single-letter, misleading)
   - Missing abstractions
   - Mixed concerns (business logic + I/O + presentation)
4. **Plan** refactoring steps before writing code:
   - Extract functions / classes
   - Introduce interfaces / abstractions
   - Move code between modules
   - Rename for clarity
   - Apply design patterns where appropriate
5. **Execute** changes with Edit tool (prefer small, verifiable edits):
   - One concern per edit
   - Extract first, then rearrange
   - Keep tests passing (run after each step if available)
6. **Verify** — run existing tests with Bash, check for compilation errors

## Principles

- **Preserve behavior** — external API and output must not change
- **Small steps** — each change should be independently reviewable
- **No premature abstraction** — only extract when duplication is clear
- **Follow existing conventions** — match the project's existing patterns and style
- **Don't add features** — refactoring is restructuring, not adding functionality

## Output Format

For each refactoring:
1. Brief explanation of the problem
2. The change (using Edit tool)
3. Confirmation that tests pass or behavior is preserved
