import { reactive, watch } from "vue";
import { FrappeApp } from "frappe-js-sdk";

export const productionScopeKey = Symbol("productionScope");

export function createProductionScope() {
  const db = new FrappeApp(window.location.origin).db();
  const companyKey = "ury_active_company_id";
  const branchKey = "ury_active_branch_id";
  const scope = reactive({
    company: readTabScoped(companyKey),
    branch: readTabScoped(branchKey),
    companies: [],
    branches: [],
    ready: false,
    loading: true,
    error: "",
  });
  let branchRequest = 0;

  async function loadBranches() {
    const request = ++branchRequest;
    scope.ready = false;
    scope.loading = true;
    scope.error = "";
    scope.branches = [];
    try {
      const branches = await db.getDocList("Branch", {
        fields: ["name", "branch"],
        filters: scope.company === "all" ? [] : [["company", "=", scope.company]],
        orderBy: { field: "name", order: "asc" },
        limit: 0,
      });
      if (request !== branchRequest) return;
      scope.branches = branches;
      scope.branch = resolveSelection(branches, scope.branch);
      writeTabScoped(branchKey, scope.branch);
      scope.ready = true;
    } catch {
      if (request === branchRequest) scope.error = "Unable to load branches. Please reload to retry.";
    } finally {
      if (request === branchRequest) scope.loading = false;
    }
  }

  async function initialize() {
    try {
      scope.companies = await db.getDocList("Company", {
        fields: ["name", "company_name"],
        filters: [["is_group", "=", 0]],
        orderBy: { field: "name", order: "asc" },
        limit: 0,
      });
      scope.company = resolveSelection(scope.companies, scope.company);
      writeTabScoped(companyKey, scope.company);
      await loadBranches();
    } catch {
      scope.error = "Unable to load companies. Please reload to retry.";
      scope.loading = false;
    }
    watch(() => scope.company, () => {
      writeTabScoped(companyKey, scope.company);
      loadBranches();
    }, { flush: "sync" });
    watch(() => scope.branch, (branch) => writeTabScoped(branchKey, branch));
  }

  return { scope, initialize };
}

function resolveSelection(records, selected) {
  if (records.some((record) => record.name === selected)) return selected;
  if (selected === "all" && records.length > 1) return "all";
  return records[0]?.name || "all";
}

// Match the dashboard's per-tab selection and shared default for new tabs.
function readTabScoped(key) {
  for (const storage of ["sessionStorage", "localStorage"]) {
    try {
      const value = window[storage].getItem(key);
      if (value) return value;
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }
  return "";
}

function writeTabScoped(key, value) {
  for (const storage of ["sessionStorage", "localStorage"]) {
    try {
      window[storage].setItem(key, value);
    } catch {
      // Keep the selection in memory when storage is unavailable.
    }
  }
}
