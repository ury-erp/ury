"""Department profitability and plan-vs-actual reporting (V3-80).

Read-only reporting/attribution layer composed over accepted V3 sources:

- `URY Sales Plan` (V3-23): approved, frozen demand snapshot -- the ONLY
  source of item -> department / production_policy mapping and of planned
  quantities used by `get_plan_vs_actual`. A live/default BOM or a plan that
  has not reached ``Approved``/``Locked for Production`` is never read as
  authoritative demand.
- `ury.ury.api.ury_cost_variance_attribution` (V3-74): posted/theoretical
  cost attribution for one item/qty/company. This module calls into it
  rather than re-deriving cost, per the prep-doc instruction to compose cost
  figures from V3-74's contract.
- Submitted `POS Invoice` / `POS Invoice Item` rows (ERPNext ledger
  evidence): revenue source, scoped to company/branch/service period and
  ``status in (Consolidated, Paid)`` / ``docstatus = 1`` -- the same
  filtering *shape* as
  `ury/ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.py`, but with
  company added to the scope. Unlike that module, this one NEVER computes
  COGS from a buying price list or from whatever BOM is marked default/
  active today -- see V3-74 above for cost instead.

This module never writes to any ERPNext accounting/stock document. It has
no `frappe.db.set_value`, no `doc.save()`, no `doc.submit()` anywhere in it.
It reads through `frappe.get_all` / `frappe.db.sql` (SELECT only) / plain
scalar `frappe.db.get_value` lookups, and it may call V3-74's read-only
`compute_variance`, which itself may only write a `URY Cost Variance
Snapshot` row when explicitly asked to (this module never passes
``persist=True``).

## Deterministic report grain

    company + branch + service_date_or_period + department +
    item_or_component + production_policy + source_document

## Reason codes (fail-closed, exact strings per the V3-80 prep handoff)

    MISSING_COMPANY, MISSING_BRANCH, MISSING_DEPARTMENT,
    DEPARTMENT_SCOPE_MISMATCH, UNATTRIBUTED_COST, UNATTRIBUTED_REVENUE,
    MISSING_APPROVED_PLAN, MISSING_COST_ATTRIBUTION

## Permission tiers

    Cashier / Captain           -> denied outright (frappe.PermissionError).
    Chef / Production           -> operational quantities only; the
                                    posted_cost/theoretical_cost/
                                    posted_gross_profit/theoretical_gross_profit/
                                    variance keys are OMITTED from every row
                                    dict (not zeroed, not null -- absent).
    Department manager          -> their own department only; requesting a
                                    different department fails closed with
                                    DEPARTMENT_SCOPE_MISMATCH.
    URY Manager                 -> their own branch only; another branch
                                    fails closed (frappe.PermissionError).
    Finance / System Manager    -> full drill-down, all fields, all branches
                                    within the requested company/branch.
"""

import frappe
from frappe import _

from ury.ury.api.ury_cost_variance_attribution import compute_variance


SALES_PLAN_DOCTYPE = "URY Sales Plan"
APPROVED_PLAN_STATES = {"Approved", "Locked for Production"}
POS_INVOICE_STATUSES = ("Consolidated", "Paid")

# Reason codes -- exact strings from the V3-80 prep handoff. Never reworded.
MISSING_COMPANY = "MISSING_COMPANY"
MISSING_BRANCH = "MISSING_BRANCH"
MISSING_DEPARTMENT = "MISSING_DEPARTMENT"
DEPARTMENT_SCOPE_MISMATCH = "DEPARTMENT_SCOPE_MISMATCH"
UNATTRIBUTED_COST = "UNATTRIBUTED_COST"
UNATTRIBUTED_REVENUE = "UNATTRIBUTED_REVENUE"
MISSING_APPROVED_PLAN = "MISSING_APPROVED_PLAN"
MISSING_COST_ATTRIBUTION = "MISSING_COST_ATTRIBUTION"

