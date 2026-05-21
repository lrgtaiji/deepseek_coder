---
name: explain
description: Explain code logic, architecture, and design patterns in clear language
metadata:
  type: builtin
  version: "1.0"
---

## Instructions

When a user asks to explain code, you should:

1. **Scope the request** — ask if not specified: specific function, file, module, or the entire architecture?
2. **Read** the relevant files using Read/Glob/Grep tools
3. **Analyze** the code systematically:
   - **Purpose**: What problem does this code solve?
   - **Input/Output**: What data flows in and out?
   - **Algorithm**: Step-by-step logic flow
   - **Dependencies**: What does it call? What calls it?
   - **State**: What state does it manage? Mutable vs immutable?
   - **Edge cases**: What boundary conditions are handled?
   - **Patterns**: What design patterns are used?
4. **Explain** in plain Chinese, organized top-down:
   - Start with a one-sentence summary
   - Then explain the overall architecture
   - Then walk through key functions/classes
   - Highlight non-obvious decisions and WHY they were made
   - Point out potential pitfalls or surprising behavior
5. **Use examples** — concrete input/output examples clarify abstractions

## Principles

- **Top-down**: Give the big picture first, then details
- **Explain the WHY**: Code tells what; explain why it's written that way
- **Be concrete**: Use specific variable names, not vague descriptions
- **Flag surprises**: Highlight non-obvious behavior, side effects, hidden assumptions
- **Chinese for explanations, code identifiers in English**
