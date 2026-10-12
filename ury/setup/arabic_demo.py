# -*- coding: utf-8 -*-
"""
Arabic demo data for Smart Restro.

Builds a realistic Iraqi restaurant on top of whatever the site already has —
menu courses, an Arabic menu, dining rooms and tables, waiters and a month and
a half of POS invoices — so the POS, the dashboard and the Smart Restro
workspace charts all have something meaningful to show.

Run from the site console:

    bench --site <site> console
    >>> from ury.setup.arabic_demo import create_arabic_demo
    >>> create_arabic_demo()

and to remove everything it created:

    >>> from ury.setup.arabic_demo import clear_arabic_demo
    >>> clear_arabic_demo()

Everything is idempotent: re-running updates rather than duplicating. Records
are recognised on the way back out by the names listed below, so the cleanup
never touches data that was already on the site.
"""

import random
from datetime import timedelta

import frappe
from frappe.utils import add_days, getdate, nowdate

# --------------------------------------------------------------------------
# Content
# --------------------------------------------------------------------------

ITEM_GROUP = "أصناف المطعم"

COURSES = ["المقبلات", "الأطباق الرئيسية", "المشاوي", "المشروبات", "الحلويات"]

# (name, course, price in IQD, is_special)
MENU = [
    ("حمص بالطحينة",      "المقبلات",            3000,  0),
    ("متبل باذنجان",       "المقبلات",            3000,  0),
    ("تبولة",             "المقبلات",            3500,  0),
    ("فتوش",              "المقبلات",            3500,  0),
    ("كبة موصلية",         "المقبلات",            5000,  1),
    ("شوربة عدس",          "المقبلات",            2500,  0),

    ("برياني دجاج",        "الأطباق الرئيسية",     12000, 1),
    ("قوزي عراقي",         "الأطباق الرئيسية",     18000, 1),
    ("دولمة عراقية",       "الأطباق الرئيسية",     10000, 0),
    ("تشريب لحم",          "الأطباق الرئيسية",     13000, 0),
    ("مقلوبة دجاج",        "الأطباق الرئيسية",     11000, 0),
    ("باجة",              "الأطباق الرئيسية",     9000,  0),

    ("تكة دجاج",           "المشاوي",             10000, 0),
    ("كباب عراقي",         "المشاوي",             14000, 1),
    ("شيش طاووق",          "المشاوي",             12000, 0),
    ("مشاوي مشكلة",        "المشاوي",             25000, 1),
    ("سمك مسكوف",          "المشاوي",             30000, 1),
    ("كباب لحم",           "المشاوي",             15000, 0),

    ("شاي عراقي",          "المشروبات",           1000,  0),
    ("قهوة عربية",         "المشروبات",           2000,  0),
    ("عصير برتقال طازج",    "المشروبات",           4000,  0),
    ("لبن عيران",          "المشروبات",           1500,  0),
    ("ماء معدني",          "المشروبات",           500,   0),
    ("مشروب غازي",         "المشروبات",           1500,  0),

    ("كنافة بالجبن",       "الحلويات",            6000,  1),
    ("بقلاوة",            "الحلويات",            5000,  0),
    ("زلابية",            "الحلويات",            3000,  0),
    ("مهلبية",            "الحلويات",            3500,  0),
]

# (room, room_type, table count, seats, is_take_away)
ROOMS = [
    ("القاعة الرئيسية", "AC",     8, 4, 0),
    ("قاعة العائلات",   "AC",     6, 6, 0),
    ("التراس الخارجي",  "NON-AC", 5, 4, 0),
]

# The `waiter` field is free text on POS Invoice, so these are names, not Users.
WAITERS = [
    "أحمد الجبوري",
    "مصطفى الكاظمي",
    "حسين العامري",
    "زينب الربيعي",
    "علي الحسناوي",
]

CUSTOMERS = [
    "زبون نقدي",
    "عائلة الجبوري",
    "شركة دجلة للتجارة",
    "مكتب الرافدين",
    "عائلة العبيدي",
]

# Delivery platforms are modelled as customers and must be registered in the
# branch's Aggregator Settings with their own price list — URY rejects an
# "Aggregators" order whose customer is not configured that way
# (ury/ury/hooks/ury_pos_invoice.py::validate_price_list).
AGGREGATORS = ["طلبات", "كريم ناو", "لقطة"]

