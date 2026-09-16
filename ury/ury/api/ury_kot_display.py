import json
import frappe
from ury.ury_pos.api import getBranch
from frappe.utils import get_datetime
from frappe import _

# Function to set order status in a KOT document
@frappe.whitelist(methods=["POST"])
def serve_kot(name, time=None):
    if frappe.request and frappe.request.method != "POST":
        frappe.throw(_("POST requests only"), frappe.PermissionError)

    kot_doc = frappe.get_doc("URY KOT", name)
    if not frappe.has_permission("URY KOT", "write", doc=kot_doc):
        frappe.throw(_("Not permitted to serve this KOT"), frappe.PermissionError)

    if kot_doc.type in ("Cancelled", "Partially cancelled"):
        frappe.throw(_("KOT has been cancelled and cannot be served"), frappe.ValidationError)

    current_time = get_datetime()
    creation_time = kot_doc.creation

    production_time = current_time - creation_time
    production_time_minutes = production_time.total_seconds() / 60
    
    server_time_str = current_time.strftime("%H:%M:%S")
    
    frappe.db.set_value("URY KOT", name, "start_time_serv", server_time_str)
    frappe.db.set_value("URY KOT", name, "production_time", production_time_minutes)
    frappe.db.set_value("URY KOT", name, "order_status", "Served")


# Function to mark it as verified in a cancel type KOT.
# The verifying user is derived from the session and must hold a manager-level
# role, so confirmation cannot be self-attributed or forged by the caller.
@frappe.whitelist()
def confirm_cancel_kot(name):
    manager_roles = {"URY Manager", "URY Admin", "System Manager"}
    if not manager_roles.intersection(frappe.get_roles()) and frappe.session.user != "Administrator":
        frappe.throw(
            "Only a manager can confirm a cancelled KOT.",
            frappe.PermissionError,
        )

    # Fetch the KOT document
    try:
        kot_doc = frappe.get_doc("URY KOT", name)
    except frappe.DoesNotExistError:
        frappe.throw(f"URY KOT {name} not found.", frappe.DoesNotExistError)

    # Document-level permission check
    if not frappe.has_permission("URY KOT", "write", doc=kot_doc):
        frappe.throw(
            "You do not have permission to modify this KOT.",
            frappe.PermissionError
        )

    # Branch-level permission check
    try:
        session_branch = getBranch()
    except Exception:
        if frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles():
            session_branch = None
        else:
            raise

    if session_branch and kot_doc.branch != session_branch:
        frappe.throw(
            "You do not have permission to modify KOTs from other branches.",
            frappe.PermissionError
        )

    frappe.db.set_value("URY KOT", name, "verified", 1)
    frappe.db.set_value("URY KOT", name, "verified_by", frappe.session.user)


@frappe.whitelist(allow_guest=True)
def get_site_name():
    return {"site_name": frappe.local.site}

def build_dashboard_summary(kot_list):
    summary = {}

    for kot in kot_list:
        production = kot.get("production")

        if not production:
            continue

        if production not in summary:
            summary[production] = {
                "name": production,
                "active_orders": 0,
                "pending_orders": 0,
                "ready_orders": 0,
                "orders": []
            }

        summary[production]["active_orders"] += 1

        if kot.get("order_status") == "Ready For Prepare":
            summary[production]["ready_orders"] += 1
        else:
            summary[production]["pending_orders"] += 1

        summary[production]["orders"].append(kot)

    return list(summary.values())

def _get_cancel_confirmed_original_kots(branch):
    """Names of KOTs that a verified cancel-KOT references via `original_kot`.

    `original_kot` is a comma-separated string of KOT names stamped onto the
    cancel-KOT record at creation time (see `ury_kot_generate.py`), not a
    link field, so it has to be matched with LIKE and split in Python rather
    than joined in the query.
    """
    cancel_rows = frappe.get_all(
        "URY KOT",
        fields=["original_kot"],
        filters={
            "branch": branch,
            "type": ["in", ["Cancelled", "Partially cancelled"]],
            "verified": 1,
            "docstatus": 1,
        },
    )
    original_names = set()
    for row in cancel_rows:
        if not row.get("original_kot"):
            continue
        original_names.update(name.strip() for name in row.get("original_kot").split(",") if name.strip())
    return original_names


