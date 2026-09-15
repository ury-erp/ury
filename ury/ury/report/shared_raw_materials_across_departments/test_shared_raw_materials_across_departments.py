# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching the
# api/test_ury_yield_variance.py convention -- there is no query-report test
# convention anywhere in this app to follow instead: `find ... -path
# "*/report/*/test_*.py"` returns nothing). No bench/Docker was reachable in
# this task's worktree, so these are traced call-by-call against
# shared_raw_materials_across_departments.py rather than executed against a
# real site. Static validation performed: python3 -m py_compile and
# python3 -m json.tool on the report's .json.
#
# Fixture (per ITEM_4_CROSS_DEPARTMENT.md AC-4 / AC-6): Grill and Tandoor
# departments each have a MADE_TO_ORDER item whose BOM uses Chicken. Chicken
# is stocked only in Grill Store (actual_qty > 0); Tandoor Store has no Bin
# row for Chicken (or actual_qty <= 0).

import unittest
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.report.shared_raw_materials_across_departments.shared_raw_materials_across_departments import (
	execute,
)


MOD = "ury.ury.report.shared_raw_materials_across_departments.shared_raw_materials_across_departments"

GRILL_IPC = frappe._dict(
	{"name": "IPC-GRILL", "item": "Chicken Tikka", "department": "Grill", "production_unit": "Grill 1"}
)
TANDOOR_IPC = frappe._dict(
	{"name": "IPC-TANDOOR", "item": "Chicken Tandoori", "department": "Tandoor", "production_unit": "Tandoor 1"}
)

GRILL_CONTEXT = frappe._dict({"warehouse": "Grill Store - URY"})
TANDOOR_CONTEXT = frappe._dict({"warehouse": "Tandoor Store - URY"})

CHICKEN_VECTOR = {"components": [{"component_item": "Chicken", "qty": 0.5}]}


def _item_name(item_code, field):
	return item_code


def _bin_actual_qty(doctype, filters, field):
	if filters.get("warehouse") == "Grill Store - URY" and filters.get("item_code") == "Chicken":
		return 5.0
	return 0


class TestSharedRawMaterialsAcrossDepartments(FrappeTestCase):
	"""AC-6: two departments sharing one raw material, one stocked, one not."""

	@patch(f"{MOD}.compile_bom_vector")
	@patch(f"{MOD}.resolve_production_context")
	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_only_show_gaps_returns_single_tandoor_row(
		self, mock_get_value, mock_get_all, mock_resolve_context, mock_compile_bom
	):
		mock_get_all.return_value = [GRILL_IPC, TANDOOR_IPC]
		mock_resolve_context.side_effect = lambda item, branch, company=None, department=None: (
			GRILL_CONTEXT if department == "Grill" else TANDOOR_CONTEXT
		)
		mock_compile_bom.return_value = CHICKEN_VECTOR
		mock_get_value.side_effect = lambda doctype, filters, field=None: (
			_bin_actual_qty(doctype, filters, field)
			if doctype == "Bin"
			else _item_name(filters, field)
		)

		columns, rows = execute(
			frappe._dict(
				{"company": "Test Co", "branch": "Test Branch", "only_show_gaps": 1}
			)
		)

		self.assertEqual(len(rows), 1)
		row = rows[0]
		self.assertEqual(row["raw_material"], "Chicken")
		self.assertEqual(row["department"], "Tandoor")
		self.assertEqual(row["required_warehouse"], "Tandoor Store - URY")
		self.assertEqual(row["stocked_here"], "❌")
		self.assertEqual(row["qty_in_warehouse"], 0)

	@patch(f"{MOD}.compile_bom_vector")
	@patch(f"{MOD}.resolve_production_context")
	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_filter_off_returns_two_rows_with_department_count_two(
		self, mock_get_value, mock_get_all, mock_resolve_context, mock_compile_bom
	):
		mock_get_all.return_value = [GRILL_IPC, TANDOOR_IPC]
		mock_resolve_context.side_effect = lambda item, branch, company=None, department=None: (
			GRILL_CONTEXT if department == "Grill" else TANDOOR_CONTEXT
		)
		mock_compile_bom.return_value = CHICKEN_VECTOR
		mock_get_value.side_effect = lambda doctype, filters, field=None: (
			_bin_actual_qty(doctype, filters, field)
			if doctype == "Bin"
			else _item_name(filters, field)
		)

		columns, rows = execute(
			frappe._dict(
				{"company": "Test Co", "branch": "Test Branch", "only_show_gaps": 0}
			)
		)

		self.assertEqual(len(rows), 2)
		for row in rows:
			self.assertEqual(row["departments_using_it"], 2)
		departments = {row["department"] for row in rows}
		self.assertEqual(departments, {"Grill", "Tandoor"})

		grill_row = next(r for r in rows if r["department"] == "Grill")
		self.assertEqual(grill_row["stocked_here"], "✅")
		self.assertEqual(grill_row["qty_in_warehouse"], 5.0)

		tandoor_row = next(r for r in rows if r["department"] == "Tandoor")
		self.assertEqual(tandoor_row["stocked_here"], "❌")
