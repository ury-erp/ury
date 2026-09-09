"""Permanent, rerunnable demo-data seed: Purchase Invoices, completed Work
Orders, and an approved multi-date URY Sales Plan spread.

Follow-up to a live-bench audit (``SEED_GAP_MAP.md``, generated against
container ``frappe_docker_devcontainer-frappe-1`` / site ``ury.localhost``)
which found three report surfaces genuinely empty because no dev_seed
module touched their doctypes at all:

- **Item Wise Purchase History** (`ury.ury.report_api.items.get_item_wise_purchase_history`)
  reads submitted ``Purchase Invoice`` + ``Purchase Invoice Item`` rows —
  0 existed on the bench, and no seed script created any.
- **Completed Work Orders** (`ury.ury.report_api.operations.get_completed_work_orders`)
  reads ``tabWork Order`` rows with ``status = "Completed"`` AND
  ``docstatus = 1`` — 0 existed. Confirmed by reading the endpoint directly
  (``ury/ury/report_api/operations.py::get_completed_work_orders``): no
  URY-specific state machine, just the standard ERPNext Work Order status.
- **Department Profitability / Plan vs Actual**
  (`ury.ury.api.ury_department_profitability`) both fail closed with
  ``MISSING_APPROVED_PLAN`` unless an approved ``URY Sales Plan`` exists
  *with a populated ``approval_snapshot``* for the requested
  company/branch/period. ``ury/ury/dev_seed/more_seed.py`` already creates
  one ``URY Sales Plan`` with ``status="Approved"`` (for wastage/issue-auth
  seeding), but — confirmed by reading
  ``ury/ury/api/ury_department_profitability.py::_load_approved_plan_items``
  — that endpoint never reads a plan's live ``items`` child table, only its
  frozen ``approval_snapshot`` JSON (built by
  ``ury/ury/api/ury_sales_plan.py::freeze_approval_snapshot``). Since
  ``more_seed.py``'s plan has no items and therefore no snapshot, both
  reports still fail closed even after that plan exists. This module adds
  proper item rows + a hand-built snapshot (mirroring
  ``freeze_approval_snapshot``'s exact payload shape) to a small spread of
  Sales Plans across recent dates, using the same item -> department
  mapping ``ury.ury.dev_seed.operations`` already created via
  ``URY Item Production Configuration``, so plan items line up with
  departments AND with items that are actually sold on seeded POS Invoices
  (Department Profitability composes revenue from real POS Invoice lines
  joined against the plan's item->department map).

Verified on a live bench console (not guessed) before writing this module:
  - Work Order: ``WorkOrder.validate()`` (erpnext.manufacturing.doctype.
    work_order.work_order) recomputes ``status`` via ``get_status()`` on
    every save/submit; setting ``skip_transfer=1`` and
    ``produced_qty=qty`` before submit deterministically yields
    ``status="Completed"`` at submit time (docstatus=1) — no separate Stock
    Entry / manufacture cycle needed. Required a submitted default ``BOM``
    for the production item and both ``fg_warehouse``/``wip_warehouse``
    (``MandatoryError`` without ``fg_warehouse`` even with
    ``skip_transfer=1``).
  - Purchase Invoice: catalog.py's menu Items are ``is_stock_item=0``, so
    ``update_stock=0`` + an explicit ``expense_account`` per row (Company's
    ``default_expense_account``) submits cleanly with no warehouse/stock
    ledger involvement.
  - Sales Plan: ``URY Sales Plan`` uses hash autonaming (confirmed already
    by more_seed.py's own docstring/comments) — a fixed ``name`` is
    ignored, so plans are looked up by (branch, company, plan_date,
    service_period) instead.

Coupling note: this module's ``PURCHASE_SPAN_DAYS`` mirrors
``historical_sales.py``'s ``HISTORICAL_DAYS`` (120, ~4 calendar months) so
Purchase Invoices land inside the same window as the POS Invoice history
that other module seeds — kept as an independent constant here (rather than
importing historical_sales, which is being actively rewritten by another
agent this session) and noted here for reconciliation once both land.

Usage (from a bench console / ``bench execute``)::

    bench execute ury.ury.dev_seed.purchasing_seed.seed
"""

