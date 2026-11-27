# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Tests for the Chef UI API (``ury_chef_ui``).

Role and department checks run for real (real users, real User Permissions,
real ``department_scope``). Production Plan loading and the compiler are
replaced at the module boundary so each test controls the plan it acts on.

``unittest.TestCase`` is used because ``bench run-tests`` cannot preload
ERPNext test records on the dev site (Fiscal Year overlap); records are
rolled back.
"""

import json
import unittest
from unittest.mock import patch

import frappe

from ury.patches.v3_47.add_department_head_role_permissions import ensure_role
from ury.ury.api import ury_chef_ui
from ury.ury.api.ury_chef_ui import (
	_department_payload,
	_last_same_weekday_production,
	get_department_raw_materials,
	get_production_queue,
	pick_latest_per_item,
	prepare_department_production,
	submit_production_plan,
	update_production_quantities,
)
from ury.ury.tests.factories import make_user
from ury.ury.utils.department_scope import DEPARTMENT_HEAD_ROLE

MOD = "ury.ury.api.ury_chef_ui"
DEPARTMENT = "URY Production Department"


class _Row(frappe._dict):
	pass


class _FakePlan:
	def __init__(self, name, department, docstatus=0, rows=None, snapshot_hash="H1", state="Awaiting Materials"):
		self.name = name
		self.docstatus = docstatus
		self._data = {
			"custom_ury_sales_plan": "SP-1",
			"custom_ury_department": department,
			"custom_ury_snapshot_hash": snapshot_hash,
			"custom_ury_production_state": state,
			"company": "Co",
		}
		self.po_items = rows or [
			_Row(name="row-1", item_code="BASE", bom_no="BOM-BASE", planned_qty=10.0),
			_Row(name="row-2", item_code="CAKE", bom_no="BOM-CAKE", planned_qty=4.0),
		]
		self.saved = False
		self.submitted = False
		self.comments = []

	def get(self, key, default=None):
		if key == "po_items":
			return self.po_items
		return self._data.get(key, default)

	def save(self):
		self.saved = True

	def submit(self):
		self.submitted = True
		self.docstatus = 1

	def add_comment(self, comment_type, text):
		self.comments.append((comment_type, text))


def _user(roles):
	email = f"chef-{frappe.generate_hash(length=8)}@example.com"
	return make_user(email=email, roles=roles, first_name="Chef").name


class _ChefTestBase(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		frappe.set_user("Administrator")
		ensure_role()
		departments = frappe.get_all(DEPARTMENT, filters={"enabled": 1}, pluck="name", limit=2)
		if len(departments) < 2:
			raise unittest.SkipTest("Needs two enabled URY Production Departments on the site.")
		cls.dept_a, cls.dept_b = departments

	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def tearDown(self):
		frappe.set_user("Administrator")

	def _head_for(self, department):
		user = _user([DEPARTMENT_HEAD_ROLE])
		frappe.get_doc(
			{"doctype": "User Permission", "user": user, "allow": DEPARTMENT, "for_value": department}
		).insert(ignore_permissions=True)
		return user

	def _with_plan(self, plan):
		"""Patch plan loading so ``_load_accessible_plan`` sees ``plan``; the
		role and department checks still run for real. Every other call
		passes through."""
		real_get_doc = frappe.get_doc
		real_exists = frappe.db.exists
		real_get_value = frappe.db.get_value

		def get_doc(*args, **kwargs):
			if len(args) > 1 and args[0] == "Production Plan" and args[1] == plan.name:
				return plan
			if len(args) > 1 and args[0] == "URY Sales Plan" and args[1] == "SP-1":
				return frappe._dict(name="SP-1", branch="B", company="Co", approval_snapshot="{}")
			return real_get_doc(*args, **kwargs)

		def exists(doctype, name=None, *args, **kwargs):
			if doctype == "Production Plan" and name == plan.name:
				return True
			return real_exists(doctype, name, *args, **kwargs)

		def get_value(doctype, *args, **kwargs):
			if doctype == "URY Sales Plan" and args and args[1:2] == ("approval_snapshot_hash",):
				return "H1"
			return real_get_value(doctype, *args, **kwargs)

		return [
			patch(f"{MOD}.frappe.db.exists", side_effect=exists),
			patch(f"{MOD}.frappe.get_doc", side_effect=get_doc),
			patch(f"{MOD}.frappe.db.get_value", side_effect=get_value),
		]

	def _run_with_plan(self, plan, fn, *args):
		patches = self._with_plan(plan)
		for p in patches:
			p.start()
		try:
			return fn(*args)
		finally:
			for p in reversed(patches):
				p.stop()


class TestRoleGate(_ChefTestBase):
	def test_user_without_chef_role_is_refused(self):
		frappe.set_user(_user(["URY Cashier"]))
		with self.assertRaises(frappe.PermissionError):
			get_production_queue()

	def test_refused_before_touching_a_plan(self):
		frappe.set_user(_user(["URY Cashier"]))
		with patch(f"{MOD}._load_accessible_plan") as load:
			with self.assertRaises(frappe.PermissionError):
				prepare_department_production("MFG-PP-X")
			load.assert_not_called()


class TestDepartmentEnforcement(_ChefTestBase):
	def test_update_on_other_department_plan_is_refused(self):
		frappe.set_user(self._head_for(self.dept_a))
		plan = _FakePlan("MFG-PP-B", self.dept_b)
		with self.assertRaises(frappe.PermissionError):
			self._run_with_plan(plan, update_production_quantities, plan.name, [{"row_name": "row-1", "production_qty": 5}])
		self.assertFalse(plan.saved)

	def test_prepare_on_other_department_plan_is_refused_and_never_delegated(self):
		frappe.set_user(self._head_for(self.dept_a))
		plan = _FakePlan("MFG-PP-B", self.dept_b, docstatus=1)
		with patch(f"{MOD}.prepare_production") as prepare:
			with self.assertRaises(frappe.PermissionError):
				self._run_with_plan(plan, prepare_department_production, plan.name)
			prepare.assert_not_called()

	def test_submit_and_raw_materials_on_other_department_are_refused(self):
		frappe.set_user(self._head_for(self.dept_a))
		plan = _FakePlan("MFG-PP-B", self.dept_b)
		with self.assertRaises(frappe.PermissionError):
			self._run_with_plan(plan, submit_production_plan, plan.name)
		with self.assertRaises(frappe.PermissionError):
			self._run_with_plan(plan, get_department_raw_materials, plan.name)
		self.assertFalse(plan.submitted)

	def test_prepare_on_own_department_delegates_and_audits(self):
		frappe.set_user(self._head_for(self.dept_a))
		plan = _FakePlan("MFG-PP-A", self.dept_a, docstatus=1)
		with patch(f"{MOD}.prepare_production", return_value={"status": "processing", "state": "Processing"}) as prepare:
			result = self._run_with_plan(plan, prepare_department_production, plan.name)
		prepare.assert_called_once_with("MFG-PP-A")
		self.assertEqual(result["status"], "processing")
		self.assertEqual(len(plan.comments), 1)
		self.assertIn("Awaiting Materials -> Processing", plan.comments[0][1])

	def test_repeated_prepare_is_not_audited_twice(self):
		frappe.set_user(self._head_for(self.dept_a))
		plan = _FakePlan("MFG-PP-A", self.dept_a, docstatus=1, state="Processing")
		with patch(f"{MOD}.prepare_production", return_value={"status": "already_processing", "state": "Processing"}):
			result = self._run_with_plan(plan, prepare_department_production, plan.name)
		self.assertEqual(result["status"], "already_processing")
		self.assertEqual(plan.comments, [])


class TestDraftEdit(_ChefTestBase):
	def setUp(self):
		frappe.set_user(self._head_for(self.dept_a))
		self.compile = patch(
			f"{MOD}._compile_department_bucket",
			return_value=(
				{
					"targets": [
						{"item_code": "BASE", "bom_no": "BOM-BASE", "required_qty": 10.0, "component_vector": [], "raw_material_vector": []},
						{
							"item_code": "CAKE",
							"bom_no": "BOM-CAKE",
							"required_qty": 4.0,
							"component_vector": [{"item_code": "BASE", "required_qty": 8.0}],
							"raw_material_vector": [],
						},
					]
				},
				[],
			),
		)
		self.compile.start()
		self.addCleanup(self.compile.stop)

	def test_edit_saves_and_audits(self):
		plan = _FakePlan("MFG-PP-A", self.dept_a)
		result = self._run_with_plan(
			plan, update_production_quantities, plan.name, json.dumps([{"row_name": "row-1", "production_qty": 12}])
		)
		self.assertEqual(result["changed"], 1)
		self.assertTrue(plan.saved)
		self.assertEqual(plan.po_items[0].planned_qty, 12)
		self.assertIn("BASE", plan.comments[0][1])

	def test_submitted_plan_is_read_only(self):
		plan = _FakePlan("MFG-PP-A", self.dept_a, docstatus=1)
		with self.assertRaises(frappe.ValidationError):
			self._run_with_plan(plan, update_production_quantities, plan.name, [{"row_name": "row-1", "production_qty": 12}])
		self.assertFalse(plan.saved)

	def test_zero_or_negative_quantity_is_refused(self):
		plan = _FakePlan("MFG-PP-A", self.dept_a)
		for qty in (0, -1):
			with self.assertRaises(frappe.ValidationError):
				self._run_with_plan(plan, update_production_quantities, plan.name, [{"row_name": "row-1", "production_qty": qty}])

	def test_row_of_another_plan_is_refused(self):
		plan = _FakePlan("MFG-PP-A", self.dept_a)
		with self.assertRaises(frappe.ValidationError):
			self._run_with_plan(plan, update_production_quantities, plan.name, [{"row_name": "foreign", "production_qty": 3}])

	def test_sub_assembly_below_consumption_is_refused(self):
		plan = _FakePlan("MFG-PP-A", self.dept_a)
		# CAKE x2 now consumes 16 BASE, but BASE stays at 10.
		with self.assertRaises(frappe.ValidationError):
			self._run_with_plan(plan, update_production_quantities, plan.name, [{"row_name": "row-2", "production_qty": 8}])
		self.assertFalse(plan.saved)

	def test_stale_plan_is_refused(self):
		plan = _FakePlan("MFG-PP-A", self.dept_a, snapshot_hash="OLD")
		with self.assertRaises(frappe.ValidationError):
			self._run_with_plan(plan, update_production_quantities, plan.name, [{"row_name": "row-1", "production_qty": 3}])

	def test_submit_draft_and_refuse_resubmit(self):
		plan = _FakePlan("MFG-PP-A", self.dept_a)
		result = self._run_with_plan(plan, submit_production_plan, plan.name)
		self.assertEqual(result["docstatus"], 1)
		self.assertTrue(plan.submitted)
		self.assertIn("Draft -> Submitted", plan.comments[0][1])
		with self.assertRaises(frappe.ValidationError):
			self._run_with_plan(plan, submit_production_plan, plan.name)


class TestQueueScoping(_ChefTestBase):
	def test_queue_only_returns_permitted_departments(self):
		user = self._head_for(self.dept_a)
		frappe.set_user(user)
		snapshot = json.dumps(
			{
				"items": [
					{"item_code": "BASE", "qty": 5, "department": self.dept_a},
					{"item_code": "OTHER", "qty": 7, "department": self.dept_b},
				]
			}
		)
		seen_allowed = {}

		def department_plans(sales_plan, allowed):
			seen_allowed["value"] = allowed
			return []

		branch = frappe.db.get_value(DEPARTMENT, self.dept_a, "branch")
		with patch(f"{MOD}._accessible_branches", return_value=[branch]), patch(
			f"{MOD}._find_sales_plan",
			return_value={"name": "SP-1", "status": "Approved", "approval_snapshot": snapshot, "approval_snapshot_hash": "H1"},
		), patch(f"{MOD}._department_plans", side_effect=department_plans):
			result = get_production_queue(branch=branch)

		self.assertEqual(seen_allowed["value"], [self.dept_a])
		self.assertEqual([row["department"] for row in result["departments"]], [self.dept_a])
		self.assertIsNone(result["departments"][0]["production_plan"])

	def test_branch_outside_users_branches_is_refused(self):
		frappe.set_user(self._head_for(self.dept_a))
		with patch(f"{MOD}._accessible_branches", return_value=["Mine"]):
			with self.assertRaises(frappe.PermissionError):
				get_production_queue(branch="Not Mine")

	def test_department_plans_query_runs_with_filter(self):
		self.assertEqual(ury_chef_ui._department_plans("SP-DOES-NOT-EXIST", [self.dept_a]), [])

	def test_weekday_history_query_runs(self):
		warehouse = frappe.db.get_value(DEPARTMENT, self.dept_a, "department_warehouse")
		result = _last_same_weekday_production(["NO-SUCH-ITEM"], warehouse, "2026-11-30")
		self.assertEqual(result, {})


class TestPayload(unittest.TestCase):
	def _plan(self, **overrides):
		plan = {
			"name": "MFG-PP-1",
			"docstatus": 0,
			"status": "Draft",
			"department": "Kitchen",
			"snapshot_hash": "H1",
			"production_state": "Awaiting Materials",
			"result": json.dumps({"blockers": [{"type": "x"}]}),
		}
		plan.update(overrides)
		return plan

	def _rows(self):
		return [
			{
				"row_name": "r1", "row_key": "r1", "item_code": "BIRYANI", "stock_uom": "Nos",
				"planned_qty": 10.0, "production_qty": 12.0, "is_sub_assembly": False, "derived_qty": False,
			},
			{
				"row_name": "r2", "row_key": "r2", "item_code": "BASE", "stock_uom": "Kg",
				"planned_qty": 9.0, "production_qty": 4.0, "is_sub_assembly": True, "derived_qty": True,
			},
		]

	def _payload(self, plan, produced=None):
		return _department_payload(
			{"name": "Kitchen", "department_warehouse": "Kitchen - WH"},
			plan,
			self._rows(),
			{"BIRYANI": "Chicken Biryani"},
			{"BIRYANI": "MADE_TO_ORDER", "BASE": "PRE_PRODUCED"},
			{"BIRYANI": {"qty": 11.0, "date": "2026-11-20"}},
			produced or {},
			"H1",
		)

	def test_columns_and_flags_for_draft(self):
		payload = self._payload(self._plan())
		biryani, base = payload["items"]
		self.assertEqual(biryani["item_name"], "Chicken Biryani")
		self.assertEqual(biryani["production_policy"], "MADE_TO_ORDER")
		self.assertEqual(base["production_policy"], "PRE_PRODUCED")
		self.assertEqual(biryani["planned_qty"], 10.0)
		self.assertEqual(biryani["production_qty"], 12.0)
		self.assertEqual(biryani["last_weekday_qty"], 11.0)
		self.assertEqual(biryani["last_weekday_date"], "2026-11-20")
		self.assertFalse(biryani["derived_qty"])
		self.assertTrue(base["derived_qty"])
		self.assertEqual(base["planned_qty"], 9.0)
		self.assertEqual(base["production_qty"], 4.0)
		self.assertIsNone(base["last_weekday_qty"])
		self.assertIsNone(biryani["produced_qty"])
		self.assertTrue(payload["can_edit"])
		self.assertTrue(payload["can_submit"])
		self.assertFalse(payload["can_prepare"])
		self.assertEqual(payload["totals"], {"items": 2, "planned_qty": 19.0, "production_qty": 16.0})
		self.assertEqual(payload["blockers"], [{"type": "x"}])

	def test_submitted_plan_can_prepare_and_shows_produced(self):
		payload = self._payload(self._plan(docstatus=1), produced={"r1": 12.0})
		self.assertFalse(payload["can_edit"])
		self.assertTrue(payload["can_prepare"])
		self.assertEqual(payload["items"][0]["produced_qty"], 12.0)
		self.assertEqual(payload["items"][1]["produced_qty"], 0.0)

	def test_processing_and_completed_cannot_prepare(self):
		for state in ("Processing", "Production Completed"):
			payload = self._payload(self._plan(docstatus=1, production_state=state))
			self.assertFalse(payload["can_prepare"])

	def test_stale_plan_has_no_actions(self):
		payload = self._payload(self._plan(snapshot_hash="OLD"))
		self.assertEqual(payload["link_state"], "stale")
		self.assertFalse(payload["can_edit"] or payload["can_submit"] or payload["can_prepare"])

	def test_stock_covered_sub_assembly_has_no_plan_row_and_shows_zero_production(self):
		rows = [self._rows()[0], {**self._rows()[1], "row_name": None, "row_key": "item:BASE", "production_qty": 0.0}]
		payload = _department_payload(
			{"name": "Kitchen", "department_warehouse": "Kitchen - WH"}, self._plan(), rows, {}, {}, {}, {}, "H1"
		)
		self.assertEqual(payload["items"][1]["production_qty"], 0.0)
		self.assertEqual(payload["items"][1]["planned_qty"], 9.0)
		self.assertTrue(payload["can_submit"])
		only_covered = _department_payload(
			{"name": "Kitchen", "department_warehouse": "W"}, self._plan(), [rows[1]], {}, {}, {}, {}, "H1"
		)
		self.assertFalse(only_covered["can_submit"])


def _target(item, qty, components=(), sources=None, bom=None):
	return {
		"item_code": item,
		"bom_no": bom or f"BOM-{item}",
		"required_qty": qty,
		"stock_uom": "Nos",
		"component_vector": [{"item_code": c, "required_qty": q} for c, q in components],
		"raw_material_vector": [],
		"depends_on": [],
		"sources": sources
		if sources is not None
		else [{"parent_item": None, "required_qty": qty, "source_type": "direct_plan_row"}],
	}


NESTED = [{"parent_item": "BIRYANI", "required_qty": 8.0, "source_type": "nested_dependency"}]


class TestQueueRows(unittest.TestCase):
	"""Sub-assembly rows: Planned Qty is what the parents consume, Production
	Qty is the Production Plan row (demand minus stock at creation)."""

	def _bucket(self):
		base = _target("BASE", 8, sources=NESTED)
		biryani = _target("BIRYANI", 10, components=[("BASE", 8.0)])
		return {"targets": [base, biryani]}

	def _items(self, base_qty=5.0):
		items = [{"name": "r-biryani", "item_code": "BIRYANI", "bom_no": "BOM-BIRYANI", "planned_qty": 10.0, "stock_uom": "Nos", "custom_ury_no_work_order": 0}]
		if base_qty:
			items.insert(0, {"name": "r-base", "item_code": "BASE", "bom_no": "BOM-BASE", "planned_qty": base_qty, "stock_uom": "Kg", "custom_ury_no_work_order": 0})
		return items

	def test_sub_assembly_planned_is_parent_demand_and_production_is_plan_row(self):
		rows = ury_chef_ui._queue_rows("Kitchen", self._items(5.0), self._bucket(), {("Kitchen", "BIRYANI"): 10.0})
		base, biryani = rows
		self.assertEqual((base["item_code"], base["planned_qty"], base["production_qty"]), ("BASE", 8.0, 5.0))
		self.assertTrue(base["is_sub_assembly"] and base["derived_qty"])
		self.assertEqual((biryani["planned_qty"], biryani["production_qty"]), (10.0, 10.0))
		self.assertFalse(biryani["derived_qty"])

	def test_demand_follows_the_parents_production_quantity(self):
		items = self._items(5.0)
		items[1]["planned_qty"] = 20.0  # BIRYANI doubled -> consumes 16 BASE
		rows = ury_chef_ui._queue_rows("Kitchen", items, self._bucket(), {("Kitchen", "BIRYANI"): 10.0})
		self.assertEqual(rows[0]["planned_qty"], 16.0)

	def test_stock_covered_sub_assembly_without_row_is_shown_with_zero_production(self):
		rows = ury_chef_ui._queue_rows("Kitchen", self._items(0), self._bucket(), {("Kitchen", "BIRYANI"): 10.0})
		base = rows[0]
		self.assertEqual((base["item_code"], base["planned_qty"], base["production_qty"]), ("BASE", 8.0, 0.0))
		self.assertIsNone(base["row_name"])
		self.assertEqual(base["row_key"], "item:BASE")

	def test_without_a_compiled_bucket_rows_come_from_the_plan(self):
		rows = ury_chef_ui._queue_rows("Kitchen", self._items(5.0), None, {("Kitchen", "BIRYANI"): 10.0})
		self.assertEqual([row["item_code"] for row in rows], ["BASE", "BIRYANI"])
		self.assertTrue(rows[0]["is_sub_assembly"])
		self.assertFalse(rows[0]["derived_qty"])


class TestPageTotals(unittest.TestCase):
	def _dept(self, state, quantities):
		rows = [{"production_qty": qty} for qty in quantities]
		return {
			"production_state": state,
			"items": rows,
			"totals": {"production_qty": float(sum(quantities))},
		}

	def _plans(self):
		return [
			{"name": "PP-A", "department": "A", "production_state": "Awaiting Materials"},
			{"name": "PP-B", "department": "B", "production_state": "Production Completed"},
			{"name": "PP-C", "department": "C", "production_state": "Processing"},
		]

	def test_counts_items_with_production_and_those_in_completed_departments(self):
		departments = [
			self._dept("Awaiting Materials", [5, 0, 7]),  # the 0 is a stock-covered sub-assembly
			self._dept("Production Completed", [10, 3]),
		]
		totals = ury_chef_ui._page_totals(departments, [], {}, {}, "Co")
		self.assertEqual(
			totals, {"items_to_prepare": 4, "items_prepared": 2, "production_qty": 25.0, "material_shortages": 0}
		)

	def test_shortages_are_distinct_raw_materials_of_departments_still_to_prepare(self):
		calls = []

		def short(department, bucket, rows, store_warehouse):
			calls.append(department)
			return {"A": {"FLOUR", "BUTTER"}, "B": {"SUGAR"}, "C": {"EGG"}}[department]

		buckets = {"A": {"targets": []}, "B": {"targets": []}, "C": {"targets": []}}
		with patch(f"{MOD}._short_raw_materials", side_effect=short), patch(f"{MOD}.get_store_warehouse", return_value="Store"):
			totals = ury_chef_ui._page_totals([], self._plans(), {}, buckets, "Co")
		# Completed (stock already used) and Processing departments are skipped.
		self.assertEqual(calls, ["A"])
		self.assertEqual(totals["material_shortages"], 2)

	def test_the_same_material_short_in_two_departments_counts_once(self):
		plans = [
			{"name": "PP-A", "department": "A", "production_state": "Awaiting Materials"},
			{"name": "PP-B", "department": "B", "production_state": "Ready for Production"},
		]
		buckets = {"A": {"targets": []}, "B": {"targets": []}}
		with patch(f"{MOD}._short_raw_materials", return_value={"FLOUR"}), patch(f"{MOD}.get_store_warehouse", return_value="Store"):
			totals = ury_chef_ui._page_totals([], plans, {}, buckets, "Co")
		self.assertEqual(totals["material_shortages"], 1)


class TestShortRawMaterials(unittest.TestCase):
	def test_department_or_store_shortage_counts(self):
		readiness = {
			"rows": [
				{"item_code": "FLOUR", "department_shortage": 2.0, "store_shortage": 0.0},
				{"item_code": "BUTTER", "department_shortage": 0.0, "store_shortage": 1.0},
				{"item_code": "SALT", "department_shortage": 0.0, "store_shortage": 0.0},
			],
			"blockers": [],
		}
		plan_rows = [{"item_code": "CAKE", "bom_no": "BOM-CAKE", "planned_qty": 4.0}]
		with patch(f"{MOD}.compute_readiness", return_value=readiness):
			result = ury_chef_ui._short_raw_materials("A", {"targets": []}, plan_rows, "Store")
		self.assertEqual(result, {"FLOUR", "BUTTER"})

	def test_a_failure_is_logged_and_counts_as_no_shortage(self):
		with patch(f"{MOD}.compute_readiness", side_effect=Exception("boom")), patch(f"{MOD}.frappe.log_error") as log_error:
			result = ury_chef_ui._short_raw_materials("A", {"targets": []}, [], "Store")
		self.assertEqual(result, set())
		log_error.assert_called_once()


class TestCompileBuckets(unittest.TestCase):
	def test_passes_the_branch_and_company_to_the_compiler(self):
		with patch(f"{MOD}.compile_production_targets", return_value=({"Kitchen": {"targets": []}}, [])) as compile_:
			result = ury_chef_ui._compile_buckets({"approval_snapshot": "{}", "company": "Co"}, "Branch A")
		compile_.assert_called_once_with("{}", "Branch A", "Co")
		self.assertEqual(result, {"Kitchen": {"targets": []}})

	def test_a_compiler_failure_degrades_to_plan_rows_and_is_logged(self):
		with patch(f"{MOD}.compile_production_targets", side_effect=Exception("bad BOM")), patch(
			f"{MOD}.frappe.log_error"
		) as log_error:
			result = ury_chef_ui._compile_buckets({"approval_snapshot": "{}", "company": "Co"}, "Branch A")
		self.assertEqual(result, {})
		log_error.assert_called_once()


class TestSubAssemblyEdit(_ChefTestBase):
	"""Editing a parent re-derives its sub-assembly row: updated, added or removed."""

	def setUp(self):
		frappe.set_user(self._head_for(self.dept_a))
		bucket = {
			"warehouse": "WH",
			"targets": [
				_target("BASE", 8, sources=NESTED),
				_target("BIRYANI", 10, components=[("BASE", 8.0)]),
			],
		}
		patches = [
			patch(f"{MOD}._compile_department_bucket", return_value=(bucket, [])),
			patch(f"{MOD}._target_to_production_plan_item", side_effect=lambda t, d, qty=None: {
				"item_code": t["item_code"], "bom_no": t["bom_no"], "planned_qty": qty}),
		]
		for p in patches:
			p.start()
			self.addCleanup(p.stop)

	def _plan(self, base_qty=5.0):
		rows = [_Row(name="r-biryani", item_code="BIRYANI", bom_no="BOM-BIRYANI", planned_qty=10.0)]
		if base_qty:
			rows.insert(0, _Row(name="r-base", item_code="BASE", bom_no="BOM-BASE", planned_qty=base_qty))
		plan = _FakePlan("MFG-PP-A", self.dept_a, rows=rows)
		plan.append = lambda table, data: plan.po_items.append(_Row(name="new", **data))
		plan.remove = lambda row: plan.po_items.remove(row)
		return plan

	def _edit(self, plan, qty, stock):
		with patch(f"{MOD}.get_warehouse_stock", return_value=stock):
			return self._run_with_plan(
				plan, update_production_quantities, plan.name, [{"row_name": "r-biryani", "production_qty": qty}]
			)

	def test_sub_assembly_row_is_updated_to_demand_minus_stock(self):
		plan = self._plan(5.0)
		self._edit(plan, 20, {"BASE": 3.0})  # demand 16, stock 3
		self.assertEqual({r.item_code: r.planned_qty for r in plan.po_items}, {"BASE": 13.0, "BIRYANI": 20})
		self.assertTrue(plan.saved)
		self.assertIn("BASE", plan.comments[0][1])

	def test_row_is_removed_when_stock_covers_the_demand(self):
		plan = self._plan(5.0)
		self._edit(plan, 20, {"BASE": 50.0})
		self.assertEqual([r.item_code for r in plan.po_items], ["BIRYANI"])
		self.assertEqual(plan.po_items[0].idx, 1)

	def test_row_is_added_when_demand_exceeds_stock_again(self):
		plan = self._plan(0)
		self._edit(plan, 20, {"BASE": 6.0})  # demand 16, stock 6
		self.assertEqual({r.item_code: r.planned_qty for r in plan.po_items}, {"BIRYANI": 20, "BASE": 10.0})

	def _edit_rows(self, plan, rows, stock):
		with patch(f"{MOD}.get_warehouse_stock", return_value=stock):
			return self._run_with_plan(plan, update_production_quantities, plan.name, rows)

	def test_a_sub_assembly_can_be_raised_above_what_its_parents_need(self):
		plan = self._plan(5.0)
		self._edit_rows(plan, [{"row_name": "r-base", "item_code": "BASE", "production_qty": 12}], {"BASE": 3.0})
		self.assertEqual({r.item_code: r.planned_qty for r in plan.po_items}, {"BASE": 12, "BIRYANI": 10.0})
		self.assertTrue(plan.saved)

	def test_a_sub_assembly_below_what_its_parents_need_after_stock_is_refused(self):
		plan = self._plan(5.0)
		with self.assertRaises(frappe.ValidationError):  # demand 8 - stock 3 = at least 5
			self._edit_rows(plan, [{"row_name": "r-base", "item_code": "BASE", "production_qty": 1}], {"BASE": 3.0})
		self.assertFalse(plan.saved)

	def test_a_stock_covered_sub_assembly_without_a_row_is_edited_by_item_code(self):
		plan = self._plan(0)
		self._edit_rows(plan, [{"row_name": None, "item_code": "BASE", "production_qty": 9}], {"BASE": 0.0})
		self.assertEqual({r.item_code: r.planned_qty for r in plan.po_items}, {"BIRYANI": 10.0, "BASE": 9})

	def test_a_sub_assembly_set_to_zero_loses_its_row_when_stock_covers_it(self):
		plan = self._plan(5.0)
		self._edit_rows(plan, [{"row_name": "r-base", "item_code": "BASE", "production_qty": 0}], {"BASE": 50.0})
		self.assertEqual([r.item_code for r in plan.po_items], ["BIRYANI"])

	def test_a_sub_assembly_set_to_zero_is_refused_when_stock_does_not_cover_it(self):
		plan = self._plan(5.0)
		with self.assertRaises(frappe.ValidationError):
			self._edit_rows(plan, [{"row_name": "r-base", "item_code": "BASE", "production_qty": 0}], {"BASE": 3.0})

	def test_a_sub_assembly_edited_with_its_parent_keeps_the_manual_value(self):
		plan = self._plan(5.0)
		self._edit_rows(
			plan,
			[
				{"row_name": "r-biryani", "item_code": "BIRYANI", "production_qty": 20},
				{"row_name": "r-base", "item_code": "BASE", "production_qty": 30},
			],
			{"BASE": 3.0},
		)
		self.assertEqual({r.item_code: r.planned_qty for r in plan.po_items}, {"BASE": 30, "BIRYANI": 20})

	def test_a_sub_assembly_only_edit_leaves_other_rows_alone(self):
		plan = self._plan(5.0)
		self._edit_rows(plan, [{"row_name": "r-base", "item_code": "BASE", "production_qty": 7}], {"BASE": 3.0})
		self.assertEqual(next(r for r in plan.po_items if r.item_code == "BIRYANI").planned_qty, 10.0)

	def test_a_direct_item_still_needs_a_quantity_above_zero(self):
		plan = self._plan(5.0)
		with self.assertRaises(frappe.ValidationError):
			self._edit_rows(plan, [{"row_name": "r-biryani", "item_code": "BIRYANI", "production_qty": 0}], {})

	def test_an_item_that_is_not_a_sub_assembly_without_a_row_is_refused(self):
		plan = self._plan(5.0)
		with self.assertRaises(frappe.ValidationError):
			self._edit_rows(plan, [{"row_name": None, "item_code": "NOPE", "production_qty": 3}], {})


class TestPickLatest(unittest.TestCase):
	def test_keeps_most_recent_date_per_item(self):
		rows = [
			{"item_code": "A", "posting_date": "2026-11-13", "qty": 4},
			{"item_code": "A", "posting_date": "2026-11-20", "qty": 6},
			{"item_code": "B", "posting_date": "2026-11-06", "qty": 2},
		]
		self.assertEqual(
			pick_latest_per_item(rows),
			{"A": {"qty": 6.0, "date": "2026-11-20"}, "B": {"qty": 2.0, "date": "2026-11-06"}},
		)

	def test_empty(self):
		self.assertEqual(pick_latest_per_item([]), {})


class TestLandingAndAppTile(_ChefTestBase):
	def test_department_head_sees_app_tile_and_lands_on_chef(self):
		from ury.permission import check_app_permission
		from ury.ury.controllers.setup_redirect import _role_based_home_page

		frappe.set_user(_user([DEPARTMENT_HEAD_ROLE]))
		self.assertTrue(check_app_permission())
		self.assertEqual(_role_based_home_page(), "/ury/production-board")

	def test_manager_with_department_head_role_keeps_default_landing(self):
		from ury.ury.controllers.setup_redirect import _role_based_home_page

		frappe.set_user(_user([DEPARTMENT_HEAD_ROLE, "URY Manager"]))
		self.assertIsNone(_role_based_home_page())
