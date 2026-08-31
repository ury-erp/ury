"""Permanent, rerunnable demo-data seed: Wastage, Stock Reservations, Rooms.

Follow-up to `ury.ury.dev_seed.catalog`, `ury.ury.dev_seed.operations`, and
`ury.ury.dev_seed.historical_sales` — written after live-bench testing found
three dashboard pages with nothing to show: the Wastage report was empty,
the Stock Reservation page said "No active stock reservations for this
branch right now", and there were too few Rooms (`catalog.py` only ever
creates one, "Main Dining", holding all 12 tables — see
`ury/ury/dev_seed/catalog.py::_ensure_restaurant_and_room`).

Doctype/field contracts confirmed by reading actual code (cited inline
below, not guessed):

- `URY Issue Wastage` — `ury/ury/doctype/ury_issue_wastage/ury_issue_wastage.json`.
  `status` Select options are literally `Draft\\nAuthorized\\nRejected`.
  `reason_category` Select options are literally
  `Spoilage\\nPreparation Error\\nDropped/Damaged\\nExpired\\nOther`.
  Required links: `issue_authorization` (-> `URY Issue Authorization`),
  `plan` (-> `URY Sales Plan`), `branch`, `company`, `department`
  (-> `URY Production Department`), `component_item` (-> `Item`).
- The REAL whitelisted flow, `capture_wastage`/`approve_wastage` in
  `ury/ury/api/ury_wastage.py`, requires a real `URY Issue Authorization`
  with `status == "Authorized"` (see `_validate_authorization_scope`) and
  computes `held_quantity()` off it. No dev_seed module creates any
  `URY Issue Authorization` or `URY Sales Plan` records yet (confirmed via
  `rg "URY Sales Plan" ury/ury/dev_seed/*.py` — no hits), so driving the
  whitelisted flow here would require first fabricating a whole
  plan/authorization chain with no existing seed convention to copy. Per
  this task's own instructions, falling back to direct
  `frappe.get_doc(...).insert(ignore_permissions=True, ignore_mandatory=True)`
  is acceptable here (matches the precedent already used once this session
  for a manually-inserted demo wastage row) — this module still creates a
  real minimal `URY Sales Plan` and `URY Issue Authorization` chain first
  (rather than fabricating a dangling link), it just does so with direct
  inserts instead of the full planning-approval API surface, which is out
  of scope for a stock/report demo-data seed.
- `URY Stock Reservation` — `ury/ury/doctype/ury_stock_reservation/ury_stock_reservation.json`.
  `status` Select options are literally
  `Reserved\\nFulfilled\\nReleased\\nExpired\\nCancelled`. Required fields:
  `reservation_group`, `order_ref`, `status`, `branch`, `company`,
  `warehouse`, `top_level_item`, `component_item`, `qty`. The real
  whitelisted flow (`create_reservation` in
  `ury/ury/api/ury_reservation_service.py`) requires actual BOM components
  and available `Bin` capacity for a real Warehouse — this module instead
  seeds `URY Stock Reservation` rows directly with `status="Reserved"` so
  `frontend/src/pages/Dashboard/StockReservationPage.tsx` (via
  `frontend/src/services/stockReservation.ts`, which reads
  `reservation_group`/`order_ref`/`branch`/`company`/`warehouse`/
  `top_level_item`/`component_item`/`qty`/`status`/`expires_at`/`actor`/
  `reason`) has real rows to show, matching the same
  direct-insert-for-demo-data precedent as Wastage above.
- `URY Room` — `ury/ury/doctype/ury_room/ury_room.json`. Real fields are
  only `branch` (reqd Link), `room_type` (Select `AC\\nNON-AC`), and
  `printer_settings` (child table `URY Printer Settings`, left empty here —
  `catalog.py`'s own `_ensure_restaurant_and_room` never populates it
  either). `autoname` is `"Prompt"`, so `name` must be set explicitly on
  insert, exactly as `catalog.py` already does for "Main Dining". NOTE:
  `frontend/src/pages/Dashboard/RoomPage.tsx` also displays
  `kot_printing`/`print_format`/`block_takeaway` fields, but those do not
  exist directly on `URY Room` — they map to `URY Printer Settings` child
  fields `custom_kot_print_format`/`custom_block_takeaway_kot` (confirmed
  via `rg "kot_printing|block_takeaway|print_format" ury/fixtures/custom_field.json`,
  which shows these as custom fields on `URY Printer Settings`/`Printer
  Settings`, not `URY Room`) — this module does not attempt to populate
  that child table; `catalog.py`'s existing "Main Dining" room does not
  either, so leaving it empty matches the established precedent.
  `URY Table.restaurant_room` (see `catalog.py::_ensure_tables`) is a
  plain Link field, so this module redistributes `catalog.py`'s 12 tables
  (`T1`..`T12`) across the new rooms via `frappe.db.set_value`.

Usage (from a bench console / ``bench execute``)::

    bench execute ury.ury.dev_seed.more_seed.seed

This module is deliberately NOT wired into
``ury/ury/dev_seed/__init__.py``'s ``run_all()`` yet — that integration is
a separate follow-up step once this has been run and iterated on against a
live bench.
"""

