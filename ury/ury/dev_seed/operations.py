"""Permanent, rerunnable demo-data seed for kitchen operations config on the
"My Restaurant" demo branch: production departments/units, item production
configurations for the full ``catalog.py`` menu, one ``URY Report Settings``
record, and a handful of aggregator (Zomato/Swiggy/Direct) settings on the
Branch.

Idempotent: every insert is guarded by ``frappe.db.exists`` so this is safe
to call repeatedly (e.g. after ``bench migrate`` wipes manually-entered test
data).

Usage (from a bench console / ``bench execute``)::

    bench execute ury.ury.dev_seed.operations.seed

Conventions here are copied from existing seed/setup code so the records
look like anything a real branch onboarding would create:

- ``URY Production Department`` / ``URY Item Production Configuration``
  shape and idempotency pattern: ``ury/ury/api/seed_v3_demo.py``.
- Default warehouse / cost center lookup pattern (``Finished Goods -
  <company abbr>``, ``company.cost_center`` fallback to first non-group Cost
  Center): ``ury/ury/api/minimal/business_setup.py`` (around its POS
  Profile & Warehouse step).
- Real item groups / item_codes seeded for this branch: ``catalog.py``
  (``ITEM_GROUPS`` / ``MENU_ITEMS`` in this same package).
- ``URY Report Settings`` fields (``branch``, ``extended_hours``, ``hours``,
  ``buying_price_list``, ``direct_fixed_expenses``/``indirect_fixed_expenses``/
  ``employee_costs``/``monthly_fixed_expenses`` as ``URY Fixed Expenses``
  rows, ``percentage_expenses`` as ``URY Variable Expenses`` rows,
  ``depreciation``, ``electricity_charges``, ``consumables`` as ``URY
  Materials`` rows): ``ury/ury/doctype/ury_report_settings/ury_report_settings.json``
  and its child tables (``ury_fixed_expenses.json``,
  ``ury_variable_expenses.json``, ``ury_materials.json``), cross-checked
  against ``frontend/src/pages/Dashboard/ReportSettingsPage.tsx`` which reads/
  writes exactly those fields via ``frappe.client.get``/``frappe.client.get_list``.
- Aggregators are NOT a standalone doctype: ``frontend/src/pages/Dashboard/
  AggregatorPage.tsx`` reads/writes a child table field ``custom_aggregator_settings``
  on ``Branch`` (a custom field, see ``ury/fixtures/custom_field.json``,
  ``dt=Branch fieldname=custom_aggregator_settings options="Aggregator
  Settings"``). The child doctype ``Aggregator Settings``
  (``ury/ury/doctype/aggregator_settings/aggregator_settings.json``) only has
  fields ``customer``, ``price_list``, ``mode_of_payments`` — there is no
  separate "aggregator name" field, so the aggregator's identity is carried
  by the linked Customer/Price List/Mode of Payment names (the frontend's
  create flow names all three identically, e.g. "Zomato" -> Customer
  "Zomato", Price List "Zomato", Mode of Payment "Zomato" — mirrored here).
"""

import frappe


# ---------------------------------------------------------------------------
# Production departments / units
# ---------------------------------------------------------------------------

# (department_name, production_unit_name, item_groups_from_catalog)
DEPARTMENTS = [
	{
		"department_name": "Indian Kitchen",
		"production_unit": "Indian Kitchen",
		"item_groups": ["Starters", "Main Course", "Biryani & Rice"],
	},
	{
		"department_name": "Chinese",
		"production_unit": "Chinese",
		"item_groups": ["Chinese"],
	},
	{
		"department_name": "Tandoor",
		"production_unit": "Tandoor",
		"item_groups": [],  # no catalog.py item_group maps 1:1; kept for menu growth
	},
	{
		"department_name": "Beverage Station",
		"production_unit": "Beverage Station",
		"item_groups": ["Beverages", "Desserts"],
	},
]

# item_group -> department_name, used to place every catalog.py item into a
# production department/unit and to pick a sensible production_policy.
ITEM_GROUP_TO_DEPARTMENT = {
	"Starters": "Indian Kitchen",
	"Main Course": "Indian Kitchen",
	"Biryani & Rice": "Indian Kitchen",
	"Chinese": "Chinese",
	"Beverages": "Beverage Station",
	"Desserts": "Beverage Station",
}

