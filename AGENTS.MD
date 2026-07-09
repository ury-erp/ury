# Workspace Agent Instructions

Welcome. You are operating in a management workspace for the URY Frappe/ERPNext application.

## 0. Meta Instructions for Agents
- **No Emojis:** Do not use emojis in your responses, documentation, or commits.
- **Tone:** Use stoic, direct, and concise language. Avoid being chatty. Get straight to the point.

## 1. Workspace Objective
This workspace (`c:\Users\swafa\Projects\Workspaces\ury`) is strictly for **planning, documentation, environmental information, specs, and issue tracking** (todos) for the URY app. 

It does **NOT** contain the active Frappe application codebase in its Git tree. The actual URY codebase and Frappe bench reside in a separate WSL (Ubuntu) environment.

## 2. Workspace Workflow (Tracks Strategy)
1. **No Git Branches (In Workspace)**: Do not create or switch Git branches in this workspace to track work.
2. **Tracks & Ownership**: All initiatives are sub-directories in `tracks/`. Directory names must include the owner prefix (e.g., `sa-create-documentation` for `sa-user`, `ak-task` for `AK-Bot`).
3. **Index**: The root `index.md` file tracks all active tracks, including the assigned user/owner.
4. **Meta Info**: Each track's plan/doc must contain a meta info block specifying the owner/agent. Default to the current Git user if unspecified.
5. **Task Execution**: Whenever assigned a task:
   - Check `index.md` and the `tracks/<prefix-task-name>/` folder.
   - Read the plan, specs, and todos.
   - Execute code modifications in the WSL environment.
   - Update documentation as progress is made.

### 2.1. Local Track Overrides & Selective Tracking
To avoid pulling/tracking other users' tracks or to work on a subset of active tracks:
- **Local-Only Ignores**: Add local-only tracks (that you do not want to push to the remote) to `.git/info/exclude` instead of `.gitignore`.
- **Sparse Checkout (Hide other tracks)**: You can configure git to only check out the core workspace files and your own tracks:
  ```bash
  git sparse-checkout init --cone
  git sparse-checkout set docs/ skills/ index.md AGENTS.MD WORKSPACE.md tracks/sa-*
  ```
  Replace `sa-*` with your owner prefix. This prevents local clutter from other users' fast-moving tracks.

## 3. Development Environment & Code Execution
The URY application is hosted in a Frappe bench inside WSL. 

- **Bench Path (WSL)**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench`
- **Site Path (WSL)**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/sites/ury.local`
- **URY App Path (WSL)**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury`

**CRITICAL RULE**: Any command related to Frappe (`bench`), Node (`yarn`, `npm`), or direct code manipulation must be executed through WSL using the `wsl` prefix and appropriate directory paths.
- Example: `wsl --cd /mnt/c/Users/swafa/Projects/Bench/ury-bench bench restart`

## 4. Knowledge Base, Features & Skills
We maintain URY-specific documentation and AI agent skills directly in this workspace:
- **Feature & Code Mapping**: Feature specifications, architecture documents, and code-to-feature mapping are maintained in the `docs/` folder (e.g., `docs/features/`). `docs/URY_APP_ARCHITECTURE.md` holds legacy architecture details.
- **Agent Skills**: URY-specific and project-specific skills (e.g., custom scripts for testing, POS build workflows) are maintained in the `skills/` directory. When applicable, relate these to your global skills to leverage existing capabilities (e.g., standard Node/Python skills).

## 5. Version Control & Codebase Management (URY App)
While this workspace uses `tracks/`, the actual **URY codebase** (in WSL) follows strict Git practices:
- **Worktrees & Branches**: Use Git worktrees or branches within the actual URY app path (`apps/ury`) to isolate feature development. This allows multiple tracks to be worked on in parallel without polluting a single working directory.
- **PR Policy**: Every completed track MUST result in a Pull Request against the upstream URY repository (`develop` or `main` depending on target). Never push directly to main branches.

## 6. Testing & Quality Assurance
All new features and bug fixes MUST include appropriate tests. We strictly enforce the following testing patterns in the URY app:
1. **E2E Tests**: Standard end-to-end flows using Frappe's test runner.
2. **E2E Deployed Tests**: Integration tests executed against a fully deployed/built staging environment to verify production-like behavior.
3. **Browser Based UI Tests**: Automated browser tests (e.g., Cypress/Playwright) for the Vue/React POS frontend interfaces.
- **Check for New Tests**: Before marking a track as complete, agents MUST verify that corresponding tests for the new feature have been written, updated, and pass successfully.