# Permission tiers.
NO_ACCESS_ROLES = {"Cashier", "URY Cashier", "Captain", "URY Captain"}
QUANTITY_ONLY_ROLES = {"Chef", "URY Chef", "Production", "URY Production"}
DEPARTMENT_MANAGER_ROLES = {"Department Manager", "URY Department Manager"}
BRANCH_MANAGER_ROLES = {"URY Manager"}
FULL_ACCESS_ROLES = {"Finance", "Finance Manager", "URY Finance", "Inventory Manager", "System Manager"}

COST_FIELDS = (
    "posted_cost",
    "theoretical_cost",
    "posted_gross_profit",
    "theoretical_gross_profit",
    "variance",
)


@frappe.whitelist()
def get_department_profitability(company, branch, service_date_or_period, department=None):
    """Department-level posted/theoretical/variance profitability rows.

    Read-only. Composes revenue from submitted POS Invoice lines and cost
    from V3-74's `compute_variance`, both scoped to the deterministic grain.
    Fails closed with a reason code (see module docstring) rather than
    silently aggregating or guessing when required scope/data is missing.
    """
    _require_company_branch(company, branch)
    tier, quantity_only, effective_department = _resolve_access(company, branch, department)

    _require_branch_in_company(company, branch)

    plan_rows = _load_approved_plan_items(company, branch, service_date_or_period, effective_department)
    if not plan_rows:
        return _fail_closed_report(
            company, branch, service_date_or_period, effective_department, MISSING_APPROVED_PLAN
        )

    item_map = _item_department_map(plan_rows)
    invoice_lines = _read_pos_invoice_lines(company, branch, service_date_or_period)

    rows = []
    unattributed_revenue = []
    for line in invoice_lines:
        mapping = item_map.get(line["item_code"])
        if not mapping:
            unattributed_revenue.append(line)
            continue
        if effective_department and mapping["department"] != effective_department:
            continue

        row = {
            "company": company,
            "branch": branch,
            "service_date_or_period": service_date_or_period,
            "department": mapping["department"],
            "item_or_component": line["item_code"],
            "production_policy": mapping.get("production_policy"),
            "source_document": line["parent"],
            "net_revenue": line["net_revenue"],
        }

        try:
            variance = compute_variance(line["item_code"], line["qty"], company)
        except frappe.ValidationError:
            row["reason"] = MISSING_COST_ATTRIBUTION
            row["provisional"] = True
            rows.append(_strip_cost_fields(row) if quantity_only else row)
            continue

        posted_cost = variance["posted_cost"]
        theoretical_cost = variance["theoretical_cost"]
        row.update(
            {
                "posted_cost": posted_cost,
                "theoretical_cost": theoretical_cost,
                "posted_gross_profit": line["net_revenue"] - posted_cost,
                "theoretical_gross_profit": line["net_revenue"] - theoretical_cost,
                "variance": posted_cost - theoretical_cost,
            }
        )
        rows.append(_strip_cost_fields(row) if quantity_only else row)

    result = {
        "company": company,
        "branch": branch,
        "service_date_or_period": service_date_or_period,
        "department": effective_department,
        "rows": rows,
        "as_of": frappe.utils.now(),
    }
    if unattributed_revenue:
        result["unattributed_revenue"] = [
            {
                "item_or_component": line["item_code"],
                "source_document": line["parent"],
                "net_revenue": line["net_revenue"],
                "reason": UNATTRIBUTED_REVENUE,
            }
            for line in unattributed_revenue
        ]
    return result