# item_group -> production_policy. Beverages/Desserts are made on demand
# rather than batch pre-produced; everything else is PRE_PRODUCED to match
# seed_v3_demo.py's convention.
ITEM_GROUP_TO_POLICY = {
	"Starters": "PRE_PRODUCED",
	"Main Course": "PRE_PRODUCED",
	"Biryani & Rice": "PRE_PRODUCED",
	"Chinese": "PRE_PRODUCED",
	"Beverages": "MADE_TO_ORDER",
	"Desserts": "MADE_TO_ORDER",
}

# Aggregators to seed on the Branch's custom_aggregator_settings child table.
AGGREGATORS = ["Zomato", "Swiggy", "Direct"]


def _get_branch():
	branch_name = frappe.db.get_value("Branch", {}, "name")
	if not branch_name:
		frappe.throw("No Branch found on this site — cannot seed operations demo data.")
	return branch_name


def _get_company():
	company_name = frappe.db.get_value("Company", {}, "name")
	if not company_name:
		frappe.throw("No Company found on this site — cannot seed operations demo data.")
	return company_name


def _get_default_warehouse(company_name):
	"""Mirrors business_setup.py's ``Finished Goods - <abbr>`` convention,
	falling back to any non-group warehouse for the company if that specific
	one doesn't exist on this bench.
	"""
	abbr = frappe.db.get_value("Company", company_name, "abbr")
	preferred = f"Finished Goods - {abbr}" if abbr else None
	if preferred and frappe.db.exists("Warehouse", preferred):
		return preferred
	fallback = frappe.db.get_value(
		"Warehouse", {"company": company_name, "is_group": 0}, "name"
	)
	if not fallback:
		frappe.throw(
			f"No Warehouse found for company {company_name} — cannot seed production departments."
		)
	return fallback


def _get_default_cost_center(company_name):
	"""Mirrors business_setup.py: prefer the Company's own default cost
	center, fall back to the first non-group Cost Center for the company.
	"""
	company_cost_center = frappe.db.get_value("Company", company_name, "cost_center")
	if company_cost_center:
		return company_cost_center
	fallback = frappe.db.get_value(
		"Cost Center", {"company": company_name, "is_group": 0}, "name"
	)
	if not fallback:
		frappe.throw(
			f"No Cost Center found for company {company_name} — cannot seed production departments."
		)
	return fallback


def _ensure_departments(branch_name, company_name, warehouse, cost_center):
	dept_names = {}
	created = []
	for d in DEPARTMENTS:
		if frappe.db.exists("URY Production Department", d["department_name"]):
			dept_names[d["department_name"]] = d["department_name"]
			continue
		doc = frappe.get_doc(
			{
				"doctype": "URY Production Department",
				"department_name": d["department_name"],
				"enabled": 1,
				"company": company_name,
				"branch": branch_name,
				"department_warehouse": warehouse,
				"cost_center": cost_center,
				"issue_control_policy": "Plan Controlled",
			}
		)
		doc.insert(ignore_permissions=True)
		dept_names[d["department_name"]] = doc.name
		created.append(doc.name)
		print(f"Created URY Production Department: {doc.name}")
	return dept_names, created


