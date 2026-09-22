# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Unit tests for the Prepare Production orchestrator.

Same mocking style as ``test_ury_production_transfer.py``: ``FrappeTestCase``
for the test-runner site context, with every frappe call and every
collaborator module function (``execute_store_to_department_transfer``,
``execute_department_targets``, ``compile_production_targets``,
``compute_readiness``, ``is_job_enqueued``) patched, so no real Sales Plan /
Production Plan / Bin / Work Order fixtures are required.
"""

import json
from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api import ury_prepare_production as pp_module
from ury.ury.api.ury_prepare_production import (
	STATE_AWAITING_MATERIALS,
	STATE_COMPLETED,
	STATE_FAILED,
	STATE_PROCESSING,
	get_production_state,
	get_sales_plan_production_states,
	prepare_production,
	reset_stale_execution,
	run_prepare_production_job,
)

MOD = "ury.ury.api.ury_prepare_production"


def _department(department="Main Kitchen", warehouse="Main Kitchen - WH", targets=None):
	return {"department": department, "warehouse": warehouse, "targets": targets or [], "external_receipt_targets": []}


def _readiness(rows=None, blockers=None):
	return {"rows": rows or [], "blockers": blockers or []}


def _row(item_code="RICE", department="Main Kitchen", store_shortage=0.0, department_shortage=0.0):
	return {
		"item_code": item_code,
		"department": department,
		"department_warehouse": "Main Kitchen - WH",
		"required_qty": 10.0,
		"stock_uom": "Kg",
		"department_available": 0.0,
		"department_shortage": department_shortage,
		"store_available": 0.0,
		"store_shortage": store_shortage,
	}


class _FakeFlags:
	pass


class _FakeProductionPlanDoc:
	def __init__(self, name="MFG-PP-0001", sales_plan="SP-0001", department="Main Kitchen", docstatus=1,
				 state=STATE_AWAITING_MATERIALS, attempt=0):
		self.name = name
		self.docstatus = docstatus
		self.flags = _FakeFlags()
		self._fields = {
			"custom_ury_sales_plan": sales_plan,
			"custom_ury_department": department,
			"custom_ury_production_state": state,
			"custom_ury_execution_attempt": attempt,
			"custom_ury_execution_job_id": None,
			"company": "URY Co",
		}
		self.saved = False

	def get(self, field, default=None):
		return self._fields.get(field, default)

	def set(self, field, value):
		self._fields[field] = value

	def save(self, ignore_permissions=False):
		self.saved = True


class _FakeSalesPlanDoc:
	def __init__(self, name="SP-0001", branch="Branch A", company="URY Co", approval_snapshot="{}"):
		self.name = name
		self._fields = {"branch": branch, "company": company, "approval_snapshot": approval_snapshot}

	def get(self, field, default=None):
		return self._fields.get(field, default)


def _get_doc_side_effect(plan_doc, sales_plan_doc):
	def _get_doc(doctype, name=None):
		if doctype == "Production Plan":
			return plan_doc
		if doctype == "URY Sales Plan":
			return sales_plan_doc
		raise AssertionError(f"Unexpected get_doc call: {doctype} {name}")

	return _get_doc


class TestPrepareProductionPreflight(FrappeTestCase):
	"""prepare_production -- synchronous preflight + enqueue (D5)."""

	def _run(self, locked_row, plan_doc=None, sales_plan_doc=None, compile_result=(None, None),
			  readiness_result=None):
		plan_doc = plan_doc or _FakeProductionPlanDoc()
		sales_plan_doc = sales_plan_doc or _FakeSalesPlanDoc()
		compile_departments, compile_blockers = compile_result
		if compile_departments is None:
			compile_departments = {"Main Kitchen": _department()}
		if compile_blockers is None:
			compile_blockers = []
		readiness_result = readiness_result or _readiness()

		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=locked_row) as mock_get_value, \
			 patch(f"{MOD}.frappe.get_doc", side_effect=_get_doc_side_effect(plan_doc, sales_plan_doc)), \
			 patch(f"{MOD}.compile_production_targets", return_value=(compile_departments, compile_blockers)), \
			 patch(f"{MOD}.compute_readiness", return_value=readiness_result), \
			 patch(f"{MOD}.get_store_warehouse", return_value="Store WH - U"), \
			 patch(f"{MOD}.frappe.generate_hash", return_value="job-abc123"), \
			 patch(f"{MOD}.frappe.enqueue") as mock_enqueue:
			result = prepare_production(plan_doc.name)
		return result, plan_doc, mock_enqueue, mock_get_value

	def test_not_a_department_plan_throws(self):
		locked_row = {"docstatus": 1, "custom_ury_sales_plan": None, "custom_ury_department": None,
					   "custom_ury_production_state": None}
		with self.assertRaises(Exception):
			self._run(locked_row)

	def test_unsubmitted_plan_throws(self):
		locked_row = {"docstatus": 0, "custom_ury_sales_plan": "SP-0001", "custom_ury_department": "Main Kitchen",
					   "custom_ury_production_state": None}
		with self.assertRaises(Exception):
			self._run(locked_row)

	def test_already_processing_is_double_click_guard(self):
		locked_row = {"docstatus": 1, "custom_ury_sales_plan": "SP-0001", "custom_ury_department": "Main Kitchen",
					   "custom_ury_production_state": STATE_PROCESSING}
		result, plan_doc, mock_enqueue, _ = self._run(locked_row)
		self.assertEqual(result["status"], "already_processing")
		mock_enqueue.assert_not_called()
		self.assertFalse(plan_doc.saved)

	def test_store_shortage_blocks_and_sets_awaiting_materials(self):
		locked_row = {"docstatus": 1, "custom_ury_sales_plan": "SP-0001", "custom_ury_department": "Main Kitchen",
					   "custom_ury_production_state": STATE_AWAITING_MATERIALS}
		readiness = _readiness(rows=[_row(store_shortage=5.0)])
		result, plan_doc, mock_enqueue, _ = self._run(locked_row, readiness_result=readiness)
		self.assertEqual(result["status"], "blocked")
		self.assertTrue(result["blockers"])
		mock_enqueue.assert_not_called()
		self.assertEqual(plan_doc.get("custom_ury_production_state"), STATE_AWAITING_MATERIALS)
		self.assertTrue(plan_doc.saved)

	def test_compiler_blocker_blocks(self):
		locked_row = {"docstatus": 1, "custom_ury_sales_plan": "SP-0001", "custom_ury_department": "Main Kitchen",
					   "custom_ury_production_state": STATE_AWAITING_MATERIALS}
		compile_result = ({"Main Kitchen": _department()}, [{"type": "bom_cycle", "message": "cycle"}])
		result, plan_doc, mock_enqueue, _ = self._run(locked_row, compile_result=compile_result)
		self.assertEqual(result["status"], "blocked")
		mock_enqueue.assert_not_called()

	def test_clean_preflight_enqueues_and_stamps_fields(self):
		locked_row = {"docstatus": 1, "custom_ury_sales_plan": "SP-0001", "custom_ury_department": "Main Kitchen",
					   "custom_ury_production_state": STATE_AWAITING_MATERIALS}
		plan_doc = _FakeProductionPlanDoc(attempt=1)
		result, plan_doc, mock_enqueue, _ = self._run(locked_row, plan_doc=plan_doc)
		self.assertEqual(result["status"], "processing")
		self.assertEqual(result["job_id"], "job-abc123")
		self.assertEqual(result["attempt"], 2)
		self.assertEqual(plan_doc.get("custom_ury_production_state"), STATE_PROCESSING)
		self.assertEqual(plan_doc.get("custom_ury_execution_job_id"), "job-abc123")
		self.assertEqual(plan_doc.get("custom_ury_execution_attempt"), 2)
		self.assertTrue(plan_doc.saved)
		mock_enqueue.assert_called_once()
		_, kwargs = mock_enqueue.call_args
		self.assertEqual(kwargs["job_id"], "job-abc123")
		self.assertTrue(kwargs["enqueue_after_commit"])
		self.assertEqual(kwargs["production_plan"], plan_doc.name)
		self.assertEqual(kwargs["attempt"], 2)


class TestRunPrepareProductionJob(FrappeTestCase):
	"""run_prepare_production_job -- the background job body (D17)."""

	def _run(self, plan_doc, sales_plan_doc=None, attempt=1, transfer_result=None, compile_result=(None, None),
			  target_results=None, raise_on_targets=None):
		sales_plan_doc = sales_plan_doc or _FakeSalesPlanDoc()
		transfer_result = transfer_result if transfer_result is not None else {
			"production_plan": plan_doc.name, "stock_entries": ["MAT-STE-0001"], "blockers": [], "locked_bins": []
		}
		compile_departments, compile_blockers = compile_result
		if compile_departments is None:
			compile_departments = {"Main Kitchen": _department()}
		if compile_blockers is None:
			compile_blockers = []
		target_results = target_results or [
			{"item_code": "BIRYANI-BASE", "work_order": "WO-0001", "work_order_created": True,
			 "manufacture_stock_entry": "MFG-STE-0001", "produced_qty": 10.0, "remaining_qty": 0.0}
		]

		def _execute_targets(*args, **kwargs):
			if raise_on_targets:
				raise raise_on_targets
			return target_results

		with patch(f"{MOD}.frappe.get_doc", side_effect=_get_doc_side_effect(plan_doc, sales_plan_doc)), \
			 patch(f"{MOD}.execute_store_to_department_transfer", return_value=transfer_result) as mock_transfer, \
			 patch(f"{MOD}.compile_production_targets", return_value=(compile_departments, compile_blockers)), \
			 patch(f"{MOD}.execute_department_targets", side_effect=_execute_targets) as mock_targets, \
			 patch(f"{MOD}.frappe.db.set_value") as mock_set_value, \
			 patch(f"{MOD}.frappe.db.commit"):
			result = None
			exc = None
			try:
				result = run_prepare_production_job(plan_doc.name, attempt)
			except Exception as e:  # noqa: BLE001
				exc = e
		return result, exc, mock_transfer, mock_targets, mock_set_value

	def test_stale_attempt_is_a_noop(self):
		plan_doc = _FakeProductionPlanDoc(state=STATE_PROCESSING, attempt=3)
		_, _, mock_transfer, mock_targets, mock_set_value = self._run(plan_doc, attempt=2)
		mock_transfer.assert_not_called()
		mock_targets.assert_not_called()
		mock_set_value.assert_not_called()

	def test_no_longer_processing_is_a_noop(self):
		plan_doc = _FakeProductionPlanDoc(state=STATE_AWAITING_MATERIALS, attempt=1)
		_, _, mock_transfer, mock_targets, mock_set_value = self._run(plan_doc, attempt=1)
		mock_transfer.assert_not_called()
		mock_targets.assert_not_called()

	def test_transfer_blocker_reverts_to_awaiting_materials(self):
		plan_doc = _FakeProductionPlanDoc(state=STATE_PROCESSING, attempt=1)
		transfer_result = {
			"production_plan": plan_doc.name, "stock_entries": [], "blockers": [{"type": "store_shortage"}],
			"locked_bins": [("RICE", "Store WH - U")],
		}
		_, _, mock_transfer, mock_targets, mock_set_value = self._run(
			plan_doc, attempt=1, transfer_result=transfer_result
		)
		mock_transfer.assert_called_once()
		mock_targets.assert_not_called()
		self.assertTrue(mock_set_value.called)
		call_args = mock_set_value.call_args_list[-1]
		values = call_args[0][2]
		self.assertEqual(values["custom_ury_production_state"], STATE_AWAITING_MATERIALS)

	def test_success_sets_completed_with_generated_documents(self):
		plan_doc = _FakeProductionPlanDoc(state=STATE_PROCESSING, attempt=1)
		_, _, mock_transfer, mock_targets, mock_set_value = self._run(plan_doc, attempt=1)
		mock_transfer.assert_called_once()
		mock_targets.assert_called_once()
		call_args = mock_set_value.call_args_list[-1]
		values = call_args[0][2]
		self.assertEqual(values["custom_ury_production_state"], STATE_COMPLETED)
		result = json.loads(values["custom_ury_production_result"])
		self.assertEqual(result["work_orders"], ["WO-0001"])
		self.assertEqual(result["manufacture_stock_entries"], ["MFG-STE-0001"])
		self.assertEqual(result["stock_entries"], ["MAT-STE-0001"])

	def test_exception_sets_failed_and_reraises(self):
		plan_doc = _FakeProductionPlanDoc(state=STATE_PROCESSING, attempt=1)
		boom = ValueError("boom")
		_, exc, mock_transfer, mock_targets, mock_set_value = self._run(plan_doc, attempt=1, raise_on_targets=boom)
		self.assertIs(exc, boom)
		call_args = mock_set_value.call_args_list[-1]
		values = call_args[0][2]
		self.assertEqual(values["custom_ury_production_state"], STATE_FAILED)
		result = json.loads(values["custom_ury_production_result"])
		self.assertIn("boom", result["error"])

	def test_compile_blocker_after_transfer_reverts_to_awaiting_materials(self):
		plan_doc = _FakeProductionPlanDoc(state=STATE_PROCESSING, attempt=1)
		compile_result = ({"Main Kitchen": _department()}, [{"type": "cross_department_dependency"}])
		_, _, mock_transfer, mock_targets, mock_set_value = self._run(
			plan_doc, attempt=1, compile_result=compile_result
		)
		mock_targets.assert_not_called()
		call_args = mock_set_value.call_args_list[-1]
		values = call_args[0][2]
		self.assertEqual(values["custom_ury_production_state"], STATE_AWAITING_MATERIALS)


class TestGetProductionState(FrappeTestCase):
	def _row(self, **overrides):
		row = {
			"docstatus": 1,
			"custom_ury_department": "Main Kitchen",
			"custom_ury_production_state": STATE_PROCESSING,
			"custom_ury_production_result": json.dumps({"blockers": [{"type": "store_shortage"}]}),
			"custom_ury_production_started_at": "2026-09-22 10:00:00",
			"custom_ury_execution_job_id": "job-1",
			"custom_ury_execution_attempt": 1,
			"custom_ury_execution_heartbeat": "2026-09-22 10:00:00",
			"custom_ury_execution_step": "transferring_stock",
		}
		row.update(overrides)
		return row

	def test_shape_and_blockers_decoded(self):
		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=self._row()), \
			 patch(f"{MOD}.is_job_enqueued", return_value=True), \
			 patch(f"{MOD}.production_job_stale_minutes", return_value=30), \
			 patch(f"{MOD}.frappe.get_roles", return_value=[]):
			state = get_production_state("MFG-PP-0001")
		self.assertEqual(state["execution_state"], "processing")
		self.assertEqual(state["blockers"], [{"type": "store_shortage"}])
		self.assertTrue(state["job_running"])
		self.assertFalse(state["can_reset"])

	def test_can_reset_true_only_when_stale_dead_and_system_manager(self):
		stale_row = self._row(custom_ury_execution_heartbeat="2020-01-01 00:00:00")
		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=stale_row), \
			 patch(f"{MOD}.is_job_enqueued", return_value=False), \
			 patch(f"{MOD}.production_job_stale_minutes", return_value=30), \
			 patch(f"{MOD}.frappe.get_roles", return_value=["System Manager"]):
			state = get_production_state("MFG-PP-0001")
		self.assertTrue(state["heartbeat_stale"])
		self.assertFalse(state["job_running"])
		self.assertTrue(state["can_reset"])

	def test_can_reset_false_when_job_still_running_despite_stale_heartbeat(self):
		stale_row = self._row(custom_ury_execution_heartbeat="2020-01-01 00:00:00")
		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=stale_row), \
			 patch(f"{MOD}.is_job_enqueued", return_value=True), \
			 patch(f"{MOD}.production_job_stale_minutes", return_value=30), \
			 patch(f"{MOD}.frappe.get_roles", return_value=["System Manager"]):
			state = get_production_state("MFG-PP-0001")
		self.assertTrue(state["heartbeat_stale"])
		self.assertTrue(state["job_running"])
		self.assertFalse(state["can_reset"])

	def test_can_reset_false_for_non_system_manager(self):
		stale_row = self._row(custom_ury_execution_heartbeat="2020-01-01 00:00:00")
		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=stale_row), \
			 patch(f"{MOD}.is_job_enqueued", return_value=False), \
			 patch(f"{MOD}.production_job_stale_minutes", return_value=30), \
			 patch(f"{MOD}.frappe.get_roles", return_value=["URY Manager"]):
			state = get_production_state("MFG-PP-0001")
		self.assertFalse(state["can_reset"])


class TestGetSalesPlanProductionStates(FrappeTestCase):
	def test_merges_link_state_and_execution_state(self):
		base = {
			"sales_plan": "SP-0001",
			"status": "Locked for Production",
			"eligible": True,
			"can_create": True,
			"production_plans": [
				{
					"department": "Main Kitchen",
					"name": "MFG-PP-0001",
					"docstatus": 1,
					"production_state": STATE_COMPLETED,
					"link_state": "stale",
					"can_open": True,
				},
			],
		}
		result_row = {
			"name": "MFG-PP-0001",
			"custom_ury_production_result": json.dumps({"blockers": []}),
		}
		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.get_production_plan_states", return_value=base), \
			 patch(f"{MOD}.frappe.get_all", return_value=[result_row]):
			states = get_sales_plan_production_states("SP-0001")

		self.assertEqual(len(states["production_plans"]), 1)
		row = states["production_plans"][0]
		# Department must survive the enrichment remap: the Sales Plan UI
		# keys Open/Create by department name. Dropping it (e.g. by reading
		# custom_ury_department off the already-mapped base row) hides every
		# Open Production Plan control after Lock for Production.
		self.assertEqual(row["department"], "Main Kitchen")
		self.assertEqual(row["production_plan"], "MFG-PP-0001")
		self.assertTrue(row["can_open"])
		# D12: both axes present and independent -- a plan can be stale AND completed.
		self.assertEqual(row["link_state"], "stale")
		self.assertEqual(row["execution_state"], "completed")
		self.assertEqual(row["blockers"], [])


class TestResetStaleExecution(FrappeTestCase):
	def _row(self, **overrides):
		row = {
			"custom_ury_production_state": STATE_PROCESSING,
			"custom_ury_execution_heartbeat": "2020-01-01 00:00:00",
			"custom_ury_execution_job_id": "job-1",
		}
		row.update(overrides)
		return row

	def test_refuses_non_system_manager(self):
		with patch(f"{MOD}.frappe.get_roles", return_value=["URY Manager"]):
			with self.assertRaises(Exception):
				reset_stale_execution("MFG-PP-0001")

	def test_refuses_when_not_processing(self):
		row = self._row(custom_ury_production_state=STATE_AWAITING_MATERIALS)
		with patch(f"{MOD}.frappe.get_roles", return_value=["System Manager"]), \
			 patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=row):
			with self.assertRaises(Exception):
				reset_stale_execution("MFG-PP-0001")

	def test_refuses_when_heartbeat_not_stale(self):
		with patch(f"{MOD}.frappe.get_roles", return_value=["System Manager"]), \
			 patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.production_job_stale_minutes", return_value=30), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=self._row(
				 custom_ury_execution_heartbeat=str(pp_module.now_datetime())
			 )):
			with self.assertRaises(Exception):
				reset_stale_execution("MFG-PP-0001")

	def test_refuses_when_job_still_enqueued_however_stale(self):
		with patch(f"{MOD}.frappe.get_roles", return_value=["System Manager"]), \
			 patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=self._row()), \
			 patch(f"{MOD}.production_job_stale_minutes", return_value=30), \
			 patch(f"{MOD}.is_job_enqueued", return_value=True):
			with self.assertRaises(Exception):
				reset_stale_execution("MFG-PP-0001")

	def test_resets_when_stale_and_dead(self):
		with patch(f"{MOD}.frappe.get_roles", return_value=["System Manager"]), \
			 patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=self._row()), \
			 patch(f"{MOD}.production_job_stale_minutes", return_value=30), \
			 patch(f"{MOD}.is_job_enqueued", return_value=False), \
			 patch(f"{MOD}.frappe.db.set_value") as mock_set_value, \
			 patch(f"{MOD}.frappe.session") as mock_session:
			mock_session.user = "admin@example.com"
			result = reset_stale_execution("MFG-PP-0001")
		self.assertEqual(result["state"], STATE_AWAITING_MATERIALS)
		mock_set_value.assert_called_once()
