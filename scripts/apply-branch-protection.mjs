#!/usr/bin/env node
// URY Dashboard — Apply Branch Protection Rules
// Usage: GITHUB_TOKEN=ghp_xxx REPO=owner/repo node scripts/apply-branch-protection.mjs
//
// Reads .github/branch-protection.yml and applies settings via GitHub REST API.
// Requires a token with "administration:write" repo scope.

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.REPO; // e.g. "ury-erp/ury-dashboard"

if (!GITHUB_TOKEN) {
  console.error("ERROR: GITHUB_TOKEN environment variable is required");
  process.exit(1);
}
if (!REPO) {
  console.error("ERROR: REPO environment variable is required (e.g. ury-erp/ury-dashboard)");
  process.exit(1);
}

// Parse simple YAML-like config (no external deps)
function parseBranchProtection(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const branches = {};
  let currentBranch = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Match branch name (e.g. "  main:")
    const branchMatch = trimmed.match(/^(\w+):$/);
    if (branchMatch && !trimmed.startsWith("#")) {
      currentBranch = branchMatch[1];
      branches[currentBranch] = { protection: {} };
      continue;
    }

    if (!currentBranch) continue;

    // Parse boolean values
    if (trimmed.match(/^\w+: (true|false)$/)) {
      const [key, val] = trimmed.split(": ");
      branches[currentBranch].protection[key] = val === "true";
      continue;
    }

    // Parse integer values
    if (trimmed.match(/^\w+: \d+$/)) {
      const [key, val] = trimmed.split(": ");
      branches[currentBranch].protection[key] = parseInt(val);
      continue;
    }

    // Parse null values
    if (trimmed.match(/^\w+: null$/)) {
      const [key] = trimmed.split(": ");
      branches[currentBranch].protection[key] = null;
      continue;
    }

    // Parse string values
    if (trimmed.match(/^\w+: ".+"$/)) {
      const [key, ...rest] = trimmed.split(": ");
      branches[currentBranch].protection[key] = rest.join(": ").replace(/"/g, "");
      continue;
    }

    // Parse context list items
    if (trimmed.match(/^- "/)) {
      if (!branches[currentBranch].protection.contexts) {
        branches[currentBranch].protection.contexts = [];
      }
      branches[currentBranch].protection.contexts.push(trimmed.replace(/^"- |"- /, "").replace(/"$/, ""));
      continue;
    }
  }

  return branches;
}

async function applyBranchProtection(branch, config) {
  const url = `https://api.github.com/repos/${REPO}/branches/${branch}/protection`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const body = {
    required_status_checks: {
      strict: config.strict ?? true,
      contexts: config.contexts ?? [],
    },
    enforce_admins: config.enforce_admins ?? true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: config.dismiss_stale_reviews ?? true,
      require_code_owner_reviews: config.require_code_owner_reviews ?? false,
      required_approving_review_count: config.required_approving_review_count ?? 1,
      require_last_push_approval: config.require_last_push_approval ?? false,
    },
    restrictions: null,
    required_linear_history: config.required_linear_history ?? false,
    allow_force_pushes: config.allow_force_pushes ?? false,
    allow_deletions: config.allow_deletions ?? false,
  };

  console.log(`\nSetting protection for branch "${branch}"...`);
  console.log(`  Required reviews: ${body.required_pull_request_reviews.required_approving_review_count}`);
  console.log(`  Status checks: ${body.required_status_checks.contexts.join(", ") || "(none)"}`);
  console.log(`  Enforce admins: ${body.enforce_admins}`);

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    console.log(`  SUCCESS: Branch "${branch}" protection updated`);
  } else {
    const error = await res.json();
    console.error(`  FAILED: ${res.status} ${res.statusText}`);
    console.error(`  ${error.message || JSON.stringify(error)}`);
  }
}

async function main() {
  console.log(`Applying branch protection for ${REPO}...\n`);

  const configPath = join(ROOT, ".github", "branch-protection.yml");
  const branches = parseBranchProtection(configPath);

  for (const [branch, { protection }] of Object.entries(branches)) {
    await applyBranchProtection(branch, protection);
  }

  console.log("\nDone! Verify at:");
  console.log(`  https://github.com/${REPO}/settings/branches`);
}

main().catch(console.error);
