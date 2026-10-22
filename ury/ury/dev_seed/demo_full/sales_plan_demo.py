"""Demo seed: 21 days of closed URY Sales Plan history + tomorrow's Draft.

For one Branch (the first Branch on the site, same resolution as the
``ury.ury.dev_seed`` modules, unless ``branch`` is passed) this creates:

* one URY Sales Plan per day for the last 21 days (ending yesterday), each
  with 5-8 menu items, walked through the REAL workflow
  Draft -> Proposed -> Submitted for Approval -> Approved -> Locked for
  Production via ``ury.ury.api.ury_sales_plan.transition_sales_plan`` (which
  calls Frappe's ``apply_workflow``; "Locked for Production" is the final
  non-cancelled state of this workflow). Day-of fulfilment is then recorded
  with ``ury.ury.api.ury_sales_plan_commit.apply_commit_delta`` so
  Plan-vs-Actual style reports show history.
* one Draft plan for TOMORROW (plan_date = today + 1), left un-submitted.

Idempotent: any date that already has a non-cancelled plan for the branch is
skipped. Each day is wrapped in try/except + rollback and committed on its own.

Usage (module must be importable, e.g. copied/PYTHONPATH'd into the bench):

    bench --site <site> execute sales_plan_demo.seed
"""

import random

import frappe
from frappe.utils import add_days, getdate, nowdate

from ury.ury.api.ury_sales_plan import transition_sales_plan
from ury.ury.api.ury_sales_plan_commit import apply_commit_delta

HISTORY_DAYS = 21
MIN_ITEMS, MAX_ITEMS = 5, 8
SERVICE_PERIODS = ("Lunch", "Dinner")
FORWARD_PATH = ("Proposed", "Submitted for Approval", "Approved", "Locked for Production")


def _resolve_branch_company(branch=None):
    # Same resolution as ury.ury.dev_seed.* (first Branch row on the site).
    branch = branch or frappe.db.get_value("Branch", {}, "name")
    company = frappe.db.get_value("Branch", branch, "company") if branch else None
    if branch and not company:
        company = frappe.db.get_value("Company", {}, "name")
    return branch, company


def _plannable_items(branch):
    """Items that are (a) on an enabled, non-disabled URY Menu of the branch
    (required by validate_items_on_active_menu at approval) and (b) have an
    active URY Item Production Configuration for the branch with department
    and production_unit (required by validate_plan_items)."""
    menus = frappe.get_all("URY Menu", filters={"branch": branch, "enabled": 1}, pluck="name")
    if not menus:
        return []
    on_menu = set(
        frappe.get_all(
            "URY Menu Item",
            filters={"parent": ["in", menus], "disabled": 0},
            pluck="item",
        )
    )
    configs = frappe.get_all(
        "URY Item Production Configuration",
        filters={"branch": branch, "active": 1},
        fields=["item", "department", "production_unit", "production_policy", "bom"],
        order_by="item asc",
    )
    out = {}
    for c in configs:
        if c.item in on_menu and c.department and c.production_unit and c.bom and c.item not in out:
            uom = frappe.db.get_value("Item", c.item, "stock_uom")
            if uom:
                out[c.item] = {
                    "item_code": c.item,
                    "stock_uom": uom,
                    "department": c.department,
                    "production_unit": c.production_unit,
                    "production_policy": c.production_policy,
                }
    return list(out.values())


def _plan_exists(branch, plan_date):
    return frappe.db.exists(
        "URY Sales Plan",
        {"branch": branch, "plan_date": plan_date, "docstatus": ["!=", 2], "status": ["!=", "Superseded/Cancelled"]},
    )


