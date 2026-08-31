"""Central-store transfer, department receipt, and return tracking service.

Consumes the V3-31 `URY Issue Authorization` record as its only input
authority: every transfer, receipt, or return recorded here must reference an
existing "Authorized" Issue Authorization and must never push the linked
authorization's cumulative movement beyond its `authorized_qty`. This module
never creates a real ERPNext ``Stock Entry``, never calls ``.submit()`` on any
stock document, and never touches the ERPNext stock/warehouse ledger. It only
produces its own lightweight ``URY Stock Movement`` tracking records, mirroring
the storage-only pattern used by V3-31's ``URY Issue Authorization``.

Design note (schema gap left open by TODO.md / V3-30): neither the TODO.md row
for V3-32 nor the V3-30 contract specifies a transfer/receipt/return record
shape - V3-30 explicitly scopes transfer/receipt/return flows out of its own
contract and defers them to this task. This module resolves that gap by
introducing a single ``URY Stock Movement`` doctype with a `movement_type`
discriminator (Transfer / Receipt / Return) rather than three separate
doctypes, so all three event kinds share one auditable, append-only ledger
keyed off `issue_authorization`. Running totals are never cached on the Issue
Authorization or on the movement records themselves; every bound check
aggregates live from existing `URY Stock Movement` rows, mirroring V3-31's
`prior_quantities()` live-aggregation pattern rather than trusting a stored
counter.

Design note (return eligibility basis): the task text asks that a return
reduce "the department's effective holding". Because a transfer can be
recorded before the department has actually confirmed receipt, this module
treats *received* quantity (not merely transferred quantity) as the
department's effective holding: a return may only draw down against
`received_qty - returned_qty` for the authorization. This is the more
conservative reading and prevents returning material the department has not
yet confirmed it physically holds.

Design note (transfer bound formula): mirroring V3-31's / V3-30's
`remaining_entitlement` formula (`required - authorized + returned - wasted`),
the transferable remainder for an authorization is
`authorized_qty - transferred_qty + returned_qty`, floored at zero. A return
frees up entitlement to transfer again, consistent with how a V3-31 return
frees up remaining entitlement to re-authorize.
"""

import json

import frappe
from frappe import _


STOCK_MOVEMENT_DOCTYPE = "URY Stock Movement"
ISSUE_AUTH_DOCTYPE = "URY Issue Authorization"
AUTHORIZED_STATUS = "Authorized"
CENTRAL_STORE_LOCATION = "Central Store"

TRANSFER = "Transfer"
RECEIPT = "Receipt"
RETURN = "Return"


@frappe.whitelist()
def transfer_to_department(issue_authorization, qty, branch=None, company=None, actor=None, to_location=None):
    """Record a central-store-to-department transfer against an authorization.

    Fails closed if the authorization is missing/not Authorized, if
    branch/company do not match the authorization's scope, or if `qty` would
    push cumulative transfers (net of returns) beyond `authorized_qty`.
    """
    actor = actor or frappe.session.user
    _require_create_permission()
    _require_positive_qty(qty)

    auth_doc = _load_authorization(issue_authorization)
    resolved_branch, resolved_company = _resolve_and_validate_scope(auth_doc, branch, company)

    remaining = remaining_transferable_qty(auth_doc)
    if qty > remaining:
        frappe.throw(
            _("Transfer quantity {0} exceeds remaining transferable quantity {1} for {2}").format(
                qty, remaining, auth_doc.get("component_item")
            ),
            frappe.ValidationError,
        )

    doc = _new_movement(
        auth_doc,
        movement_type=TRANSFER,
        qty=qty,
        branch=resolved_branch,
        company=resolved_company,
        from_location=CENTRAL_STORE_LOCATION,
        to_location=to_location or auth_doc.get("department"),
        actor=actor,
    )
    append_audit(doc, actor, event="transfer", qty=qty, remaining_before=remaining, remaining_after=remaining - qty)
    doc.insert(ignore_permissions=False)
    return doc


