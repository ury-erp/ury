# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Customer-safe ordering API (QR web / kiosk / table tablet).
#
# This module is the trust boundary between anonymous customers/devices and
# the existing staff-facing POS domain. Every whitelisted function here is
# `allow_guest=True` and must derive branch/table/profile/permission purely
# from a server-issued, verified token (`session` or a QR `token`) — never
# from client-supplied branch/table/profile values.
#
# Internally it reuses the Phase 1 domain extractions rather than
# reimplementing menu resolution, pricing, or invoice lookup:
#   - resolve_restaurant_menu()        (ury/ury_pos/api.py)
#   - price_items_for_invoice()        (ury/ury/doctype/ury_order/ury_order.py)
#   - _resolve_or_create_pos_invoice() (ury/ury/doctype/ury_order/ury_order.py)
#   - kot_execute()                    (ury/ury/api/ury_kot_generate.py)
#
# Privileged internal reads/writes (loading/saving a POS Invoice, creating a
# service request) run under a brief `frappe.set_user("Administrator")`
# elevation *after* the caller's session/table token has already been
# verified — the token check is the real authorization boundary, not the
# Frappe user session. Elevation is always narrow and wrapped in try/finally.

import base64
import hashlib
import hmac
import json

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime

from ury.ury_pos.api import resolve_restaurant_menu
from ury.ury.doctype.ury_order.ury_order import (
    _resolve_or_create_pos_invoice,
    price_items_for_invoice,
)
from ury.ury.api.ury_kot_generate import kot_execute

SESSION_TOKEN_BYTES_HASH_LEN = 64  # frappe.generate_hash(length=..)
MAX_ITEMS_PER_REQUEST = 50
MAX_COMMENT_LEN = 200


# ---------------------------------------------------------------------------
# Elevation helper
# ---------------------------------------------------------------------------

class _elevated:
    """Context manager: run a narrow block as Administrator, then restore
    the caller's original (Guest) user. Never widen what happens inside."""

    def __enter__(self):
        self._previous_user = frappe.session.user
        frappe.set_user("Administrator")
        return self

    def __exit__(self, exc_type, exc, tb):
        frappe.set_user(self._previous_user)
        return False


def _ensure_admin_branch_mapping(branch):
    """`getBranch()` (ury/ury_pos/api.py) — used deep inside the shared KOT
    pipeline (`create_kot_doc`) that `kot_execute()` calls — resolves branch
    from a `URY User` child-table row on `Branch` matching
    `frappe.session.user`. Under `_elevated()` that user is "Administrator",
    which has no such row by default, so KOT creation for a self-ordered
    item fails with "User is not Associated with any Branch" even though
    the invoice itself saves fine (kot_execute's caller already tolerates
    KOT failure without surfacing it to the customer, which is exactly why
    this was silent instead of loud — caught only by an actual end-to-end
    order placement, not by the mocked unit tests).

    Idempotently register Administrator against `branch` so `getBranch()`
    resolves during elevation, without touching the shared KOT/getBranch
    code itself. Administrator is used (not a new technical user) because
    kot_execute()/create_kot_doc() also perform frappe.has_permission()
    checks that a fresh no-role user would fail.
    """
    if not branch:
        return
    already_mapped = frappe.db.exists("URY User", {"parent": branch, "parenttype": "Branch", "user": "Administrator"})
    if already_mapped:
        return
    branch_doc = frappe.get_doc("Branch", branch)
    branch_doc.append("user", {"user": "Administrator"})
    branch_doc.save(ignore_permissions=True)


# ---------------------------------------------------------------------------
# Stateless QR token (table / pickup) — signed, not stored per-table
# ---------------------------------------------------------------------------

def _get_profile_secret(profile_name):
    secret = frappe.db.get_value("URY Self Ordering Profile", profile_name, "qr_signing_secret")
    if not secret:
        frappe.throw(_("Self ordering is not configured for this restaurant"), frappe.ValidationError)
    return secret


def _sign(payload, secret):
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


