# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# What each dish costs, what it sells for, and what is left.
#
# Two things make this report honest rather than reassuring:
#
#   1. Every figure says where its cost came from. A margin worked out from a
#      real BOM and a margin worked out from a number somebody typed into the
#      menu a year ago are not the same claim, and a manager deciding whether
#      to delist a dish has to know which one they are reading.
#   2. A dish with no cost at all is reported as having none, not as having a
#      100% margin. Treating a missing cost as zero turns the dishes nobody
#      has costed — which are exactly the ones worth looking at — into the
#      best performers on the page.

import frappe
from frappe import _
from frappe.utils import flt

from ury.ury_pos.api import getBranch

# Where a dish's cost came from, in the order they are preferred.
COST_SOURCE_BOM = "bom"          # a real recipe, priced from its ingredients
COST_SOURCE_MANUAL = "manual"    # `URY Menu Item.plate_cost`, typed by staff
COST_SOURCE_NONE = "none"        # nobody has costed this dish


def _bom_cost_map(item_codes):
    """Per-unit cost from the default active BOM, for the items that have one.

    One query for the whole menu rather than one per dish: a menu is a few
    hundred rows and this report is opened on a phone behind a counter.
    """
    if not item_codes:
        return {}

    boms = frappe.get_all(
        "BOM",
        filters={"item": ["in", item_codes], "is_active": 1, "is_default": 1, "docstatus": 1},
        fields=["item", "total_cost", "quantity"],
    )

    costs = {}
    for bom in boms:
        qty = flt(bom.quantity) or 1
        # A BOM may produce several portions; the dish costs one of them.
        costs[bom.item] = flt(bom.total_cost) / qty
    return costs


@frappe.whitelist()
def get_plate_costs(branch=None, menu=None):
    """Cost, price and margin for every dish on a branch's active menu."""
    branch = branch if (frappe.session.user == "Administrator" and branch) else getBranch()

    if not menu:
        restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch}, "name")
        menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")

    if not menu:
        frappe.throw(_("No active menu is set for branch {0}.").format(branch))

    rows = frappe.get_all(
        "URY Menu Item",
        filters={"parent": menu, "disabled": 0},
        fields=["item", "item_name", "rate", "plate_cost", "course"],
        order_by="item_name asc",
    )

    bom_costs = _bom_cost_map([row.item for row in rows])

    out = []
    for row in rows:
        price = flt(row.rate)

        if row.item in bom_costs:
            cost, source = bom_costs[row.item], COST_SOURCE_BOM
        elif flt(row.plate_cost):
            cost, source = flt(row.plate_cost), COST_SOURCE_MANUAL
        else:
            cost, source = None, COST_SOURCE_NONE

        # None, not zero. A dish nobody has costed has an unknown margin, and
        # saying "100%" about it would put it at the top of the page.
        margin = None if cost is None else price - cost
        margin_percent = None if (cost is None or not price) else (margin / price) * 100
        food_cost_percent = None if (cost is None or not price) else (cost / price) * 100

        out.append({
            "item": row.item,
            "item_name": row.item_name,
            "course": row.course,
            "price": price,
            "cost": cost,
            "cost_source": source,
            "margin": margin,
            "margin_percent": margin_percent,
            "food_cost_percent": food_cost_percent,
        })

    return {"menu": menu, "branch": branch, "items": out, "summary": _summarise(out)}


def _summarise(rows):
    """Averages over the dishes that actually have a cost.

    Counted separately from the ones that do not, because "average food cost
    32%" over half a menu is a different statement from the same number over
    all of it, and the gap is the work still to do.
    """
    costed = [r for r in rows if r["food_cost_percent"] is not None]

    return {
        "total_items": len(rows),
        "costed_items": len(costed),
        "uncosted_items": len(rows) - len(costed),
        "average_food_cost_percent": (
            sum(r["food_cost_percent"] for r in costed) / len(costed) if costed else None
        ),
        "from_bom": len([r for r in rows if r["cost_source"] == COST_SOURCE_BOM]),
        "from_manual": len([r for r in rows if r["cost_source"] == COST_SOURCE_MANUAL]),
    }


@frappe.whitelist()
def get_waste_summary(from_date=None, to_date=None, branch=None):
    """Waste by reason for a period.

    Grouped by reason rather than listed by entry, because the total is not
    the actionable part: which reason it sits under is what tells a manager
    whether to talk to the chef, the buyer, or the fridge.
    """
    branch = branch if (frappe.session.user == "Administrator" and branch) else getBranch()

    conditions = ["docstatus = 1", "branch = %(branch)s"]
    values = {"branch": branch}
    if from_date:
        conditions.append("posting_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("posting_date <= %(to_date)s")
        values["to_date"] = to_date

    by_reason = frappe.db.sql(
        f"""
        SELECT reason, COUNT(*) AS entries, COALESCE(SUM(total_value), 0) AS total
        FROM `tabURY Waste Log`
        WHERE {" AND ".join(conditions)}
        GROUP BY reason
        ORDER BY total DESC
        """,
        values,
        as_dict=True,
    )

    top_items = frappe.db.sql(
        f"""
        SELECT child.item_code, child.item_name,
               SUM(child.qty) AS qty, SUM(child.amount) AS total
        FROM `tabURY Waste Log Item` child
        INNER JOIN `tabURY Waste Log` parent ON parent.name = child.parent
        WHERE {" AND ".join("parent." + c if c.startswith(("docstatus", "branch", "posting_date")) else c for c in conditions)}
        GROUP BY child.item_code, child.item_name
        ORDER BY total DESC
        LIMIT 10
        """,
        values,
        as_dict=True,
    )

    return {
        "by_reason": by_reason,
        "top_items": top_items,
        "total": sum(flt(r.total) for r in by_reason),
    }