import frappe
from frappe.utils import add_days, nowdate


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# Mirrors historical_sales.py::HISTORICAL_DAYS -- see module docstring's
# "Coupling note". Kept as an independent constant since historical_sales.py
# is out of scope (another agent is rewriting it this session).
PURCHASE_SPAN_DAYS = 120

SUPPLIERS = [
	"Fresh Farms Supplier",
	"Spice Route Wholesale",
	"City Beverage Distributors",
]

PURCHASE_INVOICE_COUNT = 12  # spread across PURCHASE_SPAN_DAYS -- see SEED_GAP_MAP.md's
                              # "~10 Purchase Invoices spread across the window" target
PURCHASE_ITEMS_PER_INVOICE = (3, 6)  # (min, max) line items per invoice

WORK_ORDER_COUNT = 8  # SEED_GAP_MAP.md flags this as lowest-priority/"nice to have"
                       # since Work Order has no URY-specific tie-in at all

# Sales Plan dates to approve with a real snapshot (today + a few recent
# days, so Plan vs Actual / Department Profitability have more than one
# comparable date). Kept small and fixed-count per the task's "watch
# volume" guidance -- these are cheap single-doc inserts, not bulk data.
SALES_PLAN_OFFSETS = [0, 1, 3, 7]  # days back from today
SALES_PLAN_SERVICE_PERIOD = "Dinner"
# Every resolvable item (production config + production_unit assigned) is
# covered, not a fixed subset -- a real order-creation test needs any item
# on the menu to be plannable, not just a fixed demo sample. Capped only as
# a sanity ceiling against a runaway catalog, not a deliberate demo-size
# limit.
SALES_PLAN_ITEMS_PER_PLAN = 500
SALES_PLAN_QTY_PER_ITEM = 25


# ---------------------------------------------------------------------------
# Shared lookups
# ---------------------------------------------------------------------------

def _get_branch_and_company():
	"""Resolve branch first, then derive company from THAT branch's own
	`company` field -- picking an arbitrary Company row independently of
	the chosen branch (the previous behavior) silently mismatches on any
	multi-company site. This is the same class of bug already fixed in
	operations.py's _get_company(); this is a separate occurrence in this
	file, not shared code, so fixed here too.
	"""
	branch_name = frappe.db.get_value("Branch", {}, "name")
	company_name = frappe.db.get_value("Branch", branch_name, "company") if branch_name else None
	if not company_name:
		company_name = frappe.db.get_value("Company", {}, "name")
	return branch_name, company_name


def _get_menu_items():
	"""Reuse catalog.py's MENU_ITEMS-derived Items -- see catalog.py's own
	docstring precedent (also followed by more_seed.py) of reading whatever
	sellable Items already exist rather than re-defining the list here.
	"""
	return frappe.get_all("Item", filters={"disabled": 0, "is_sales_item": 1}, pluck="name")


def _get_default_expense_account(company_name):
	return frappe.db.get_value("Company", company_name, "default_expense_account")


def _get_supplier_group():
	return frappe.db.get_value("Supplier Group", {}, "name") or "All Supplier Groups"


# ---------------------------------------------------------------------------
# Purchase Invoices
# ---------------------------------------------------------------------------

def _ensure_suppliers():
	supplier_group = _get_supplier_group()
	created = []
	for supplier_name in SUPPLIERS:
		if frappe.db.exists("Supplier", supplier_name):
			continue
		try:
			doc = frappe.get_doc(
				{
					"doctype": "Supplier",
					"supplier_name": supplier_name,
					"supplier_group": supplier_group,
					"supplier_type": "Company",
				}
			)
			doc.insert(ignore_permissions=True)
			created.append(doc.name)
			print(f"Created Supplier: {doc.name}")
		except Exception as e:
			print(f"  ! Failed to create Supplier {supplier_name}: {e}")
	return created


