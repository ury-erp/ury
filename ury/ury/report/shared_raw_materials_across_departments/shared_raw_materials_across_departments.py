# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Item 4d (sa-pos-followups-and-ux, per
# tracks/sa-pos-followups-and-ux/ITEM_4_CROSS_DEPARTMENT.md section 5.3).
#
# Admin-facing worklist: for every MADE_TO_ORDER item production configuration
# in a branch, resolve the warehouse it issues raw materials from (reusing
# ury_production_context.resolve_production_context -- the single
# authoritative resolver, see ITEM_4_CROSS_DEPARTMENT.md section 2.1) and
# explode its BOM (reusing ury_bom_compiler.compile_bom_vector, the same
# compiler ury_reservation_service.py's _resolve_components uses). This
# report never re-implements warehouse resolution or BOM explosion.
#
# Shape: one row per (raw material, department) pair -- a raw material used
# by N departments produces N rows, each carrying "Departments Using It" = N,
# so a shared raw material that needs N separate department-scoped stocks is
# immediately visible.

import frappe

from ury.ury.api.ury_production_context import resolve_production_context
from ury.ury.api.ury_bom_compiler import compile_bom_vector

IPC_DOCTYPE = "URY Item Production Configuration"
POLICY_MADE_TO_ORDER = "MADE_TO_ORDER"


def execute(filters=None):
	filters = frappe._dict(filters or {})
	columns = _get_columns()

	company = filters.get("company")
	branch = filters.get("branch")
	if not (company and branch):
		return columns, []

	only_show_gaps = filters.get("only_show_gaps")
	only_show_gaps = 1 if only_show_gaps in (None, "", 1, "1", True) else 0

	department_filter = filters.get("department")

	rows = _build_rows(company, branch, department_filter, only_show_gaps)
	return columns, rows


def _get_columns():
	return [
		{"label": "Raw Material", "fieldname": "raw_material", "fieldtype": "Link", "options": "Item", "width": 140},
		{"label": "Item Name", "fieldname": "item_name", "fieldtype": "Data", "width": 160},
		{"label": "Departments Using It", "fieldname": "departments_using_it", "fieldtype": "Int", "width": 140},
		{"label": "Department", "fieldname": "department", "fieldtype": "Link", "options": "URY Production Department", "width": 160},
		{"label": "Production Unit", "fieldname": "production_unit", "fieldtype": "Link", "options": "URY Production Unit", "width": 150},
		{"label": "Required Warehouse", "fieldname": "required_warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 170},
		{"label": "Stocked Here?", "fieldname": "stocked_here", "fieldtype": "Data", "width": 100},
		{"label": "Qty In Warehouse", "fieldname": "qty_in_warehouse", "fieldtype": "Float", "width": 130},
		{"label": "Used By Items", "fieldname": "used_by_items", "fieldtype": "Data", "width": 260},
	]


def _active_mto_configurations(branch, department_filter=None):
	ipc_filters = {"branch": branch, "active": 1, "production_policy": POLICY_MADE_TO_ORDER}
	if department_filter:
		ipc_filters["department"] = department_filter

	return frappe.get_all(
		IPC_DOCTYPE,
		fields=["name", "item", "department", "production_unit"],
		filters=ipc_filters,
	)


def _build_rows(company, branch, department_filter, only_show_gaps):
	ipc_rows = _active_mto_configurations(branch, department_filter)

	# (component_item, department) -> accumulator
	material_department_map = {}
	# component_item -> set(department) -- for the "Departments Using It" count,
	# which must reflect ALL departments using the material, independent of
	# the "Only show gaps" filter or a Department filter narrowing the rows
	# actually rendered below.
	all_departments_for_material = {}

	for ipc in ipc_rows:
		context = resolve_production_context(ipc.item, branch, company=company, department=ipc.department)
		if not context or not context.get("warehouse"):
			continue
		warehouse = context["warehouse"]

		try:
			vector = compile_bom_vector(ipc.item, 1, company)
		except Exception:
			# No active BOM / no exploded components for this configuration --
			# nothing to report for it, but do not fail the whole report.
			continue

		item_name = frappe.db.get_value("Item", ipc.item, "item_name") or ipc.item

		for component in vector.get("components", []):
			component_item = component["component_item"]

			all_departments_for_material.setdefault(component_item, set()).add(ipc.department)

			key = (component_item, ipc.department)
			entry = material_department_map.get(key)
			if entry is None:
				entry = {
					"raw_material": component_item,
					"department": ipc.department,
					"production_unit": ipc.production_unit,
					"warehouse": warehouse,
					"used_by_items": set(),
				}
				material_department_map[key] = entry
			entry["used_by_items"].add(item_name)

	rows = []
	for (component_item, department), entry in material_department_map.items():
		component_name = frappe.db.get_value("Item", component_item, "item_name") or component_item

		bin_qty = frappe.db.get_value(
			"Bin",
			{"item_code": component_item, "warehouse": entry["warehouse"]},
			"actual_qty",
		) or 0
		stocked_here = bin_qty > 0

		if only_show_gaps and stocked_here:
			continue

		rows.append(
			{
				"raw_material": component_item,
				"item_name": component_name,
				"departments_using_it": len(all_departments_for_material.get(component_item, ())),
				"department": department,
				"production_unit": entry["production_unit"],
				"required_warehouse": entry["warehouse"],
				"stocked_here": "✅" if stocked_here else "❌",
				"qty_in_warehouse": bin_qty,
				"used_by_items": ", ".join(sorted(entry["used_by_items"])),
			}
		)

	rows.sort(key=lambda r: (r["raw_material"], r["department"] or ""))
	return rows


@frappe.whitelist()
def create_transfer_for_missing(company, branch, department=None):
	"""Build one draft Material Transfer Stock Entry per target warehouse
	holding a "not stocked here" (gap) row, per ITEM_4_CROSS_DEPARTMENT.md
	section 5.3. Qty is left at 0 for the user to fill in -- this report has
	no "required qty" figure (it reports presence/absence and current stock,
	not a per-order requirement), only a worklist of which items need
	transferring into which warehouse.
	"""
	# This endpoint inserts Stock Entries, so it must not be reachable by any
	# logged-in user. `ignore_permissions=True` below is only there because
	# the draft is assembled field-by-field rather than through the Desk form;
	# it is not a grant, so the grant is checked explicitly here first.
	frappe.has_permission("Stock Entry", "create", throw=True)

	filters = frappe._dict({
		"company": company,
		"branch": branch,
		"department": department,
		"only_show_gaps": 1,
	})
	_, rows = execute(filters)

	by_warehouse = {}
	for row in rows:
		if row["stocked_here"] != "❌":
			continue
		by_warehouse.setdefault(row["required_warehouse"], []).append(row["raw_material"])

	created = []
	for warehouse, item_codes in by_warehouse.items():
		stock_entry = frappe.new_doc("Stock Entry")
		stock_entry.stock_entry_type = "Material Transfer"
		stock_entry.company = company
		for item_code in sorted(set(item_codes)):
			stock_entry.append(
				"items",
				{
					"item_code": item_code,
					"t_warehouse": warehouse,
					"qty": 0,
				},
			)
		stock_entry.insert(ignore_permissions=True)
		created.append(stock_entry.name)

	return created
