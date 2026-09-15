"""Issue Authorization creation against an approved Sales Plan's frozen demand.

Consumes the V3-20/V3-23 Sales Plan approval snapshot and the V3-30 exact-BOM
material demand and issue policy contract. This module never creates a Stock
Entry, mutates a warehouse quantity, or touches ERPNext ledger/stock APIs —
it only authorizes an amount and records an audited data record.

Design note (V3-30 contract gap): V3-30 states the demand vector is "computed
once from the BOM snapshot frozen by V3-23 approval". The V3-23 implementation
this task builds on only freezes item/qty/department/production_unit/policy/
bom/bom_revision, not a component-level exploded demand vector. Rather than
perform BOM explosion here (out of this task's scope — that belongs to the
frozen-demand computation step implied by V3-30, not V3-31's issue/authorize
step), this module expects the plan's `approval_snapshot` JSON to carry a
`demand_vector` list of per-component rows shaped per the V3-30 contract
(component_item, department, production_unit, required_qty, stock_uom,
control_mode, ...). If that key is absent or does not contain the requested
component/department, authorization fails closed with a ValidationError. Once
a task upstream of V3-31 materializes that key at approval time, no change to
this module is required.
"""

import json

import frappe
from frappe import _

from ury.ury.report_api.utils import user_has_branch_access


ISSUE_AUTH_DOCTYPE = "URY Issue Authorization"
SALES_PLAN_DOCTYPE = "URY Sales Plan"
WASTAGE_DOCTYPE = "URY Issue Wastage"
APPROVED_STATES = {"Approved", "Locked for Production"}

# `URY Issue Wastage.source_type` discriminator values. Only rows sourced from
# an Issue Authorization may ever decrement issue entitlement; rows written by
# the POS KOT-cancellation write-off route are an accounting record about a
# cancelled sale and have nothing to do with a Sales Plan's material budget.
SOURCE_ISSUE_AUTHORIZATION = "Issue Authorization"
SOURCE_KOT_CANCELLATION = "KOT Cancellation"


@frappe.whitelist()
def create_issue_authorization(
    plan,
    department,
    component_item,
    requested_qty,
    branch=None,
    company=None,
    production_unit=None,
    actor=None,
):
    """Authorize `requested_qty` of `component_item` for one department on one approved plan.

    Fails closed on: unapproved/unsnapshotted plan, branch/company mismatch,
    missing frozen demand for the component, missing permission, and any
    request that would push authorized+returned-wasted above the component's
    frozen required_qty (exact-demand enforcement).
    """
    actor = actor or frappe.session.user
    if not frappe.has_permission(ISSUE_AUTH_DOCTYPE, "create"):
        frappe.throw(_("Not permitted to create Issue Authorization"), frappe.PermissionError)

    if requested_qty is None or requested_qty <= 0:
        frappe.throw(_("Requested quantity must be greater than zero"), frappe.ValidationError)

    plan_doc = frappe.get_doc(SALES_PLAN_DOCTYPE, plan)
    _validate_plan_approved(plan_doc)
    resolved_branch = branch or plan_doc.get("branch")
    resolved_company = company or plan_doc.get("company")
    _validate_scope(plan_doc, resolved_branch, resolved_company, department)

    demand = frozen_component_demand(plan_doc, department, production_unit, component_item)
    prior = prior_quantities(plan, department, resolved_branch, resolved_company, component_item)

    remaining_before = remaining_entitlement(
        demand["required_qty"], prior["authorized_qty"], prior["returned_qty"], prior["wasted_qty"]
    )

    if requested_qty > remaining_before:
        frappe.throw(
            _("Requested quantity {0} exceeds remaining entitlement {1} for {2}").format(
                requested_qty, remaining_before, component_item
            ),
            frappe.ValidationError,
        )

    remaining_after = remaining_before - requested_qty

    doc = frappe.get_doc(
        {
            "doctype": ISSUE_AUTH_DOCTYPE,
            "plan": plan,
            "plan_approval_hash": plan_doc.get("approval_snapshot_hash"),
            "branch": resolved_branch,
            "company": resolved_company,
            "department": department,
            "production_unit": production_unit,
            "component_item": component_item,
            "stock_uom": demand.get("stock_uom"),
            "control_mode": demand.get("control_mode"),
            "status": "Authorized",
            "required_qty": demand["required_qty"],
            "prior_authorized_qty": prior["authorized_qty"],
            "prior_returned_qty": prior["returned_qty"],
            "prior_wasted_qty": prior["wasted_qty"],
            "remaining_before_qty": remaining_before,
            "authorized_qty": requested_qty,
            "remaining_after_qty": remaining_after,
            "actor": actor,
        }
    )
    append_audit(doc, actor, requested_qty, remaining_before, remaining_after)
    doc.insert(ignore_permissions=False)
    return doc