def _purchase_invoice_dates():
	"""PURCHASE_INVOICE_COUNT dates evenly spread across the last
	PURCHASE_SPAN_DAYS days (oldest first), so purchase history isn't
	bunched at one end of the window.
	"""
	if PURCHASE_INVOICE_COUNT <= 1:
		return [nowdate()]
	step = PURCHASE_SPAN_DAYS / (PURCHASE_INVOICE_COUNT - 1)
	offsets = sorted({round(i * step) for i in range(PURCHASE_INVOICE_COUNT)})
	return [add_days(nowdate(), -offset) for offset in offsets]


def _seed_purchase_invoices(branch_name, company_name, items, expense_account):
	if not items:
		print("purchasing_seed.seed: no sellable Items found (run dev_seed.catalog.seed first) — skipping Purchase Invoices.")
		return 0
	if not expense_account:
		print(f"purchasing_seed.seed: no default_expense_account set on Company {company_name} — skipping Purchase Invoices.")
		return 0

	existing = frappe.db.count("Purchase Invoice", {"company": company_name})
	if existing >= PURCHASE_INVOICE_COUNT:
		print(f"purchasing_seed.seed: {existing} Purchase Invoice(s) already exist for {company_name} — skipping.")
		return 0

	created = 0
	for i, posting_date in enumerate(_purchase_invoice_dates()):
		supplier = SUPPLIERS[i % len(SUPPLIERS)]
		if not frappe.db.exists("Supplier", supplier):
			continue

		# Idempotency key: this module's own supplier + posting_date pair --
		# Purchase Invoice has no other natural key, and re-running seed()
		# must not create a second invoice for a date already covered.
		if frappe.db.exists(
			"Purchase Invoice", {"supplier": supplier, "company": company_name, "posting_date": posting_date}
		):
			continue

		line_count = PURCHASE_ITEMS_PER_INVOICE[0] + (i % (PURCHASE_ITEMS_PER_INVOICE[1] - PURCHASE_ITEMS_PER_INVOICE[0] + 1))
		chosen_items = [items[(i + j) % len(items)] for j in range(line_count)]

		try:
			doc = frappe.get_doc(
				{
					"doctype": "Purchase Invoice",
					"supplier": supplier,
					"company": company_name,
					"branch": branch_name,
					"posting_date": posting_date,
					"set_posting_time": 1,
					"update_stock": 0,
					"items": [
						{
							"item_code": item_code,
							"qty": 8 + ((i + j) % 12),
							"rate": 20 + ((i + j) % 8) * 5,
							"expense_account": expense_account,
						}
						for j, item_code in enumerate(chosen_items)
					],
				}
			)
			doc.insert(ignore_permissions=True)
			doc.submit()
			created += 1
			print(f"Created Purchase Invoice: {doc.name} ({supplier}, {posting_date}, {len(chosen_items)} lines)")
		except Exception as e:
			print(f"  ! Failed to seed Purchase Invoice for {supplier}/{posting_date}: {e}")
			frappe.db.rollback()

	return created


# ---------------------------------------------------------------------------
# Stock for stray real-data history items (items with real POS Invoice
# history that predate/aren't part of catalog.py's MENU_ITEMS -- see
# ury.ury.dev_seed.operations._ensure_item_production_configurations_for_stray_history_items,
# whose docstring and query this mirrors).
#
# On a bench restored from real production data, these stray items are the
# ONLY sellable items that exist, but this module (see its own docstring) is
# otherwise entirely scoped to catalog.py's MENU_ITEMS-derived Items --
# ``_get_menu_items()`` above only reads ``is_sales_item=1`` Items, which
# real historical items generally aren't tagged as, and even where they are,
# nothing in this module has ever given them a stock balance. So even after
# operations.py's stray-item function backfills a resolvable
# ``URY Item Production Configuration`` for them, ``get_item_availability``
# (ury/ury/api/ury_availability.py) correctly reports zero stock forever,
# because no seed script ever created any. This section closes that gap.
# ---------------------------------------------------------------------------