@frappe.whitelist()
def generate_qr_token(profile, table=None):
    """Staff-only: mint an opaque QR token for a table (or a pickup token
    when table is None) belonging to `profile`. Called from the desk / a
    future QR-management UI — never called by customers."""

    if not frappe.has_permission("URY Self Ordering Profile", "write", frappe.get_doc("URY Self Ordering Profile", profile)):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    secret = _get_profile_secret(profile)
    payload = f"{profile}|{table or 'PICKUP'}"
    signature = _sign(payload, secret)
    raw = f"{payload}|{signature}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def _verify_qr_token(token):
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
        profile, table, signature = raw.rsplit("|", 2)
    except Exception:
        frappe.throw(_("Invalid ordering link"), frappe.PermissionError)

    secret = _get_profile_secret(profile)
    expected = _sign(f"{profile}|{table}", secret)
    if not hmac.compare_digest(expected, signature):
        frappe.throw(_("Invalid ordering link"), frappe.PermissionError)

    profile_doc = frappe.get_doc("URY Self Ordering Profile", profile)
    if not profile_doc.enabled:
        frappe.throw(_("Ordering is currently unavailable for this restaurant"), frappe.ValidationError)

    if table == "PICKUP":
        if not profile_doc.enable_qr_pickup_ordering:
            frappe.throw(_("Pickup ordering is not enabled"), frappe.ValidationError)
        return profile_doc, None, "QR Pickup"

    if not profile_doc.enable_qr_table_ordering:
        frappe.throw(_("Table ordering is not enabled"), frappe.ValidationError)
    if not frappe.db.exists("URY Table", table):
        frappe.throw(_("Invalid table"), frappe.ValidationError)
    return profile_doc, table, "QR Table"


# ---------------------------------------------------------------------------
# Device authentication (kiosk / table tablet)
# ---------------------------------------------------------------------------

def _hash_credential(raw_credential):
    return hashlib.sha256(raw_credential.encode()).hexdigest()


@frappe.whitelist()
def enroll_device(device):
    """Staff-only: (re)issue a device credential for a provisioned
    URY Ordering Device. The raw credential is shown once and must be
    stored securely on the device; only its hash is persisted."""

    doc = frappe.get_doc("URY Ordering Device", device)
    if not frappe.has_permission("URY Ordering Device", "write", doc):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    raw_credential = frappe.generate_hash(length=40)
    with _elevated():
        frappe.db.set_value("URY Ordering Device", device, "credential_hash", _hash_credential(raw_credential))
    return {"device_id": doc.device_id, "credential": raw_credential}


def _resolve_device(device_id, credential):
    credential_hash = _hash_credential(credential)
    device_name = frappe.db.get_value(
        "URY Ordering Device",
        {"device_id": device_id, "credential_hash": credential_hash, "enabled": 1},
        "name",
    )
    if not device_name:
        frappe.throw(_("Device not recognized"), frappe.PermissionError)

    device = frappe.get_doc("URY Ordering Device", device_name)
    profile = frappe.get_doc("URY Self Ordering Profile", device.ordering_profile)
    if not profile.enabled or not profile.enable_kiosk_ordering:
        frappe.throw(_("Kiosk ordering is currently unavailable"), frappe.ValidationError)

    table = device.fixed_table if device.table_mode == "Fixed" else None
    source = "Table Tablet" if device.device_type == "Table Tablet" else "Kiosk"

    with _elevated():
        frappe.db.set_value("URY Ordering Device", device.name, "last_seen", now_datetime())

    return profile, table, source, device.name


# ---------------------------------------------------------------------------
# Ordering session lifecycle
# ---------------------------------------------------------------------------

def _open_session(profile, source, table, device=None):
    raw_session_token = frappe.generate_hash(length=SESSION_TOKEN_BYTES_HASH_LEN)
    token_hash = hashlib.sha256(raw_session_token.encode()).hexdigest()
    timeout_minutes = profile.session_idle_timeout_minutes or 30

    with _elevated():
        session = frappe.get_doc({
            "doctype": "URY Ordering Session",
            "ordering_profile": profile.name,
            "source": source,
            "device": device,
            "table": table,
            "token_hash": token_hash,
            "status": "Active",
            "opened_at": now_datetime(),
            "expires_at": add_to_date(now_datetime(), minutes=timeout_minutes),
            "last_activity": now_datetime(),
        })
        session.insert(ignore_permissions=True)

    return raw_session_token, session


