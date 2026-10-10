"""The dashboard's menu: one list of dishes per branch, managed in one step.

Putting a dish on the POS used to take five records created one browser
call at a time — Item Group, Item, URY Menu Course, URY Menu row, Item Price
— across several menus and a "course" concept the restaurant never used.
The dashboard parked new dishes in "All Item Groups", a group node no URY
Production Unit lists, so they sold at the counter and never reached a
kitchen; a failure halfway left an Item with no menu row behind it.

Here the restaurant sees two things only: a dish and its category. The
category is the dish's Item Group, which is both what the POS groups its
grid by and what routes the order to a kitchen. Each branch has one menu
(its restaurant's active menu, created on first use); room and order-type
menus, where a restaurant has them, are kept in step automatically. Every
write happens in one request, so it all lands or none of it does.
"""

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt

DEFAULT_UOM = "Unit"


@frappe.whitelist()
def get_menu_page(branch=None):
    """Everything the menu page and its add/edit form need, in one call."""
    frappe.has_permission("URY Menu", "read", throw=True)

    restaurants = frappe.get_all(
        "URY Restaurant",
        filters={"branch": branch} if _is_branch(branch) else {},
        fields=["name", "branch", "active_menu"],
        order_by="branch",
    )

    items = []
    for restaurant in restaurants:
        if not restaurant.active_menu:
            continue
        rows = frappe.db.sql(
            """
            SELECT mi.name AS row, mi.item, mi.item_name, mi.rate, mi.special_dish, mi.disabled,
                   it.image, it.item_group AS category
            FROM `tabURY Menu Item` mi
            LEFT JOIN `tabItem` it ON it.name = mi.item
            WHERE mi.parent = %s
            ORDER BY mi.idx
            """,
            restaurant.active_menu,
            as_dict=True,
        )
        for row in rows:
            row.branch = restaurant.branch
        items.extend(rows)

    kitchens = frappe.get_all(
        "URY Production Unit",
        filters={"branch": ["in", [r.branch for r in restaurants] or [""]]},
        fields=["name", "branch"],
        order_by="name",
    )
    kitchen_groups = _kitchen_groups([k.name for k in kitchens])
    for kitchen in kitchens:
        kitchen["item_groups"] = sorted(kitchen_groups.get(kitchen.name, set()))

    # Categories are the groups this restaurant actually sells from, plus any
    # a kitchen already prepares — not ERPNext's stock groups (Raw Material,
    # Services, ...) that would only clutter the picker.
    counts = {}
    for row in items:
        if row.category:
            counts[row.category] = counts.get(row.category, 0) + 1
    names = set(counts)
    for groups in kitchen_groups.values():
        names |= groups
    leaf_groups = set(
        frappe.get_all("Item Group", filters={"is_group": 0, "name": ["in", list(names) or [""]]}, pluck="name")
    )
    categories = [
        {
            "name": name,
            "count": counts.get(name, 0),
            "kitchens": sorted(k for k, g in kitchen_groups.items() if name in g),
        }
        for name in sorted(names & leaf_groups)
    ]

    return {
        "branches": [{"branch": r.branch, "restaurant": r.name, "has_menu": bool(r.active_menu)} for r in restaurants],
        "items": items,
        "categories": categories,
        "kitchens": kitchens,
        "currency": frappe.defaults.get_global_default("currency"),
    }