@frappe.whitelist()
def kot_list():
    today = frappe.utils.now()
    branch = getBranch()
    kot_alert_time = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_kot_warning_time"
    )
    daily_order_number = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_reset_order_number_daily"
    )
    three_hours_ago = frappe.utils.add_to_date(today, hours=-3)
    audio_alert = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_kot_alert"
    )
    kotList = frappe.get_list(
        "URY KOT",
        fields=["name"],
        filters={
            "order_status": "Ready For Prepare",
            "branch": branch,
            "type": [
                "in",
                [
                    "New Order",
                    "Order Modified",
                    "Duplicate",
                    "Cancelled",
                    "Partially cancelled",
                ],
            ],
            "docstatus": 1,
            "verified": 0,
            "creation": (">=", three_hours_ago),
        },
        order_by="creation desc",
    )
    cancelled_original_kots = _get_cancel_confirmed_original_kots(branch)
    production_filters = {}
    KOT = []
    for kot in kotList:
        if kot.name in cancelled_original_kots:
            continue

        kotdoc = frappe.get_doc("URY KOT", kot.name)

        if kotdoc.production:
            if kotdoc.production not in production_filters:
                prod_doc = frappe.get_doc("URY Production Unit", kotdoc.production)
                if prod_doc.enable_order_type_wise_display_on_mosaic:
                    production_filters[kotdoc.production] = [row.order_type for row in prod_doc.get("order_type", [])]
                else:
                    production_filters[kotdoc.production] = None

            allowed_order_types = production_filters[kotdoc.production]
            if allowed_order_types is not None:
                invoice_order_type = frappe.db.get_value("POS Invoice", kotdoc.invoice, "order_type")
                if invoice_order_type not in allowed_order_types:
                    continue

        kotjson = json.loads(frappe.as_json(kotdoc))
        KOT.append(kotjson)
    dashboard = build_dashboard_summary(KOT)
    return {
        "KOT": KOT,
        "Dashboard": dashboard,
        "Branch": branch,
        "kot_alert_time": kot_alert_time,
        "audio_alert": audio_alert,
        "daily_order_number":daily_order_number
    }

@frappe.whitelist()
def served_kot_list():
    today = frappe.utils.now()
    branch = getBranch()
    kot_alert_time = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_kot_warning_time"
    )
    daily_order_number = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_reset_order_number_daily"
    )
    three_hours_ago = frappe.utils.add_to_date(today, hours=-3)
    audio_alert = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_kot_alert"
    )
    kotList = frappe.get_list(
        "URY KOT",
        fields=["name"],
        filters={
            "order_status": "Served",
            "branch": branch,
            "type": [
                "in",
                [
                    "New Order",
                    "Order Modified",
                    "Duplicate",
                    "Cancelled",
                    "Partially cancelled",
                ],
            ],
            "docstatus": 1,
            "verified": 0,
            "creation": (">=", three_hours_ago),
        },
        order_by="creation desc",
    )
    production_filters = {}

    print(kotList,"kotList..................")
    KOT = []
    for kot in kotList:
        kotdoc = frappe.get_doc("URY KOT", kot.name)
        print(kot.name,".................kotdoc")
        
        if kotdoc.production:
            if kotdoc.production not in production_filters:
                prod_doc = frappe.get_doc("URY Production Unit", kotdoc.production)
                if prod_doc.enable_order_type_wise_display_on_mosaic:
                    production_filters[kotdoc.production] = [row.order_type for row in prod_doc.get("order_type", [])]
                else:
                    production_filters[kotdoc.production] = None
            
            allowed_order_types = production_filters[kotdoc.production]
            if allowed_order_types is not None:
                invoice_order_type = frappe.db.get_value("POS Invoice", kotdoc.invoice, "order_type")
                if invoice_order_type not in allowed_order_types:
                    continue

        invoice=frappe.db.get_value("URY KOT",kot.name,"invoice")
        print(invoice,".....................invoice")
        kotjson = json.loads(frappe.as_json(kotdoc))
        KOT.append(kotjson)
    return {
        "KOT": KOT,
        "Branch": branch,
        "kot_alert_time": kot_alert_time,
        "audio_alert": audio_alert,
        "daily_order_number":daily_order_number
    }

