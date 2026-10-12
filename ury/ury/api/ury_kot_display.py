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

    current_time = get_datetime()
    creation_time = kot_doc.creation

    production_time = current_time - creation_time
    production_time_minutes = production_time.total_seconds() / 60
    
    server_time_str = current_time.strftime("%H:%M:%S")
    
    # One write instead of three: `set_value` issues a statement per call, and
    # these three always change together.
    frappe.db.set_value(
        "URY KOT",
        name,
        {
            "start_time_serv": server_time_str,
            "production_time": production_time_minutes,
            "order_status": "Served",
            # Who sent it out. Nothing recorded this before, so a complaint
            # about a plate could not be traced past the branch.
            "served_by": frappe.session.user,
        },
    )


def _assert_kot_access(name):
    """Loads a KOT and checks the caller may act on it from this station.

    Two gates, not one: Frappe's own write permission, and the caller's branch.
    A station should never be able to act on another branch's ticket by
    guessing a KOT name.
    """
    kot_doc = frappe.get_doc("URY KOT", name)
    if not frappe.has_permission("URY KOT", "write", doc=kot_doc):
        frappe.throw(_("Not permitted to modify this KOT"), frappe.PermissionError)

    try:
        session_branch = getBranch()
    except Exception:
        # A system user without a URY User row still administers every branch.
        if frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles():
            session_branch = None
        else:
            raise

    if session_branch and kot_doc.branch and kot_doc.branch != session_branch:
        frappe.throw(_("Not permitted to modify KOTs from other branches"), frappe.PermissionError)

    return kot_doc


@frappe.whitelist(methods=["POST"])
def start_kot_prep(name):
    """Marks a ticket as picked up by the kitchen.

    This is the missing middle state. Until now a ticket went straight from
    "waiting" to "served", so a board with ten tickets could not show which
    ones somebody was already cooking — two cooks would start the same order.

    It writes `start_time_prep`, a field the schema already had and nothing
    ever set; `ury_dashboard.avg_ticket_minutes` reads it, so that metric
    starts producing real numbers as a side effect.

    Idempotent: a second tap keeps the original start time, because the first
    one is when cooking actually began.
    """
    kot_doc = _assert_kot_access(name)

    if kot_doc.start_time_prep:
        return {"name": name, "start_time_prep": str(kot_doc.start_time_prep).split(".")[0]}

    started = get_datetime().strftime("%H:%M:%S")
    frappe.db.set_value(
        "URY KOT",
        name,
        {"start_time_prep": started, "prepared_by": frappe.session.user},
    )
    return {"name": name, "start_time_prep": started, "prepared_by": frappe.session.user}


@frappe.whitelist(methods=["POST"])
def recall_kot(name):
    """Puts a served ticket back on the board.

    Mis-taps happen on a touch screen above a hot line, and without this the
    only recovery was the Desk UI — which nobody in a kitchen has open. The
    ticket returns to "Ready For Prepare" and its serve timings are cleared so
    the production-time metric is not polluted by the mistake.
    """
    kot_doc = _assert_kot_access(name)

    if kot_doc.order_status != "Served":
        frappe.throw(_("Only a served ticket can be recalled"))

    frappe.db.set_value(
        "URY KOT",
        name,
        {"order_status": "Ready For Prepare", "start_time_serv": None, "production_time": None},
    )
    return {"name": name, "order_status": "Ready For Prepare"}


def _item_channel(branch, production):
    """Realtime channel for per-item progress on one station's board."""
    return "kot_item_update_{}_{}".format(branch, production or "")


