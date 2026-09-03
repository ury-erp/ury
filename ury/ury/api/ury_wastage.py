"""Wastage capture, approval, and valuation-hook module for one Issue Authorization.

Depends only on V3-31 (`ury.ury.api.ury_issue_authorization`). This module
never creates a Stock Entry, mutates a warehouse quantity, or touches
ERPNext ledger/stock/costing APIs — it only records an audited, explicitly
approved wastage amount that V3-31's `prior_quantities()` can later read.

Doctype/field contract this module MUST honor (do not change without also
changing V3-31, which is out of scope for this task):

    ury/ury/api/ury_issue_authorization.py::prior_quantities() builds:
        filters = {
            "plan": plan, "department": department, "branch": branch,
            "company": company, "component_item": component_item,
            "status": "Authorized",
        }
        wasted_qty = _sum_live_if_exists("URY Issue Wastage", dict(filters), "wasted_qty")

    So V3-31 only counts a "URY Issue Wastage" row toward `wasted_qty` when
    that row's `status` field is literally the string "Authorized" and it
    carries matching plan/department/branch/company/component_item fields
    plus a `wasted_qty` field. Everything else (issue_authorization link,
    reason, valuation, audit log, capture/approval actor fields) is free.

No hidden/automatic adjustment: a wastage row is created with status
"Draft" and does NOT reduce entitlement (V3-31 only sums status="Authorized"
rows). It only starts counting once `approve_wastage()` is explicitly
called by a distinct authorized role and flips status to "Authorized".
"""

import json

import frappe
from frappe import _

from ury.ury.api.ury_issue_authorization import ISSUE_AUTH_DOCTYPE


WASTAGE_DOCTYPE = "URY Issue Wastage"

# Roles permitted to capture (create) a wastage record.
CAPTURE_ROLES = {"System Manager", "Production Manager"}

# Roles permitted to approve/reject a captured wastage record. Kept distinct
# from CAPTURE_ROLES (except the System Manager escape hatch) so approval is
# never rubber-stamped by the same actor class that captured it.
APPROVE_ROLES = {"System Manager", "Stock Manager"}

REASON_CATEGORIES = {"Spoilage", "Preparation Error", "Dropped/Damaged", "Expired", "Other"}


@frappe.whitelist()
def capture_wastage(
    issue_authorization,
    wasted_qty,
    reason_category,
    reason_notes=None,
    branch=None,
    company=None,
    actor=None,
):
    """Create a Draft wastage record against one Issue Authorization.

    Draft rows never reduce entitlement (see module docstring) — this is
    the explicit, recorded "capture" step, not an approval.

    Fails closed on: missing/ambiguous permission, non-Authorized issue
    authorization, branch/company mismatch, invalid reason category, and a
    quantity that would exceed the authorization's currently-held amount
    (authorized_qty - already-approved-wasted - already-approved-returned).
    """
    actor = actor or frappe.session.user
    _require_role(actor, CAPTURE_ROLES, "capture wastage")
    if not frappe.has_permission(WASTAGE_DOCTYPE, "create", user=actor):
        frappe.throw(_("Not permitted to create Issue Wastage"), frappe.PermissionError)

    if wasted_qty is None or wasted_qty <= 0:
        frappe.throw(_("Wasted quantity must be greater than zero"), frappe.ValidationError)

    if reason_category not in REASON_CATEGORIES:
        frappe.throw(_("Unknown wastage reason category"), frappe.ValidationError)

    auth_doc = frappe.get_doc(ISSUE_AUTH_DOCTYPE, issue_authorization)
    _validate_authorization_scope(auth_doc, branch, company)

    held_qty = held_quantity(auth_doc)
    if wasted_qty > held_qty:
        frappe.throw(
            _("Wasted quantity {0} exceeds currently-held quantity {1} for {2}").format(
                wasted_qty, held_qty, auth_doc.get("component_item")
            ),
            frappe.ValidationError,
        )

    doc = frappe.get_doc(
        {
            "doctype": WASTAGE_DOCTYPE,
            "issue_authorization": auth_doc.get("name"),
            "plan": auth_doc.get("plan"),
            "branch": auth_doc.get("branch"),
            "company": auth_doc.get("company"),
            "department": auth_doc.get("department"),
            "production_unit": auth_doc.get("production_unit"),
            "component_item": auth_doc.get("component_item"),
            "stock_uom": auth_doc.get("stock_uom"),
            "status": "Draft",
            "held_qty_before": held_qty,
            "wasted_qty": wasted_qty,
            "reason_category": reason_category,
            "reason_notes": reason_notes,
            "captured_by": actor,
            "captured_on": frappe.utils.now(),
        }
    )
    append_audit(doc, "captured", actor, {"held_qty_before": held_qty, "wasted_qty": wasted_qty})
    doc.insert(ignore_permissions=False)
    return doc