def _resolve_session(session_token):
    if not session_token:
        frappe.throw(_("Missing ordering session"), frappe.PermissionError)

    token_hash = hashlib.sha256(session_token.encode()).hexdigest()
    session_name = frappe.db.get_value(
        "URY Ordering Session",
        {"token_hash": token_hash, "status": "Active"},
        "name",
    )
    if not session_name:
        frappe.throw(_("Ordering session expired or invalid. Please rescan the QR code."), frappe.PermissionError)

    with _elevated():
        session = frappe.get_doc("URY Ordering Session", session_name)
        if session.expires_at and session.expires_at < now_datetime():
            session.status = "Expired"
            session.save(ignore_permissions=True)
            frappe.throw(_("Ordering session expired. Please rescan the QR code."), frappe.PermissionError)

        session.last_activity = now_datetime()
        session.expires_at = add_to_date(
            now_datetime(),
            minutes=frappe.db.get_value(
                "URY Self Ordering Profile", session.ordering_profile, "session_idle_timeout_minutes"
            ) or 30,
        )
        session.save(ignore_permissions=True)

    return session


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

@frappe.whitelist(allow_guest=True)
def get_ordering_context(token=None, device_id=None, device_credential=None):
    """Entry point for every customer-facing surface. Resolves a QR token
    or a device credential into a fresh ordering session and returns only
    customer-safe channel configuration — never raw branch/table names the
    client didn't already have a right to see."""

    if token:
        profile, table, source = _verify_qr_token(token)
        device_name = None
    elif device_id and device_credential:
        profile, table, source, device_name = _resolve_device(device_id, device_credential)
    else:
        frappe.throw(_("Missing ordering token or device credentials"), frappe.PermissionError)

    raw_session_token, session = _open_session(profile, source, table, device_name)

    return {
        "session": raw_session_token,
        "source": source,
        "restaurant": profile.restaurant,
        "table": table,
        "capabilities": {
            "product_detail_enabled": bool(profile.enable_product_detail_page),
            "show_item_images": bool(profile.show_item_images),
            "show_item_descriptions": bool(profile.show_item_descriptions),
            "item_notes_enabled": bool(profile.enable_item_notes),
            "request_bill_enabled": bool(profile.enable_request_bill) and bool(table),
            "customer_payment_enabled": bool(profile.enable_customer_payment),
            "payment_link_enabled": bool(profile.enable_payment_link),
            "pay_at_counter_enabled": bool(profile.enable_pay_at_counter),
            "add_to_running_table_enabled": bool(profile.allow_add_to_running_table),
        },
    }


# ---------------------------------------------------------------------------
# Menu / product (customer-safe DTOs)
# ---------------------------------------------------------------------------

@frappe.whitelist(allow_guest=True)
def get_customer_menu(session):
    session = _resolve_session(session)
    order_type = "Dine In" if session.table else "Take Away"

    with _elevated():
        menu = resolve_restaurant_menu(
            branch=frappe.db.get_value("URY Self Ordering Profile", session.ordering_profile, "branch"),
            room=None,
            order_type=order_type,
            cashier=False,
        )

    # resolve_restaurant_menu() already returns a sanitized item list
    # (item/item_name/rate/course/image) — no raw Item doc fields leak here.
    return menu


@frappe.whitelist(allow_guest=True)
def get_customer_product(session, item_code):
    session = _resolve_session(session)
    profile = frappe.get_doc("URY Self Ordering Profile", session.ordering_profile)

    with _elevated():
        item = frappe.db.get_value(
            "Item", item_code,
            ["item_code", "item_name", "description", "image"],
            as_dict=True,
        )
        if not item:
            frappe.throw(_("Item not found"), frappe.DoesNotExistError)

        # Both `POS Item Variants` and `Item Add On` are child-table doctypes
        # whose only field is a Link to another Item (the variant/add-on is
        # itself a priced Item) — see ury/ury/doctype/{pos_item_variants,
        # item_add_on}/*.json. Resolve each linked item's own price rather
        # than trusting any client-supplied amount.
        variants = _linked_item_options("POS Item Variants", item_code, invoice_price_list=None)
        addons = _linked_item_options("Item Add On", item_code, invoice_price_list=None)

    return {
        "item_code": item.item_code,
        "item_name": item.item_name,
        "description": item.description if profile.show_item_descriptions else None,
        "image": item.image if profile.show_item_images else None,
        "variants": variants,
        "addons": addons,
    }


