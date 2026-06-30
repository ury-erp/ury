"""
URY Menu Management API
CRUD operations for menu items, categories (courses), and prices.
"""

import frappe
import json


@frappe.whitelist()
def get_menus():
    """Get all URY Menus with their items for the current branch."""
    branch = _get_user_branch()
    if not branch:
        frappe.throw("User branch not found", frappe.ValidationError)

    menus = frappe.get_all(
        "URY Menu",
        filters={"branch": branch},
        fields=["name", "enabled", "branch", "price_list"],
        order_by="name"
    )

    for menu in menus:
        items = frappe.get_all(
            "URY Menu Item",
            filters={"parent": menu.name, "parenttype": "URY Menu"},
            fields=[
                "name", "item", "item_name", "rate", "special_dish",
                "disabled", "course", "course_icon", "idx"
            ],
            order_by="idx"
        )
        menu["items"] = items
        menu["item_count"] = len(items)
        menu["enabled_count"] = len([i for i in items if not i.get("disabled")])

    return menus


@frappe.whitelist()
def get_menu_detail(menu_name):
    """Get a single URY Menu with full details."""
    menu = frappe.get_doc("URY Menu", menu_name)
    return {
        "name": menu.name,
        "enabled": menu.enabled,
        "branch": menu.branch,
        "price_list": menu.price_list,
        "items": [
            {
                "name": item.name,
                "item": item.item,
                "item_name": item.item_name,
                "rate": item.rate,
                "special_dish": item.special_dish,
                "disabled": item.disabled,
                "course": item.course,
                "course_icon": item.course_icon,
                "idx": item.idx,
            }
            for item in menu.items
        ]
    }


@frappe.whitelist()
def create_menu(branch, enabled=1):
    """Create a new URY Menu."""
    existing = frappe.get_all("URY Menu", filters={"branch": branch})
    if existing:
        frappe.throw(f"Menu already exists for branch {branch}", frappe.DuplicateEntryError)

    menu = frappe.get_doc({
        "doctype": "URY Menu",
        "branch": branch,
        "enabled": enabled,
    })
    menu.insert(ignore_permissions=True)
    frappe.db.commit()
    return menu.name


@frappe.whitelist()
def toggle_menu(menu_name, enabled):
    """Enable or disable a menu."""
    menu = frappe.get_doc("URY Menu", menu_name)
    menu.enabled = enabled
    menu.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": menu.name, "enabled": menu.enabled}


@frappe.whitelist()
def add_menu_item(menu_name, item, rate, course=None, special_dish=0):
    """Add an item to a URY Menu."""
    menu = frappe.get_doc("URY Menu", menu_name)

    for existing_item in menu.items:
        if existing_item.item == item:
            frappe.throw(f"Item {item} already exists in this menu", frappe.DuplicateEntryError)

    item_doc = frappe.get_doc("Item", item)
    item_name = item_doc.item_name

    menu.append("items", {
        "item": item,
        "item_name": item_name,
        "rate": float(rate),
        "special_dish": special_dish,
        "disabled": 0,
        "course": course,
    })
    menu.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "item": item, "item_name": item_name}


@frappe.whitelist()
def update_menu_item(menu_name, item_row_name, rate=None, special_dish=None, disabled=None, course=None):
    """Update a menu item's properties."""
    menu = frappe.get_doc("URY Menu", menu_name)
    for item in menu.items:
        if item.name == item_row_name:
            if rate is not None:
                item.rate = float(rate)
            if special_dish is not None:
                item.special_dish = int(special_dish)
            if disabled is not None:
                item.disabled = int(disabled)
            if course is not None:
                item.course = course
            break
    else:
        frappe.throw(f"Menu item row {item_row_name} not found", frappe.DoesNotExistError)

    menu.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def remove_menu_item(menu_name, item_row_name):
    """Remove an item from a URY Menu."""
    menu = frappe.get_doc("URY Menu", menu_name)
    original_count = len(menu.items)

    menu.items = [item for item in menu.items if item.name != item_row_name]

    if len(menu.items) == original_count:
        frappe.throw(f"Menu item row {item_row_name} not found", frappe.DoesNotExistError)

    menu.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def batch_update_prices(menu_name, updates):
    """Batch update prices for menu items.
    updates: list of dicts with {item_row_name, rate}
    """
    if isinstance(updates, str):
        updates = json.loads(updates)

    menu = frappe.get_doc("URY Menu", menu_name)
    updated = 0

    for update in updates:
        for item in menu.items:
            if item.name == update.get("item_row_name"):
                item.rate = float(update.get("rate", item.rate))
                updated += 1
                break

    menu.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "updated_count": updated}


@frappe.whitelist()
def get_courses_detail():
    """Get all menu courses with their details."""
    courses = frappe.get_all(
        "URY Menu Course",
        fields=["name", "course", "custom_serving_priority", "custom_indicate_in_kds"],
        order_by="custom_serving_priority asc"
    )
    return courses


@frappe.whitelist()
def create_menu_course(course, serving_priority=0, indicate_in_kds=0):
    """Create a new menu course/category."""
    existing = frappe.get_all("URY Menu Course", filters={"course": course})
    if existing:
        frappe.throw(f"Course '{course}' already exists", frappe.DuplicateEntryError)

    doc = frappe.get_doc({
        "doctype": "URY Menu Course",
        "course": course,
        "custom_serving_priority": serving_priority,
        "custom_indicate_in_kds": indicate_in_kds,
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name


@frappe.whitelist()
def update_menu_course(course_name, course=None, serving_priority=None, indicate_in_kds=None):
    """Update a menu course."""
    doc = frappe.get_doc("URY Menu Course", course_name)
    if course is not None:
        doc.course = course
    if serving_priority is not None:
        doc.custom_serving_priority = int(serving_priority)
    if indicate_in_kds is not None:
        doc.custom_indicate_in_kds = int(indicate_in_kds)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def delete_menu_course(course_name):
    """Delete a menu course if not used by any menu items."""
    used_items = frappe.get_all(
        "URY Menu Item",
        filters={"course": course_name},
        fields=["name", "parent"]
    )
    if used_items:
        frappe.throw(
            f"Cannot delete course. It is used by {len(used_items)} menu items.",
            frappe.ValidationError
        )

    frappe.delete_doc("URY Menu Course", course_name, ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def get_available_items():
    """Get all Items that can be added to a menu (food/beverage items)."""
    items = frappe.get_all(
        "Item",
        filters={
            "disabled": 0,
            "is_sales_item": 1,
        },
        fields=["name", "item_name", "item_group", "standard_rate", "image"],
        order_by="item_name",
        limit_page_length=500
    )
    return items


def _get_user_branch():
    """Get the branch for the current user."""
    user = frappe.session.user
    branch = frappe.db.get_value("URY User", {"user": user}, "parent")
    return branch
