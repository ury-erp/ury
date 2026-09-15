"""Wastage capture, approval, valuation and stock posting.

Two sources feed one doctype (`URY Issue Wastage`), discriminated by
`source_type`:

  1. ``Issue Authorization`` (the original, unchanged flow) -- a department
     wasted material it had been issued against an approved Sales Plan.
     Anchored on a `URY Issue Authorization`, bounded by `held_quantity()`,
     and counted by V3-31's `prior_quantities()` as an entitlement decrement.

  2. ``KOT Cancellation`` (added by item 9) -- a POS order was cancelled after
     production had already posted a real, submitted `Manufacture` Stock
     Entry. The raw materials are genuinely consumed and the finished good
     genuinely exists against no sale. `capture_kot_cancellation_wastage()`
     mirrors that `Manufacture` entry into one Draft wastage row per consumed
     component. These rows have NO `plan` and NO `issue_authorization`.

**Critical invariant.** KOT-sourced rows must NEVER decrement issue
entitlement. That guard lives in
`ury_issue_authorization.sum_issue_sourced_wastage()`, which both
`prior_quantities()` and `held_quantity()` below route through; see that
function's docstring for why the discrimination is done in Python rather than
as a NULL-unsafe SQL predicate. Regression tests:
`test_ury_issue_authorization.TestKotSourcedWastageIsInvisibleToEntitlement`.

**This module now posts stock** (it previously, deliberately, did not). The
Draft -> Authorized approval step is financially load-bearing: a POS
cancellation captures a Draft write-off immediately so nothing is lost, and a
Stock Manager's approval is what puts it in the ledger as a submitted
`Material Issue` Stock Entry. Posting only happens for
`disposition in ("Wastage", "Damaged", "Staff Meal")`; `Re-plated` posts
nothing (the food legitimately stays in stock).

Account resolution is **explicit configuration, never inference**. grillax's
`name LIKE '%Wastage%'` account lookup is deliberately NOT ported -- it is a
name-matching heuristic that silently picks the wrong account. The accounts
and cost center are read from named `Branch` fields
(`wastage_expense_account`, `damage_expense_account`,
`staff_meal_expense_account`, `wastage_cost_center`) and approval **fails
closed with a named, actionable message** when they are unset.

No hidden/automatic adjustment: a wastage row is always created with status
"Draft" and does not reduce entitlement or touch the ledger until
`approve_wastage()` is explicitly called by a distinct authorized role.
"""

import json

import frappe
from frappe import _
from frappe.utils import flt

from ury.ury.api.ury_issue_authorization import (
    ISSUE_AUTH_DOCTYPE,
    SOURCE_ISSUE_AUTHORIZATION,
    SOURCE_KOT_CANCELLATION,
    sum_issue_sourced_wastage,
)


WASTAGE_DOCTYPE = "URY Issue Wastage"
POSTING_INTENT_DOCTYPE = "URY Fulfilment Posting Intent"
KOT_DOCTYPE = "URY KOT"
EXECUTION_DOCTYPE = "URY KOT Execution"

# Roles permitted to capture (create) a wastage record.
CAPTURE_ROLES = {"System Manager", "Production Manager"}

# Roles permitted to capture a KOT-cancellation write-off. A POS floor manager
# who is already trusted to confirm the cancellation itself (see
# `ury_kot_cancellation_service._verify_manager_confirmation`, which gates on
# `ury_kot_execution_service.MANAGER_ROLES`) must also be able to record the
# resulting Draft write-off -- requiring a Production Manager to be physically
# present before a cancelled dish can be written off would make the flow
# unusable on the floor. Capture is Draft-only and never touches the ledger,
# so widening it here does not widen any financial authority; APPROVE_ROLES is
# unchanged and is still the only path into the GL.
KOT_CANCELLATION_CAPTURE_ROLES = CAPTURE_ROLES | {"URY Manager", "URY Admin"}

# Roles permitted to approve/reject a captured wastage record. Kept distinct
# from CAPTURE_ROLES (except the System Manager escape hatch) so approval is
# never rubber-stamped by the same actor class that captured it.
APPROVE_ROLES = {"System Manager", "Stock Manager"}

REASON_CATEGORIES = {"Spoilage", "Preparation Error", "Dropped/Damaged", "Expired", "Other"}

