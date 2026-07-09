# URY Workspace — Agent Instructions

This workspace is for managing URY, a Frappe/ERPNext custom app for restaurant order management.
It serves as the main area for plans, docs, environment info, specs, trackers, and todos.

## 1. Environment & Paths

- **Actual Frappe Site and Apps**: Located in WSL (Ubuntu default).
- **Bench Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench`
- **Site Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/sites/ury.local`
- **App Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury`

**CRITICAL RULE**: Run all bench commands in the WSL bench path using the `wsl` prefix from this workspace or directly in WSL.
Examples:
- `wsl --cd /mnt/c/Users/swafa/Projects/Bench/ury-bench bench start`
- `wsl --cd /mnt/c/Users/swafa/Projects/Bench/ury-bench bench clear-cache`
- `wsl --cd /mnt/c/Users/swafa/Projects/Bench/ury-bench bench migrate`

## 2. Workspace Workflow (Tracks)

**We do NOT create branches in the workspace git remote.**
Instead, all work is organized in a **`tracks`** directory.
- Each job, initiative, or work track gets its own sub-directory under `tracks/`.
- Each track directory contains its own docs, plans, specs, trackers, and todos.
- The main workspace root maintains an `index.md` file to keep track of all tracks, their status (e.g., active, default, archived).

## 3. Creating a New Track

1. Create a new directory: `tracks/<track-name>/`.
2. Add necessary documentation (e.g., `plan.md`, `todo.md`) in the track directory.
3. Update `index.md` in the root to link to the new track and set its status.
4. For implementation, modify the actual code in the WSL paths mentioned above.

## 4. Useful Links

- Upstream repo: https://github.com/ury-erp/ury
- URY docs: https://ury.app/docs/
- Installation docs: https://ury.app/docs/Installation/
- Setup docs: https://ury.app/docs/Setup/
- Frappe Framework docs: https://docs.frappe.io/
- ERPNext docs: https://docs.erpnext.com/
