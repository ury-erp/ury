# Workspace Workflow

## Principle

This workspace is a **documentation-only stub**. It is designed so that every task, PR, or job starts from the same known state and lives on its own isolated branch. When implementation work begins, the URY source code is brought into the task branch separately (e.g. cloned into a subdirectory or worked in a separate local URY clone).

## Branches

- **`default`** — workspace base branch. Created from upstream `develop`. Keep it clean and unmodified.
- **`task/<short-description>`** — one branch per task. Created from `default`. Never merged back into `default`.

## Starting a New Task

```bash
cd C:/Users/swafa/Projects/Workspaces/ury/default

# 1. Ensure you are on default and it is clean
git checkout default
git status   # should show no uncommitted changes

# 2. (Optional) Refresh upstream reference docs in default
#    Since this stub has no source code, you can safely reset to upstream
#    develop to refresh reference docs, then re-apply workspace files.
git fetch origin
git reset --hard origin/develop

# 3. Create task branch
git checkout -b task/short-description

# 4. Bring in the URY codebase for implementation work
#    (skip this if the task is documentation/planning only)
git clone --branch develop https://github.com/ury-erp/ury.git ury-code

# 5. Work, commit, push
git add .
git commit -m "feat: description of change"
git push -u origin task/short-description
```

## Completing a Task

1. Push the final commits to the remote task branch.
2. Open a pull request on GitHub against **`ury-erp/ury:develop`**.
3. Do **not** open the PR against the local `default` branch.
4. Do **not** merge the task branch into `default`.
5. After the upstream PR is merged (or closed), the local task branch can be deleted.

## Housekeeping Rules

- Never commit directly to `default`.
- Never merge a task branch into `default`.
- Do not leave work-in-progress files on `default` when switching away.
- Keep task branches focused on a single PR/task.