def _validate_plan_approved(plan_doc):
    status = plan_doc.get("status")
    if status not in APPROVED_STATES:
        frappe.throw(
            _("Sales Plan {0} is not approved").format(plan_doc.get("name") or plan_doc.get("plan")),
            frappe.ValidationError,
        )
    if not plan_doc.get("approval_snapshot") or not plan_doc.get("approval_snapshot_hash"):
        frappe.throw(_("Sales Plan has no frozen approval snapshot"), frappe.ValidationError)


def _validate_scope(plan_doc, branch, company, department):
    plan_branch = plan_doc.get("branch")
    plan_company = plan_doc.get("company")
    if not plan_branch or not plan_company:
        frappe.throw(_("Sales Plan branch and company are required"), frappe.ValidationError)
    if branch != plan_branch:
        frappe.throw(_("Issue Authorization branch does not match Sales Plan branch"), frappe.ValidationError)
    if company != plan_company:
        frappe.throw(_("Issue Authorization company does not match Sales Plan company"), frappe.ValidationError)
    branch_company = frappe.db.get_value("Branch", plan_branch, "company")
    if not branch_company or branch_company != plan_company:
        frappe.throw(_("Sales Plan branch and company do not match"), frappe.ValidationError)
    if not department:
        frappe.throw(_("Department is required"), frappe.ValidationError)
    if not user_has_branch_access(frappe.session.user, branch):
        frappe.throw(
            _("You are not assigned to branch {0}").format(branch),
            frappe.PermissionError,
        )


def frozen_component_demand(plan_doc, department, production_unit, component_item):
    """Read required_qty for one component from the plan's frozen demand vector.

    Never recomputes against a live BOM; only reads what was frozen at
    approval time inside `approval_snapshot`.
    """
    snapshot = load_snapshot(plan_doc)
    vector = snapshot.get("demand_vector") or []
    for row in vector:
        if row.get("component_item") != component_item:
            continue
        if row.get("department") != department:
            continue
        if production_unit and row.get("production_unit") and row.get("production_unit") != production_unit:
            continue
        return row
    frappe.throw(
        _("No frozen demand found for component {0} in department {1} on this plan").format(
            component_item, department
        ),
        frappe.ValidationError,
    )


def load_snapshot(plan_doc):
    raw = plan_doc.get("approval_snapshot")
    if not raw:
        frappe.throw(_("Sales Plan has no frozen approval snapshot"), frappe.ValidationError)
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        frappe.throw(_("Sales Plan approval snapshot is not valid JSON"), frappe.ValidationError)


def prior_quantities(plan, department, branch, company, component_item):
    """Live aggregation of prior authorized/returned/wasted qty for this scope.

    Queried fresh from actual documents at authorization time, never from a
    cached running total on the demand vector, per the V3-30 contract.
    """
    filters = {
        "plan": plan,
        "department": department,
        "branch": branch,
        "company": company,
        "component_item": component_item,
        "status": "Authorized",
    }
    authorized_qty = _sum_live(ISSUE_AUTH_DOCTYPE, filters, "authorized_qty")
    # V3-32 (return) and V3-33 (wastage) doctypes are later tasks. Query them
    # live if present so this module needs no change once they land; treat
    # their absence today as zero, never as a cached/stale value.
    returned_qty = _sum_live_if_exists("URY Issue Return", dict(filters), "returned_qty")
    wasted_qty = sum_issue_sourced_wastage(dict(filters), "wasted_qty")
    return {"authorized_qty": authorized_qty, "returned_qty": returned_qty, "wasted_qty": wasted_qty}


def wastage_tracks_source_type():
    """True when `URY Issue Wastage` actually has the `source_type` column.

    The column is added by the KOT-cancellation write-off work; a bench that
    has the doctype but has not migrated yet will not have it. Probing instead
    of assuming keeps `frappe.get_all(fields=[... "source_type"])` from raising
    a bare SQL error on an un-migrated site.
    """
    try:
        return bool(frappe.db.has_column(WASTAGE_DOCTYPE, "source_type"))
    except Exception:
        return False