# Platforms charge a commission, so the menu is marked up for them. This is
# what makes the aggregator price list worth demonstrating at all.
AGGREGATOR_PRICE_LIST = "أسعار تطبيقات التوصيل"
AGGREGATOR_MARKUP = 1.20

# Weighted so Dine In dominates, the way a real restaurant's mix looks —
# a flat distribution makes the order-type donut meaningless.
ORDER_TYPE_WEIGHTS = [
    ("Dine In", 55),
    ("Take Away", 20),
    ("Delivery", 15),
    ("Aggregators", 7),
    ("Phone In", 3),
]

DAYS_OF_HISTORY = 45
TABLE_PREFIX = "ط"


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _log(msg):
    print(f"  {msg}")


def _company():
    company = frappe.defaults.get_defaults().get("company")
    if not company:
        company = frappe.db.get_value("Company", {}, "name")
    if not company:
        frappe.throw("No Company found — create one before loading demo data.")
    return company


def _pos_profile(company):
    """An enabled POS Profile for this company, preferring one with a branch."""
    profile = frappe.db.get_value(
        "POS Profile",
        {"company": company, "disabled": 0, "branch": ("is", "set")},
        ["name", "warehouse", "branch", "restaurant", "selling_price_list"],
        as_dict=True,
    )
    if not profile:
        profile = frappe.db.get_value(
            "POS Profile", {"company": company, "disabled": 0},
            ["name", "warehouse", "branch", "restaurant", "selling_price_list"],
            as_dict=True,
        )
    if not profile:
        frappe.throw("No enabled POS Profile found for this company.")
    return profile


def _weighted_order_type():
    population = [t for t, _ in ORDER_TYPE_WEIGHTS]
    weights = [w for _, w in ORDER_TYPE_WEIGHTS]
    return random.choices(population, weights=weights, k=1)[0]


def _table_name(room, index):
    """Table names are scoped by room so two rooms can both have a "ط1"."""
    return f"{TABLE_PREFIX}{index} - {room}"


# --------------------------------------------------------------------------
# Masters
# --------------------------------------------------------------------------

def _ensure_item_group():
    if frappe.db.exists("Item Group", ITEM_GROUP):
        return ITEM_GROUP
    parent = frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ""}, "name") \
        or "All Item Groups"
    frappe.get_doc({
        "doctype": "Item Group",
        "item_group_name": ITEM_GROUP,
        "parent_item_group": parent,
        "is_group": 0,
    }).insert(ignore_permissions=True)
    _log(f"item group: {ITEM_GROUP}")
    return ITEM_GROUP


def _ensure_courses():
    for course in COURSES:
        if not frappe.db.exists("URY Menu Course", course):
            frappe.get_doc({"doctype": "URY Menu Course", "course": course}).insert(
                ignore_permissions=True
            )
    _log(f"courses: {len(COURSES)}")


def _ensure_items(company, price_list):
    """Non-stock sales items, so invoices never touch the stock ledger."""
    uom = frappe.db.get_value("UOM", "Unit", "name") or frappe.db.get_value("UOM", {}, "name")
    created = 0
    for name, _course, rate, _special in MENU:
        if not frappe.db.exists("Item", name):
            frappe.get_doc({
                "doctype": "Item",
                "item_code": name,
                "item_name": name,
                "item_group": ITEM_GROUP,
                "stock_uom": uom,
                "is_stock_item": 0,
                "is_sales_item": 1,
                "is_purchase_item": 0,
                "include_item_in_manufacturing": 0,
            }).insert(ignore_permissions=True)
            created += 1

        existing = frappe.db.get_value(
            "Item Price",
            {"item_code": name, "price_list": price_list},
            ["name", "price_list_rate"], as_dict=True,
        )
        if not existing:
            frappe.get_doc({
                "doctype": "Item Price",
                "item_code": name,
                "price_list": price_list,
                "price_list_rate": rate,
                "currency": frappe.db.get_value("Price List", price_list, "currency"),
            }).insert(ignore_permissions=True)
        elif existing.price_list_rate != rate:
            frappe.db.set_value("Item Price", existing.name, "price_list_rate", rate)
    _log(f"items: {len(MENU)} ({created} new), prices on '{price_list}'")