import json

import frappe
from frappe.utils import add_days, now_datetime, nowdate


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

WASTAGE_REASON_CATEGORIES = ["Spoilage", "Preparation Error", "Dropped/Damaged", "Expired", "Other"]
WASTAGE_STATUSES = ["Draft", "Authorized", "Rejected"]
WASTAGE_ROW_COUNT = 7

RESERVATION_STATUSES = ["Reserved", "Reserved", "Reserved", "Fulfilled"]  # weighted toward "active"
RESERVATION_ROW_COUNT = 5

EXTRA_ROOMS = [
    # (room_name, room_type)
    ("Patio", "NON-AC"),
    ("Private Room", "AC"),
    ("Bar Area", "AC"),
]

# catalog.py's TABLES: T1..T12 (see ury/ury/dev_seed/catalog.py::TABLES).
# Distributed here across "Main Dining" + the new rooms so every table is
# not left in one room.
TABLE_ROOM_ASSIGNMENT = {
    "T1": "Main Dining",
    "T2": "Main Dining",
    "T3": "Main Dining",
    "T4": "Main Dining",
    "T5": "Main Dining",
    "T6": "Patio",
    "T7": "Patio",
    "T8": "Patio",
    "T9": "Private Room",
    "T10": "Private Room",
    "T11": "Bar Area",
    "T12": "Bar Area",
}


# ---------------------------------------------------------------------------
# Shared lookups (mirrors catalog.py / operations.py / historical_sales.py
# "reuse what exists, only create the minimum needed" convention)
# ---------------------------------------------------------------------------

def _get_branch_and_company():
    branch_name = frappe.db.get_value("Branch", {}, "name")
    company_name = frappe.db.get_value("Company", {}, "name")
    return branch_name, company_name


def _get_warehouse(company_name):
    return frappe.db.get_value("Warehouse", {"company": company_name, "is_group": 0}, "name")


def _get_departments():
    """(department_name -> name) for whatever ``URY Production Department``
    rows exist (seeded by ``ury.ury.dev_seed.operations``); skips gracefully
    if none exist yet, per that module's own precedent of not hard-failing.
    """
    return frappe.get_all("URY Production Department", pluck="name")


def _get_menu_items():
    """Reuse catalog.py's MENU_ITEMS-derived Items rather than re-defining
    the list here — read whatever sellable Items already exist (created by
    ``ury.ury.dev_seed.catalog``).
    """
    return frappe.get_all("Item", filters={"disabled": 0, "is_sales_item": 1}, pluck="name")