# Single server-side vocabulary for "why the sale did not happen" (item 10).
# Distinct axis from REASON_CATEGORIES above (which is "what happened to the
# physical stock" wastage-reason-category): this is the customer/service-facing
# cancellation reason shown on POS Invoice / URY KOT Execution. Order matters
# (it is the Select field's option order); "Other" stays last so it reads as
# the catch-all. Mirrored on the frontend by
# `frontend/src/services/departmentStock.ts`'s `CANCEL_REASONS` constant --
# keep the two lists identical; this list is the single source of truth.
CANCEL_REASONS = [
    "Customer Changed Mind",
    "Order Placed By Mistake",
    "Duplicate Order",
    "Kitchen Error",
    "Out Of Stock",
    "Excessive Wait",
    "Payment Issue",
    "Other",
]

# CANCEL_REASONS and REASON_CATEGORIES are two DIFFERENT vocabularies on two
# different axes ("why the sale did not happen" vs "what happened to the
# physical stock"), and only "Other" is spelled the same in both. A caller
# that captures a write-off for a cancelled order therefore must NOT pass a
# cancel reason straight through as `reason_category` -- every value except
# "Other" would fail `capture_kot_cancellation_wastage`'s validation, and in
# the fail-open POS cancellation path that failure is swallowed, silently
# capturing no write-off at all. This map is the single, explicit translation
# between the two; see `wastage_category_for_cancel_reason` below.
CANCEL_REASON_TO_WASTAGE_CATEGORY = {
    "Customer Changed Mind": "Other",
    "Order Placed By Mistake": "Other",
    "Duplicate Order": "Other",
    "Kitchen Error": "Preparation Error",
    "Out Of Stock": "Other",
    "Excessive Wait": "Other",
    "Payment Issue": "Other",
    "Other": "Other",
}


def wastage_category_for_cancel_reason(reason):
    """Translate a `CANCEL_REASONS` value into a legal `REASON_CATEGORIES` one.

    Falls back to "Other" for an unknown/blank reason rather than raising:
    the caller is on a cancellation path where a write-off must be captured
    even if the reason vocabulary drifts.
    """
    return CANCEL_REASON_TO_WASTAGE_CATEGORY.get(reason) or DEFAULT_KOT_CANCELLATION_REASON


def kot_has_posted_consumption(kot):
    """True when `kot` has at least one POSTED fulfilment posting intent.

    i.e. production really did post a `Manufacture` Stock Entry for this KOT
    and its raw materials are genuinely consumed in the ledger. Used by
    `ury_kot_cancellation_service.cancel_before_start` to tell a truly
    untouched QUEUED KOT (nothing consumed -- capture nothing) apart from one
    whose item is configured with `production_posting_trigger_state = QUEUED`
    and therefore already posted while still QUEUED. Never raises.
    """
    if not kot:
        return False
    try:
        if not frappe.db.exists("DocType", POSTING_INTENT_DOCTYPE):
            return False
        return bool(
            frappe.get_all(
                POSTING_INTENT_DOCTYPE,
                filters={"kot": kot, "status": "POSTED"},
                pluck="name",
                limit=1,
            )
        )
    except Exception:
        return False


# grillax's binary `stock` field (Damaged / Wastage), widened. Only the first
# three post a `Material Issue`; `Re-plated` posts nothing.
DISPOSITIONS = ("Wastage", "Damaged", "Staff Meal", "Re-plated")
POSTING_DISPOSITIONS = ("Wastage", "Damaged", "Staff Meal")

# Disposition -> the explicitly configured `Branch` field naming the expense
# account to debit. No `LIKE '%Wastage%'` inference anywhere.
DISPOSITION_ACCOUNT_FIELD = {
    "Wastage": "wastage_expense_account",
    "Damaged": "damage_expense_account",
    "Staff Meal": "staff_meal_expense_account",
}
COST_CENTER_FIELD = "wastage_cost_center"

DEFAULT_KOT_CANCELLATION_DISPOSITION = "Wastage"
DEFAULT_KOT_CANCELLATION_REASON = "Other"


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
            "source_type": SOURCE_ISSUE_AUTHORIZATION,
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