STRAY_ITEM_OPENING_QTY = 50  # matches a typical demo-catalog opening qty


def _get_stray_history_item_codes(branch_name):
	"""Item codes with real POS Invoice history on this branch that aren't
	part of catalog.py's MENU_ITEMS. Mirrors
	``operations._ensure_item_production_configurations_for_stray_history_items``'s
	own query verbatim, so the two modules agree on what counts as "stray".
	"""
	from ury.ury.dev_seed.catalog import MENU_ITEMS

	menu_item_names = {name for name, _group, _rate in MENU_ITEMS}

	item_codes = frappe.db.sql_list(
		"""
		SELECT DISTINCT pii.item_code
		FROM `tabPOS Invoice Item` pii
		INNER JOIN `tabPOS Invoice` pi ON pi.name = pii.parent
		WHERE pi.branch = %(branch)s AND pi.docstatus = 1
		""",
		{"branch": branch_name},
	)
	return [code for code in item_codes if code not in menu_item_names]


def _resolve_stray_item_warehouse(item_code, branch_name):
	"""Resolve the exact warehouse ``get_item_availability`` will read stock
	from for this item, via the single authoritative resolver
	(``ury.ury.api.ury_production_context.resolve_production_context``)
	rather than re-deriving its PRE_PRODUCED/DIRECT_RETAIL ->
	``direct_retail_warehouse`` vs. MADE_TO_ORDER -> production unit's
	warehouse (department warehouse fallback) logic here. Returns
	``(warehouse, production_policy)``, both ``None`` if the item has no
	resolvable production config yet (e.g. operations.seed() hasn't run, or
	an unmapped item_group left it without a production_unit/department).
	"""
	from ury.ury.api.ury_production_context import resolve_production_context

	context = resolve_production_context(item_code, branch_name)
	if not context:
		return None, None
	return context.get("warehouse"), context.get("production_policy")


def _ensure_stock_for_stray_history_items(branch_name, company_name):
	"""Give every stray real-data history item (``_get_stray_history_item_codes``)
	that already has a resolvable ``URY Item Production Configuration`` a
	real opening stock balance in whichever warehouse
	``get_item_availability`` actually reads from.

	Also flips ``Item.is_stock_item`` to 1 when needed: real production
	Items restored from a live bench are frequently non-stock
	(``is_stock_item=0``, since they were historically sold as plain
	menu/sales items with no stock tracking wired up), and a non-stock Item
	cannot receive a Stock Entry at all -- confirmed live (``BBQWNG`` came
	back ``is_stock_item=0`` on the coherence-audit bench).

	Idempotent: skips any item whose resolved warehouse already carries at
	least ``STRAY_ITEM_OPENING_QTY`` (via ``Bin.actual_qty``), and reuses
	whatever config/warehouse ``resolve_production_context`` already
	resolves rather than guessing at one.
	"""
	item_codes = _get_stray_history_item_codes(branch_name)
	if not item_codes:
		return 0

	created = 0
	for item_code in item_codes:
		try:
			warehouse, production_policy = _resolve_stray_item_warehouse(item_code, branch_name)
			if not warehouse:
				# No resolvable production config yet (operations.seed()
				# hasn't run, or this item is still unmapped) -- nothing to
				# stock into.
				continue

			current_qty = frappe.db.get_value(
				"Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"
			) or 0
			if current_qty >= STRAY_ITEM_OPENING_QTY:
				continue

			if not frappe.db.get_value("Item", item_code, "is_stock_item"):
				frappe.db.set_value("Item", item_code, "is_stock_item", 1)
				print(f"Flagged stray history item {item_code} as is_stock_item=1")

			qty_to_add = STRAY_ITEM_OPENING_QTY - current_qty
			doc = frappe.get_doc(
				{
					"doctype": "Stock Entry",
					"stock_entry_type": "Material Receipt",
					"purpose": "Material Receipt",
					"company": company_name,
					"items": [
						{
							"item_code": item_code,
							"qty": qty_to_add,
							"t_warehouse": warehouse,
							"basic_rate": 100,
						}
					],
				}
			)
			doc.insert(ignore_permissions=True)
			doc.submit()
			created += 1
			print(
				f"Created opening Stock Entry for stray history item {item_code}: "
				f"+{qty_to_add} in {warehouse} (policy={production_policy})"
			)
		except Exception as e:
			print(f"  ! Failed to seed stock for stray history item {item_code}: {e}")
			frappe.db.rollback()

	return created