def _linked_item_options(child_doctype, parent_item_code, invoice_price_list):
    if not frappe.db.exists("DocType", child_doctype):
        return []

    rows = frappe.get_all(
        child_doctype,
        filters={"parenttype": "Item", "parent": parent_item_code},
        fields=["item"],
    )

    options = []
    for row in rows:
        linked = frappe.db.get_value("Item", row.item, ["item_code", "item_name", "image"], as_dict=True)
        if not linked:
            continue
        price = None
        if invoice_price_list:
            price = frappe.db.get_value(
                "Item Price", {"item_code": linked.item_code, "price_list": invoice_price_list}, "price_list_rate"
            )
        options.append({
            "item_code": linked.item_code,
            "item_name": linked.item_name,
            "image": linked.image,
            "rate": price,
        })
    return options


# ---------------------------------------------------------------------------
# Current order / append-only mutation
# ---------------------------------------------------------------------------

def _sanitize_invoice_for_customer(invoice):
    return {
        "invoice": invoice.name,
        "table": invoice.restaurant_table,
        "order_type": invoice.order_type,
        "items": [
            {
                "item_code": row.item_code,
                "item_name": row.item_name,
                "qty": row.qty,
                "comment": row.comment,
                "rate": row.rate,
                "amount": row.amount,
            }
            for row in invoice.items
        ],
        "grand_total": invoice.grand_total,
        "billed": bool(invoice.invoice_printed),
    }


@frappe.whitelist(allow_guest=True)
def get_customer_order(session):
    session = _resolve_session(session)
    if not session.invoice:
        return {"invoice": None, "items": [], "grand_total": 0, "billed": False}

    with _elevated():
        invoice = frappe.get_doc("POS Invoice", session.invoice)

    return _sanitize_invoice_for_customer(invoice)


@frappe.whitelist(allow_guest=True)
def add_customer_items(session, items):
    """Append-only customer order mutation. `items` is a list of
    {"item": <item_code>, "qty": <number>, "comment": <optional str>} —
    same shape sync_order()/price_items_for_invoice() already expect.

    Never trusts client-supplied price/tax/discount/warehouse/cost-center —
    price_items_for_invoice() re-derives price server-side from Item Price,
    exactly as it does for staff orders.
    """
    session = _resolve_session(session)
    profile = frappe.get_doc("URY Self Ordering Profile", session.ordering_profile)

    if not profile.enabled:
        frappe.throw(_("Ordering is currently unavailable"), frappe.ValidationError)
    if session.invoice and not profile.allow_add_to_running_table:
        frappe.throw(_("Adding further items to this order is not allowed"), frappe.ValidationError)

    # session.invoice is only set after THIS session has placed an order —
    # it's None on a session's very first call even when the table already
    # has an open invoice from staff (POS/Captain) or an earlier customer
    # session. Without this check, allow_add_to_running_table=False could
    # be silently bypassed by a customer's first request attaching to (and
    # mutating pos_profile/order_source on) an order they didn't start.
    if session.table and not session.invoice and not profile.allow_add_to_running_table:
        with _elevated():
            existing_invoice = frappe.get_all(
                "POS Invoice",
                filters={"docstatus": 0, "invoice_printed": 0},
                or_filters={
                    "restaurant_table": session.table,
                    "custom_merged_tables": ["like", f"%{session.table}%"],
                },
                limit=1,
            )
        if existing_invoice:
            frappe.throw(
                _("This table already has an order in progress. Please ask staff for assistance."),
                frappe.ValidationError,
            )

    if isinstance(items, str):
        items = json.loads(items)
    if not items or not isinstance(items, list):
        frappe.throw(_("No items provided"), frappe.ValidationError)
    if len(items) > MAX_ITEMS_PER_REQUEST:
        frappe.throw(_("Too many items in a single request"), frappe.ValidationError)

    with _elevated():
        menu_names = {
            m.get("item")
            for m in resolve_restaurant_menu(
                branch=profile.branch,
                room=None,
                order_type="Dine In" if session.table else "Take Away",
                cashier=False,
            )["items"]
        }

    clean_items = []
    for raw in items:
        item_code = raw.get("item")
        qty = raw.get("qty")
        comment = (raw.get("comment") or "")[:MAX_COMMENT_LEN]

        if not item_code or item_code not in menu_names:
            frappe.throw(_("Item {0} is not available on this menu").format(item_code), frappe.ValidationError)
        try:
            qty = float(qty)
        except (TypeError, ValueError):
            qty = 0
        if qty <= 0:
            frappe.throw(_("Invalid quantity for item {0}").format(item_code), frappe.ValidationError)

        clean_items.append({"item": item_code, "item_name": item_code, "qty": qty, "comment": comment})

    order_type = "Dine In" if session.table else "Take Away"

    with _elevated():
        _ensure_admin_branch_mapping(profile.branch)

        invoice, invoice_name = _resolve_or_create_pos_invoice(
            table=session.table, invoiceNo=session.invoice, order_type=order_type, is_payment=None,
            check_permission=False, override_branch=profile.branch,
        )

        if not invoice.customer:
            if not profile.default_customer:
                frappe.throw(_("Self ordering profile has no default customer configured"), frappe.ValidationError)
            invoice.customer = profile.default_customer

        invoice.pos_profile = profile.pos_profile
        invoice.custom_order_source = session.source
        invoice.custom_ordering_session = session.name
        if session.device:
            invoice.custom_ordering_device = session.device

        past_item = [
            {"item_code": row.item_code, "item_name": row.item_name, "qty": row.qty, "comments": ""}
            for row in invoice.items
        ]

        menu = frappe.db.get_value("URY Menu", {"branch": invoice.branch}, "name")
        priced_items = price_items_for_invoice(
            clean_items, invoice.selling_price_list, profile.pos_profile, invoice.branch, menu,
        )
        for item_dict in priced_items:
            invoice.append("items", item_dict)

        if invoice.invoice_created == 0:
            posprofile = frappe.get_doc("POS Profile", profile.pos_profile)
            default_mode = posprofile.payments[0].mode_of_payment if posprofile.payments else None
            if not default_mode:
                frappe.throw(_("POS Profile has no mode of payment configured"), frappe.ValidationError)
            invoice.append("payments", dict(mode_of_payment=default_mode, amount=invoice.grand_total))
            invoice.invoice_created = 1

        try:
            invoice.save(ignore_permissions=True)
        except Exception as e:
            frappe.throw(_("Error while placing order: {0}").format(e))

        if not session.invoice:
            session.invoice = invoice.name
            session.save(ignore_permissions=True)

        if invoice.invoice_printed == 0 and invoice.restaurant_table:
            frappe.db.set_value(
                "URY Table", invoice.restaurant_table,
                {"occupied": 1, "latest_invoice_time": invoice.creation},
            )

        try:
            kot_execute(invoice.name, invoice.customer, invoice.restaurant_table, clean_items, past_item, None)
        except Exception as e:
            frappe.log_error(f"Self-order KOT creation failed: {e}", "KOT Error")

    return _sanitize_invoice_for_customer(invoice)