@frappe.whitelist()
def reverse_wastage(wastage, actor=None, reason=None):
    """Reverse an already-Authorized wastage row and cancel any posted Stock Entry.

    `reject_wastage()` stays Draft-only (an un-approved row was never in the
    ledger, so there is nothing to undo). This is the path for a row that was
    approved in error: it flips the row to "Rejected" -- so it immediately
    stops decrementing entitlement, exactly like any other rejected row -- and
    cancels its linked `Material Issue` Stock Entry so no orphan submitted
    entry is left behind in the GL.
    """
    actor = actor or frappe.session.user
    _require_role(actor, APPROVE_ROLES, "reverse wastage")
    if not frappe.has_permission(WASTAGE_DOCTYPE, "write", user=actor):
        frappe.throw(_("Not permitted to reverse Issue Wastage"), frappe.PermissionError)

    doc = frappe.get_doc(WASTAGE_DOCTYPE, wastage)
    if doc.get("status") != "Authorized":
        frappe.throw(
            _("Only Authorized wastage records can be reversed; {0} is {1}").format(
                doc.get("name"), doc.get("status")
            ),
            frappe.ValidationError,
        )

    cancelled_entry = _cancel_stock_entry(doc, actor)
    doc.status = "Rejected"
    permission_basis = ",".join(sorted(_actor_roles(actor) & APPROVE_ROLES))
    doc.approved_by = actor
    doc.approved_on = frappe.utils.now()
    doc.approval_permission_basis = permission_basis
    append_audit(
        doc,
        "reversed",
        actor,
        {
            "wasted_qty": doc.get("wasted_qty"),
            "permission_basis": permission_basis,
            "cancelled_stock_entry": cancelled_entry,
            "reason": reason,
        },
    )
    doc.save(ignore_permissions=False)
    return doc


def _resolve_wastage(wastage, actor, approve):
    actor = actor or frappe.session.user
    _require_role(actor, APPROVE_ROLES, "approve/reject wastage")
    if not frappe.has_permission(WASTAGE_DOCTYPE, "write", user=actor):
        frappe.throw(_("Not permitted to approve/reject Issue Wastage"), frappe.PermissionError)

    doc = frappe.get_doc(WASTAGE_DOCTYPE, wastage)
    if doc.get("status") != "Draft":
        frappe.throw(_("Only Draft wastage records can be approved or rejected"), frappe.ValidationError)

    stock_entry = None
    if approve:
        if _is_kot_sourced(doc):
            # A KOT-sourced row is bounded by the cancelled KOT item's own
            # consumption (frozen at capture time from the posting intent that
            # actually posted), not by an Issue Authorization's authorized_qty
            # -- there is no authorization to bound it with.
            pass
        else:
            auth_doc = frappe.get_doc(ISSUE_AUTH_DOCTYPE, doc.get("issue_authorization"))
            held_qty = held_quantity(auth_doc, exclude_wastage=doc.get("name"))
            if doc.get("wasted_qty") > held_qty:
                frappe.throw(
                    _(
                        "Wasted quantity {0} exceeds currently-held quantity {1} for {2} "
                        "(re-validated at approval)"
                    ).format(doc.get("wasted_qty"), held_qty, auth_doc.get("component_item")),
                    frappe.ValidationError,
                )
        compute_wastage_valuation(doc)
        # Resolve and post BEFORE flipping status, so a fail-closed account
        # misconfiguration leaves the row Draft (re-approvable once configured)
        # rather than Authorized-but-unposted.
        stock_entry = _post_stock_entry(doc, actor)
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
        {
            "wasted_qty": doc.get("wasted_qty"),
            "permission_basis": permission_basis,
            "stock_entry": stock_entry,
        },
    )
    doc.save(ignore_permissions=False)
    return doc


def _is_kot_sourced(doc):
    return (doc.get("source_type") or SOURCE_ISSUE_AUTHORIZATION) == SOURCE_KOT_CANCELLATION


# ---------------------------------------------------------------------------
# Valuation -- real rate cascade (replaces the former stub)
# ---------------------------------------------------------------------------


