---
name: code-style
description: Code style rules for readable, maintainable implementation. Load this skill always when writing or editing code, and whenever the user asks about code style, refactoring shape, function/file size, object-oriented structure, helper ordering, or comments. For Frappe-specific work, prefer frappe-app-dev.
---

# Code Style Rules

- Keep functions small. Split when a function has multiple jobs or needs sections to be readable.
- Keep files under 300 lines when practical. Split by responsibility, not by arbitrary layer.
- Prefer object-oriented code over scattered functions.
- Put higher-order/public functions near the top of the file; keep low-level utilities at the bottom.
- Write terse, simple English comments. Explain why something is surprising; do not narrate obvious code.
- Do not add abstractions until there are repeated concrete uses.

For Frappe-specific work, prefer `frappe-app-dev`.