@frappe.whitelist()
def approve_wastage(wastage, actor=None):
    """Explicitly approve a Draft wastage record so it starts counting.

    Only after this call does the record's `status` become "Authorized",
    the value V3-31's `prior_quantities()` filters on. Re-validates the
    held-quantity bound at approval time (defense in depth against
    concurrent captures) and computes the valuation-hook stub.
    """
    return _resolve_wastage(wastage, actor, approve=True)


@frappe.whitelist()
def reject_wastage(wastage, actor=None):
    """Explicitly reject a Draft wastage record. Never counts toward wasted_qty."""
    return _resolve_wastage(wastage, actor, approve=False)


def _resolve_wastage(wastage, actor, approve):
    actor = actor or frappe.session.user
    _require_role(actor, APPROVE_ROLES, "approve/reject wastage")
    if not frappe.has_permission(WASTAGE_DOCTYPE, "write", user=actor):
        frappe.throw(_("Not permitted to approve/reject Issue Wastage"), frappe.PermissionError)

    doc = frappe.get_doc(WASTAGE_DOCTYPE, wastage)
    if doc.get("status") != "Draft":
        frappe.throw(_("Only Draft wastage records can be approved or rejected"), frappe.ValidationError)

    if approve:
        auth_doc = frappe.get_doc(ISSUE_AUTH_DOCTYPE, doc.get("issue_authorization"))
        held_qty = held_quantity(auth_doc, exclude_wastage=doc.get("name"))
        if doc.get("wasted_qty") > held_qty:
            frappe.throw(
                _("Wasted quantity {0} exceeds currently-held quantity {1} for {2} (re-validated at approval)").format(
                    doc.get("wasted_qty"), held_qty, auth_doc.get("component_item")
                ),
                frappe.ValidationError,
            )
        compute_wastage_valuation(doc)
        doc.status = "Authorized"
    else:
        doc.status = "Rejected"

    permission_basis = ",".join(sorted(_actor_roles(actor) & APPROVE_ROLES))
    doc.approved_by = actor
    doc.approved_on = frappe.utils.now()
    doc.approval_permission_basis = permission_basis
    append_audit(
        doc,
        "approved" if approve else "rejected",
        actor,
        {"wasted_qty": doc.get("wasted_qty"), "permission_basis": permission_basis},
    )
    doc.save(ignore_permissions=False)
    return doc


def compute_wastage_valuation(wastage_doc, valuation_rate=None):
    """Valuation hook (stub): attribute a cost to approved wastage.

    FUTURE WORK: real ERPNext valuation-rate sourcing (item bin valuation
    rate, moving-average/FIFO layers, warehouse-specific rate, etc.) is NOT
    implemented here — this module never calls any ERPNext costing/ledger
    API. For now this simply computes `qty * valuation_rate`, where
    `valuation_rate` is either the argument passed in, or a
    `valuation_rate` value already present on the doc (e.g. set by a
    caller who already looked it up), defaulting to 0 if neither is
    available. `valuation_is_estimated` stays 1 to flag that this number is
    not sourced from a real valuation ledger yet.
    """
    rate = valuation_rate if valuation_rate is not None else (wastage_doc.get("valuation_rate") or 0)
    qty = wastage_doc.get("wasted_qty") or 0
    wastage_doc.valuation_rate = rate
    wastage_doc.valuation_amount = qty * rate
    wastage_doc.valuation_is_estimated = 1
    return wastage_doc.valuation_amount