def compute_wastage_valuation(wastage_doc, valuation_rate=None):
    """Attribute a real cost to wastage, via grillax's proven rate cascade.

    Cascade, in order, first hit wins:

      1. The item's active+default+submitted `BOM`: ``total_cost / quantity``.
         A composed dish is worth what its bill of materials says it costs.
      2. ``Item.last_purchase_rate`` -- what it was last actually bought for.
      3. ``erpnext.stock.utils.get_incoming_rate(allow_zero_valuation=1)`` --
         the real warehouse valuation-ledger rate for this item/warehouse at
         this moment.

    `valuation_is_estimated` is 0 only when the rate came from
    `get_incoming_rate`, because that (and only that) is sourced from the
    actual stock ledger. A BOM cost and a last-purchase rate are both
    perfectly reasonable numbers, but they are derived/historical, not the
    ledger's own valuation -- so they stay flagged as estimates. This retires
    the field's former "Future Work" label and makes the `Wastage and Damage
    Report`'s cost columns trustworthy for the first time.

    An explicitly passed `valuation_rate` short-circuits the cascade (and is
    treated as an estimate), preserving the previous signature for callers
    that already looked a rate up.
    """
    qty = flt(wastage_doc.get("wasted_qty") or 0)

    if valuation_rate is not None:
        rate, source = flt(valuation_rate), "caller"
    else:
        rate, source = _resolve_valuation_rate(
            wastage_doc.get("component_item"),
            wastage_doc.get("warehouse"),
            wastage_doc.get("company"),
            qty,
        )

    wastage_doc.valuation_rate = rate
    wastage_doc.valuation_amount = qty * rate
    wastage_doc.valuation_is_estimated = 0 if source == "incoming_rate" else 1
    return wastage_doc.valuation_amount


def _resolve_valuation_rate(item_code, warehouse, company, qty):
    """Return (rate, source) per the documented cascade. Never raises."""
    if not item_code:
        return 0, "unresolved"

    rate = _bom_unit_cost(item_code, company)
    if rate:
        return rate, "bom"

    rate = _last_purchase_rate(item_code)
    if rate:
        return rate, "last_purchase_rate"

    rate = _incoming_rate(item_code, warehouse, company, qty)
    if rate:
        return rate, "incoming_rate"

    return 0, "unresolved"


def _bom_unit_cost(item_code, company):
    """Active+default+submitted BOM `total_cost / quantity` for `item_code`."""
    filters = {"item": item_code, "is_active": 1, "is_default": 1, "docstatus": 1}
    if company:
        filters["company"] = company
    try:
        rows = frappe.get_all(
            "BOM", filters=filters, fields=["name", "total_cost", "quantity"], limit=1
        )
    except Exception:
        return 0
    if not rows:
        return 0
    row = rows[0]
    quantity = flt(row.get("quantity"))
    if not quantity:
        return 0
    return flt(row.get("total_cost")) / quantity


def _last_purchase_rate(item_code):
    try:
        return flt(frappe.db.get_value("Item", item_code, "last_purchase_rate"))
    except Exception:
        return 0


def _incoming_rate(item_code, warehouse, company, qty):
    """Real stock-ledger rate via ERPNext's own valuation API."""
    if not warehouse:
        return 0
    try:
        from erpnext.stock.utils import get_incoming_rate
    except Exception:
        return 0
    try:
        return flt(
            get_incoming_rate(
                {
                    "item_code": item_code,
                    "warehouse": warehouse,
                    "company": company,
                    "qty": -1 * flt(qty),
                    "posting_date": frappe.utils.nowdate(),
                    "posting_time": frappe.utils.nowtime(),
                    "voucher_type": "Stock Entry",
                    "voucher_no": None,
                    "allow_zero_valuation": 1,
                }
            )
        )
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# KOT cancellation write-off capture
# ---------------------------------------------------------------------------