def _actor_user():
    rows = frappe.get_all(
        "Has Role", filters={"role": ["in", ["Production Manager", "Stock Manager"]], "parenttype": "User"},
        fields=["parent"],
    )
    users = sorted({r.parent for r in rows if r.parent not in ("Administrator", "Guest")})
    return users[0] if users else "Administrator"


# ---------------------------------------------------------------------------
# Minimal URY Sales Plan + URY Issue Authorization chain (direct insert;
# see module docstring for why the full planning API isn't driven here)
# ---------------------------------------------------------------------------

DEMO_PLAN_NAME = "dev-seed-more-seed-plan"  # legacy marker only; real name is autogenerated
DEMO_PLAN_SERVICE_PERIOD = "Dinner"


def _ensure_demo_plan(branch_name, company_name):
    # `URY Sales Plan` uses hash autonaming, so a `name` passed into
    # frappe.get_doc() is IGNORED -- the doc comes back with a generated
    # name (e.g. "cr9fkde91l"). Looking it up by DEMO_PLAN_NAME therefore
    # never matched, and every Issue Authorization below failed with
    # "Could not find Sales Plan: dev-seed-more-seed-plan" (confirmed on a
    # live bench). Identify the demo plan by its distinguishing FIELDS
    # instead, and thread the real generated name through to callers.
    existing = frappe.db.get_value(
        "URY Sales Plan",
        {
            "branch": branch_name,
            "company": company_name,
            "plan_date": nowdate(),
            "service_period": DEMO_PLAN_SERVICE_PERIOD,
        },
        "name",
    )
    if existing:
        return existing
    try:
        doc = frappe.get_doc(
            {
                "doctype": "URY Sales Plan",
                "status": "Approved",
                "branch": branch_name,
                "company": company_name,
                "plan_date": nowdate(),
                "service_period": DEMO_PLAN_SERVICE_PERIOD,
            }
        )
        doc.insert(ignore_permissions=True, ignore_mandatory=True)
        print(f"Created demo URY Sales Plan for wastage seeding: {doc.name}")
        return doc.name
    except Exception as e:
        print(f"  ! Failed to create demo URY Sales Plan: {e}")
        return None


def _ensure_demo_issue_authorization(plan_name, branch_name, company_name, department, component_item, authorized_qty):
    """One demo, already-Authorized ``URY Issue Authorization`` per
    (department, component_item) pair, sized generously so seeded wastage
    rows always fit under ``held_qty_before``/``authorized_qty``.
    """
    filters = {
        "plan": plan_name,
        "branch": branch_name,
        "department": department,
        "component_item": component_item,
    }
    existing = frappe.db.get_value("URY Issue Authorization", filters, "name")
    if existing:
        return existing
    try:
        doc = frappe.get_doc(
            {
                "doctype": "URY Issue Authorization",
                "plan": plan_name,
                "plan_approval_hash": frappe.generate_hash(length=20),
                "branch": branch_name,
                "company": company_name,
                "department": department,
                "component_item": component_item,
                "control_mode": "SOFT",
                "status": "Authorized",
                "required_qty": authorized_qty,
                "authorized_qty": authorized_qty,
                "remaining_before_qty": authorized_qty,
                "remaining_after_qty": authorized_qty,
                "actor": "Administrator",
            }
        )
        doc.insert(ignore_permissions=True, ignore_mandatory=True)
        return doc.name
    except Exception as e:
        print(f"  ! Failed to create demo URY Issue Authorization for {department}/{component_item}: {e}")
        return None


# ---------------------------------------------------------------------------
# Wastage
# ---------------------------------------------------------------------------

