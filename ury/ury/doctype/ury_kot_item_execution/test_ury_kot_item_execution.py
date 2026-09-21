"""Doctype-level tests for `URY KOT Execution` and `URY KOT Item Execution`.

Both controllers are pure storage `Document` subclasses (verified by reading
`ury_kot_execution.py`/`ury_kot_item_execution.py` in full -- both are
`pass`-only; every lifecycle rule lives in
`ury.ury.api.ury_kot_execution_service`/`ury_kot_item_execution_service`,
already covered by `test_ury_kot_execution_service.py`/
`test_ury_kot_item_execution_service.py`). Since there is no doctype-level
test file at all for either doctype (the gap TRACK.md's Phase 2 flags), and
these are real transactional records (one row per KOT / KOT-item execution
lifecycle, `idempotency_key` uniqueness matters), this file uses
`frappe.tests.IntegrationTestCase` with real fixture records and a real DB
round trip -- per TRACK.md's stated split for write-path state, not the
mock convention -- rather than mocking away the exact schema-level behavior
(mandatory fields, `Select` options, insert/update semantics) that a service-
layer unit test intentionally never exercises.

Uses `ury.ury.tests.factories.make_branch` (Phase 8 factory, already
committed) instead of hand-rolling another Branch-insert call site.

IMPORTANT -- status of this file: written and statically checked
(`py_compile`, hand-reviewed against the two doctypes' actual JSON schemas
and controller source) but NOT YET run against a live bench in this pass --
see this session's EXECUTION_LOG.md entry for why (bench-provisioning time
budget). Do not treat this file as CI-verified until a real
`bench run-tests` run against it is recorded with the literal OK/FAILED
text.
"""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase as IntegrationTestCase
# this app's dev bench predates frappe.tests.IntegrationTestCase (v16-native);
# FrappeTestCase is the currently-available equivalent here.

from ury.ury.tests.factories import make_branch


def _make_company_for(branch_doc):
	"""Reuse an existing Company if one is already on the site (as the repo's
	own `_Test Company` CI-fixture convention guarantees), else fall back to
	whatever the first Company record is. Mirrors `make_pos_profile()`'s own
	"pick an existing Company" fallback in `ury/ury/tests/factories.py`
	rather than inserting a second, competing one.
	"""
	company = frappe.db.get_value("Company", {}, "name")
	if not company:
		frappe.throw("No Company fixture found on this site -- cannot build URY KOT Execution fixtures")
	return company


def _make_kot(**overrides):
	name = overrides.pop("name", None) or frappe.generate_hash(length=10)
	fields = {
		"doctype": "URY KOT",
		"name": name,
		"date": frappe.utils.today(),
		"type": overrides.pop("type", None) or "New Order",
		"invoice": overrides.pop("invoice", None) or "INV-TEST-001",
		"restaurant_table": overrides.pop("restaurant_table", None) or "T-01",
		"customer_name": overrides.pop("customer_name", None) or "Test Customer",
		"order_no": overrides.pop("order_no", None) or "101",
		"naming_series": overrides.pop("naming_series", None) or "KOT-URY-",
		"kot_items": [],
	}
	fields.update(overrides)
	doc = frappe.get_doc(fields)
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.insert(ignore_permissions=True)
	return doc


class TestURYKOTItemExecution(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.branch = make_branch(branch="URY KOT Item Execution Test Branch")
		cls.company = _make_company_for(cls.branch)

	def test_insert_with_mandatory_fields_succeeds(self):
		kot = _make_kot()
		self.addCleanup(lambda: frappe.delete_doc("URY KOT", kot.name, force=True, ignore_permissions=True))
		doc = frappe.get_doc(
			{
				"doctype": "URY KOT Item Execution",
				"kot": kot.name,
				# `kot_item` is a Link to the "URY KOT Items" child-row
				# doctype (autoname hash) -- this test doesn't build a real
				# `URY KOT.kot_items` row, so ignore_links bypasses the FK
				# check below, matching the doctype-controller-level scope
				# of this test (schema/lifecycle behavior of the execution
				# record itself, not `URY KOT`'s own item table).
				"kot_item": frappe.generate_hash(length=10),
				"state": "QUEUED",
				"idempotency_key": frappe.generate_hash(length=12),
				"branch": self.branch.name,
				"company": self.company,
			}
		)
		doc.flags.ignore_links = True
		doc.insert(ignore_permissions=True)
		self.addCleanup(lambda: frappe.delete_doc("URY KOT Item Execution", doc.name, force=True, ignore_permissions=True))
		self.assertTrue(doc.name)
		reloaded = frappe.get_doc("URY KOT Item Execution", doc.name)
		self.assertEqual(reloaded.kot, kot.name)
