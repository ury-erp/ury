# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Prefill Work In Progress Warehouse on a Work Order created from a
Production Plan (URY's manual "Create Work Order" flow, and native ERPNext's
own Production Plan -> Work Order button).

URY has no separate WIP warehouse concept: production for an item always
happens in the item's department/production unit warehouse, the same one
already used as the Finished Goods Warehouse (see
``ury_production_plan_adapter._snapshot_item_to_production_plan_item``).
ERPNext's own Work Order creation only prefills ``wip_warehouse`` from the
site-wide ``Manufacturing Settings.default_wip_warehouse`` -- which URY does
not set, since it is per-department, not global -- so it is left empty and
the user is asked for it (and blocked at submit, since it is effectively
mandatory once the Work Order has operations/`skip_transfer` off).
"""

import frappe


def department_warehouse(department):
	if not department:
		return None
	return frappe.db.get_value("URY Production Department", department, "department_warehouse")


def validate(doc, method=None):
	if doc.get("wip_warehouse"):
		return

	department = _resolve_department(doc)
	warehouse = department_warehouse(department)
	if warehouse:
		doc.set("wip_warehouse", warehouse)


def _resolve_department(doc):
	# Native ERPNext "Create Work Order" from a Production Plan: the row's
	# custom_ury_department (see fixtures/custom_field.json) carries the
	# department, but ERPNext's own Work Order creation does not copy it --
	# resolve it from the Production Plan Item row identified by
	# `production_plan_item` (a real, standard Work Order field).
	if doc.get("production_plan_item"):
		return frappe.db.get_value("Production Plan Item", doc.get("production_plan_item"), "custom_ury_department")

	return None
