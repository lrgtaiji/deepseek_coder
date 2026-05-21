---
name: test
description: Generate unit tests, integration tests, and test strategies for code
metadata:
  type: builtin
  version: "1.0"
---

## Instructions

When a user asks to write tests, you should:

1. **Understand the target** — read the source code to understand:
   - Function signatures, inputs, outputs, side effects
   - Dependencies and mocking requirements
   - Edge cases and boundary conditions
2. **Determine test framework** — check project for existing test setup:
   - Look for `package.json` test scripts, jest/ava/vitest config
   - Check existing test files for patterns to follow
   - Default to Bun.test() if no framework detected (this project uses Bun)
3. **Write tests** covering:
   - **Happy path**: normal inputs produce expected outputs
   - **Edge cases**: empty, null, boundary values, special chars
   - **Error cases**: invalid input, thrown exceptions, rejected promises
   - **Integration**: multiple units working together (if applicable)
4. **Structure tests** clearly:
   - Descriptive test names that explain the scenario
   - Arrange → Act → Assert pattern
   - One concept per test
   - Shared setup in beforeEach / beforeAll
5. **Run tests** — execute with Bash to verify they pass

## Test Template (Bun)

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";

describe("ModuleName", () => {
  describe("functionName", () => {
    test("should do X when given Y", () => {
      const result = functionName(input);
      expect(result).toBe(expected);
    });

    test("should throw when given invalid input", () => {
      expect(() => functionName(null as any)).toThrow();
    });
  });
});
```

## Principles

- **Test behavior, not implementation** — don't test private methods directly
- **One assertion purpose per test** — avoid testing multiple behaviors in one test
- **Realistic data** — use production-like inputs, not just `"foo"` / `123`
- **Cover edge cases** — empty strings, NaN, -0, large numbers, unicode
- **Don't test the framework** — trust that `expect().toBe()` works
- **Match existing style** — follow the project's existing test conventions
