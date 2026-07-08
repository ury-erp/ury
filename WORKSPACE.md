# URY Workspace — Agent Instructions

This is the **default workspace stub** for planning and documenting work on [URY](https://github.com/ury-erp/ury), an open-source restaurant management system built as a Frappe/ERPNext app.

This stub contains **documentation and metadata only** — no URY codebase. When you start an actual implementation task, clone or check out the URY source into the task branch separately.

> **Read this file first** when starting work in this workspace. It defines the workspace conventions, branch strategy, and where to find project context. For URY-specific implementation guidance, also read the project's own `AGENTS.MD`.

---

## 1. What Is URY?

- **Full name:** URY — Open Source Restaurant Management System
- **Publisher:** Tridz Technologies Pvt. Ltd. (supported by Frappe)
- **License:** MIT
- **GitHub:** https://github.com/ury-erp/ury
- **Default upstream branch:** `develop`
- **Current workspace base branch:** `default`

URY covers the full restaurant workflow: menu management, table management, order taking (POS), kitchen display (KOT), payments, daily P&L reporting, and multi-branch support. It is built on top of ERPNext and Frappe Framework.

---

## 2. Workspace Layout

```
C:/Users/swafa/Projects/Workspaces/ury/default/
├── WORKSPACE.md              ← You are here (workspace agent instructions)
├── .gitignore                ← Workspace-specific ignores
├── .workspace/               ← Workspace metadata and workflow docs
│   ├── README.md
│   ├── metadata.json
│   └── workflow.md
├── docs/                     ← Project documentation derived from upstream
│   ├── project-specifications.md
│   ├── installation.md
│   └── setup-guide.md
│
├── AGENTS.MD                 ← Upstream project agent documentation
├── README.md                 ← Upstream project README
├── FEATURES.md               ← Upstream feature list
├── INSTALLATION.md           ← Upstream installation guide
└── SETUP.md                  ← Upstream setup guide
```

This stub intentionally does **not** contain the URY source code (`ury/`, `pos/`, `URYMosaic/`, `urypos/`). Keep it documentation-only so it stays lightweight and unambiguous as a starting point.

**Do not edit upstream project files** (`AGENTS.MD`, `README.md`, `FEATURES.md`, etc.) unless the task explicitly requires it. Treat them as reference material.

---

## 3. Branch Strategy (Important)

This workspace follows a **one job / one PR / one task = one independent branch** model.

- The local branch `default` is the **workspace base branch**. It was created from the upstream `develop` branch and should remain in a known-good, ready-to-start state.
- For every new task, create a new branch **from `default`**:
  ```bash
  git checkout default
  git pull origin develop          # optional: refresh upstream changes
  git checkout -b task/<short-description>
  ```
- **These task branches are never merged back into `default`.** Each branch is an isolated slice of work. When a task is complete, the branch is pushed to the remote and a pull request is opened from it against the upstream `develop` branch, not against this local `default` branch.
- Do not delete or rewrite the `default` branch.

### Suggested branch naming

- `task/pos-payment-dialog-fix`
- `task/add-kot-delay-column`
- `task/menu-i18n-de`

---

## 4. How to Start a Task

1. Check out `default`.
2. Make sure the working tree is clean (stash or commit any leftover work on other branches first).
3. Create the task branch from `default`.
4. Bring in the URY codebase for implementation work. Common options:
   - Clone the upstream repo into a subdirectory of the task branch:
     ```bash
     git checkout task/<short-description>
     git clone --branch develop https://github.com/ury-erp/ury.git ury-code
     ```
   - Or maintain a separate local clone of URY and work there, using this workspace for planning and reference.
5. Read the relevant upstream agent doc for the area you are touching:
   - Backend / doctypes / hooks → `AGENTS.MD`
   - React POS v2 → `pos/AGENTS.MD` (inside the URY source)
   - Vue KDS → `URYMosaic/AGENTS.MD` (inside the URY source)
6. Implement the change, test it, commit.
7. Push the task branch to the remote and open a PR against `ury-erp/ury:develop`.

---

## 5. Development Environment Notes

When you bring in the URY codebase for a task, the expected stack is:

- **Python:** >= 3.10
- **Node.js:** >= 18.20 (required for building the POS/KDS frontends)
- **Framework:** Frappe Framework v15 + ERPNext v15 + Frappe HR (`hrms`)
- **Package manager:** Yarn workspace at the URY repo root manages `pos/`, `URYMosaic/`, and `urypos/`.

### Common commands (run inside the URY source tree)

```bash
# Install URY into a Frappe bench
bench get-app ury https://github.com/ury-erp/ury.git

# Build frontends
yarn install
yarn build

# Or build individual apps
cd pos && yarn build
cd URYMosaic && yarn build
cd urypos && yarn build

# Copy assets into Frappe public directory
bench build --app ury

# Run server
bench start
```

---

## 6. Useful Links

- Upstream repo: https://github.com/ury-erp/ury
- URY docs: https://ury.app/docs/
- Installation docs: https://ury.app/docs/Installation/
- Setup docs: https://ury.app/docs/Setup/
- Frappe Framework docs: https://docs.frappe.io/
- ERPNext docs: https://docs.erpnext.com/