@frappe.whitelist()
def quick_add_item(branch, item_name, rate, category, kitchen=None, image=None, special_dish=0):
    """Create a dish and put it on the branch's POS, in one transaction."""
    restaurant = _get_restaurant(branch)
    frappe.has_permission("Item", "create", throw=True)

    item_name = _clean_name(item_name, _("Item name"))
    category = _clean_name(category, _("Category"))
    rate = _valid_rate(rate)

    if item_name == category or frappe.db.exists("Item Group", item_name):
        # ERPNext refuses an Item named after an Item Group (and vice versa).
        frappe.throw(_("The item name cannot be the same as a category name: {0}").format(frappe.bold(item_name)))

    menus = _branch_menus(restaurant)
    for menu in menus:
        if any(cstr(row.item_name).strip() == item_name for row in menu.items):
            frappe.throw(_("{0} is already on the menu").format(frappe.bold(item_name)))

    item_group = ensure_category(category)
    _route_to_kitchen(item_group, kitchen, restaurant.branch)

    item_code = frappe.db.get_value("Item", {"item_code": item_name}) or frappe.db.get_value(
        "Item", {"item_name": item_name, "disabled": 0}
    )
    reused = bool(item_code)
    if reused:
        frappe.db.set_value("Item", item_code, "item_group", item_group)
    else:
        item_code = frappe.get_doc({
            "doctype": "Item",
            "item_code": item_name,
            "item_name": item_name,
            "item_group": item_group,
            "stock_uom": _default_uom(),
            "description": item_name,
            "image": image or None,
            "standard_rate": rate,
            # A dish is sold, not stocked: no stock ledger, no purchase flow.
            "is_stock_item": 0,
            "is_sales_item": 1,
            "is_purchase_item": 0,
            "include_item_in_manufacturing": 0,
        }).insert().name

    row = {"item": item_code, "item_name": item_name, "rate": rate, "special_dish": cint(special_dish)}
    if not menus:
        menus = [_create_branch_menu(restaurant, row)]
    else:
        for menu in menus:
            menu.append("items", row)
            # Saving republishes the menu's price list (URYMenu.on_update),
            # which is what the invoice is priced from.
            menu.save()

    return {"item": item_code, "category": item_group, "reused": reused}


@frappe.whitelist()
def update_menu_item(branch, item, item_name, rate, category, kitchen=None, image=None,
                     special_dish=0, disabled=0):
    """Edit a dish everywhere the branch sells it, keeping its Item in step."""
    restaurant = _get_restaurant(branch)
    item_name = _clean_name(item_name, _("Item name"))
    category = _clean_name(category, _("Category"))
    rate = _valid_rate(rate)

    menus = [m for m in _branch_menus(restaurant) if any(r.item == item for r in m.items)]
    if not menus:
        frappe.throw(_("Could not find the item to update"))

    item_group = ensure_category(category)
    _route_to_kitchen(item_group, kitchen, restaurant.branch)

    for menu in menus:
        for row in menu.items:
            if row.item == item:
                row.update({
                    "item_name": item_name,
                    "rate": rate,
                    "special_dish": cint(special_dish),
                    "disabled": cint(disabled),
                })
        menu.save()

    doc = frappe.get_doc("Item", item)
    if doc.has_permission("write"):
        doc.update({"item_name": item_name, "item_group": item_group, "standard_rate": rate, "image": image or None})
        doc.save()

    return {"item": item, "category": item_group}


def ensure_category(category):
    """Make sure `category` exists as a leaf Item Group (the dish's category)."""
    is_group = frappe.db.get_value("Item Group", category, "is_group")
    if is_group is None:
        if frappe.db.exists("Item", category):
            frappe.throw(_("An item named {0} already exists, choose another category name").format(
                frappe.bold(category)
            ))
        frappe.get_doc({
            "doctype": "Item Group",
            "item_group_name": category,
            "parent_item_group": _root_item_group(),
            "is_group": 0,
        }).insert(ignore_permissions=True)
    elif cint(is_group):
        frappe.throw(_("{0} is a parent item group; items cannot be added to it directly").format(
            frappe.bold(category)
        ))
    return category


def _branch_menus(restaurant):
    """The branch's active menu, plus its room and order-type menus when in use.

    A dish added to the active menu alone would be missing in any room or
    order type that has its own menu; the page shows one menu, so every menu
    the POS can resolve to has to carry it.
    """
    names = [restaurant.active_menu] if restaurant.active_menu else []
    doc = frappe.get_doc("URY Restaurant", restaurant.name)
    if cint(doc.get("room_wise_menu")):
        names += [r.menu for r in doc.get("menu_for_room") or [] if r.menu]
    if cint(doc.get("order_type_wise_menu")):
        names += [r.menu for r in doc.get("order_type_menu") or [] if r.menu]

    menus = []
    for name in dict.fromkeys(names):
        if frappe.db.exists("URY Menu", name):
            menu = frappe.get_doc("URY Menu", name)
            menu.check_permission("write")
            menus.append(menu)
    return menus


