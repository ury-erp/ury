from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.setup.setup_wizard import get_setup_stages, load_demo_masters, load_demo_pos, load_demo_transactions
from ury.ury.api.minimal.setup_organization import (
	_normalize_setup_payload,
	get_setup_progress_steps,
	submit_setup,
)


class TestUrySetupStages(FrappeTestCase):
	def test_empty_without_demo_flag(self):
		self.assertEqual(get_setup_stages(None), [])
		self.assertEqual(get_setup_stages({}), [])
		self.assertEqual(get_setup_stages({"setup_ury_demo": 0}), [])
		self.assertEqual(get_setup_stages({"setup_ury_demo": "0"}), [])

	def test_three_sync_stages_when_demo_requested(self):
		stages = get_setup_stages({"setup_ury_demo": 1, "company_name": "Cafe"})
		self.assertEqual(len(stages), 3)

		fns = [task["fn"] for stage in stages for task in stage["tasks"]]
		self.assertEqual(fns, [load_demo_masters, load_demo_transactions, load_demo_pos])
		self.assertTrue(all("enqueue" not in fn.__name__ for fn in fns))

	def test_accepts_boolean_true(self):
		self.assertEqual(len(get_setup_stages({"setup_ury_demo": True})), 3)


class TestNormalizeSetupPayload(FrappeTestCase):
	def test_forwards_ury_demo_and_omits_erpnext_demo(self):
		payload = _normalize_setup_payload(
			{
				"fy_start_date": "2026-04-01",
				"setup_demo": 1,
				"setup_ury_demo": True,
				"company_name": "Cafe",
			}
		)
		self.assertEqual(payload["setup_ury_demo"], 1)
		self.assertNotIn("setup_demo", payload)
		self.assertEqual(payload["fy_end_date"], "2027-03-31")

	def test_demo_off_by_default(self):
		payload = _normalize_setup_payload({"company_name": "Cafe"})
		self.assertEqual(payload["setup_ury_demo"], 0)


class TestGetSetupProgressSteps(FrappeTestCase):
	@patch("frappe.desk.page.setup_wizard.setup_wizard.get_setup_stages")
	def test_includes_erpnext_then_ury_when_demo_on(self, mock_stages):
		mock_stages.return_value = [
			{"status": "Updating global settings", "tasks": [{"app_name": "frappe"}]},
			{"status": "Installing presets", "tasks": [{"app_name": "erpnext"}]},
			{"status": "Setting up company", "tasks": [{"app_name": "erpnext"}]},
			{"status": "Loading restaurant demo masters", "tasks": [{"app_name": "ury"}]},
			{"status": "Creating demo transactions", "tasks": [{"app_name": "ury"}]},
			{"status": "Wrapping up", "tasks": [{}]},
		]
		original_user = frappe.session.user
		frappe.session.user = "Administrator"
		try:
			steps = get_setup_progress_steps(1)
		finally:
			frappe.session.user = original_user

		apps = [step["app"] for step in steps]
		self.assertIn("erpnext", apps)
		self.assertIn("ury", apps)
		self.assertLess(apps.index("erpnext"), apps.index("ury"))
		self.assertEqual(steps[3]["status"], "Loading restaurant demo masters")
		mock_stages.assert_called_once()
		self.assertEqual(mock_stages.call_args.args[0].setup_ury_demo, 1)


class TestSubmitSetupPayload(FrappeTestCase):
	@patch("ury.ury.api.minimal.setup_organization.setup_complete", return_value={"status": "ok"})
	@patch("ury.ury.api.minimal.setup_organization.frappe.db.get_single_value", return_value=0)
	def test_submit_setup_passes_ury_demo_not_erpnext_demo(self, _mock_settings, mock_complete):
		original_user = frappe.session.user
		frappe.session.user = "Administrator"
		try:
			submit_setup(
				{
					"company_name": "Cafe",
					"fy_start_date": "2026-04-01",
					"setup_demo": 1,
					"setup_ury_demo": 1,
				}
			)
		finally:
			frappe.session.user = original_user

		args = mock_complete.call_args.kwargs["args"]
		self.assertEqual(args["setup_ury_demo"], 1)
		self.assertNotIn("setup_demo", args)