# ---------------------------------------------------------------------------
# Request bill
# ---------------------------------------------------------------------------

@frappe.whitelist(allow_guest=True)
def request_bill(session):
    session = _resolve_session(session)
    profile = frappe.get_doc("URY Self Ordering Profile", session.ordering_profile)

    if not profile.enable_request_bill:
        frappe.throw(_("Requesting the bill is not enabled"), frappe.ValidationError)
    if not session.table or not session.invoice:
        frappe.throw(_("No active order for this table"), frappe.ValidationError)

    with _elevated():
        existing = frappe.db.exists(
            "URY Service Request",
            {"table": session.table, "invoice": session.invoice, "request_type": "Bill", "status": ["!=", "Resolved"]},
        )
        if existing:
            return {"status": "Already Requested", "request": existing}

        req = frappe.get_doc({
            "doctype": "URY Service Request",
            "request_type": "Bill",
            "table": session.table,
            "invoice": session.invoice,
            "session": session.name,
            "status": "Open",
            "requested_at": now_datetime(),
        })
        req.insert(ignore_permissions=True)

    return {"status": "Requested", "request": req.name}


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

@frappe.whitelist(allow_guest=True)
def get_order_status(session):
    session = _resolve_session(session)
    result = {"session_status": session.status, "invoice": session.invoice}

    if session.invoice:
        with _elevated():
            invoice_fields = frappe.db.get_value(
                "POS Invoice", session.invoice, ["docstatus", "invoice_printed"], as_dict=True,
            )
            open_requests = frappe.get_all(
                "URY Service Request",
                filters={"invoice": session.invoice, "status": ["!=", "Resolved"]},
                fields=["name", "request_type", "status"],
            )
        result["billed"] = bool(invoice_fields and invoice_fields.invoice_printed)
        result["submitted"] = bool(invoice_fields and invoice_fields.docstatus == 1)
        result["open_requests"] = open_requests

    return result
