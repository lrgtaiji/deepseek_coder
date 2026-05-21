---
name: document
description: Generate and improve code documentation, README files, and API docs
metadata:
  type: builtin
  version: "1.0"
---

## Instructions

When a user asks for documentation, you should:

1. **Determine scope** — single function, module, API, or project README?
2. **Read** the source code and any existing docs
3. **Generate** documentation appropriate to the scope:

### For Functions/Methods
- Brief description of purpose
- `@param` — each parameter with type and meaning
- `@returns` — return value description
- `@throws` — when and what errors
- Usage example in a code block

### For Classes/Modules
- Overview of responsibility
- Constructor parameters
- Public methods summary
- Key properties
- Usage example

### For APIs/Endpoints
- HTTP method and path
- Request parameters (path, query, body)
- Response format with example
- Error codes and meanings
- Authentication requirements

### For README
- Project title and one-line description
- Installation instructions
- Quick start with code example
- Configuration options (table format)
- Architecture diagram (ASCII or Mermaid)
- Development setup

## Principles

- **Write for the reader** — assume they know nothing about the code
- **Explain the WHY** — not just what, but why it exists
- **Be concise** — prefer bullet points and tables over long paragraphs
- **Keep docs near code** — prefer JSDoc/TSDoc over separate docs
- **Use Chinese** for explanations, keep code identifiers in English
- **Update don't duplicate** — if docs exist, edit them; don't add a second copy