@frappe.whitelist(methods=["POST"])
def set_kot_item_prepared(name, row, prepared=1):
    """Marks one line of a ticket as plated, or un-marks it.

    This progress used to live in the browser's `localStorage`, keyed by
    `<kot>_<row>_strike`. That meant it was lost on refresh, invisible to a
    second screen in the same kitchen, and impossible to report on — a cook
    could plate nine of ten items and a reload would show none of them done.
    It lives on the row now, and the change is broadcast so every screen
    watching the station updates without a refetch.

    @param name: URY KOT name
    @param row:  the URY KOT Items row name
    @param prepared: 1 to mark plated, 0 to undo
    """
    kot_doc = _assert_kot_access(name)

    # The row must belong to this ticket; otherwise any row name in the system
    # could be flipped by passing an unrelated KOT the caller *can* write.
    if not frappe.db.exists(
        "URY KOT Items", {"name": row, "parent": name, "parenttype": "URY KOT"}
    ):
        frappe.throw(_("That item is not part of this ticket"))

    prepared = frappe.utils.cint(prepared)
    values = {
        "prepared": prepared,
        "prepared_at": get_datetime() if prepared else None,
        "prepared_by": frappe.session.user if prepared else None,
    }
    frappe.db.set_value("URY KOT Items", row, values, update_modified=False)

    payload = {
        "kot": name,
        "row": row,
        "prepared": prepared,
        "prepared_by": values["prepared_by"],
    }
    frappe.publish_realtime(_item_channel(kot_doc.branch, kot_doc.production), payload)
    return payload


@frappe.whitelist(methods=["POST"])
def set_item_availability(item, available, menu=None):
    """The kitchen taking an item off the menu, and putting it back ("86").

    The cook is the one who knows the sea bass has run out, but until now
    only a manager could act on it, from the Desk UI, per menu. By then the
    cashier and the self-ordering kiosk have taken three more orders for it.

    Scoped to the caller's branch: it toggles `disabled` on the matching
    `URY Menu Item` rows of that branch's restaurant menus only, so one
    station cannot empty another branch's menu. Touching the parent menu's
    `modified` is what makes the POS and kiosk pick the change up, since both
    poll it to decide whether to refetch.
    """
    branch = getBranch()
    available = frappe.utils.cint(available)

    if not frappe.has_permission("URY Menu Item", "write"):
        frappe.throw(_("Not permitted to change menu availability"), frappe.PermissionError)

    restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch}, "name")
    if not restaurant:
        frappe.throw(_("No restaurant is configured for Branch {0}").format(branch))

    # Every menu this restaurant can serve: the active one, plus any room- or
    # order-type-specific menus. An item that has run out has run out for all
    # of them, so half-applying this would be worse than not applying it.
    menus = set()
    active_menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
    if active_menu:
        menus.add(active_menu)
    for child in ("Menu for Room", "Order Type Menu"):
        menus.update(
            frappe.get_all(
                child,
                filters={"parent": restaurant, "parenttype": "URY Restaurant"},
                pluck="menu",
            )
            or []
        )
    menus.discard(None)

    if menu:
        # Caller asked for one specific menu; honour it only if it is one of
        # this restaurant's own.
        menus = menus.intersection({menu})
        if not menus:
            frappe.throw(_("That menu does not belong to this branch"))

    if not menus:
        frappe.throw(_("No menu is configured for Branch {0}").format(branch))

    rows = frappe.get_all(
        "URY Menu Item",
        filters={"parent": ["in", list(menus)], "parenttype": "URY Menu", "item": item},
        fields=["name", "parent"],
    )
    if not rows:
        frappe.throw(_("{0} is not on this branch's menu").format(item))

    for row in rows:
        frappe.db.set_value("URY Menu Item", row.name, "disabled", 0 if available else 1)

    # The POS and kiosk decide whether to refetch by comparing the menu's
    # `modified`, so it has to move even though only a child row changed.
    now = frappe.utils.now()
    for menu_name in {row.parent for row in rows}:
        frappe.db.set_value("URY Menu", menu_name, "modified", now, update_modified=False)

    frappe.publish_realtime(
        "menu_availability_{}".format(branch),
        {"item": item, "available": available, "by": frappe.session.user},
    )

    return {
        "item": item,
        "available": available,
        "menus": sorted({row.parent for row in rows}),
    }


@frappe.whitelist()
def unavailable_items():
    """Items currently 86'd on this branch's menus, for the board's panel."""
    branch = getBranch()
    restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch}, "name")
    if not restaurant:
        return []

    menus = set()
    active_menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
    if active_menu:
        menus.add(active_menu)
    for child in ("Menu for Room", "Order Type Menu"):
        menus.update(
            frappe.get_all(
                child,
                filters={"parent": restaurant, "parenttype": "URY Restaurant"},
                pluck="menu",
            )
            or []
        )
    menus.discard(None)
    if not menus:
        return []

    rows = frappe.get_all(
        "URY Menu Item",
        filters={"parent": ["in", list(menus)], "parenttype": "URY Menu", "disabled": 1},
        fields=["item", "item_name"],
    )

    # One entry per item: the same dish disabled on three menus is one dish.
    seen = {}
    for row in rows:
        seen.setdefault(row.item, row.item_name or row.item)
    return [{"item": item, "item_name": name} for item, name in sorted(seen.items())]