# ---------------------------------------------------------------------------
# Completed Work Orders
# ---------------------------------------------------------------------------

WORK_ORDER_PRODUCTION_ITEM = "DEMO-CHICKEN"  # real stock Item confirmed to exist
                                              # on this bench (ERPNext demo data)
WORK_ORDER_RAW_MATERIALS = ["DEMO-ONION", "DEMO-CAPSICUM"]
WORK_ORDER_BOM_NAME = f"BOM-{WORK_ORDER_PRODUCTION_ITEM}-001"


def _ensure_work_order_bom(company_name):
	if frappe.db.exists("BOM", {"item": WORK_ORDER_PRODUCTION_ITEM, "docstatus": 1}):
		return frappe.db.get_value(
			"BOM", {"item": WORK_ORDER_PRODUCTION_ITEM, "docstatus": 1, "is_default": 1}, "name"
		)

	missing = [i for i in WORK_ORDER_RAW_MATERIALS if not frappe.db.exists("Item", i)]
	if missing or not frappe.db.exists("Item", WORK_ORDER_PRODUCTION_ITEM):
		print(f"purchasing_seed.seed: expected demo stock Items not found ({[WORK_ORDER_PRODUCTION_ITEM] + missing}) — skipping Work Order BOM.")
		return None

	try:
		doc = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": WORK_ORDER_PRODUCTION_ITEM,
				"company": company_name,
				"quantity": 1,
				"is_active": 1,
				"is_default": 1,
				"items": [
					{"item_code": item_code, "qty": 1, "rate": 40}
					for item_code in WORK_ORDER_RAW_MATERIALS
				],
			}
		)
		doc.insert(ignore_permissions=True)
		doc.submit()
		print(f"Created BOM: {doc.name}")
		return doc.name
	except Exception as e:
		print(f"  ! Failed to create demo BOM for {WORK_ORDER_PRODUCTION_ITEM}: {e}")
		frappe.db.rollback()
		return None


def _work_order_dates():
	if WORK_ORDER_COUNT <= 1:
		return [nowdate()]
	step = PURCHASE_SPAN_DAYS / (WORK_ORDER_COUNT - 1)
	offsets = sorted({round(i * step) for i in range(WORK_ORDER_COUNT)})
	return [add_days(nowdate(), -offset) for offset in offsets]


def _seed_work_orders(company_name, fg_warehouse, wip_warehouse):
	if not fg_warehouse or not wip_warehouse:
		print(f"purchasing_seed.seed: could not resolve Finished Goods / Work In Progress warehouses for {company_name} — skipping Work Orders.")
		return 0

	bom_name = _ensure_work_order_bom(company_name)
	if not bom_name:
		return 0

	existing = frappe.db.count("Work Order", {"production_item": WORK_ORDER_PRODUCTION_ITEM, "status": "Completed", "docstatus": 1})
	if existing >= WORK_ORDER_COUNT:
		print(f"purchasing_seed.seed: {existing} completed Work Order(s) already exist — skipping.")
		return 0

	created = 0
	for i, planned_date in enumerate(_work_order_dates()):
		# Idempotency key: production_item + planned_start_date, since this
		# module always drives the same production_item/BOM.
		if frappe.db.exists(
			"Work Order",
			[
				["Work Order", "production_item", "=", WORK_ORDER_PRODUCTION_ITEM],
				["Work Order", "planned_start_date", ">=", f"{planned_date} 00:00:00"],
				["Work Order", "planned_start_date", "<", f"{add_days(planned_date, 1)} 00:00:00"],
			],
		):
			continue

		qty = 10 + (i % 5) * 2
		try:
			doc = frappe.get_doc(
				{
					"doctype": "Work Order",
					"production_item": WORK_ORDER_PRODUCTION_ITEM,
					"bom_no": bom_name,
					"qty": qty,
					"company": company_name,
					"skip_transfer": 1,
					"fg_warehouse": fg_warehouse,
					"wip_warehouse": wip_warehouse,
					"planned_start_date": f"{planned_date} 09:00:00",
					"expected_delivery_date": planned_date,
					"produced_qty": qty,
				}
			)
			doc.insert(ignore_permissions=True)
			doc.actual_start_date = f"{planned_date} 09:00:00"
			doc.actual_end_date = f"{planned_date} 14:00:00"
			doc.submit()
			if doc.status != "Completed":
				print(f"  ! Work Order {doc.name} submitted with status={doc.status}, expected Completed")
			created += 1
			print(f"Created Work Order: {doc.name} (status={doc.status}, qty={qty}, {planned_date})")
			frappe.db.commit()
		except Exception as e:
			print(f"  ! Failed to seed Work Order for {planned_date}: {e}")
			frappe.db.rollback()

	return created


