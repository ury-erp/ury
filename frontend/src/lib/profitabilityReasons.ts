/**
 * Human-readable labels for the reason codes
 * `ury.ury.api.ury_department_profitability` returns (exact strings from
 * the V3-80 prep handoff -- see that module's docstring). The backend never
 * reword these codes, so the raw string (e.g. "UNATTRIBUTED_COST") was
 * rendered verbatim in the UI. This is a display-only translation: it never
 * changes what the backend returns or how the frontend branches on it, so
 * an unrecognized code still falls back to showing the raw string rather
 * than hiding it.
 */
export const PROFITABILITY_REASON_LABELS: Record<string, string> = {
  MISSING_COMPANY: 'No company resolved for this branch.',
  MISSING_BRANCH: 'Select a branch to see department profitability.',
  MISSING_DEPARTMENT: 'Select a department.',
  DEPARTMENT_SCOPE_MISMATCH: 'You can only view your own department.',
  MISSING_APPROVED_PLAN: 'No approved Sales Plan found for this branch and date.',
  MISSING_COST_ATTRIBUTION: 'Cost could not be attributed for these items.',
  UNATTRIBUTED_REVENUE: 'Some revenue could not be matched to a department on the approved Sales Plan.',
  // The one every row currently carries: V3-74's compute_variance returns
  // posted_cost=None until a fulfilment Stock Entry is posted to ERPNext, so
  // every row is theoretical-only until the Store Issue/Wastage posting
  // chain actually writes stock movements.
  UNATTRIBUTED_COST: 'Theoretical cost only — no stock has been posted to ERPNext for this item yet.',
};

/** Human-readable label for a reason code, falling back to the raw code for
 * anything not in the map above rather than showing nothing. */
export const describeProfitabilityReason = (reason?: string | null): string => {
  if (!reason) return '';
  return PROFITABILITY_REASON_LABELS[reason] ?? reason;
};
