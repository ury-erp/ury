# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_production_plan_cancel_hooks import before_cancel


class _FakeDoc(dict):
	"""dict.__setattr__ is object's default (independent of dict storage),
	which is exactly what matters here: this mirrors how a real
	frappe.model.document.Document is set via `doc.ignore_linked_doctypes =
	...` (a plain instance attribute, not a real doctype field)."""

	def get(self, key, default=None):
		return super().get(key, default)


class TestProductionPlanCancelHooks(FrappeTestCase):
	def test_adds_sales_plan_when_unset(self):
		doc = _FakeDoc()
		before_cancel(doc)
		self.assertEqual(set(doc.ignore_linked_doctypes), {"URY Sales Plan"})

	def test_preserves_existing_entries(self):
		doc = _FakeDoc(ignore_linked_doctypes=("Serial and Batch Bundle",))
		before_cancel(doc)
		self.assertEqual(
			set(doc.ignore_linked_doctypes), {"Serial and Batch Bundle", "URY Sales Plan"}
		)

	def test_idempotent_no_duplicate(self):
		doc = _FakeDoc(ignore_linked_doctypes=("URY Sales Plan",))
		before_cancel(doc)
		self.assertEqual(doc.ignore_linked_doctypes.count("URY Sales Plan"), 1)
