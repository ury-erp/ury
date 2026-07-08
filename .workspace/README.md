# URY Default Workspace

This directory is the **default workspace stub** for URY development.

## Purpose

Provide a clean, documented starting point for every URY task or PR. This stub contains **documentation and plans only** — no URY source code. Each task gets its own branch created from the local `default` branch. Task branches are isolated and are not merged back into `default`.

## Quick Start

```bash
# From the workspace root
cd C:/Users/swafa/Projects/Workspaces/ury/default

# Make sure you are on the default branch
git checkout default

# Create a task branch
git checkout -b task/<short-description>

# Bring in the URY codebase when you are ready to implement
# (e.g. clone into a subdirectory or use a separate local URY clone)
git clone --branch develop https://github.com/ury-erp/ury.git ury-code

# Do work, commit, push, open PR against ury-erp/ury:develop
```

## Documentation Map

| File | Purpose |
|------|---------|
| `WORKSPACE.md` | Agent instructions and workspace conventions |
| `.workspace/metadata.json` | Structured workspace metadata |
| `.workspace/workflow.md` | Branch and PR workflow |
| `docs/project-specifications.md` | URY architecture, tech stack, doctypes |
| `docs/installation.md` | How to install URY in a Frappe bench |
| `docs/setup-guide.md` | How to configure URY after installation |
| `AGENTS.MD` | Upstream project agent documentation |
| `pos/AGENTS.MD` | React POS v2 agent documentation (inside URY source) |
| `URYMosaic/AGENTS.MD` | Vue KDS agent documentation (inside URY source) |

## Project Links

- GitHub: https://github.com/ury-erp/ury
- Docs: https://ury.app/docs/
- Publisher: Tridz Technologies Pvt. Ltd.