@frappe.whitelist()
def get_plan_vs_actual(company, branch, service_date_or_period, department=None):
    """Compare V3-23 approved Sales Plan quantities to actual sold quantities.

    Read-only. Fails closed with MISSING_APPROVED_PLAN when no plan for the
    requested grain has reached an approved state.
    """
    _require_company_branch(company, branch)
    _tier, quantity_only, effective_department = _resolve_access(company, branch, department)

    _require_branch_in_company(company, branch)

    plan_rows = _load_approved_plan_items(company, branch, service_date_or_period, effective_department)
    if not plan_rows:
        return _fail_closed_report(
            company, branch, service_date_or_period, effective_department, MISSING_APPROVED_PLAN
        )

    item_map = _item_department_map(plan_rows)
    invoice_lines = _read_pos_invoice_lines(company, branch, service_date_or_period)

    actual_qty_by_item = {}
    for line in invoice_lines:
        actual_qty_by_item[line["item_code"]] = actual_qty_by_item.get(line["item_code"], 0.0) + line["qty"]

    rows = []
    for item_code, mapping in item_map.items():
        if effective_department and mapping["department"] != effective_department:
            continue
        actual_qty = actual_qty_by_item.get(item_code, 0.0)
        planned_qty = mapping["qty"] or 0.0
        row = {
            "company": company,
            "branch": branch,
            "service_date_or_period": service_date_or_period,
            "department": mapping["department"],
            "item_or_component": item_code,
            "production_policy": mapping.get("production_policy"),
            "source_document": mapping.get("plan"),
            "planned_qty": planned_qty,
            "actual_qty": actual_qty,
            "qty_variance": actual_qty - planned_qty,
        }
        rows.append(row)

    return {
        "company": company,
        "branch": branch,
        "service_date_or_period": service_date_or_period,
        "department": effective_department,
        "rows": rows,
        "as_of": frappe.utils.now(),
    }


# --- permission resolution --------------------------------------------------


def _require_company_branch(company, branch):
    if not company:
        frappe.throw(_("Company is required ({0})").format(MISSING_COMPANY), frappe.ValidationError)
    if not branch:
        frappe.throw(_("Branch is required ({0})").format(MISSING_BRANCH), frappe.ValidationError)


def _require_branch_in_company(company, branch):
    branch_company = frappe.db.get_value("Branch", branch, "company")
    if not branch_company or branch_company != company:
        frappe.throw(
            _("Branch {0} does not belong to company {1} ({2})").format(
                branch, company, DEPARTMENT_SCOPE_MISMATCH
            ),
            frappe.ValidationError,
        )


def _resolve_access(company, branch, department):
    """Resolve the caller's tier and effective department scope, fail closed.

    Returns (tier, quantity_only, effective_department). Never returns a
    tier that grants broader access than the caller's role permits; always
    raises rather than silently filtering when the requested scope exceeds
    what the role/assignment allows.
    """
    roles = set(frappe.get_roles(frappe.session.user))
    is_admin = frappe.session.user == "Administrator"

    if roles & FULL_ACCESS_ROLES or is_admin:
        return "full", False, department

    if roles & BRANCH_MANAGER_ROLES:
        assigned_branch = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "branch")
        if not assigned_branch or assigned_branch != branch:
            frappe.throw(
                _("URY Manager may only view profitability for their assigned branch ({0})").format(
                    DEPARTMENT_SCOPE_MISMATCH
                ),
                frappe.PermissionError,
            )
        return "branch_manager", False, department

    if roles & DEPARTMENT_MANAGER_ROLES:
        assigned = frappe.db.get_value(
            "Employee", {"user_id": frappe.session.user}, ["branch", "department"], as_dict=True
        )
        assigned_branch = assigned.get("branch") if assigned else None
        assigned_department = assigned.get("department") if assigned else None
        if not assigned_branch or assigned_branch != branch:
            frappe.throw(
                _(
                    "Department manager may only view profitability for their assigned branch ({0})"
                ).format(DEPARTMENT_SCOPE_MISMATCH),
                frappe.PermissionError,
            )
        if not assigned_department:
            frappe.throw(
                _("No department assigned ({0})").format(MISSING_DEPARTMENT), frappe.ValidationError
            )
        if department and department != assigned_department:
            frappe.throw(
                _("Department {0} does not match your assigned department {1} ({2})").format(
                    department, assigned_department, DEPARTMENT_SCOPE_MISMATCH
                ),
                frappe.ValidationError,
            )
        return "department_manager", False, assigned_department

    if roles & QUANTITY_ONLY_ROLES:
        return "quantity_only", True, department

    if roles & NO_ACCESS_ROLES or not roles:
        frappe.throw(_("Not permitted to access department profitability"), frappe.PermissionError)

    # Unknown/unmapped role: fail closed rather than guess a tier.
    frappe.throw(_("Not permitted to access department profitability"), frappe.PermissionError)