@frappe.whitelist()
def capture_kot_cancellation_wastage(
    kot,
    disposition=None,
    reason_category=None,
    reason_notes=None,
    kot_execution=None,
    branch=None,
    company=None,
    actor=None,
):
    """Capture Draft write-off rows for a KOT cancelled after production posted.

    Called by `ury_kot_cancellation_service.cancel_after_start` /
    `cancel_after_ready` once the execution state transition has been written.

    **Source of truth is the posting that actually happened**, not a
    re-derived bill. `URY Fulfilment Posting Intent` rows with
    `status = "POSTED"` for this KOT carry the exact frozen payload that
    `ury_fulfilment_posting_service._stock_entry_items()` turned into the
    submitted `Manufacture` Stock Entry -- component item, qty and source
    warehouse. Reading those back means the write-off mirrors the real
    consumption line for line, including any component whose warehouse or
    quantity differed from what today's BOM would say.

    Only when this KOT posted nothing (typically a `CANCELLED_AFTER_START` on
    an item that never reached READY, so nothing was consumed in the ledger)
    does this fall back to `ury_bom_compiler.compile_bom_vector` -- the same
    explosion helper the posting path itself uses -- against the KOT's own
    items, and only for items whose production context resolves a warehouse.
    The fallback is recorded as `derivation: "bom_explosion"` in each row's
    audit log so a reviewer can tell a mirrored write-off from a derived one.

    Returns a dict describing what was captured; never raises for a KOT that
    simply consumed nothing (it returns zero rows), because a cancellation
    must never be blocked by the absence of a write-off.
    """
    actor = actor or frappe.session.user
    _require_role(actor, KOT_CANCELLATION_CAPTURE_ROLES, "capture KOT cancellation wastage")
    if not frappe.has_permission(WASTAGE_DOCTYPE, "create", user=actor):
        frappe.throw(_("Not permitted to create Issue Wastage"), frappe.PermissionError)

    disposition = disposition or DEFAULT_KOT_CANCELLATION_DISPOSITION
    if disposition not in DISPOSITIONS:
        frappe.throw(
            _("Unknown disposition {0}; expected one of {1}").format(
                disposition, ", ".join(DISPOSITIONS)
            ),
            frappe.ValidationError,
        )

    reason_category = reason_category or DEFAULT_KOT_CANCELLATION_REASON
    if reason_category not in REASON_CATEGORIES:
        frappe.throw(_("Unknown wastage reason category"), frappe.ValidationError)

    existing = _existing_kot_wastage(kot)
    if existing:
        # Idempotent replay: a retried cancellation must not double the
        # write-off. Draft/Authorized rows already exist for this KOT.
        return {
            "kot": kot,
            "disposition": disposition,
            "created": [],
            "idempotent_replay": True,
            "existing": existing,
            "derivation": None,
        }

    branch, company = _resolve_kot_scope(kot, branch, company)
    consumption, derivation = _kot_consumption(kot, branch, company)

    created = []
    for row in consumption:
        doc = frappe.get_doc(
            {
                "doctype": WASTAGE_DOCTYPE,
                "source_type": SOURCE_KOT_CANCELLATION,
                # No issue_authorization, no plan, no department: this row is
                # an accounting record about a cancelled sale, not a draw
                # against a Sales Plan's material budget. See
                # ury_issue_authorization.sum_issue_sourced_wastage().
                "issue_authorization": None,
                "plan": None,
                "source_kot": kot,
                "source_kot_execution": kot_execution,
                "branch": branch,
                "company": company,
                "department": row.get("department"),
                "production_unit": row.get("production_unit"),
                "warehouse": row.get("warehouse"),
                "component_item": row.get("component_item"),
                "stock_uom": row.get("stock_uom"),
                "status": "Draft",
                "held_qty_before": 0,
                "wasted_qty": row.get("qty"),
                "reason_category": reason_category,
                "reason_notes": reason_notes,
                "disposition": disposition,
                "captured_by": actor,
                "captured_on": frappe.utils.now(),
            }
        )
        append_audit(
            doc,
            "captured",
            actor,
            {
                "source_type": SOURCE_KOT_CANCELLATION,
                "source_kot": kot,
                "derivation": derivation,
                "disposition": disposition,
                "wasted_qty": row.get("qty"),
                "warehouse": row.get("warehouse"),
                "posting_intent": row.get("posting_intent"),
                "manufacture_stock_entry": row.get("stock_entry"),
            },
        )
        doc.insert(ignore_permissions=False)
        created.append(doc)

    return {
        "kot": kot,
        "disposition": disposition,
        "created": created,
        "idempotent_replay": False,
        "existing": [],
        "derivation": derivation,
    }


def _existing_kot_wastage(kot):
    """Names of non-Rejected wastage rows already captured for `kot`."""
    if not frappe.db.exists("DocType", WASTAGE_DOCTYPE):
        return []
    try:
        rows = frappe.get_all(
            WASTAGE_DOCTYPE,
            filters={"source_kot": kot, "status": ["!=", "Rejected"]},
            pluck="name",
        )
    except Exception:
        return []
    return list(rows or [])


