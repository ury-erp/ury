"""Governed Sales Plan state and approval snapshot helpers."""

import hashlib
import json

import frappe
from frappe import _

from ury.ury.api.ury_production_validation import validate_item_production_configuration


TRANSITIONS = {
    "Draft": {"Proposed"},
    "Proposed": {"Submitted for Approval"},
    "Submitted for Approval": {"Approved"},
    "Approved": {"Locked for Production", "Superseded/Cancelled"},
    "Locked for Production": {"Superseded/Cancelled"},
}


def transition_sales_plan(doc, target_state, actor=None):
    """Validate and apply one audited state transition to a plan document."""
    current = doc.get("status") or "Draft"
    if target_state not in TRANSITIONS.get(current, set()):
        frappe.throw(_("Invalid Sales Plan transition from {0} to {1}").format(current, target_state), frappe.ValidationError)
    if not frappe.has_permission("URY Sales Plan", "write", doc=doc):
        frappe.throw(_("Not permitted to change this Sales Plan"), frappe.PermissionError)
    _validate_plan_scope(doc)
    if target_state == "Approved":
        validate_plan_items(doc)
        freeze_approval_snapshot(doc)
    doc.status = target_state
    append_audit(doc, current, target_state, actor or frappe.session.user)
    return doc


def _validate_plan_scope(doc):
    branch = doc.get("branch")
    company = doc.get("company")
    if not branch or not company:
        frappe.throw(_("Sales Plan branch and company are required"), frappe.ValidationError)
    branch_company = frappe.db.get_value("Branch", branch, "company")
    if not branch_company or branch_company != company:
        frappe.throw(_("Sales Plan branch and company do not match"), frappe.ValidationError)


def validate_plan_items(doc):
    """Validate every mapped line before approval can freeze demand."""
    for row in doc.get("items") or []:
        item_code = row.get("item_code")
        if not item_code:
            frappe.throw(_("Sales Plan item is required"), frappe.ValidationError)
        validate_item_production_configuration(item_code, doc.get("branch"))


def freeze_approval_snapshot(doc):
    """Freeze approved demand and mapping inputs into a deterministic snapshot."""
    if doc.get("approval_snapshot"):
        return doc.approval_snapshot
    payload = {
        "branch": doc.get("branch"),
        "company": doc.get("company"),
        "plan_date": str(doc.get("plan_date")) if doc.get("plan_date") else None,
        "service_period": doc.get("service_period"),
        "items": [snapshot_item(row) for row in (doc.get("items") or [])],
        "insight_snapshot": doc.get("insight_snapshot") or {},
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    doc.approval_snapshot = encoded
    doc.approval_snapshot_hash = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    return encoded


def snapshot_item(row):
    return {key: row.get(key) for key in ("item_code", "qty", "stock_uom", "department", "production_unit", "production_policy", "bom", "bom_revision")}


def append_audit(doc, from_state, to_state, actor):
    audits = doc.get("audit_log") or []
    audits.append({"from_state": from_state, "to_state": to_state, "actor": actor, "branch": doc.get("branch"), "company": doc.get("company")})
    doc.audit_log = audits