@frappe.whitelist()
def receive_at_department(transfer_movement, qty, branch=None, company=None, actor=None):
    """Record department receipt confirmation against an existing transfer.

    Fails closed if the referenced movement is missing, is not a `Transfer`
    record, if branch/company do not match, or if `qty` would push cumulative
    receipts against that transfer beyond the transfer's own `qty`.
    """
    actor = actor or frappe.session.user
    _require_create_permission()
    _require_positive_qty(qty)

    transfer_doc = frappe.get_doc(STOCK_MOVEMENT_DOCTYPE, transfer_movement)
    if transfer_doc.get("movement_type") != TRANSFER:
        frappe.throw(_("Referenced movement is not a Transfer record"), frappe.ValidationError)

    auth_doc = _load_authorization(transfer_doc.get("issue_authorization"))
    resolved_branch, resolved_company = _resolve_and_validate_scope(auth_doc, branch, company)
    if transfer_doc.get("branch") != resolved_branch or transfer_doc.get("company") != resolved_company:
        frappe.throw(_("Receipt branch/company does not match the transfer's scope"), frappe.ValidationError)

    already_received = received_qty_for_transfer(transfer_movement)
    outstanding = max((transfer_doc.get("qty") or 0) - already_received, 0)
    if qty > outstanding:
        frappe.throw(
            _("Receipt quantity {0} exceeds outstanding transfer quantity {1}").format(qty, outstanding),
            frappe.ValidationError,
        )

    doc = _new_movement(
        auth_doc,
        movement_type=RECEIPT,
        qty=qty,
        branch=resolved_branch,
        company=resolved_company,
        from_location=transfer_doc.get("from_location"),
        to_location=transfer_doc.get("to_location"),
        actor=actor,
    )
    doc.transfer_ref = transfer_movement
    append_audit(
        doc,
        actor,
        event="receipt",
        qty=qty,
        remaining_before=outstanding,
        remaining_after=outstanding - qty,
        transfer_ref=transfer_movement,
    )
    doc.insert(ignore_permissions=False)
    return doc


@frappe.whitelist()
def return_to_central_store(issue_authorization, qty, branch=None, company=None, actor=None):
    """Record a return of unused/excess material from a department back to
    central store, reducing the department's effective (received) holding.

    Fails closed if `qty` would push cumulative returns beyond the
    department's effective holding: `received_qty - returned_qty`.
    """
    actor = actor or frappe.session.user
    _require_create_permission()
    _require_positive_qty(qty)

    auth_doc = _load_authorization(issue_authorization)
    resolved_branch, resolved_company = _resolve_and_validate_scope(auth_doc, branch, company)

    holding = effective_department_holding(issue_authorization)
    if qty > holding:
        frappe.throw(
            _("Return quantity {0} exceeds department's effective holding {1} for {2}").format(
                qty, holding, auth_doc.get("component_item")
            ),
            frappe.ValidationError,
        )

    doc = _new_movement(
        auth_doc,
        movement_type=RETURN,
        qty=qty,
        branch=resolved_branch,
        company=resolved_company,
        from_location=auth_doc.get("department"),
        to_location=CENTRAL_STORE_LOCATION,
        actor=actor,
    )
    append_audit(doc, actor, event="return", qty=qty, remaining_before=holding, remaining_after=holding - qty)
    doc.insert(ignore_permissions=False)
    return doc


def _require_create_permission():
    if not frappe.has_permission(STOCK_MOVEMENT_DOCTYPE, "create"):
        frappe.throw(_("Not permitted to record stock movements"), frappe.PermissionError)


def _require_positive_qty(qty):
    if qty is None or qty <= 0:
        frappe.throw(_("Quantity must be greater than zero"), frappe.ValidationError)


def _load_authorization(issue_authorization):
    if not issue_authorization:
        frappe.throw(_("Issue Authorization is required"), frappe.ValidationError)
    auth_doc = frappe.get_doc(ISSUE_AUTH_DOCTYPE, issue_authorization)
    if auth_doc.get("status") != AUTHORIZED_STATUS:
        frappe.throw(
            _("Issue Authorization {0} is not Authorized").format(issue_authorization),
            frappe.ValidationError,
        )
    return auth_doc


def _resolve_and_validate_scope(auth_doc, branch, company):
    auth_branch = auth_doc.get("branch")
    auth_company = auth_doc.get("company")
    if not auth_branch or not auth_company:
        frappe.throw(_("Issue Authorization branch and company are required"), frappe.ValidationError)

    resolved_branch = branch or auth_branch
    resolved_company = company or auth_company

    if resolved_branch != auth_branch:
        frappe.throw(_("Branch does not match the Issue Authorization's branch"), frappe.ValidationError)
    if resolved_company != auth_company:
        frappe.throw(_("Company does not match the Issue Authorization's company"), frappe.ValidationError)

    branch_company = frappe.db.get_value("Branch", auth_branch, "company")
    if not branch_company or branch_company != auth_company:
        frappe.throw(_("Branch and company do not match"), frappe.ValidationError)

    return resolved_branch, resolved_company