def _resolve_kot_scope(kot, branch, company):
    if branch and company:
        return branch, company
    row = frappe.db.get_value(KOT_DOCTYPE, kot, ["branch"], as_dict=True) or {}
    branch = branch or row.get("branch")
    if not branch:
        frappe.throw(_("KOT {0} has no resolvable branch").format(kot), frappe.ValidationError)
    company = company or frappe.db.get_value("Branch", branch, "company")
    if not company:
        frappe.throw(
            _("Branch {0} has no resolvable company").format(branch), frappe.ValidationError
        )
    return branch, company


def _kot_consumption(kot, branch, company):
    """Return (rows, derivation) describing what this KOT actually consumed.

    Rows aggregate by (component_item, warehouse) so one write-off row is
    produced per consumed component even when a KOT posted several intents.
    """
    rows = _consumption_from_posting_intents(kot)
    if rows:
        return rows, "posting_intent"
    return _consumption_from_bom(kot, branch, company), "bom_explosion"


def _consumption_from_posting_intents(kot):
    if not frappe.db.exists("DocType", POSTING_INTENT_DOCTYPE):
        return []
    try:
        intents = frappe.get_all(
            POSTING_INTENT_DOCTYPE,
            filters={"kot": kot, "status": "POSTED"},
            fields=[
                "name",
                "erpnext_stock_entry",
                "department",
                "production_unit",
                "frozen_payload_json",
            ],
        )
    except Exception:
        # `department` is not guaranteed on every schema revision of this
        # doctype; retry with the minimal field set rather than losing the
        # authoritative consumption source over an optional column.
        intents = frappe.get_all(
            POSTING_INTENT_DOCTYPE,
            filters={"kot": kot, "status": "POSTED"},
            fields=["name", "erpnext_stock_entry", "production_unit", "frozen_payload_json"],
        )

    aggregated = {}
    for intent in intents or []:
        try:
            payload = json.loads(intent.get("frozen_payload_json") or "{}")
        except (TypeError, ValueError):
            continue
        for component in payload.get("components") or []:
            item_code = component.get("item_code")
            qty = flt(component.get("qty"))
            warehouse = component.get("s_warehouse")
            if not item_code or qty <= 0:
                continue
            key = (item_code, warehouse)
            row = aggregated.setdefault(
                key,
                {
                    "component_item": item_code,
                    "warehouse": warehouse,
                    "qty": 0,
                    "stock_uom": None,
                    "department": payload.get("department") or intent.get("department"),
                    "production_unit": payload.get("production_unit")
                    or intent.get("production_unit"),
                    "posting_intent": intent.get("name"),
                    "stock_entry": intent.get("erpnext_stock_entry"),
                },
            )
            row["qty"] += qty

    for row in aggregated.values():
        row["stock_uom"] = _item_stock_uom(row["component_item"])
    return [aggregated[key] for key in sorted(aggregated, key=lambda k: (k[0], k[1] or ""))]


def _consumption_from_bom(kot, branch, company):
    """Fallback explosion for a KOT that posted no `Manufacture` entry.

    Uses `ury_bom_compiler.compile_bom_vector` -- the same helper
    `ury_fulfilment_posting_service` / `ury_batch_manufacture_service` use --
    so a derived write-off is shaped identically to a posted one. Items whose
    production context resolves no warehouse are skipped rather than written
    off against an unknown warehouse.
    """
    from ury.ury.api.ury_bom_compiler import compile_bom_vector
    from ury.ury.api.ury_production_context import resolve_production_context

    try:
        kot_doc = frappe.get_doc(KOT_DOCTYPE, kot)
    except Exception:
        return []

    aggregated = {}
    for kot_item in kot_doc.get("kot_items") or []:
        item_code = kot_item.get("item")
        qty = flt(kot_item.get("quantity")) - flt(kot_item.get("cancelled_qty"))
        if not item_code or qty <= 0:
            continue

        context = resolve_production_context(item_code, branch, company) or {}
        warehouse = context.get("warehouse")
        if not warehouse:
            continue

        try:
            vector = compile_bom_vector(item_code, qty, company)
        except Exception:
            continue

        for component in vector.get("components") or []:
            component_item = component.get("component_item")
            component_qty = flt(component.get("qty"))
            if not component_item or component_qty <= 0:
                continue
            key = (component_item, warehouse)
            row = aggregated.setdefault(
                key,
                {
                    "component_item": component_item,
                    "warehouse": warehouse,
                    "qty": 0,
                    "stock_uom": component.get("stock_uom"),
                    "department": context.get("department"),
                    "production_unit": context.get("production_unit"),
                    "posting_intent": None,
                    "stock_entry": None,
                },
            )
            row["qty"] += component_qty

    return [aggregated[key] for key in sorted(aggregated, key=lambda k: (k[0], k[1] or ""))]