def _build_plan(branch, company, plan_date, catalog, rng):
    weekend = getdate(plan_date).weekday() >= 4  # Fri/Sat/Sun busier
    picks = rng.sample(catalog, min(len(catalog), rng.randint(MIN_ITEMS, MAX_ITEMS)))
    doc = frappe.get_doc(
        {
            "doctype": "URY Sales Plan",
            "status": "Draft",
            "branch": branch,
            "company": company,
            "plan_date": plan_date,
            "service_period": rng.choice(SERVICE_PERIODS),
            "enforcement_mode": rng.choice(("Hard", "Hard", "Soft", "Alert")),
        }
    )
    for p in picks:
        qty = rng.randint(30, 60) if weekend else rng.randint(15, 40)
        doc.append(
            "items",
            {
                "item_code": p["item_code"],
                "qty": qty,
                "stock_uom": p["stock_uom"],
                "department": p["department"],
                "production_unit": p["production_unit"],
                "production_policy": p["production_policy"],
            },
        )
    doc.insert(ignore_permissions=True)
    return doc


def _record_fulfilment(doc, branch, company, plan_date, rng):
    """Record produced/sold quantity through the real counter API."""
    n = 0
    for row in doc.items:
        fulfilled = round(row.qty * rng.uniform(0.7, 1.05))
        res = apply_commit_delta(
            row.item_code, branch, company, plan_date=plan_date, fulfilled_delta=fulfilled
        )
        if res:
            n += 1
    return n


def seed(branch=None):
    branch, company = _resolve_branch_company(branch)
    if not branch or not company:
        print("sales_plan_demo.seed: no Branch/Company found - skipping.")
        return {"skipped": True}

    catalog = _plannable_items(branch)
    if len(catalog) < MIN_ITEMS:
        print(
            f"sales_plan_demo.seed: only {len(catalog)} plannable items (menu + active "
            f"production config) for {branch}; need >= {MIN_ITEMS} - skipping."
        )
        return {"skipped": True, "reason": "not enough plannable items"}

    today = nowdate()
    stats = {"created": 0, "skipped": 0, "failed": 0, "draft_tomorrow": None}

    # Oldest first so the history reads chronologically in the list view.
    for offset in range(HISTORY_DAYS, 0, -1):
        plan_date = add_days(today, -offset)
        try:
            if _plan_exists(branch, plan_date):
                stats["skipped"] += 1
                continue
            rng = random.Random(f"{branch}:{plan_date}")
            doc = _build_plan(branch, company, plan_date, catalog, rng)
            for target in FORWARD_PATH:
                doc = transition_sales_plan(doc, target)
            fulfilled_rows = _record_fulfilment(doc, branch, company, plan_date, rng)
            frappe.db.commit()
            stats["created"] += 1
            print(f"  + {doc.name} {plan_date} [{doc.status}] {len(doc.items)} items, {fulfilled_rows} fulfilled")
        except Exception as e:
            frappe.db.rollback()
            stats["failed"] += 1
            print(f"  ! {plan_date}: {type(e).__name__}: {e}")
            frappe.log_error(title=f"sales_plan_demo {plan_date}", message=frappe.get_traceback())

    # Tomorrow: Draft, never submitted.
    plan_date = add_days(today, 1)
    try:
        if _plan_exists(branch, plan_date):
            stats["skipped"] += 1
        else:
            rng = random.Random(f"{branch}:{plan_date}")
            doc = _build_plan(branch, company, plan_date, catalog, rng)
            frappe.db.commit()
            stats["draft_tomorrow"] = doc.name
            print(f"  + {doc.name} {plan_date} [{doc.status}] (tomorrow, left in Draft)")
    except Exception as e:
        frappe.db.rollback()
        stats["failed"] += 1
        print(f"  ! {plan_date} (tomorrow): {type(e).__name__}: {e}")
        frappe.log_error(title=f"sales_plan_demo {plan_date}", message=frappe.get_traceback())

    print(
        f"sales_plan_demo summary ({branch}): created={stats['created']} skipped={stats['skipped']} "
        f"failed={stats['failed']} tomorrow_draft={stats['draft_tomorrow']}"
    )
    return stats