def _create_branch_menu(restaurant, first_row):
    """A branch without a menu gets one, made active, on its first dish."""
    frappe.has_permission("URY Menu", "create", throw=True)
    name = _("Menu {0}").format(restaurant.branch)
    if frappe.db.exists("URY Menu", name):
        name = f"{name} - {frappe.generate_hash(length=4)}"
    menu = frappe.get_doc({
        "doctype": "URY Menu",
        "branch": restaurant.branch,
        "enabled": 1,
        "items": [first_row],
    }).insert(set_name=name)
    frappe.db.set_value("URY Restaurant", restaurant.name, "active_menu", menu.name)
    return menu


def _get_restaurant(branch):
    filters = {"branch": branch} if _is_branch(branch) else {}
    restaurants = frappe.get_all("URY Restaurant", filters=filters, fields=["name", "branch", "active_menu"])
    if not restaurants:
        frappe.throw(_("No restaurant is set up for this branch"))
    if len(restaurants) > 1:
        frappe.throw(_("Choose a branch first"))
    return restaurants[0]


def _is_branch(branch):
    return bool(branch) and branch != "all"


def _route_to_kitchen(item_group, kitchen, branch):
    """Add the item group to the kitchen that prepares it, unless already routed.

    With no kitchen chosen, a branch that has exactly one is routed to it —
    the common case for a single-kitchen restaurant — and a branch with
    several must say which, because guessing would print the dish in the
    wrong station.
    """
    branch_kitchens = frappe.get_all("URY Production Unit", filters={"branch": branch}, pluck="name")
    if not branch_kitchens:
        return

    routed = [k for k, groups in _kitchen_groups(branch_kitchens).items() if item_group in groups]

    if not kitchen:
        if routed:
            return
        if len(branch_kitchens) > 1:
            frappe.throw(_("Choose the kitchen that prepares category {0}").format(frappe.bold(item_group)))
        kitchen = branch_kitchens[0]

    if kitchen not in branch_kitchens:
        frappe.throw(_("Kitchen {0} does not belong to branch {1}").format(frappe.bold(kitchen), frappe.bold(branch)))
    if kitchen in routed:
        return

    unit = frappe.get_doc("URY Production Unit", kitchen)
    unit.append("item_groups", {"item_group": item_group})
    unit.save(ignore_permissions=True)


def _kitchen_groups(kitchens):
    if not kitchens:
        return {}
    rows = frappe.get_all(
        "URY Production Item Groups",
        filters={"parenttype": "URY Production Unit", "parent": ["in", kitchens]},
        fields=["parent", "item_group"],
    )
    groups = {k: set() for k in kitchens}
    for r in rows:
        groups[r.parent].add(r.item_group)
    return groups


def _clean_name(value, label):
    value = " ".join(cstr(value).split())
    if not value:
        frappe.throw(_("{0} is required").format(label))
    if len(value) > 140:
        frappe.throw(_("{0} is too long").format(label))
    return value


def _valid_rate(rate):
    rate = flt(rate)
    if rate <= 0:
        frappe.throw(_("Price must be greater than zero"))
    return rate


def _root_item_group():
    return frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ["in", ["", None]]}) or "All Item Groups"


def _default_uom():
    for uom in (DEFAULT_UOM, "Nos"):
        if frappe.db.exists("UOM", uom):
            return uom
    frappe.get_doc({"doctype": "UOM", "uom_name": DEFAULT_UOM, "must_be_whole_number": 1}).insert(
        ignore_permissions=True
    )
    return DEFAULT_UOM