def _item_stock_uom(item_code):
    try:
        return frappe.db.get_value("Item", item_code, "stock_uom")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Stock posting -- explicit account configuration, fail closed
# ---------------------------------------------------------------------------


def resolve_posting_accounts(branch, disposition):
    """Resolve (expense_account, cost_center) from explicit `Branch` config.

    Deliberately NOT grillax's `Account.name LIKE '%Wastage%'` heuristic: that
    silently picks whichever account happens to be named similarly, which is
    exactly how unreviewed entries end up in a real financial ledger. These
    are named configuration fields, and an unset one fails closed with a
    message naming the branch, the field and the disposition so the operator
    knows precisely what to configure.
    """
    account_field = DISPOSITION_ACCOUNT_FIELD.get(disposition)
    if not account_field:
        frappe.throw(
            _("Disposition {0} does not post a Stock Entry").format(disposition),
            frappe.ValidationError,
        )
    if not branch:
        frappe.throw(
            _("Wastage record has no branch; cannot resolve the expense account to debit"),
            frappe.ValidationError,
        )

    expense_account = frappe.db.get_value("Branch", branch, account_field)
    cost_center = frappe.db.get_value("Branch", branch, COST_CENTER_FIELD)

    if not expense_account:
        frappe.throw(
            _(
                "Branch {0} has no {1} configured, so a {2} write-off cannot be posted. "
                "Set it on the Branch record (Wastage Accounting section) and approve again."
            ).format(branch, _field_label(account_field), disposition),
            frappe.ValidationError,
        )
    if not cost_center:
        frappe.throw(
            _(
                "Branch {0} has no {1} configured, so a {2} write-off cannot be posted. "
                "Set it on the Branch record (Wastage Accounting section) and approve again."
            ).format(branch, _field_label(COST_CENTER_FIELD), disposition),
            frappe.ValidationError,
        )
    return expense_account, cost_center


def _field_label(fieldname):
    return fieldname.replace("_", " ").title()


def _post_stock_entry(doc, actor):
    """Create and submit one `Material Issue` Stock Entry for an approved row.

    Returns the Stock Entry name, or None when this disposition posts nothing.
    `Re-plated` posts nothing: the food legitimately stayed in stock, so there
    is no issue to record. A row with no disposition at all (every
    Issue-Authorization-sourced row written before this change) also posts
    nothing, preserving the previous behaviour byte for byte.
    """
    disposition = doc.get("disposition")
    if not disposition or disposition not in POSTING_DISPOSITIONS:
        return None
    if doc.get("stock_entry"):
        # Already posted (idempotent re-approval guard).
        return doc.get("stock_entry")

    warehouse = doc.get("warehouse")
    if not warehouse:
        frappe.throw(
            _(
                "Wastage record {0} has no warehouse, so a {1} write-off cannot be issued "
                "from anywhere. This row cannot be approved."
            ).format(doc.get("name"), disposition),
            frappe.ValidationError,
        )

    expense_account, cost_center = resolve_posting_accounts(doc.get("branch"), disposition)

    rate = flt(doc.get("valuation_rate"))
    item_row = {
        "item_code": doc.get("component_item"),
        "qty": flt(doc.get("wasted_qty")),
        "s_warehouse": warehouse,
        "basic_rate": rate,
        "expense_account": expense_account,
        "cost_center": cost_center,
    }
    if not rate:
        # Mirrors grillax: a zero rate is allowed through explicitly rather
        # than letting ERPNext reject the submit on an item with no valuation.
        item_row["allow_zero_valuation_rate"] = 1

    entry = frappe.get_doc(
        {
            "doctype": "Stock Entry",
            "company": doc.get("company"),
            "stock_entry_type": "Material Issue",
            "purpose": "Material Issue",
            "set_basic_rate_manually": 1 if rate else 0,
            "from_bom": 0,
            "items": [item_row],
            "remarks": "URY Wastage {0} ({1}) for {2}".format(
                doc.get("name"), disposition, doc.get("source_kot") or doc.get("issue_authorization")
            ),
        }
    )
    entry.insert(ignore_permissions=False)
    entry.submit()
    doc.stock_entry = entry.name
    return entry.name