def _ensure_menu(branch, price_list):
    """Put every demo dish on the branch menu, replacing only our own rows."""
    menu_name = frappe.db.get_value("URY Menu", {"branch": branch}, "name")
    if not menu_name:
        menu = frappe.get_doc({
            "doctype": "URY Menu", "__newname": "قائمة المطعم",
            "branch": branch, "enabled": 1, "price_list": price_list,
        })
        menu.insert(ignore_permissions=True)
        menu_name = menu.name

    menu = frappe.get_doc("URY Menu", menu_name)
    demo_items = {name for name, _c, _r, _s in MENU}
    # Keep whatever was already on the menu; only our rows are re-written.
    menu.items = [row for row in menu.items if row.item not in demo_items]
    for name, course, rate, special in MENU:
        menu.append("items", {
            "item": name, "item_name": name, "rate": rate,
            "course": course, "special_dish": special, "disabled": 0,
        })
    menu.save(ignore_permissions=True)
    _log(f"menu '{menu_name}': {len(menu.items)} rows")
    return menu_name


def _ensure_rooms_and_tables(branch, restaurant):
    tables = []
    for room, room_type, count, seats, is_take_away in ROOMS:
        if not frappe.db.exists("URY Room", room):
            frappe.get_doc({
                "doctype": "URY Room", "__newname": room,
                "branch": branch, "room_type": room_type,
            }).insert(ignore_permissions=True)

        for i in range(1, count + 1):
            name = _table_name(room, i)
            if not frappe.db.exists("URY Table", name):
                frappe.get_doc({
                    "doctype": "URY Table", "__newname": name,
                    "restaurant": restaurant, "restaurant_room": room, "branch": branch,
                    "no_of_seats": seats, "minimum_seating": 1,
                    "table_shape": "Square" if seats <= 4 else "Rectangle",
                    "is_take_away": is_take_away, "occupied": 0,
                    # Spread them on the layout so the floor plan is not a pile.
                    "layout_x": 120 + ((i - 1) % 5) * 150,
                    "layout_y": 120 + (ROOMS.index((room, room_type, count, seats, is_take_away)) * 220)
                                + ((i - 1) // 5) * 150,
                }).insert(ignore_permissions=True)
            tables.append(name)
    _log(f"rooms: {len(ROOMS)}, tables: {len(tables)}")
    return tables


def _ensure_aggregators(company, branch):
    """Delivery platforms, their marked-up price list, and the branch wiring."""
    currency = frappe.db.get_value("Company", company, "default_currency")

    if not frappe.db.exists("Price List", AGGREGATOR_PRICE_LIST):
        frappe.get_doc({
            "doctype": "Price List", "price_list_name": AGGREGATOR_PRICE_LIST,
            "selling": 1, "buying": 0, "enabled": 1, "currency": currency,
        }).insert(ignore_permissions=True)

    for name, _course, rate, _special in MENU:
        marked_up = round(rate * AGGREGATOR_MARKUP)
        existing = frappe.db.get_value(
            "Item Price", {"item_code": name, "price_list": AGGREGATOR_PRICE_LIST}, "name"
        )
        if existing:
            frappe.db.set_value("Item Price", existing, "price_list_rate", marked_up)
        else:
            frappe.get_doc({
                "doctype": "Item Price", "item_code": name,
                "price_list": AGGREGATOR_PRICE_LIST,
                "price_list_rate": marked_up, "currency": currency,
            }).insert(ignore_permissions=True)

    group = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
    territory = frappe.db.get_value("Territory", {"is_group": 0}, "name")
    for name in AGGREGATORS:
        if not frappe.db.exists("Customer", name):
            frappe.get_doc({
                "doctype": "Customer", "customer_name": name,
                "customer_group": group, "territory": territory,
                "customer_type": "Company",
            }).insert(ignore_permissions=True)

    mode = _mode_of_payment(company)
    doc = frappe.get_doc("Branch", branch)
    rows = doc.get("custom_aggregator_settings") or []
    have = {r.customer for r in rows}
    for name in AGGREGATORS:
        if name not in have:
            doc.append("custom_aggregator_settings", {
                "customer": name,
                "price_list": AGGREGATOR_PRICE_LIST,
                "mode_of_payments": mode,
            })
    doc.save(ignore_permissions=True)
    _log(f"aggregators: {len(AGGREGATORS)} on '{AGGREGATOR_PRICE_LIST}' (+{round((AGGREGATOR_MARKUP-1)*100)}%)")


def _ensure_customers():
    group = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
    territory = frappe.db.get_value("Territory", {"is_group": 0}, "name")
    for name in CUSTOMERS:
        if not frappe.db.exists("Customer", name):
            frappe.get_doc({
                "doctype": "Customer", "customer_name": name,
                "customer_group": group, "territory": territory,
                "customer_type": "Company" if "شركة" in name or "مكتب" in name else "Individual",
            }).insert(ignore_permissions=True)
    _log(f"customers: {len(CUSTOMERS)}")


# --------------------------------------------------------------------------
# Transactions
# --------------------------------------------------------------------------

def _mode_of_payment(company):
    for candidate in ("Cash", "نقدي"):
        if frappe.db.exists("Mode of Payment", candidate):
            return candidate
    return frappe.db.get_value("Mode of Payment", {}, "name")


def _create_invoices(company, profile, tables, per_day=(4, 11), force=False):
    """
    A month and a half of trading.
    
    Each invoice carries branch, order type, waiter and table, because those
    are exactly the fields the Smart Restro workspace charts group by — the
    site's existing invoices leave them blank, which is why those charts had
    only one bar.
    """
    existing = frappe.db.count("POS Invoice", {"waiter": ("in", WAITERS), "docstatus": 1})
    if existing and not force:
        # The masters above are idempotent, but trading history is not: without
        # this guard a second run would stack another month and a half of sales
        # on top of the first and double every chart.
        _log(f"invoices: {existing} already present — skipped (pass force=True to add more)")
        return 0

    mode = _mode_of_payment(company)
    today = getdate(nowdate())
    created = 0

    for day_offset in range(DAYS_OF_HISTORY, -1, -1):
        day = add_days(today, -day_offset)
        weekday = day.weekday()
        # Thursday/Friday are the busy nights in Iraq.
        busy = 1.6 if weekday in (3, 4) else 1.0
        count = int(random.randint(*per_day) * busy)

        for _ in range(count):
            order_type = _weighted_order_type()
            dine_in = order_type == "Dine In"
            aggregator = order_type == "Aggregators"
            lines = random.sample(MENU, k=random.randint(1, 4))
            # The validation hook overrides selling_price_list per order type,
            # so the line rate has to match the list it will be priced against
            # or ERPNext re-rates the row underneath us.
            markup = AGGREGATOR_MARKUP if aggregator else 1

            invoice = frappe.get_doc({
                "doctype": "POS Invoice",
                "company": company,
                "customer": random.choice(AGGREGATORS if aggregator else CUSTOMERS),
                "pos_profile": profile.name,
                "is_pos": 1,
                "update_stock": 0,
                "set_posting_time": 1,
                "posting_date": day,
                "posting_time": f"{random.randint(11, 22):02d}:{random.randint(0, 59):02d}:00",
                "branch": profile.branch,
                "restaurant": profile.restaurant,
                "restaurant_table": random.choice(tables) if dine_in and tables else None,
                "order_type": order_type,
                "waiter": random.choice(WAITERS),
                "no_of_pax": str(random.randint(1, 6)) if dine_in else None,
                "items": [
                    {
                        "item_code": name,
                        "qty": random.randint(1, 3),
                        "rate": round(rate * markup),
                        "warehouse": profile.warehouse,
                    }
                    for name, _course, rate, _special in lines
                ],
            })
            invoice.append("payments", {"mode_of_payment": mode, "amount": 0})
            invoice.insert(ignore_permissions=True)

            # A dine-in bill must be printed before it can be submitted
            # (ury_pos_invoice.validate_invoice_print), and that hook reads the
            # flag straight from the database — so set it in both places, the
            # way the POS does when the cashier hits Print.
            if invoice.restaurant_table:
                frappe.db.set_value("POS Invoice", invoice.name, "invoice_printed", 1,
                                    update_modified=False)
                invoice.invoice_printed = 1

            # The payment has to match the computed total, which only exists
            # after insert — this mirrors ury/setup/pos_demo.py.
            invoice.payments[0].amount = invoice.grand_total
            invoice.paid_amount = invoice.grand_total
            invoice.submit()
            created += 1

        if day_offset % 10 == 0:
            frappe.db.commit()
            _log(f"invoices … {created} so far (through {day})")

    _log(f"invoices: {created}")
    return created


def _ensure_production_routing(branch):
    """
    Make sure the kitchen actually receives the restaurant's food.

    The Production Unit routes KOTs by item group, and on this site it was
    configured for beverages only — so every dish would have been billed but
    never printed to the kitchen. Adding the demo's item group is what makes
    the kitchen display meaningful.
    """
    unit = frappe.db.get_value("URY Production Unit", {"branch": branch}, "name")
    if not unit:
        _log("no production unit for branch — kitchen routing skipped")
        return None

    doc = frappe.get_doc("URY Production Unit", unit)
    groups = {r.item_group for r in (doc.get("item_groups") or [])}
    if ITEM_GROUP not in groups:
        doc.append("item_groups", {"item_group": ITEM_GROUP})
        doc.save(ignore_permissions=True)
        _log(f"production '{unit}': routed '{ITEM_GROUP}' to the kitchen")
    return unit


def _kot_naming_series(profile):
    """The KOT series field is a Custom Field, and its name varies by site."""
    for field in ("custom_kot_naming_series", "kot_naming_series"):
        if frappe.get_meta("POS Profile").get_field(field):
            value = frappe.db.get_value("POS Profile", profile.name, field)
            if value:
                return value
    # Fall back to whatever series existing KOTs already use.
    return frappe.db.get_value("URY KOT", {}, "naming_series") or "KOT-URY-"


def _create_kot(invoice, profile, production, series, status):
    """One kitchen ticket for an order, mirroring ury_kot_validation.create_kot."""
    kot = frappe.new_doc("URY KOT")
    kot.update({
        "invoice": invoice.name,
        "restaurant_table": invoice.restaurant_table,
        # Check field, not a label: 1 marks the ticket as an off-premise order,
        # which is what suppresses table-specific KOT printing.
        "table_takeaway": 0 if invoice.restaurant_table else 1,
        "naming_series": series,
        "type": "New Order",
        "pos_profile": profile.name,
        "branch": invoice.branch,
        "customer_name": invoice.customer,
        "production": production,
        "date": invoice.posting_date,
        "time": invoice.posting_time,
        "order_no": getattr(invoice, "custom_ury_order_number", None),
    })
    for row in invoice.items:
        kot.append("kot_items", {
            "item": row.item_code,
            "item_name": row.item_name or row.item_code,
            "quantity": row.qty,
        })
    kot.insert(ignore_permissions=True)
    kot.submit()
    # `order_status` is read-only and allow-on-submit, so it is set after.
    kot.db_set("order_status", status, update_modified=False)
    return kot.name


def _create_live_orders(company, profile, tables, seated=6, takeaway=4):
    """
    Orders that are open right now.

    Everything else in this demo is already settled, which left the floor plan
    showing occupied tables with no order behind them — tapping one in the POS
    would have raised "no active order found for this table". These are draft
    (unbilled) invoices, which is exactly what the POS treats as a live order,
    each with a kitchen ticket so the display has something on it.
    """
    mode = _mode_of_payment(company)
    production = _ensure_production_routing(profile.branch)
    series = _kot_naming_series(profile)
    now = frappe.utils.now_datetime()

    # Start from a clean slate so re-runs do not stack orders on one table.
    _clear_live_orders(quiet=True)
    frappe.db.set_value("URY Table", {"name": ("in", tables)}, "occupied", 0)

    chosen = random.sample(tables, min(seated, len(tables)))
    kots = 0
    orders = []

    def build(table, order_type):
        lines = random.sample(MENU, k=random.randint(2, 4))
        # Staggered through the last couple of hours, so the dashboard's
        # service-line chart shows tables at different stages of their meal.
        minutes_ago = random.randint(5, 115)
        placed = now - timedelta(minutes=minutes_ago)
        invoice = frappe.get_doc({
            "doctype": "POS Invoice",
            "company": company,
            "customer": random.choice(CUSTOMERS),
            "pos_profile": profile.name,
            "is_pos": 1,
            "update_stock": 0,
            "set_posting_time": 1,
            "posting_date": placed.date(),
            "posting_time": placed.strftime("%H:%M:%S"),
            "branch": profile.branch,
            "restaurant": profile.restaurant,
            "restaurant_table": table,
            "order_type": order_type,
            "waiter": random.choice(WAITERS),
            "no_of_pax": str(random.randint(1, 6)) if table else None,
            "items": [
                {"item_code": n, "qty": random.randint(1, 3), "rate": r,
                 "warehouse": profile.warehouse}
                for n, _c, r, _s in lines
            ],
        })
        invoice.append("payments", {"mode_of_payment": mode, "amount": 0})
        # Left as a draft on purpose: that is what "unbilled / in service" is.
        invoice.insert(ignore_permissions=True)
        return invoice, minutes_ago

    for table in chosen:
        invoice, minutes_ago = build(table, "Dine In")
        frappe.db.set_value("URY Table", table, {
            "occupied": 1,
            "latest_invoice_time": invoice.creation,
        }, update_modified=False)
        if production:
            # Older tickets have already been served; the recent ones are still
            # on the pass, so the kitchen display shows a realistic mix.
            status = "Served" if minutes_ago > 60 else "Ready For Prepare"
            _create_kot(invoice, profile, production, series, status)
            kots += 1
        orders.append(invoice.name)

    for _ in range(takeaway):
        invoice, _m = build(None, random.choice(["Take Away", "Delivery"]))
        if production:
            _create_kot(invoice, profile, production, series, "Ready For Prepare")
            kots += 1
        orders.append(invoice.name)

    _log(f"live orders: {len(orders)} ({len(chosen)} seated, {takeaway} off-premise), kitchen tickets: {kots}")
    return orders


def _clear_live_orders(quiet=False):
    """Drop any previous demo drafts and their tickets."""
    drafts = frappe.get_all(
        "POS Invoice", filters={"waiter": ("in", WAITERS), "docstatus": 0}, pluck="name"
    )
    for name in drafts:
        for kot in frappe.get_all("URY KOT", filters={"invoice": name}, fields=["name", "docstatus"]):
            doc = frappe.get_doc("URY KOT", kot.name)
            if doc.docstatus == 1:
                doc.cancel()
            doc.delete(ignore_permissions=True)
        frappe.delete_doc("POS Invoice", name, ignore_permissions=True, force=True)
    if drafts and not quiet:
        _log(f"removed previous live orders: {len(drafts)}")
    return len(drafts)


# --------------------------------------------------------------------------
# Entry points
# --------------------------------------------------------------------------

def create_arabic_demo(invoices=True):
    """Build the Arabic demo restaurant. Safe to run more than once."""
    random.seed(20260917)  # reproducible runs
    company = _company()
    profile = _pos_profile(company)
    price_list = profile.selling_price_list or "Standard Selling"
    branch = profile.branch
    restaurant = profile.restaurant

    print(f"Smart Restro — Arabic demo data")
    print(f"  company={company} profile={profile.name} branch={branch} restaurant={restaurant}")

    frappe.flags.mute_messages = True
    try:
        _ensure_item_group()
        _ensure_courses()
        _ensure_items(company, price_list)
        _ensure_menu(branch, price_list)
        tables = _ensure_rooms_and_tables(branch, restaurant)
        _ensure_customers()
        _ensure_aggregators(company, branch)
        frappe.db.commit()

        if invoices:
            _create_invoices(company, profile, tables)
            _create_live_orders(company, profile, tables)
        frappe.db.commit()
    finally:
        frappe.flags.mute_messages = False

    frappe.clear_cache()
    print("done.")


def clear_arabic_demo():
    """
    Remove only what `create_arabic_demo` created.

    Matches on the exact names defined in this module, so nothing that was
    already on the site is touched.
    """
    table_names = [
        _table_name(room, i)
        for room, _t, count, _s, _ta in ROOMS
        for i in range(1, count + 1)
    ]
    item_names = [name for name, _c, _r, _s in MENU]

    # Live drafts and their kitchen tickets first.
    _clear_live_orders()

    # Then the settled invoices: they reference the items and tables below.
    invoices = frappe.get_all(
        "POS Invoice",
        filters={"waiter": ("in", WAITERS)},
        fields=["name", "docstatus"],
    )
    for inv in invoices:
        doc = frappe.get_doc("POS Invoice", inv.name)
        if doc.docstatus == 1:
            doc.cancel()
        doc.delete(ignore_permissions=True)
    print(f"  removed invoices: {len(invoices)}")
    frappe.db.commit()

    for dt, names in (
        ("URY Table", table_names),
        ("URY Room", [r[0] for r in ROOMS]),
        ("Item Price", None),
        ("Item", item_names),
        ("URY Menu Course", COURSES),
        ("Customer", CUSTOMERS + AGGREGATORS),
        ("Price List", [AGGREGATOR_PRICE_LIST]),
    ):
        if dt == "Item Price":
            for p in frappe.get_all("Item Price", filters={"item_code": ("in", item_names)}, pluck="name"):
                frappe.delete_doc("Item Price", p, ignore_permissions=True, force=True)
            continue
        for name in names:
            if frappe.db.exists(dt, name):
                try:
                    frappe.delete_doc(dt, name, ignore_permissions=True, force=True)
                except Exception as e:
                    print(f"  kept {dt} {name}: {e}")
    frappe.db.commit()
    print("cleared.")