def _ensure_production_units(dept_names, branch_name):
	"""URY Production Unit requires a ``department`` link (reqd field, see
	ury/ury/doctype/ury_production_unit/ury_production_unit.json). It does
	NOT require a pos_profile, so a bare unit can be created here for
	catalog/config purposes even without a POS Profile wired up yet.

	``branch`` must also be set: `URY Item Production Configuration`'s
	`validate_link_ownership()` (ury_item_production_configuration.py:39-43)
	fetches the Production Unit's `branch`/`company` and throws "Production
	Unit {0} is required" if `branch` comes back empty -- confirmed live on
	the bench (all 30 item configs failed with this exact message before
	`branch` was added here).
	"""
	created = []
	for d in DEPARTMENTS:
		unit_name = d["production_unit"]
		dept_name = dept_names.get(d["department_name"])
		if frappe.db.exists("URY Production Unit", unit_name):
			current_dept = frappe.db.get_value("URY Production Unit", unit_name, "department")
			current_branch = frappe.db.get_value("URY Production Unit", unit_name, "branch")
			if not current_dept and dept_name:
				frappe.db.set_value("URY Production Unit", unit_name, "department", dept_name)
				print(f"Linked existing Production Unit {unit_name} -> department {dept_name}")
			if not current_branch and branch_name:
				frappe.db.set_value("URY Production Unit", unit_name, "branch", branch_name)
				print(f"Linked existing Production Unit {unit_name} -> branch {branch_name}")
			continue
		doc = frappe.get_doc(
			{
				"doctype": "URY Production Unit",
				"production": unit_name,
				"enabled": 1,
				"department": dept_name,
				"branch": branch_name,
			}
		)
		doc.insert(ignore_permissions=True)
		created.append(doc.name)
		print(f"Created URY Production Unit: {doc.name}")
	return created


def _ensure_item_production_configurations(branch_name, dept_names):
	"""One row per real Item that catalog.py seeded (its MENU_ITEMS), mapped
	to a department/production_unit via ITEM_GROUP_TO_DEPARTMENT and a
	production_policy via ITEM_GROUP_TO_POLICY. Uses catalog.py's own
	MENU_ITEMS list rather than a generic Item filter, since catalog.py
	seeds items with is_stock_item=0 (they're menu/sales items, not stock
	items) — the ``is_stock_item=1`` filter seed_v3_demo.py uses would match
	none of them.
	"""
	# Local import to avoid a hard import-time dependency cycle; catalog.py
	# has no side effects at import time.
	from ury.ury.dev_seed.catalog import MENU_ITEMS

	created = []
	skipped = []
	for item_name, item_group, _rate in MENU_ITEMS:
		if not frappe.db.exists("Item", item_name):
			skipped.append(item_name)
			continue
		if frappe.db.exists("URY Item Production Configuration", {"item": item_name}):
			continue

		dept_key = ITEM_GROUP_TO_DEPARTMENT.get(item_group)
		department = dept_names.get(dept_key) if dept_key else None
		production_unit = dept_key  # production_unit names mirror department names here
		production_policy = ITEM_GROUP_TO_POLICY.get(item_group, "PRE_PRODUCED")

		doc = frappe.get_doc(
			{
				"doctype": "URY Item Production Configuration",
				"item": item_name,
				"branch": branch_name,
				"department": department,
				"production_unit": production_unit,
				"production_policy": production_policy,
				"active": 1,
			}
		)
		try:
			doc.insert(ignore_permissions=True)
			created.append(doc.name)
			print(f"Created Item Production Configuration for {item_name}")
		except Exception as e:
			print(f"Skipped Item Production Configuration for {item_name}: {e}")

	if skipped:
		print(f"Skipped {len(skipped)} MENU_ITEMS not found as Items (run catalog.seed() first): {skipped}")
	return created


# ---------------------------------------------------------------------------
# URY Report Settings
# ---------------------------------------------------------------------------


def _ensure_report_settings(branch_name):
	if frappe.db.exists("URY Report Settings", {"branch": branch_name}):
		print(f"URY Report Settings already exists for branch {branch_name}")
		return None

	price_list = frappe.db.get_value("Price List", {"selling": 1}, "name") or "Standard Selling"

	doc = frappe.get_doc(
		{
			"doctype": "URY Report Settings",
			"branch": branch_name,
			"extended_hours": 1,
			"hours": 4,
			"buying_price_list": price_list,
			"depreciation": 5.0,
			"electricity_charges": 1200.0,
			"direct_fixed_expenses": [
				{"expense": "Rent", "amount": 45000},
				{"expense": "Gas", "amount": 8000},
			],
			"indirect_fixed_expenses": [
				{"expense": "Staff Food Charges", "amount": 6000},
			],
			"percentage_expenses": [
				{"expense": "Marketing", "percentage_type": "Gross Sales", "percent": 3},
				{"expense": "Aggregator Commission", "percentage_type": "Gross Sales", "percent": 18},
			],
			"employee_costs": [
				{"expense": "Kitchen Staff Salaries", "amount": 120000},
				{"expense": "Service Staff Salaries", "amount": 90000},
			],
			"monthly_fixed_expenses": [
				{"expense": "Internet & POS Software", "amount": 3500},
				{"expense": "Pest Control", "amount": 1500},
			],
			"consumables": [
				{"material": "Packaging Boxes", "cost_per_unit": 5},
				{"material": "Napkins", "cost_per_unit": 1},
			],
		}
	)
	doc.insert(ignore_permissions=True)
	print(f"Created URY Report Settings: {doc.name}")
	return doc.name


