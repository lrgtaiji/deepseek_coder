---
name: code-review
description: Review code for bugs, style issues, security vulnerabilities, and performance problems
metadata:
  type: builtin
  version: "1.0"
---

## Instructions

When a user asks for a code review, you should:

1. **First**, understand what the code is supposed to do
2. **Read** the relevant files using Read/Glob/Grep tools
3. **Check for**:
   - Bugs and logic errors
   - Security vulnerabilities (XSS, SQL injection, command injection)
   - Performance issues (unnecessary loops, memory leaks, N+1 queries)
   - Code style and naming conventions
   - Missing error handling at system boundaries
   - Test coverage gaps
4. **Report** findings organized by severity:
   - CRITICAL: security issues, data loss risks
   - HIGH: bugs that affect correctness
   - MEDIUM: performance issues, missing error handling
   - LOW: style/naming improvements
5. **Suggest** concrete fixes for each issue found

## Output Format

Present findings as a table:

| Severity | File | Line | Issue | Fix |
|----------|------|------|-------|-----|
