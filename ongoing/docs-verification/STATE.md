# Task: Verify two agents' documentation branches against ury source code

## Ground facts (verified — do not re-derive)
- Workspace repo: C:/Users/swafa/Projects/Workspaces/ury (branch `default`, clean).
- `origin` remote = actual source repo https://github.com/ury-erp/ury (Frappe/ERPNext restaurant POS app).
- Source code checked out at: C:/Users/swafa/Projects/Workspaces/ury/.worktrees/ury-src (origin/develop @ d889a90).
- Agent A docs = branch `default` (this checkout). Root files AGENTS.MD, FEATURES.md, INSTALLATION.md, SETUP.md, README.md are VERBATIM COPIES of upstream ury repo files — not agent A's work. Agent A's original work: docs/installation.md, docs/project-specifications.md, docs/setup-guide.md (+ WORKSPACE.md, .workspace/*).
- Agent B docs = branch `draft-docs` @ 3b2c772, checked out at C:/Users/swafa/Projects/Workspaces/ury/.worktrees/draft-docs — structured mkdocs site, 38 files, ~2350 lines.
- Executor: Kimi CLI 0.23.2 (`kimi -y -p "..."`).

## Phase table
| # | phase | output | status |
|---|-------|--------|--------|
| 1 | verify Agent A docs (default branch) | 01-verify-default.md | DONE — 108 claims, 3 inaccurate (97.1%); installation KEEP, spec FIX, setup KEEP. Findings spot-checked by orchestrator: all 3 confirmed. |
| 2a | verify Agent B docs: architecture/backend/reference | 02a-verify-draft-backend.md | IN PROGRESS (kimi bg bya8f453v) |
| 2b | verify Agent B docs: frontend/flows/operations/passes | 02b-verify-draft-frontend.md | pending (dispatch after 2a) |
| 3 | triage + keep/take decision (ORCHESTRATOR) | 03-triage.md | pending |
| 4 | final report (ORCHESTRATOR) | 04-final-report.md | pending |

## Decisions log
- 2026-07-08: Root docs on `default` are upstream copies → excluded from Agent A accuracy assessment; only docs/*.md evaluated.