@frappe.whitelist()
def kitchen_stats():
    """Shift numbers for the board header.

    Served count and average production time are computed in SQL rather than
    by walking documents, because this is polled by every station screen.
    The window is the current day, which is the unit a kitchen thinks in.
    """
    branch = getBranch()
    start = frappe.utils.get_datetime(frappe.utils.today())

    row = frappe.db.sql(
        """
        SELECT
            COUNT(*) AS served_count,
            AVG(CAST(production_time AS DECIMAL(10, 2))) AS avg_minutes
        FROM `tabURY KOT`
        WHERE branch = %(branch)s
          AND docstatus = 1
          AND order_status = 'Served'
          AND creation >= %(start)s
          AND production_time IS NOT NULL
          AND production_time != ''
        """,
        {"branch": branch, "start": start},
        as_dict=True,
    )

    served = row[0] if row else {}
    avg_minutes = served.get("avg_minutes")

    return {
        "served_today": frappe.utils.cint(served.get("served_count")),
        "avg_minutes": round(float(avg_minutes), 1) if avg_minutes else None,
    }


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

KOT_FIELDS = [
    "name", "invoice", "restaurant_table", "customer_name", "original_kot",
    "date", "time", "type", "order_status", "production", "start_time_prep",
    "start_time_serv", "prepared_by", "served_by", "naming_series",
    "pos_profile", "comments", "branch", "verified", "order_no", "verified_by",
    "customer_group", "table_takeaway", "user", "aggregator_id",
    "is_aggregator", "production_time", "creation", "modified", "owner",
    "docstatus",
]

KOT_ITEM_FIELDS = [
    "name", "parent", "item", "item_name", "quantity", "cancelled_qty",
    "comments", "course", "serve_priority", "indicate_course", "prepared",
    "prepared_at", "prepared_by", "idx",
]