def _seed_wastage(branch_name, company_name, departments, items, actor):
    if not departments:
        print("more_seed.seed: no URY Production Department rows found (run dev_seed.operations.seed first) — skipping wastage.")
        return 0
    if not items:
        print("more_seed.seed: no sellable Items found (run dev_seed.catalog.seed first) — skipping wastage.")
        return 0

    plan_name = _ensure_demo_plan(branch_name, company_name)
    if not plan_name:
        print("more_seed.seed: could not create demo URY Sales Plan — skipping wastage.")
        return 0

    existing = frappe.db.count("URY Issue Wastage", {"plan": plan_name})
    if existing >= WASTAGE_ROW_COUNT:
        print(f"more_seed.seed: {existing} demo URY Issue Wastage row(s) already exist — skipping wastage.")
        return 0

    created = 0
    for i in range(WASTAGE_ROW_COUNT):
        department = departments[i % len(departments)]
        component_item = items[i % len(items)]
        status = WASTAGE_STATUSES[i % len(WASTAGE_STATUSES)]
        reason_category = WASTAGE_REASON_CATEGORIES[i % len(WASTAGE_REASON_CATEGORIES)]
        authorized_qty = 20
        wasted_qty = 2 + (i % 4)

        issue_authorization = _ensure_demo_issue_authorization(
            plan_name, branch_name, company_name, department, component_item, authorized_qty
        )
        if not issue_authorization:
            continue

        # Skip if this exact demo row was already seeded (idempotency for a
        # re-run, keyed on the (authorization, wasted_qty, status) triple
        # since URY Issue Wastage autonames by hash and has no natural key).
        if frappe.db.exists(
            "URY Issue Wastage",
            {"issue_authorization": issue_authorization, "wasted_qty": wasted_qty, "status": status},
        ):
            continue

        try:
            doc = frappe.get_doc(
                {
                    "doctype": "URY Issue Wastage",
                    "issue_authorization": issue_authorization,
                    "plan": plan_name,
                    "branch": branch_name,
                    "company": company_name,
                    "department": department,
                    "component_item": component_item,
                    "status": status,
                    "held_qty_before": authorized_qty,
                    "wasted_qty": wasted_qty,
                    "reason_category": reason_category,
                    "reason_notes": f"Dev-seed demo wastage ({reason_category.lower()})",
                    "captured_by": actor,
                    "captured_on": now_datetime(),
                }
            )
            if status in ("Authorized", "Rejected"):
                doc.approved_by = actor
                doc.approved_on = now_datetime()
                doc.approval_permission_basis = "Stock Manager" if status == "Authorized" else "System Manager"
                if status == "Authorized":
                    doc.valuation_rate = 45
                    doc.valuation_amount = wasted_qty * 45
                    doc.valuation_is_estimated = 1
            doc.audit_log = json.dumps(
                [{"event": "dev_seed", "actor": actor, "status": status}], sort_keys=True, default=str
            )
            doc.insert(ignore_permissions=True, ignore_mandatory=True)
            created += 1
            print(f"Created URY Issue Wastage: {doc.name} ({department}/{component_item}, status={status})")
        except Exception as e:
            print(f"  ! Failed to seed URY Issue Wastage for {department}/{component_item}: {e}")

    return created


# ---------------------------------------------------------------------------
# Stock Reservations
# ---------------------------------------------------------------------------

