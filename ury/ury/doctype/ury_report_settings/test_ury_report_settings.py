# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Doctype-level coverage for URY Report Settings.

TRACK.md Phase 2 item 2 / COVERAGE_GAP_ANALYSIS.md Table 3+4: this doctype's
test file existed but had zero `def test_` methods, and its `validate()`
hook (the only real logic in the controller -- guards against a
zero-value `hours` field when `extended_hours` is enabled) had no reference
anywhere else in the suite. This is a genuine gap, not a "covered elsewhere"
false positive.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.tests.factories import make_branch


class TestURYReportSettings(FrappeTestCase):
	def tearDown(self):
		frappe.db.rollback()

	def _make_settings(self, branch=None, **overrides):
		branch = branch or make_branch()
		fields = {
			"doctype": "URY Report Settings",
			"branch": branch.name,
			"buying_price_list": overrides.pop("buying_price_list", None) or "Standard Buying",
		}
		fields.update(overrides)
		doc = frappe.get_doc(fields)
		doc.insert(ignore_permissions=True, ignore_mandatory=True)
		return doc

	def test_autoname_is_branch(self):
		branch = make_branch()
		settings = self._make_settings(branch=branch)
		self.assertEqual(settings.name, branch.name)

	def test_extended_hours_with_zero_hours_is_rejected(self):
		branch = make_branch()
		with self.assertRaises(frappe.ValidationError):
			self._make_settings(branch=branch, extended_hours=1, hours=0)

	def test_extended_hours_with_nonzero_hours_is_allowed(self):
		branch = make_branch()
		settings = self._make_settings(branch=branch, extended_hours=1, hours=2)
		self.assertEqual(settings.hours, 2)
		self.assertEqual(settings.extended_hours, 1)

	def test_extended_hours_disabled_allows_zero_hours(self):
		# validate() only throws when extended_hours == 1; disabled (default
		# 0) with hours == 0 must be allowed.
		branch = make_branch()
		settings = self._make_settings(branch=branch, extended_hours=0, hours=0)
		self.assertEqual(settings.hours, 0)

	def test_zero_hours_rejection_also_fires_on_update(self):
		branch = make_branch()
		settings = self._make_settings(branch=branch, extended_hours=0, hours=3)
		settings.extended_hours = 1
		settings.hours = 0
		with self.assertRaises(frappe.ValidationError):
			settings.save()
