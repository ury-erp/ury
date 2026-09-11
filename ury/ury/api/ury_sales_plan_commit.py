"""Sales Plan committed/fulfilled counter resolution and locked mutation.

Shared by `ury_availability.py` (read-only `_resolve_plan_remaining`) and
`ury_reservation_service.py` (transactional `committed_qty`/`fulfilled_qty`
maintenance on reservation create/release/fulfil), kept in its own module
rather than either of those to avoid a circular import between them
(`ury_availability` already imports `ury_reservation_service` for its
side-effect of loading the `URY Stock Reservation` doctype).

Matching logic mirrors `ury_availability._resolve_plan_remaining`'s existing
query: plans in scope for today's `plan_date` and an active `status`
(`Approved`/`Locked for Production`), then their `URY Sales Plan Item` child
rows filtered by `item_code`/(`department`).

Multiple-plan overlap: `URY Sales Plan.validate()` (see
`ury.ury.api.ury_sales_plan.validate_plan_items`) rejects approving a plan
that overlaps another Approved/Locked plan on the same item/branch/day, so in
steady state at most one plan should match a given item/branch/department/day
scope. `resolve_single_plan_item_row` still codes defensively for the
possibility of more than one match (e.g. plans approved before this
validation existed, or a department-less lookup crossing multiple rows) by
refusing to silently pick one -- it logs and returns None rather than
guessing, so a caller's counter maintenance simply no-ops for that event
rather than corrupting an arbitrarily-chosen row.
"""

import frappe
from frappe.utils import getdate

SALES_PLAN_DOCTYPE = "URY Sales Plan"
SALES_PLAN_ITEM_DOCTYPE = "URY Sales Plan Item"

ACTIVE_PLAN_STATUSES = ("Approved", "Locked for Production")


def _matching_plan_names(branch, company, plan_date=None):
    filters = {
        "branch": branch,
        "company": company,
        "status": ["in", list(ACTIVE_PLAN_STATUSES)],
        "plan_date": plan_date or getdate(),
    }
    return frappe.get_all(SALES_PLAN_DOCTYPE, filters=filters, pluck="name")


def resolve_plan_item_rows(item_code, branch, company, department=None, plan_date=None):
    """Read (unlocked) matching `URY Sales Plan Item` rows for the scope.

    Used by `ury_availability._resolve_plan_remaining` for a plain aggregate
    read -- not for mutation, so no locking here.
    """
    plan_names = _matching_plan_names(branch, company, plan_date=plan_date)
    if not plan_names:
        return []

    item_filters = {"parent": ["in", plan_names], "item_code": item_code}
    if department:
        item_filters["department"] = department

    return frappe.get_all(
        SALES_PLAN_ITEM_DOCTYPE,
        filters=item_filters,
        fields=["name", "parent", "qty", "committed_qty", "fulfilled_qty"],
    )


def resolve_single_plan_item_row(item_code, branch, company, department=None, plan_date=None):
    """Resolve the one `URY Sales Plan Item` row a given order line maps to.

    Returns None (not an exception) when nothing matches, or when more than
    one row matches -- see module docstring. Callers must treat None as
    "nothing to adjust", never as an error to surface to the order flow.
    """
    rows = resolve_plan_item_rows(item_code, branch, company, department=department, plan_date=plan_date)
    if not rows:
        return None
    if len(rows) > 1:
        frappe.log_error(
            title="URY Sales Plan committed_qty: ambiguous plan-item match",
            message=(
                "Item {0} at branch {1}/company {2}/department {3} matched {4} "
                "URY Sales Plan Item rows across active plans; expected at most one "
                "(the overlap-prevention validation on Sales Plan approval should "
                "have blocked this). Rows: {5}"
            ).format(item_code, branch, company, department, len(rows), [r["name"] for r in rows]),
        )
        return None
    return rows[0]


def resolve_plan_enforcement_mode(item_code, branch, company, department=None, plan_date=None):
    """Return the `enforcement_mode` of the single plan owning this item's row.

    Defaults to "Hard" (the doctype default, and the safe fail-closed choice)
    when no unambiguous matching plan-item row is found -- e.g. no active
    plan at all, in which case `NO_ACTIVE_PLAN` handling elsewhere already
    governs the outcome and this value is not consulted; kept as a safe
    default regardless.
    """
    row = resolve_single_plan_item_row(item_code, branch, company, department=department, plan_date=plan_date)
    if not row:
        return "Hard"
    return frappe.db.get_value(SALES_PLAN_DOCTYPE, row["parent"], "enforcement_mode") or "Hard"


def _lock_plan_item_row(name):
    rows = frappe.db.sql(
        """
        SELECT name, qty, committed_qty, fulfilled_qty
        FROM `tabURY Sales Plan Item`
        WHERE name = %(name)s
        FOR UPDATE
        """,
        {"name": name},
        as_dict=True,
    )
    return rows[0] if rows else None


def apply_commit_delta(
    item_code,
    branch,
    company,
    department=None,
    committed_delta=0,
    fulfilled_delta=0,
    plan_date=None,
):
    """Transactionally adjust `committed_qty`/`fulfilled_qty` on the matched plan-item row.

    Follows the `FOR UPDATE`-on-specific-row locking idiom established by
    `ury_fulfilment_posting_service.py` (raw `frappe.db.sql(... FOR UPDATE)`
    against the row's `name`, never `frappe.get_all`/`get_value` for the lock
    read). No-op (returns None) if no unambiguous matching row is found --
    items not governed by an active Sales Plan (or, defensively, an
    ambiguous multi-plan match) simply have nothing to adjust; this must
    never block the reservation lifecycle event that triggered it.

    Counters are clamped at 0 so float drift or an out-of-order event can
    never push a counter negative and corrupt every subsequent
    `plan_remaining` read.
    """
    if not committed_delta and not fulfilled_delta:
        return None

    row = resolve_single_plan_item_row(item_code, branch, company, department=department, plan_date=plan_date)
    if not row:
        return None

    locked = _lock_plan_item_row(row["name"])
    if not locked:
        return None

    new_committed = (locked.get("committed_qty") or 0) + committed_delta
    new_fulfilled = (locked.get("fulfilled_qty") or 0) + fulfilled_delta
    if new_committed < 0:
        new_committed = 0
    if new_fulfilled < 0:
        new_fulfilled = 0

    frappe.db.sql(
        """
        UPDATE `tabURY Sales Plan Item`
        SET committed_qty = %(committed)s, fulfilled_qty = %(fulfilled)s
        WHERE name = %(name)s
        """,
        {"committed": new_committed, "fulfilled": new_fulfilled, "name": row["name"]},
    )
    return {"name": row["name"], "committed_qty": new_committed, "fulfilled_qty": new_fulfilled}