def held_quantity(auth_doc, exclude_wastage=None):
    """Currently-held qty = authorized_qty - approved wastage - approved returns.

    Only status="Authorized" rows count (mirrors V3-31's prior_quantities
    live-aggregation pattern); Draft/Rejected wastage never reduces this.
    """
    authorized_qty = auth_doc.get("authorized_qty") or 0
    already_wasted = _sum_authorized(
        WASTAGE_DOCTYPE,
        {"issue_authorization": auth_doc.get("name"), "status": "Authorized"},
        "wasted_qty",
        exclude_name=exclude_wastage,
    )
    already_returned = _sum_live_if_exists(
        "URY Issue Return",
        {"issue_authorization": auth_doc.get("name"), "status": "Authorized"},
        "returned_qty",
    )
    return max(authorized_qty - already_wasted - already_returned, 0)


def _sum_authorized(doctype, filters, fieldname, exclude_name=None):
    rows = frappe.get_all(doctype, filters=filters, fields=["name", fieldname])
    total = 0
    for row in rows:
        name = row.get("name") if isinstance(row, dict) else row["name"]
        if exclude_name and name == exclude_name:
            continue
        value = row.get(fieldname) if isinstance(row, dict) else row[fieldname]
        total += value or 0
    return total


def _sum_live_if_exists(doctype, filters, fieldname):
    if not frappe.db.exists("DocType", doctype):
        return 0
    rows = frappe.get_all(doctype, filters=filters, pluck=fieldname)
    return sum(row or 0 for row in rows)


def _validate_authorization_scope(auth_doc, branch, company):
    if auth_doc.get("status") != "Authorized":
        frappe.throw(_("Issue Authorization is not in Authorized status"), frappe.ValidationError)
    auth_branch = auth_doc.get("branch")
    auth_company = auth_doc.get("company")
    if not auth_branch or not auth_company:
        frappe.throw(_("Issue Authorization branch and company are required"), frappe.ValidationError)
    if branch and branch != auth_branch:
        frappe.throw(_("Wastage branch does not match Issue Authorization branch"), frappe.ValidationError)
    if company and company != auth_company:
        frappe.throw(_("Wastage company does not match Issue Authorization company"), frappe.ValidationError)
    branch_company = frappe.db.get_value("Branch", auth_branch, "company")
    if not branch_company or branch_company != auth_company:
        frappe.throw(_("Issue Authorization branch and company do not match"), frappe.ValidationError)


def _actor_roles(actor):
    return set(frappe.get_roles(actor) or [])


def _require_role(actor, allowed_roles, action_label):
    roles = _actor_roles(actor)
    if not roles or not (roles & allowed_roles):
        frappe.throw(
            _("Not permitted to {0}: requires one of {1}").format(action_label, ", ".join(sorted(allowed_roles))),
            frappe.PermissionError,
        )


def append_audit(doc, event, actor, details):
    existing = doc.get("audit_log")
    entries = json.loads(existing) if existing else []
    entry = {
        "event": event,
        "actor": actor,
        "timestamp": frappe.utils.now(),
        "issue_authorization": doc.get("issue_authorization"),
        "plan": doc.get("plan"),
        "branch": doc.get("branch"),
        "company": doc.get("company"),
        "department": doc.get("department"),
        "component_item": doc.get("component_item"),
    }
    entry.update(details or {})
    entries.append(entry)
    doc.audit_log = json.dumps(entries, sort_keys=True, default=str)


@frappe.whitelist()
def list_wastage(branch, department=None, company=None, from_date=None, to_date=None):
    """Read-only list of URY Issue Wastage records scoped by branch.

    Fails closed if branch is missing/blank. Pure frappe.get_all read; never
    creates or approves any wastage record.
    """
    if not branch:
        frappe.throw(_("Branch is required"), frappe.ValidationError)
    if not frappe.has_permission(WASTAGE_DOCTYPE, "read"):
        frappe.throw(_("Not permitted to read Issue Wastage"), frappe.PermissionError)

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
        WASTAGE_DOCTYPE,
        filters=filters,
        fields=[
            "name",
            "component_item",
            "wasted_qty",
            "status",
            "reason_category",
            "reason_notes",
            "captured_by",
            "captured_on",
            "approved_by",
            "approved_on",
            "department",
            "branch",
            "company",
            "valuation_rate",
            "valuation_amount",
        ],
        order_by="creation desc",
    )