def _strip_cost_fields(row):
    """Return a copy of `row` with every cost/profit key OMITTED (absent).

    Never sets these keys to zero or None -- they are deleted entirely so a
    quantity-only caller cannot infer cost data even from a null/zero value.
    """
    stripped = dict(row)
    for field in COST_FIELDS:
        stripped.pop(field, None)
    return stripped


# --- plan / revenue reads ----------------------------------------------------


def _load_approved_plan_items(company, branch, service_date_or_period, department):
    """Read frozen item rows from every approved Sales Plan for this grain.

    Only plans in `APPROVED_PLAN_STATES` are read, and only their frozen
    `approval_snapshot` items -- never a plan's live/unapproved item table.
    """
    plans = frappe.get_all(
        SALES_PLAN_DOCTYPE,
        filters={
            "company": company,
            "branch": branch,
            "status": ["in", list(APPROVED_PLAN_STATES)],
        },
        fields=["name", "approval_snapshot", "plan_date", "service_period"],
    )

    rows = []
    for plan in plans:
        if not _plan_matches_period(plan, service_date_or_period):
            continue
        snapshot = _load_plan_snapshot(plan)
        for item in snapshot.get("items") or []:
            if department and item.get("department") != department:
                continue
            rows.append({**item, "plan": plan["name"]})
    return rows


def _plan_matches_period(plan, service_date_or_period):
    if plan.get("service_period") and str(plan.get("service_period")) == str(service_date_or_period):
        return True
    if plan.get("plan_date") and str(plan.get("plan_date")) == str(service_date_or_period):
        return True
    return False


def _load_plan_snapshot(plan):
    import json

    raw = plan.get("approval_snapshot")
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return {}


def _item_department_map(plan_rows):
    """item_code -> {department, production_policy, qty, plan} from frozen plan rows.

    When the same item_code appears in more than one plan row (e.g. split
    across production units within the same department), quantities are
    summed and the first-seen department/policy/plan is kept; a genuine
    cross-department duplicate is not silently merged because plan rows are
    already filtered to `department` by the caller when a department scope
    is in effect.
    """
    item_map = {}
    for row in plan_rows:
        item_code = row.get("item_code")
        if not item_code:
            continue
        existing = item_map.get(item_code)
        if existing:
            existing["qty"] = (existing.get("qty") or 0) + (row.get("qty") or 0)
            continue
        item_map[item_code] = {
            "department": row.get("department"),
            "production_policy": row.get("production_policy"),
            "qty": row.get("qty") or 0,
            "plan": row.get("plan"),
        }
    return item_map


def _read_pos_invoice_lines(company, branch, service_date_or_period):
    """Submitted POS Invoice Item rows scoped to company/branch/service date.

    Mirrors `ury_daily_p_and_l.py`'s POS Invoice filter shape (status in
    Consolidated/Paid, docstatus = 1, branch/date scoping) with company
    added to the scope. Does NOT compute COGS here -- see V3-74 for cost.
    """
    rows = frappe.db.sql(
        """
        SELECT
            b.item_code AS item_code,
            SUM(b.qty) AS qty,
            SUM(b.net_amount) AS net_revenue,
            a.name AS parent
        FROM `tabPOS Invoice` a
        INNER JOIN `tabPOS Invoice Item` b ON a.name = b.parent
        WHERE
            a.company = %(company)s
            AND a.branch = %(branch)s
            AND a.status IN %(statuses)s
            AND a.docstatus = 1
            AND a.posting_date = %(service_date_or_period)s
        GROUP BY b.item_code, a.name
        """,
        {
            "company": company,
            "branch": branch,
            "statuses": POS_INVOICE_STATUSES,
            "service_date_or_period": service_date_or_period,
        },
        as_dict=True,
    )
    return rows


def _fail_closed_report(company, branch, service_date_or_period, department, reason):
    return {
        "company": company,
        "branch": branch,
        "service_date_or_period": service_date_or_period,
        "department": department,
        "rows": [],
        "reason": reason,
        "provisional": True,
        "as_of": frappe.utils.now(),
    }