def _new_movement(auth_doc, movement_type, qty, branch, company, from_location, to_location, actor):
    return frappe.get_doc(
        {
            "doctype": STOCK_MOVEMENT_DOCTYPE,
            "issue_authorization": auth_doc.get("name") or auth_doc.get("issue_authorization"),
            "movement_type": movement_type,
            "branch": branch,
            "company": company,
            "department": auth_doc.get("department"),
            "component_item": auth_doc.get("component_item"),
            "stock_uom": auth_doc.get("stock_uom"),
            "qty": qty,
            "from_location": from_location,
            "to_location": to_location,
            "posting_datetime": frappe.utils.now(),
            "actor": actor,
        }
    )


def transferred_qty(issue_authorization):
    return _sum_qty({"issue_authorization": issue_authorization, "movement_type": TRANSFER})


def returned_qty(issue_authorization):
    return _sum_qty({"issue_authorization": issue_authorization, "movement_type": RETURN})


def received_qty(issue_authorization):
    return _sum_qty({"issue_authorization": issue_authorization, "movement_type": RECEIPT})


def received_qty_for_transfer(transfer_movement):
    return _sum_qty({"movement_type": RECEIPT, "transfer_ref": transfer_movement})


def remaining_transferable_qty(auth_doc):
    """`max(authorized_qty - transferred_qty + returned_qty, 0)`.

    See the module docstring's "transfer bound formula" design note.
    """
    issue_authorization = auth_doc.get("name") or auth_doc.get("issue_authorization")
    authorized_qty = auth_doc.get("authorized_qty") or 0
    return max(authorized_qty - transferred_qty(issue_authorization) + returned_qty(issue_authorization), 0)


def effective_department_holding(issue_authorization):
    """`max(received_qty - returned_qty, 0)`.

    See the module docstring's "return eligibility basis" design note.
    """
    return max(received_qty(issue_authorization) - returned_qty(issue_authorization), 0)


def _sum_qty(filters):
    rows = frappe.get_all(STOCK_MOVEMENT_DOCTYPE, filters=filters, pluck="qty")
    return sum(row or 0 for row in rows)


def append_audit(doc, actor, event, qty, remaining_before, remaining_after, transfer_ref=None):
    existing = doc.get("audit_log")
    entries = json.loads(existing) if existing else []
    entry = {
        "actor": actor,
        "timestamp": frappe.utils.now(),
        "event": event,
        "issue_authorization": doc.get("issue_authorization"),
        "branch": doc.get("branch"),
        "company": doc.get("company"),
        "department": doc.get("department"),
        "component_item": doc.get("component_item"),
        "qty": qty,
        "remaining_before": remaining_before,
        "remaining_after": remaining_after,
    }
    if transfer_ref:
        entry["transfer_ref"] = transfer_ref
    entries.append(entry)
    doc.audit_log = json.dumps(entries, sort_keys=True, default=str)


@frappe.whitelist()
def list_stock_movements(branch, department=None, company=None, from_date=None, to_date=None):
    """Read-only list of URY Stock Movement records scoped by branch.

    Fails closed if branch is missing/blank. Pure frappe.get_all read; never
    creates, transfers, receives, or returns any stock.
    """
    if not branch:
        frappe.throw(_("Branch is required"), frappe.ValidationError)
    if not frappe.has_permission(STOCK_MOVEMENT_DOCTYPE, "read"):
        frappe.throw(_("Not permitted to read Stock Movement"), frappe.PermissionError)

    filters = {"branch": branch}
    if department:
        filters["department"] = department
    if company:
        filters["company"] = company
    if from_date and to_date:
        filters["posting_datetime"] = ["between", [from_date, to_date]]
    elif from_date:
        filters["posting_datetime"] = [">=", from_date]
    elif to_date:
        filters["posting_datetime"] = ["<=", to_date]

    return frappe.get_all(
        STOCK_MOVEMENT_DOCTYPE,
        filters=filters,
        fields=[
            "name",
            "issue_authorization",
            "movement_type",
            "department",
            "component_item",
            "branch",
            "company",
            "qty",
            "stock_uom",
            "from_location",
            "to_location",
            "posting_datetime",
            "transfer_ref",
        ],
        order_by="posting_datetime desc",
    )
