"""Wastage capture, approval, and valuation-hook module for one Issue Authorization.

Depends only on V3-31 (`ury.ury.api.ury_issue_authorization`). This module
never creates a Stock Entry, mutates a warehouse quantity, or writes to any
ERPNext ledger/stock/costing API — it only records an audited, explicitly
approved wastage amount that V3-31's `prior_quantities()` can later read.
Valuation is a read-only lookup of ERPNext's own maintained ``BOM.total_cost``
(see `_resolve_bom_valuation_rate`); it posts nothing.

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
from frappe.utils import flt

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
    _validate_no_duplicate_yield_check(auth_doc)

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
    # Valued at capture too so a Draft row displays its estimated BOM-based
    # rate instead of 0. Approval re-resolves the rate anyway (see
    # _resolve_wastage), so the Authorized record is always valued as of the
    # approval moment, not the capture moment.
    compute_wastage_valuation(
        doc,
        valuation_rate=_resolve_bom_valuation_rate(auth_doc.get("component_item"), auth_doc.get("company")),
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
        # Frozen at approval: the BOM-based rate is re-resolved here (not
        # reused from capture time) so an approved record carries the cost
        # as of the approval moment, matching this doctype's audit philosophy.
        compute_wastage_valuation(
            doc,
            valuation_rate=_resolve_bom_valuation_rate(doc.get("component_item"), doc.get("company")),
        )
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
    """Valuation hook: attribute a cost to approved wastage.

    ``valuation_rate`` is either the argument passed in — approval passes
    the BOM-based rate from :func:`_resolve_bom_valuation_rate` — or a
    ``valuation_rate`` value already present on the doc, defaulting to 0 if
    neither is available. Simply computes ``qty * valuation_rate``.
    ``valuation_is_estimated`` stays 1 to flag that this number is BOM
    standard cost, not a rate sourced from live stock valuation layers.
    """
    rate = valuation_rate if valuation_rate is not None else (wastage_doc.get("valuation_rate") or 0)
    qty = wastage_doc.get("wasted_qty") or 0
    wastage_doc.valuation_rate = rate
    wastage_doc.valuation_amount = qty * rate
    wastage_doc.valuation_is_estimated = 1
    return wastage_doc.valuation_amount


def _resolve_bom_valuation_rate(component_item, company):
    """Per-unit BOM total cost for ``component_item``, or ``None``.

    Business rule: an item's wastage is valued at its BOM total cost. The
    source is ERPNext's own ``BOM.total_cost`` — the stored field ERPNext
    maintains via ``BOM.calculate_cost()`` — NOT a hand-rolled costing
    algorithm. Selection precedence mirrors ``ury.services.bom_cost_resolver``:
    the submitted, active, company-matching BOM marked ``is_default`` first,
    falling back to any other submitted active BOM for the item. ``None``
    (not 0) is returned when no such BOM exists, so "no BOM" stays
    distinguishable from a genuinely zero-cost BOM.
    """
    if not component_item:
        return None
    base_filters = {"item": component_item, "docstatus": 1, "is_active": 1}
    if company:
        base_filters["company"] = company

    bom = frappe.db.get_value(
        "BOM",
        dict(base_filters, is_default=1),
        ["total_cost", "quantity"],
        as_dict=True,
    )
    if not bom:
        bom = frappe.db.get_value(
            "BOM",
            base_filters,
            ["total_cost", "quantity"],
            as_dict=True,
        )
    if not bom:
        return None

    # total_cost covers the whole BOM batch; the valuation rate is per unit
    # of the item, so normalize by the BOM quantity.
    quantity = flt(bom.get("quantity")) or 1
    return flt(bom.get("total_cost")) / quantity


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


def _validate_no_duplicate_yield_check(auth_doc):
    """Mirror of `URYYieldCheck.validate_no_duplicate_wastage`.

    That guard blocks logging a Yield Check once an Issue Wastage already
    exists for the same authorization, but was one-directional — it never
    blocked the reverse order (capturing wastage once a Yield Check already
    exists). Both records would otherwise double-count the same shortfall
    for one authorization, regardless of which one was recorded first.
    """
    existing_checks = frappe.get_all(
        "URY Yield Check",
        filters={"issue_authorization": auth_doc.get("name")},
        fields=["name"],
    )
    if existing_checks:
        frappe.throw(
            _(
                "Issue Authorization {0} already has a Yield Check recorded ({1}). "
                "Routine/expected trim loss should be logged as a Yield Check, "
                "exceptional loss (spoilage, damage, expiry, prep error) as Issue Wastage. "
                "The same authorization cannot have both, as it would double-count the same shortfall."
            ).format(auth_doc.get("name"), existing_checks[0].get("name")),
            frappe.ValidationError,
        )


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