def _fetch_kots(filters, branch):
    """Loads the board's tickets in a fixed number of queries.

    This used to be `frappe.get_doc` inside a loop — one SELECT for the parent
    and one for the child table per ticket — plus a `get_doc` for the
    production unit and a `get_value` for the invoice's order type. Forty
    tickets across four station screens meant hundreds of queries a minute for
    data that is identical on every screen. Now it is four queries total,
    regardless of how many tickets are on the board.

    The returned dicts keep the same keys the old `frappe.as_json(doc)` payload
    had for every field the display reads, so the clients need no changes.
    """
    kots = frappe.get_list(
        "URY KOT", fields=KOT_FIELDS, filters=filters, order_by="creation desc"
    )
    if not kots:
        return []

    names = [k["name"] for k in kots]

    # 1. Child rows for every ticket at once, grouped back by parent.
    items_by_parent = {}
    for row in frappe.get_all(
        "URY KOT Items",
        filters={"parent": ["in", names], "parenttype": "URY KOT"},
        fields=KOT_ITEM_FIELDS,
        order_by="parent asc, idx asc",
    ):
        items_by_parent.setdefault(row.parent, []).append(row)

    # 2. Order-type filtering, when any production unit on the board asks for
    #    it. Both sides of the comparison are gathered in one query each.
    productions = {k["production"] for k in kots if k.get("production")}
    order_type_filters = {}
    if productions:
        for unit in frappe.get_all(
            "URY Production Unit",
            filters={"name": ["in", list(productions)]},
            fields=["name", "enable_order_type_wise_display_on_mosaic"],
        ):
            order_type_filters[unit.name] = (
                [] if unit.enable_order_type_wise_display_on_mosaic else None
            )

        restricted = [n for n, v in order_type_filters.items() if v is not None]
        if restricted:
            for row in frappe.get_all(
                "KDS Order Type",
                filters={"parent": ["in", restricted], "parenttype": "URY Production Unit"},
                fields=["parent", "order_type"],
            ):
                order_type_filters[row.parent].append(row.order_type)

    invoice_order_types = {}
    if any(v is not None for v in order_type_filters.values()):
        invoices = [k["invoice"] for k in kots if k.get("invoice")]
        if invoices:
            invoice_order_types = {
                row.name: row.order_type
                for row in frappe.get_all(
                    "POS Invoice",
                    filters={"name": ["in", invoices]},
                    fields=["name", "order_type"],
                )
            }

    # 3. Merged-table labels, which the board reads off the invoice.
    merged = {}
    invoices = [k["invoice"] for k in kots if k.get("invoice")]
    if invoices:
        merged = {
            row.name: row.custom_merged_tables
            for row in frappe.get_all(
                "POS Invoice",
                filters={"name": ["in", invoices]},
                fields=["name", "custom_merged_tables"],
            )
        }

    result = []
    for kot in kots:
        allowed = order_type_filters.get(kot.get("production"))
        if allowed is not None:
            if invoice_order_types.get(kot.get("invoice")) not in allowed:
                continue

        kot["kot_items"] = items_by_parent.get(kot["name"], [])
        kot["custom_merged_tables"] = merged.get(kot.get("invoice"))
        result.append(kot)

    # `as_json` normalises dates, times and Decimals the way the clients
    # already expect them; doing it once for the whole list is cheap.
    return json.loads(frappe.as_json(result))


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
    KOT = _fetch_kots(
        {
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
        branch,
    )
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
    KOT = _fetch_kots(
        {
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
        branch,
    )
    return {
        "KOT": KOT,
        "Branch": branch,
        "kot_alert_time": kot_alert_time,
        "audio_alert": audio_alert,
        "daily_order_number":daily_order_number
    }



def _clock(value):
    """Render a Time/Datetime/timedelta as a plain string, without microseconds."""
    if value in (None, ""):
        return None
    text = str(value)
    return text.split(".")[0]


@frappe.whitelist()
def get_kot_details(name):
    """
    Everything the kitchen might want about one ticket, for the detail view.

    The board payload is already the full KOT document, so the only thing
    worth another round trip is the order context that lives on the POS
    Invoice — how many people are eating, whether it is dine-in or delivery,
    which waiter owns it. That is fetched here rather than on every board
    refresh, because it is only ever needed for the one ticket being opened.

    Scoped to the caller's branch: a station should not be able to read
    another branch's orders by guessing a KOT name.
    """
    kot = frappe.get_doc("URY KOT", name)

    branch = getBranch()
    if kot.branch and branch and kot.branch != branch:
        frappe.throw(_("Not permitted to view this ticket"), frappe.PermissionError)

    invoice = {}
    if kot.invoice and frappe.db.exists("POS Invoice", kot.invoice):
        invoice = (
            frappe.db.get_value(
                "POS Invoice",
                kot.invoice,
                [
                    "name",
                    "customer",
                    "order_type",
                    "no_of_pax",
                    "waiter",
                    "mobile_number",
                    "grand_total",
                    "currency",
                    "posting_date",
                    "posting_time",
                    "restaurant_table",
                    "custom_restaurant_room",
                    "custom_merged_tables",
                    "status",
                    "docstatus",
                ],
                as_dict=True,
            )
            or {}
        )

    room = invoice.get("custom_restaurant_room")
    if not room and kot.restaurant_table:
        room = frappe.db.get_value("URY Table", kot.restaurant_table, "restaurant_room")

    seats = None
    if kot.restaurant_table:
        seats = frappe.db.get_value("URY Table", kot.restaurant_table, "no_of_seats")

    return {
        "kot": json.loads(frappe.as_json(kot)),
        "invoice": invoice,
        "room": room,
        "seats": seats,
        # Named explicitly so the client does not have to know which of the
        # three timing fields on the KOT means what. Values are normalised to
        # plain strings without microseconds: Time fields come back as
        # timedelta, which serialises inconsistently and is never what a
        # kitchen screen wants to render.
        "timeline": {
            "placed": _clock(f"{kot.date} {kot.time}") if kot.date and kot.time else None,
            "prep_started": _clock(kot.start_time_prep),
            "serving_started": _clock(kot.start_time_serv),
            "production_time": _clock(kot.production_time),
        },
    }
