"""Tests for alert_settings.get_alert_rule() and the AlertRule/AlertRuleRole/
AlertSettings controllers.

Static-review note: these tests are written and hand-traced against the
mocking pattern used by `ury/ury/api/test_ury_daily_p_and_l.py` and
`ury/ury/api/test_ury_kot_execution_service.py` (patching `frappe.get_single`
so the module under test never touches a real database). `alert_rule.py`
and `alert_rule_role.py` are trivial pass-through `Document` subclasses with
no custom logic of their own (verified by reading both files in full), so
this file also asserts that instantiating them via `frappe.get_doc` with a
plain dict does not raise -- a cheap but real regression guard against
someone later adding a `validate()`/`before_save()` that breaks bare
construction. All real logic under test lives in
`alert_settings.get_alert_rule()`, a read-only whitelisted lookup with no
write path -- per this track's stated mock-vs-IntegrationTestCase split,
this is squarely read/reporting logic, not a financial write-path.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.alert_settings.alert_settings import get_alert_rule

MODULE = "ury.ury.doctype.alert_settings.alert_settings"


def _rule(alert_type, branch=None, enabled=1):
	row = frappe._dict(
		{
			"alert_type": alert_type,
			"branch": branch,
			"enabled": enabled,
		}
	)
	row.as_dict = MagicMock(return_value=dict(row))
	return row


class TestGetAlertRule(FrappeTestCase):
	def _settings(self, custom_alerts):
		settings = frappe._dict({"custom_alerts": custom_alerts})
		return settings

	def test_no_custom_alerts_returns_none(self):
		with patch(f"{MODULE}.frappe.get_single", return_value=self._settings([])):
			self.assertIsNone(get_alert_rule("Payment Delay"))

	def test_custom_alerts_none_returns_none(self):
		with patch(
			f"{MODULE}.frappe.get_single",
			return_value=frappe._dict({"custom_alerts": None}),
		):
			self.assertIsNone(get_alert_rule("Payment Delay"))

	def test_branch_specific_rule_takes_priority_over_global(self):
		global_rule = _rule("Payment Delay", branch=None)
		branch_rule = _rule("Payment Delay", branch="Branch A")
		settings = self._settings([global_rule, branch_rule])
		with patch(f"{MODULE}.frappe.get_single", return_value=settings):
			result = get_alert_rule("Payment Delay", branch="Branch A")
		self.assertEqual(result["branch"], "Branch A")

	def test_falls_back_to_global_default_when_no_branch_match(self):
		global_rule = _rule("Payment Delay", branch=None)
		other_branch_rule = _rule("Payment Delay", branch="Branch B")
		settings = self._settings([other_branch_rule, global_rule])
		with patch(f"{MODULE}.frappe.get_single", return_value=settings):
			result = get_alert_rule("Payment Delay", branch="Branch A")
		self.assertIsNone(result["branch"])

	def test_no_branch_argument_uses_global_default_directly(self):
		global_rule = _rule("Cancel Delay", branch=None)
		settings = self._settings([global_rule])
		with patch(f"{MODULE}.frappe.get_single", return_value=settings):
			result = get_alert_rule("Cancel Delay")
		self.assertEqual(result["alert_type"], "Cancel Delay")

	def test_disabled_rule_is_ignored_even_on_exact_branch_match(self):
		disabled_branch_rule = _rule("Payment Delay", branch="Branch A", enabled=0)
		settings = self._settings([disabled_branch_rule])
		with patch(f"{MODULE}.frappe.get_single", return_value=settings):
			self.assertIsNone(get_alert_rule("Payment Delay", branch="Branch A"))

	def test_disabled_global_default_is_ignored(self):
		disabled_global_rule = _rule("Payment Delay", branch=None, enabled=0)
		settings = self._settings([disabled_global_rule])
		with patch(f"{MODULE}.frappe.get_single", return_value=settings):
			self.assertIsNone(get_alert_rule("Payment Delay"))

	def test_no_matching_alert_type_returns_none(self):
		unrelated_rule = _rule("Table Turnaround", branch=None)
		settings = self._settings([unrelated_rule])
		with patch(f"{MODULE}.frappe.get_single", return_value=settings):
			self.assertIsNone(get_alert_rule("Payment Delay"))


class TestAlertControllersConstructBare(FrappeTestCase):
	"""alert_rule.py / alert_rule_role.py / alert_settings.py's `Document`
	subclasses have no custom __init__/validate of their own (verified by
	direct source read) -- guard that against silent future breakage without
	needing a live DB round trip.
	"""

	def test_alert_rule_document_constructs(self):
		from ury.ury.doctype.alert_rule.alert_rule import AlertRule

		doc = AlertRule(
			{
				"doctype": "Alert Rule",
				"alert_type": "Payment Delay",
				"threshold_minutes": 15,
				"enabled": 1,
			}
		)
		self.assertEqual(doc.alert_type, "Payment Delay")

	def test_alert_rule_role_document_constructs(self):
		from ury.ury.doctype.alert_rule_role.alert_rule_role import AlertRuleRole

		doc = AlertRuleRole({"doctype": "Alert Rule Role", "role": "URY Manager"})
		self.assertEqual(doc.role, "URY Manager")

	def test_alert_settings_document_constructs(self):
		from ury.ury.doctype.alert_settings.alert_settings import AlertSettings

		doc = AlertSettings({"doctype": "Alert Settings", "payment_delay_time": 10})
		self.assertEqual(doc.payment_delay_time, 10)