# ---------------------------------------------------------------------------
# Approved multi-date URY Sales Plan (Department Profitability / Plan vs
# Actual). Builds a real approval_snapshot -- see module docstring.
# ---------------------------------------------------------------------------

def _get_item_department_map():
	"""item_code -> department, from URY Item Production Configuration rows
	that ury.ury.dev_seed.operations already created. Returns {} (and lets
	the caller skip) if that module hasn't run yet.

	Only rows with BOTH department and production_unit assigned are
	included -- a Sales Plan item row with a null production_unit is not
	genuinely plannable/producible (nothing can pick it up on the KDS/
	production side), so it shouldn't be snapshotted into an "Approved"
	plan as if it were.
	"""
	rows = frappe.get_all(
		"URY Item Production Configuration",
		fields=["item", "department", "production_unit", "production_policy"],
		filters={"active": 1},
	)
	skipped_no_unit = [r.item for r in rows if r.department and not r.production_unit]
	if skipped_no_unit:
		print(f"purchasing_seed._get_item_department_map: {len(skipped_no_unit)} item(s) have a department but no production_unit, excluded from Sales Plan coverage: {skipped_no_unit}")
	return {r.item: r for r in rows if r.department and r.production_unit}


def _snapshot_item(item_code, config, qty):
	return {
		"item_code": item_code,
		"qty": qty,
		"stock_uom": frappe.db.get_value("Item", item_code, "stock_uom"),
		"department": config["department"],
		"production_unit": config.get("production_unit"),
		"production_policy": config.get("production_policy"),
		"bom": None,
		"bom_revision": None,
	}