def sum_issue_sourced_wastage(filters, fieldname="wasted_qty", exclude_name=None):
    """Sum `URY Issue Wastage.<fieldname>` over ISSUE-AUTHORIZATION-sourced rows only.

    CRITICAL INVARIANT (highest-risk regression in the wastage generalisation):
    `URY Issue Wastage` is shared by two unrelated jobs since the KOT
    cancellation write-off route landed:

      1. `source_type = "Issue Authorization"` -- a department issue against a
         Sales Plan. These rows DO decrement issue entitlement and must keep
         counting here exactly as they always have.
      2. `source_type = "KOT Cancellation"` -- a write-off of food already
         cooked for a cancelled POS order. These rows carry no `plan`, no
         `issue_authorization` and often no `department`. They must NEVER
         decrement issue entitlement: doing so would silently shrink a
         department's material budget every time a customer cancelled a dish.

    The discrimination is deliberately done in PYTHON rather than as a SQL
    filter, and that is not an oversight:

      * A SQL `source_type = "Issue Authorization"` condition would DROP every
        pre-existing row on a bench where the new column was added but the
        backfill patch has not run yet (the column is NULL there, and
        `NULL = 'Issue Authorization'` is NULL, i.e. false). That would make
        real, approved wastage stop decrementing entitlement -- the exact
        regression this guard exists to prevent, in the opposite direction.
      * A SQL `source_type != "KOT Cancellation"` condition is equally
        NULL-unsafe unless Frappe happens to wrap it in `ifnull(...)`, which
        varies by Frappe version and query backend.

    Treating a missing/blank `source_type` as "Issue Authorization" (the
    doctype default, and what every legacy row semantically is) is correct
    under BOTH a migrated and an un-migrated schema, with no dependency on
    SQL NULL semantics or on `ury.patches.v3_21` having run.

    `ury.patches.v3_21.backfill_issue_wastage_source_type` still backfills the
    column so Desk list views and reports see a populated discriminator; this
    function does not depend on it.
    """
    if not frappe.db.exists("DocType", WASTAGE_DOCTYPE):
        return 0

    fields = ["name", fieldname]
    track_source = wastage_tracks_source_type()
    if track_source:
        fields.append("source_type")

    rows = frappe.get_all(WASTAGE_DOCTYPE, filters=filters, fields=fields) or []
    total = 0
    for row in rows:
        name = row.get("name")
        if exclude_name and name == exclude_name:
            continue
        source_type = (row.get("source_type") if track_source else None) or SOURCE_ISSUE_AUTHORIZATION
        if source_type == SOURCE_KOT_CANCELLATION:
            continue
        total += row.get(fieldname) or 0
    return total


def _sum_live(doctype, filters, fieldname):
    rows = frappe.get_all(doctype, filters=filters, pluck=fieldname)
    return sum(row or 0 for row in rows)


def _sum_live_if_exists(doctype, filters, fieldname):
    if not frappe.db.exists("DocType", doctype):
        return 0
    return _sum_live(doctype, filters, fieldname)


def remaining_entitlement(required_qty, authorized_qty, returned_qty, wasted_qty):
    """`max(required_qty - authorized_qty + returned_qty - wasted_qty, 0)` per V3-30."""
    return max((required_qty or 0) - (authorized_qty or 0) + (returned_qty or 0) - (wasted_qty or 0), 0)


def append_audit(doc, actor, requested_qty, remaining_before, remaining_after):
    existing = doc.get("audit_log")
    entries = json.loads(existing) if existing else []
    entries.append(
        {
            "actor": actor,
            "timestamp": frappe.utils.now(),
            "plan": doc.get("plan"),
            "branch": doc.get("branch"),
            "company": doc.get("company"),
            "department": doc.get("department"),
            "component_item": doc.get("component_item"),
            "authorized_qty": requested_qty,
            "remaining_before_qty": remaining_before,
            "remaining_after_qty": remaining_after,
        }
    )
    doc.audit_log = json.dumps(entries, sort_keys=True, default=str)


@frappe.whitelist()
def list_issue_authorizations(branch, department=None, company=None, from_date=None, to_date=None):
    """Read-only list of URY Issue Authorization records scoped by branch.

    Fails closed if branch is missing/blank. Never creates, mutates, or
    approves any record — pure frappe.get_all read.
    """
    if not branch:
        frappe.throw(_("Branch is required"), frappe.ValidationError)
    if not frappe.has_permission(ISSUE_AUTH_DOCTYPE, "read"):
        frappe.throw(_("Not permitted to read Issue Authorization"), frappe.PermissionError)

    filters = {"branch": branch}
    if department:
        filters["department"] = department
    if company:
        filters["company"] = company
    if from_date and to_date:
        filters["creation"] = ["between", [from_date, to_date]]
    elif from_date:
        filters["creation"] = [">=", from_date]
    elif to_date:
        filters["creation"] = ["<=", to_date]

    return frappe.get_all(
        ISSUE_AUTH_DOCTYPE,
        filters=filters,
        fields=[
            "name",
            "plan",
            "component_item",
            "department",
            "authorized_qty",
            "required_qty",
            "remaining_after_qty",
            "status",
            "branch",
            "company",
            "production_unit",
            "stock_uom",
            "creation",
        ],
        order_by="creation desc",
    )