def _cancel_stock_entry(doc, actor):
    """Cancel the linked submitted Stock Entry, if any. Returns its name or None."""
    name = doc.get("stock_entry")
    if not name:
        return None
    entry = frappe.get_doc("Stock Entry", name)
    if entry.get("docstatus") == 1:
        entry.cancel()
    return name


def held_quantity(auth_doc, exclude_wastage=None):
    """Currently-held qty = authorized_qty - approved wastage - approved returns.

    Only status="Authorized" rows count (mirrors V3-31's prior_quantities
    live-aggregation pattern); Draft/Rejected wastage never reduces this.
    """
    authorized_qty = auth_doc.get("authorized_qty") or 0
    # Routed through the shared guard so a "KOT Cancellation"-sourced row can
    # never decrement an Issue Authorization's held quantity. Such a row has a
    # null `issue_authorization` and so cannot match this filter anyway -- the
    # explicit guard is defence in depth against a future caller that
    # back-links one, and keeps the two entitlement readers
    # (`prior_quantities()` and this) provably identical in their exclusion
    # rule rather than relying on two separate accidents.
    already_wasted = sum_issue_sourced_wastage(
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
def get_cancellation_vocabulary():
    """Read-only vocabulary for the POS/urypos cancel dialog (item 10).

    Single server-side source of truth for both the cancel-reason Select and
    the post-production disposition Select, so neither surface hand-maintains
    its own copy. `frontend/src/services/departmentStock.ts` mirrors this
    call's shape into a typed `CANCEL_REASONS` constant, the same pattern it
    already uses for `WASTAGE_REASON_CATEGORIES`.
    """
    return {
        "cancel_reasons": list(CANCEL_REASONS),
        "dispositions": list(DISPOSITIONS),
    }


@frappe.whitelist()
def estimate_kot_cancellation_wastage_value(kot, disposition=None, branch=None, company=None):
    """Read-only estimate of the write-off value a cancellation would create.

    Mirrors `capture_kot_cancellation_wastage()`'s own consumption resolution
    (`_kot_consumption`) and `compute_wastage_valuation()`'s rate cascade, but
    inserts nothing. Used by the cancel dialog to show the estimated write-off
    amount before the operator confirms (item 10, AC-6). Never raises for a
    KOT that consumed nothing -- returns a zero estimate instead, matching
    `capture_kot_cancellation_wastage()`'s own fail-open shape.
    """
    if not frappe.has_permission(WASTAGE_DOCTYPE, "read"):
        frappe.throw(_("Not permitted to read Issue Wastage"), frappe.PermissionError)

    disposition = disposition or DEFAULT_KOT_CANCELLATION_DISPOSITION
    if disposition not in DISPOSITIONS:
        frappe.throw(
            _("Unknown disposition {0}; expected one of {1}").format(
                disposition, ", ".join(DISPOSITIONS)
            ),
            frappe.ValidationError,
        )

    branch, company = _resolve_kot_scope(kot, branch, company)
    consumption, derivation = _kot_consumption(kot, branch, company)

    lines = []
    total = 0.0
    for row in consumption:
        qty = flt(row.get("qty"))
        rate, source = _resolve_valuation_rate(
            row.get("component_item"), row.get("warehouse"), company, qty
        )
        amount = qty * rate
        total += amount
        lines.append(
            {
                "component_item": row.get("component_item"),
                "qty": qty,
                "warehouse": row.get("warehouse"),
                "valuation_rate": rate,
                "valuation_source": source,
                "estimated_amount": amount,
            }
        )

    return {
        "kot": kot,
        "disposition": disposition,
        "derivation": derivation,
        "will_post": disposition in POSTING_DISPOSITIONS,
        "lines": lines,
        "estimated_total": total,
    }


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
            "valuation_is_estimated",
            "source_type",
            "source_kot",
            "disposition",
            "warehouse",
            "stock_entry",
        ],
        order_by="creation desc",
    )