def _seed_stock_reservations(branch_name, company_name, warehouse, items, actor):
    if not warehouse:
        print(f"more_seed.seed: no Warehouse found for company {company_name} — skipping stock reservations.")
        return 0
    if not items:
        print("more_seed.seed: no sellable Items found — skipping stock reservations.")
        return 0

    existing = frappe.db.count("URY Stock Reservation", {"branch": branch_name, "warehouse": warehouse})
    if existing >= RESERVATION_ROW_COUNT:
        print(f"more_seed.seed: {existing} URY Stock Reservation row(s) already exist for {branch_name}/{warehouse} — skipping.")
        return 0

    created = 0
    for i in range(RESERVATION_ROW_COUNT):
        component_item = items[(i + 1) % len(items)]
        status = RESERVATION_STATUSES[i % len(RESERVATION_STATUSES)]
        qty = 3 + (i % 5)
        order_ref = f"ORD-{2000 + i + 1}"

        if frappe.db.exists(
            "URY Stock Reservation",
            {"branch": branch_name, "warehouse": warehouse, "order_ref": order_ref},
        ):
            continue

        try:
            doc = frappe.get_doc(
                {
                    "doctype": "URY Stock Reservation",
                    "reservation_group": frappe.generate_hash(length=10),
                    "order_ref": order_ref,
                    "policy": "SOFT",
                    "status": status,
                    "reason": "Held for dine-in order" if status != "Reserved" else None,
                    "branch": branch_name,
                    "company": company_name,
                    "warehouse": warehouse,
                    "top_level_item": component_item,
                    "component_item": component_item,
                    "qty": qty,
                    "expires_at": add_days(now_datetime(), 1) if status == "Reserved" else None,
                    "actor": actor,
                    "audit_log": json.dumps(
                        [{"event": "dev_seed", "actor": actor, "status": status}], sort_keys=True, default=str
                    ),
                }
            )
            doc.insert(ignore_permissions=True, ignore_mandatory=True)
            created += 1
            print(f"Created URY Stock Reservation: {doc.name} ({component_item}, status={status})")
        except Exception as e:
            print(f"  ! Failed to seed URY Stock Reservation for {component_item}: {e}")

    return created


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------

def _seed_rooms(branch_name):
    existing_rooms = frappe.get_all("URY Room", filters={"branch": branch_name}, pluck="name")
    created = []
    for room_name, room_type in EXTRA_ROOMS:
        if room_name in existing_rooms or frappe.db.exists("URY Room", room_name):
            continue
        try:
            doc = frappe.get_doc(
                {
                    "doctype": "URY Room",
                    "name": room_name,
                    "branch": branch_name,
                    "room_type": room_type,
                }
            )
            doc.insert(ignore_permissions=True)
            created.append(doc.name)
            print(f"Created URY Room: {doc.name}")
        except Exception as e:
            print(f"  ! Failed to create URY Room {room_name}: {e}")

    # Redistribute catalog.py's T1..T12 tables across rooms so they aren't
    # all left in "Main Dining" (URY Table.restaurant_room is a plain Link
    # field, safe to update directly — see catalog.py::_ensure_tables).
    reassigned = 0
    for table_name, room_name in TABLE_ROOM_ASSIGNMENT.items():
        if not frappe.db.exists("URY Table", table_name):
            continue
        if not frappe.db.exists("URY Room", room_name):
            continue
        current_room = frappe.db.get_value("URY Table", table_name, "restaurant_room")
        if current_room != room_name:
            frappe.db.set_value("URY Table", table_name, "restaurant_room", room_name)
            reassigned += 1

    if reassigned:
        print(f"Reassigned {reassigned} URY Table row(s) across rooms")

    return created, reassigned


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def seed():
    """Idempotent entrypoint — safe to call repeatedly, e.g. via
    ``bench execute ury.ury.dev_seed.more_seed.seed``.
    """
    branch_name, company_name = _get_branch_and_company()
    if not branch_name or not company_name:
        print("more_seed.seed: no Branch/Company found on this site — skipping.")
        return {"skipped": True, "reason": "no Branch/Company"}

    warehouse = _get_warehouse(company_name)
    departments = _get_departments()
    items = _get_menu_items()
    actor = _actor_user()

    wastage_created = _seed_wastage(branch_name, company_name, departments, items, actor)
    reservations_created = _seed_stock_reservations(branch_name, company_name, warehouse, items, actor)
    rooms_created, tables_reassigned = _seed_rooms(branch_name)

    frappe.db.commit()

    summary = {
        "branch": branch_name,
        "company": company_name,
        "wastage_created": wastage_created,
        "stock_reservations_created": reservations_created,
        "rooms_created": len(rooms_created),
        "tables_reassigned": tables_reassigned,
    }
    print(f"more_seed seed complete: {summary}")
    return summary


# Backwards-compatible alias matching this package's other modules'
# ``run()`` convention.
run = seed