def _ensure_approved_sales_plan(branch_name, company_name, plan_date, item_department_map):
	existing = frappe.db.get_value(
		"URY Sales Plan",
		{
			"branch": branch_name,
			"company": company_name,
			"plan_date": plan_date,
			"service_period": SALES_PLAN_SERVICE_PERIOD,
			"status": ["in", ["Approved", "Locked for Production"]],
		},
		"name",
	)
	if existing:
		# Already-approved plan from an earlier run -- verify it actually has
		# a snapshot (an older/partial run, or more_seed.py's own plan for a
		# different purpose, might not). Only backfill if missing.
		if frappe.db.get_value("URY Sales Plan", existing, "approval_snapshot"):
			return existing, False

	item_codes = list(item_department_map.keys())
	if not item_codes:
		return None, False
	chosen = [item_codes[i % len(item_codes)] for i in range(min(SALES_PLAN_ITEMS_PER_PLAN, len(item_codes)))]
	items_payload = [_snapshot_item(code, item_department_map[code], SALES_PLAN_QTY_PER_ITEM) for code in chosen]

	import hashlib
	import json

	snapshot_payload = {
		"branch": branch_name,
		"company": company_name,
		"plan_date": str(plan_date),
		"service_period": SALES_PLAN_SERVICE_PERIOD,
		"items": items_payload,
		"insight_snapshot": {},
	}
	encoded = json.dumps(snapshot_payload, sort_keys=True, separators=(",", ":"), default=str)
	snapshot_hash = hashlib.sha256(encoded.encode("utf-8")).hexdigest()

	try:
		if existing:
			doc = frappe.get_doc("URY Sales Plan", existing)
		else:
			doc = frappe.get_doc(
				{
					"doctype": "URY Sales Plan",
					"status": "Draft",
					"branch": branch_name,
					"company": company_name,
					"plan_date": plan_date,
					"service_period": SALES_PLAN_SERVICE_PERIOD,
				}
			)
		doc.set("items", [])
		for item in items_payload:
			doc.append(
				"items",
				{
					"item_code": item["item_code"],
					"qty": item["qty"],
					"stock_uom": item["stock_uom"],
					"department": item["department"],
					"production_unit": item["production_unit"],
					"production_policy": item["production_policy"],
				},
			)
		doc.status = "Approved"
		doc.approval_snapshot = encoded
		doc.approval_snapshot_hash = snapshot_hash
		if existing:
			doc.save(ignore_permissions=True)
		else:
			doc.insert(ignore_permissions=True)
		print(f"Approved URY Sales Plan with snapshot: {doc.name} ({plan_date}, {len(items_payload)} items)")
		return doc.name, True
	except Exception as e:
		print(f"  ! Failed to seed approved URY Sales Plan for {plan_date}: {e}")
		frappe.db.rollback()
		return None, False


def _seed_sales_plans(branch_name, company_name):
	item_department_map = _get_item_department_map()
	if not item_department_map:
		print("purchasing_seed.seed: no URY Item Production Configuration rows found (run dev_seed.operations.seed first) — skipping Sales Plan snapshots.")
		return 0

	created_or_fixed = 0
	for offset in SALES_PLAN_OFFSETS:
		plan_date = add_days(nowdate(), -offset)
		_, changed = _ensure_approved_sales_plan(branch_name, company_name, plan_date, item_department_map)
		if changed:
			created_or_fixed += 1

	return created_or_fixed


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def seed():
	"""Idempotent entrypoint — safe to call repeatedly, e.g. via
	``bench execute ury.ury.dev_seed.purchasing_seed.seed``.
	"""
	branch_name, company_name = _get_branch_and_company()
	if not branch_name or not company_name:
		print("purchasing_seed.seed: no Branch/Company found on this site — skipping.")
		return {"skipped": True, "reason": "no Branch/Company"}

	items = _get_menu_items()
	expense_account = _get_default_expense_account(company_name)
	fg_warehouse = frappe.db.get_value("Warehouse", {"company": company_name, "warehouse_name": "Finished Goods"}, "name") \
		or frappe.db.get_value("Warehouse", {"company": company_name, "name": ["like", "Finished Goods%"]}, "name")
	wip_warehouse = frappe.db.get_value("Warehouse", {"company": company_name, "warehouse_name": "Work In Progress"}, "name") \
		or frappe.db.get_value("Warehouse", {"company": company_name, "name": ["like", "Work In Progress%"]}, "name")

	_ensure_suppliers()
	purchase_invoices_created = _seed_purchase_invoices(branch_name, company_name, items, expense_account)
	stray_item_stock_created = _ensure_stock_for_stray_history_items(branch_name, company_name)
	work_orders_created = _seed_work_orders(company_name, fg_warehouse, wip_warehouse)
	sales_plans_created = _seed_sales_plans(branch_name, company_name)

	frappe.db.commit()

	summary = {
		"branch": branch_name,
		"company": company_name,
		"purchase_invoices_created": purchase_invoices_created,
		"stray_item_stock_created": stray_item_stock_created,
		"work_orders_created": work_orders_created,
		"sales_plans_created_or_fixed": sales_plans_created,
	}
	print(f"purchasing_seed seed complete: {summary}")
	return summary


# Backwards-compatible alias matching this package's other modules' ``run()``
# convention.
run = seed