# ---------------------------------------------------------------------------
# Aggregators (Branch.custom_aggregator_settings, per AggregatorPage.tsx)
# ---------------------------------------------------------------------------


def _ensure_aggregators(branch_name):
	"""Create Customer / Price List / Mode of Payment for each aggregator
	name (mirroring AggregatorPage.tsx's create flow, which names all three
	identically to the aggregator) and append a row to
	Branch.custom_aggregator_settings if one for that Customer isn't already
	there.
	"""
	customer_group = (
		frappe.db.get_value("Customer Group", {"is_group": 0}, "name") or "All Customer Groups"
	)
	territory = frappe.db.get_value("Territory", {"is_group": 0}, "name") or "All Territories"

	branch_doc = frappe.get_doc("Branch", branch_name)
	if not hasattr(branch_doc, "custom_aggregator_settings"):
		print(
			"Branch has no custom_aggregator_settings field on this site "
			"(custom field not installed) — skipping aggregator seed."
		)
		return []

	existing_customers = {row.customer for row in branch_doc.custom_aggregator_settings}

	created = []
	for name in AGGREGATORS:
		if not frappe.db.exists("Customer", name):
			frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": name,
					"customer_type": "Company",
					"customer_group": customer_group,
					"territory": territory,
				}
			).insert(ignore_permissions=True)
			print(f"Created Customer: {name}")

		if not frappe.db.exists("Price List", name):
			frappe.get_doc(
				{"doctype": "Price List", "price_list_name": name, "selling": 1, "currency": "INR"}
			).insert(ignore_permissions=True)
			print(f"Created Price List: {name}")

		if not frappe.db.exists("Mode of Payment", name):
			frappe.get_doc(
				{"doctype": "Mode of Payment", "mode_of_payment": name, "type": "Bank"}
			).insert(ignore_permissions=True)
			print(f"Created Mode of Payment: {name}")

		if name in existing_customers:
			continue

		branch_doc.append(
			"custom_aggregator_settings",
			{
				"customer": name,
				"price_list": name,
				"mode_of_payments": name,
			},
		)
		created.append(name)

	if created:
		branch_doc.save(ignore_permissions=True)
		print(f"Added aggregator settings to Branch {branch_name}: {created}")

	return created


def seed():
	"""Idempotent entrypoint — safe to call repeatedly, e.g. via
	``bench execute ury.ury.dev_seed.operations.seed``.
	"""
	branch_name = _get_branch()
	company_name = _get_company()
	warehouse = _get_default_warehouse(company_name)
	cost_center = _get_default_cost_center(company_name)

	dept_names, departments_created = _ensure_departments(
		branch_name, company_name, warehouse, cost_center
	)
	production_units_created = _ensure_production_units(dept_names, branch_name)
	item_configs_created = _ensure_item_production_configurations(branch_name, dept_names)
	report_settings = _ensure_report_settings(branch_name)
	aggregators_created = _ensure_aggregators(branch_name)

	frappe.db.commit()

	summary = {
		"branch": branch_name,
		"company": company_name,
		"departments_created": len(departments_created),
		"production_units_created": len(production_units_created),
		"item_configs_created": len(item_configs_created),
		"report_settings_created": report_settings,
		"aggregators_created": aggregators_created,
	}
	print(f"Operations seed complete: {summary}")
	return summary


# Backwards-compatible alias matching the ``run()`` convention used by
# ury/ury/api/seed_v3_demo.py.
run = seed
