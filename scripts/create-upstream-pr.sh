#!/bin/bash
# URY Dashboard — Fork-to-Upstream PR Helper
# 
# Creates a pull request from your fork to the upstream repository.
# This is the recommended workflow for contributing changes.
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated
#   - Fork remote already added (run: git remote add fork <your-fork-url>)
#
# Usage:
#   bash scripts/create-upstream-pr.sh                    # PR from current branch to upstream/develop
#   bash scripts/create-upstream-pr.sh feature/my-thing   # PR from specific branch
#   bash scripts/create-upstream-pr.sh feature/x main     # PR targeting upstream/main

set -euo pipefail

# ── Configuration ──────────────────────────────────────────
UPSTREAM_REPO="${UPSTREAM_REPO:-ury-erp/ury}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
FORK_REMOTE="${FORK_REMOTE:-origin}"
DEFAULT_TARGET_BRANCH="${DEFAULT_TARGET_BRANCH:-develop}"

# ── Arguments ──────────────────────────────────────────────
SOURCE_BRANCH="${1:-$(git branch --show-current)}"
TARGET_BRANCH="${2:-$DEFAULT_TARGET_BRANCH}"

if [ -z "$SOURCE_BRANCH" ]; then
  echo "ERROR: Could not determine source branch. Pass it as argument."
  echo "Usage: bash scripts/create-upstream-pr.sh [source-branch] [target-branch]"
  exit 1
fi

echo "Creating PR to upstream..."
echo "  Source: $FORK_REMOTE/$SOURCE_BRANCH"
echo "  Target: $UPSTREAM_REPO:$TARGET_BRANCH"
echo ""

# ── Ensure upstream remote exists ─────────────────────────
if ! git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
  echo "Adding upstream remote..."
  git remote add "$UPSTREAM_REMOTE" "https://github.com/$UPSTREAM_REPO.git"
fi

# ── Fetch latest upstream ─────────────────────────────────
echo "Fetching upstream changes..."
git fetch "$UPSTREAM_REMOTE"

# ── Check if branch has commits not in upstream ───────────
MERGE_BASE=$(git merge-base "$UPSTREAM_REMOTE/$TARGET_BRANCH" "$FORK_REMOTE/$SOURCE_BRANCH" 2>/dev/null || echo "")
CURRENT_HEAD=$(git rev-parse "$FORK_REMOTE/$SOURCE_BRANCH")

if [ "$MERGE_BASE" = "$CURRENT_HEAD" ]; then
  echo "WARNING: No new commits on $SOURCE_BRANCH compared to upstream/$TARGET_BRANCH"
  echo "Make sure you have pushed your changes: git push $FORK_REMOTE $SOURCE_BRANCH"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
  fi
fi

# ── Generate PR description ───────────────────────────────
COMMIT_COUNT=$(git rev-list "$UPSTREAM_REMOTE/$TARGET_BRANCH..$FORK_REMOTE/$SOURCE_BRANCH" --count 2>/dev/null || echo "0")
COMMIT_LIST=$(git log --oneline "$UPSTREAM_REMOTE/$TARGET_BRANCH..$FORK_REMOTE/$SOURCE_BRANCH" 2>/dev/null || echo "(no new commits)")

echo ""
echo "Found $COMMIT_COUNT new commit(s):"
echo "$COMMIT_LIST"
echo ""

# ── Create PR via GitHub CLI ──────────────────────────────
BODY=$(cat <<EOF
## Fork Contribution

**Source:** \`${SOURCE_BRANCH}\`
**Target:** \`${UPSTREAM_REPO}:${TARGET_BRANCH}\`

### Commits (${COMMIT_COUNT})
$(echo "$COMMIT_LIST" | sed 's/^/- /')

---
_Please review the changes before merging._
EOF
)

TITLE="Sync: ${SOURCE_BRANCH} → ${TARGET_BRANCH} (${COMMIT_COUNT} commits)"

echo "Creating pull request..."
echo "  Title: $TITLE"
echo ""

if command -v gh &>/dev/null; then
  gh pr create \
    --repo "$UPSTREAM_REPO" \
    --head "$SOURCE_BRANCH" \
    --base "$TARGET_BRANCH" \
    --title "$TITLE" \
    --body "$BODY"
  echo ""
  echo "SUCCESS: Pull request created!"
else
  echo "GitHub CLI (gh) not found."
  echo ""
  echo "Create the PR manually at:"
  echo "  https://github.com/$UPSTREAM_REPO/compare/$TARGET_BRANCH...$SOURCE_BRANCH"
  echo ""
  echo "Or install GitHub CLI: https://cli.github.com/"
  echo "Then re-run this script."
fi
