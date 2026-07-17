#!/usr/bin/env node
// URY Dashboard — Admin Setup Script
// Approves pending CI workflow runs and applies branch protection rules.
//
// Usage:
//   GITHUB_TOKEN=<admin-token> node scripts/admin-setup.mjs
//
// Requirements:
//   - GITHUB_TOKEN with admin rights on ury-erp/ury
//   - Node.js 18+ (for built-in fetch)

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = "ury-erp/ury";
const API = `https://api.github.com/repos/${REPO}`;
const HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (!GITHUB_TOKEN) {
  console.error("ERROR: GITHUB_TOKEN environment variable is required");
  console.error("Usage: GITHUB_TOKEN=<admin-token> node scripts/admin-setup.mjs");
  process.exit(1);
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...HEADERS, ...options.headers } });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

// ── Step 1: Approve pending workflow runs ──────────────────
async function approvePendingWorkflows() {
  console.log("\n📋 Step 1: Approving pending workflow runs...\n");

  const { workflow_runs } = await fetchJSON(
    `${API}/actions/runs?status=action_required&per_page=20`
  );

  if (workflow_runs.length === 0) {
    console.log("  No pending workflow runs found.");
    return;
  }

  for (const run of workflow_runs) {
    try {
      await fetch(`${API}/actions/runs/${run.id}/approve`, {
        method: "POST",
        headers: HEADERS,
      });
      console.log(`  ✅ Approved: ${run.name} (#${run.id}, head=${run.head_sha?.slice(0, 8)})`);
    } catch (err) {
      console.error(`  ❌ Failed: ${run.name} (#${run.id}): ${err.message}`);
    }
  }
}

// ── Step 2: Apply branch protection ────────────────────────
async function applyBranchProtection() {
  console.log("\n🛡️  Step 2: Applying branch protection rules...\n");

  const branches = {
    develop: {
      required_status_checks: {
        strict: true,
        contexts: ["Lint & Type Check", "Unit Tests", "Build Verification"],
      },
      enforce_admins: false,
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,
        required_approving_review_count: 1,
      },
      restrictions: null,
      required_linear_history: false,
      allow_force_pushes: false,
      allow_deletions: false,
    },
    v1: {
      required_status_checks: {
        strict: true,
        contexts: ["Lint & Type Check", "Build Verification"],
      },
      enforce_admins: true,
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        required_approving_review_count: 2,
      },
      restrictions: null,
      required_linear_history: true,
      allow_force_pushes: false,
      allow_deletions: false,
    },
  };

  for (const [branch, protection] of Object.entries(branches)) {
    try {
      await fetch(`${API}/branches/${branch}/protection`, {
        method: "PUT",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify(protection),
      });
      console.log(`  ✅ Protected: ${branch}`);
    } catch (err) {
      console.error(`  ❌ Failed: ${branch}: ${err.message}`);
    }
  }

  // Note: main branch protection requires the branch to exist first
  try {
    const mainProtection = {
      required_status_checks: {
        strict: true,
        contexts: ["Lint & Type Check", "Unit Tests", "Build Verification"],
      },
      enforce_admins: true,
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        required_approving_review_count: 2,
        require_last_push_approval: true,
      },
      restrictions: null,
      required_linear_history: true,
      allow_force_pushes: false,
      allow_deletions: false,
    };
    await fetch(`${API}/branches/main/protection`, {
      method: "PUT",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(mainProtection),
    });
    console.log("  ✅ Protected: main");
  } catch (err) {
    console.log(`  ⚠️  main: ${err.message} (branch may not exist yet)`);
  }
}

// ── Step 3: Add required labels ────────────────────────────
async function addRequiredLabels() {
  console.log("\n🏷️  Step 3: Creating required labels...\n");

  const labels = [
    { name: "bug", color: "d73a4a", description: "Something isn't working" },
    { name: "enhancement", color: "a2eeef", description: "New feature or request" },
    { name: "triage", color: "fbca04", description: "Needs initial assessment" },
    { name: "stale", color: "fef2c0", description: "Inactive for an extended period" },
    { name: "security", color: "b60205", description: "Security-related issue" },
    { name: "pinned", color: "bfdadc", description: "Exempt from stale automation" },
    { name: "blocked", color: "e99695", description: "Blocked by external dependency" },
    { name: "ui", color: "0075ca", description: "@ury/ui package changes" },
    { name: "pos", color: "1d76db", description: "POS application changes" },
    { name: "frontend", color: "0e8a16", description: "Frontend dashboard changes" },
    { name: "backend", color: "5319e7", description: "Backend/Frappe changes" },
    { name: "infrastructure", color: "c5def5", description: "CI/Docker/config changes" },
    { name: "storybook", color: "d4c5f9", description: "Storybook changes" },
    { name: "dependencies", color: "0366d6", description: "Dependency updates" },
    { name: "documentation", color: "bfd4f2", description: "Documentation changes" },
    { name: "docker", color: "0052cc", description: "Docker-related changes" },
    { name: "database", color: "006b75", description: "Database/schema changes" },
    { name: "question", color: "d876e3", description: "Further information requested" },
  ];

  for (const label of labels) {
    try {
      await fetch(`${API}/labels`, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify(label),
      });
      console.log(`  ✅ Created: ${label.name}`);
    } catch (err) {
      if (err.message?.includes("422")) {
        console.log(`  ⏭️  Already exists: ${label.name}`);
      } else {
        console.error(`  ❌ Failed: ${label.name}: ${err.message}`);
      }
    }
  }
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   URY Repository Admin Setup Script      ║");
  console.log("╚══════════════════════════════════════════╝");

  try {
    await approvePendingWorkflows();
    await applyBranchProtection();
    await addRequiredLabels();
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    process.exit(1);
  }

  console.log("\n✅ Admin setup complete!");
  console.log("\nNext steps:");
  console.log("  1. Check CI status: https://github.com/ury-erp/ury/actions");
  console.log("  2. Verify branch protection: https://github.com/ury-erp/ury/settings/branches");
  console.log("  3. Review PR #187: https://github.com/ury-erp/ury/pull/187");
}

main();
