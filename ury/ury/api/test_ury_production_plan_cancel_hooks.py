# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Unit tests for the Production Plan cancel guard, including the D6
extension: refuse while Processing, refuse when a submitted Manufacture
Stock Entry is linked (naming it), allow (with a message) when only
unstarted submitted Work Orders exist. ``frappe.get_all`` is patched rather
than requiring real Work Order / Stock Entry fixtures, matching this
module's existing test style."""

from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_production_plan_cancel_hooks import before_cancel

MOD = "ury.ury.api.ury_production_plan_cancel_hooks"


def _fake_msgprint(msg, *args, raise_exception=None, **kwargs):
	"""Stand-in for ``frappe.msgprint`` that still raises when called the way
	``frappe.throw`` calls it (``msgprint(msg, raise_exception=exc, ...)`` --
	see ``frappe.throw``'s own implementation). A bare ``MagicMock`` would
	silently swallow that raise and make every ``frappe.throw`` in the code
	under test a no-op, which is not what real ``frappe.msgprint`` does."""
	if raise_exception:
		exc = raise_exception if isinstance(raise_exception, BaseException) else raise_exception(msg)
		raise exc


class _FakeDoc(dict):
	"""dict.__setattr__ is object's default (independent of dict storage),
	which is exactly what matters here: this mirrors how a real
	frappe.model.document.Document is set via `doc.ignore_linked_doctypes =
	...` (a plain instance attribute, not a real doctype field)."""

	def __init__(self, name="MFG-PP-0001", **fields):
		super().__init__(**fields)
		self.name = name

	def get(self, key, default=None):
		return super().get(key, default)


class TestProductionPlanCancelHooks(FrappeTestCase):
	def _before_cancel(self, doc, work_orders=None, manufacture_entries=None):
		"""``frappe.get_all`` is called twice inside ``_guard_posted_production``
		-- once for submitted Work Orders, once for submitted Manufacture
		Stock Entries linked to them -- so the fake returns each list in
		call order."""
		calls = [work_orders or [], manufacture_entries or []]

		def _fake_get_all(*args, **kwargs):
			return calls.pop(0) if calls else []

		mock_msgprint = MagicMock(side_effect=_fake_msgprint)
		with patch(f"{MOD}.frappe.get_all", side_effect=_fake_get_all), \
			 patch(f"{MOD}.frappe.msgprint", mock_msgprint):
			before_cancel(doc)
		return mock_msgprint

	def test_adds_sales_plan_when_unset(self):
		doc = _FakeDoc()
		self._before_cancel(doc)
		self.assertEqual(set(doc.ignore_linked_doctypes), {"URY Sales Plan"})

	def test_preserves_existing_entries(self):
		doc = _FakeDoc(ignore_linked_doctypes=("Serial and Batch Bundle",))
		self._before_cancel(doc)
		self.assertEqual(
			set(doc.ignore_linked_doctypes), {"Serial and Batch Bundle", "URY Sales Plan"}
		)

	def test_idempotent_no_duplicate(self):
		doc = _FakeDoc(ignore_linked_doctypes=("URY Sales Plan",))
		self._before_cancel(doc)
		self.assertEqual(doc.ignore_linked_doctypes.count("URY Sales Plan"), 1)

	def test_no_linked_work_orders_is_a_clean_pass(self):
		doc = _FakeDoc()
		mock_msgprint = self._before_cancel(doc, work_orders=[])
		mock_msgprint.assert_not_called()

	def test_refuses_while_processing(self):
		doc = _FakeDoc(custom_ury_production_state="Processing")
		with self.assertRaises(Exception):
			self._before_cancel(doc)

	def test_refuses_when_manufacture_entry_linked_and_names_it(self):
		doc = _FakeDoc()
		with self.assertRaises(Exception) as ctx:
			self._before_cancel(doc, work_orders=["WO-0001"], manufacture_entries=["MFG-STE-0007"])
		self.assertIn("MFG-STE-0007", str(ctx.exception))

	def test_allows_with_only_unstarted_work_orders_and_warns(self):
		doc = _FakeDoc()
		mock_msgprint = self._before_cancel(doc, work_orders=["WO-0001", "WO-0002"], manufacture_entries=[])
		mock_msgprint.assert_called_once()
		message = mock_msgprint.call_args[0][0]
		self.assertIn("WO-0001", message)
		self.assertIn("WO-0002", message)
