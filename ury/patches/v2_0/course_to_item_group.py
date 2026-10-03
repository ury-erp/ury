"""Make each menu item's course its category (Item Group).

The POS used to group its grid by `URY Menu Item.course` while kitchens
routed orders by `Item.item_group`, two classifications that drifted apart:
on a live site 28 dishes across five courses all sat in one item group. The
POS now groups by item group, so without this patch those menus would
collapse into a single category on upgrade.

For every menu item with a course, its Item moves to an Item Group of that
name, and that group is added to every kitchen that prepared the item's old
group — so what the cashier sees changes to match the courses, and where
each order prints does not change at all.

Idempotent, and skips (with a log entry) anything it cannot move safely: a
course named like a parent group, or like an existing Item.
"""

import frappe

from ury.ury.api.menu_quick_add import ensure_category


def execute():
    rows = frappe.db.sql(
        """
        SELECT mi.item, MIN(mi.course) AS course, it.item_group
        FROM `tabURY Menu Item` mi
        INNER JOIN `tabItem` it ON it.name = mi.item
        WHERE IFNULL(mi.course, '') != ''
        GROUP BY mi.item, it.item_group
        """,
        as_dict=True,
    )

    kitchens_by_group = {}
    for r in frappe.get_all(
        "URY Production Item Groups",
        filters={"parenttype": "URY Production Unit"},
        fields=["parent", "item_group"],
    ):
        kitchens_by_group.setdefault(r.item_group, set()).add(r.parent)

    for row in rows:
        if row.course == row.item_group:
            continue
        try:
            group = ensure_category(row.course)
        except frappe.ValidationError:
            frappe.clear_messages()
            frappe.log_error(f"Kept {row.item} in {row.item_group}: course {row.course!r} cannot be an item group",
                             "Course to item group")
            continue

        frappe.db.set_value("Item", row.item, "item_group", group, update_modified=False)

        routed = kitchens_by_group.setdefault(group, set())
        for kitchen in list(kitchens_by_group.get(row.item_group, ())):
            if kitchen in routed:
                continue
            unit = frappe.get_doc("URY Production Unit", kitchen)
            unit.append("item_groups", {"item_group": group})
            unit.save(ignore_permissions=True)
            routed.add(kitchen)
