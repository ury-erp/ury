"""POS Profile `role_masked_for_amounts`: configuration, API payload and independence from the
Table Order restriction. Masking itself is display-only (see packages/core roles helper tests)."""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury_pos.api import getPosProfileFull


class TestPosProfileAmountMasking(FrappeTestCase):
	def setUp(self):
		self.profile_name = frappe.db.get_value("POS Profile", {"disabled": 0}, "name")
		if not self.profile_name:
			self.skipTest("No POS Profile on this site")
		self.profile = frappe.get_doc("POS Profile", self.profile_name)

	def tearDown(self):
		frappe.db.rollback()

	def test_field_follows_table_order_pattern(self):
		meta = frappe.get_meta("POS Profile")
		masked = meta.get_field("role_masked_for_amounts")
		table_order = meta.get_field("role_restricted_for_table_order")
		self.assertEqual((masked.fieldtype, masked.options), (table_order.fieldtype, table_order.options))
		self.assertEqual(masked.options, "Role Permitted")

	def test_payload_returns_configured_roles_and_leaves_table_order_untouched(self):
		self.profile.set("role_masked_for_amounts", [])
		self.profile.append("role_masked_for_amounts", {"role": "URY Cashier"})
		self.profile.set("role_restricted_for_table_order", [])
		self.profile.append("role_restricted_for_table_order", {"role": "URY Captain"})
		self.profile.save(ignore_permissions=True)

		data = getPosProfileFull(self.profile_name)
		data = data.get("message", data) if isinstance(data, dict) else data
		self.assertEqual([r["role"] for r in data["role_masked_for_amounts"]], ["URY Cashier"])
		self.assertEqual([r["role"] for r in data["role_restricted_for_table_order"]], ["URY Captain"])

	def test_changing_roles_changes_payload(self):
		for role in ("URY Cashier", "URY Captain"):
			self.profile.set("role_masked_for_amounts", [])
			self.profile.append("role_masked_for_amounts", {"role": role})
			self.profile.save(ignore_permissions=True)
			data = getPosProfileFull(self.profile_name)
			data = data.get("message", data) if isinstance(data, dict) else data
			self.assertEqual([r["role"] for r in data["role_masked_for_amounts"]], [role])

	def test_empty_configuration_returns_empty_list(self):
		self.profile.set("role_masked_for_amounts", [])
		self.profile.save(ignore_permissions=True)
		data = getPosProfileFull(self.profile_name)
		data = data.get("message", data) if isinstance(data, dict) else data
		self.assertEqual(data["role_masked_for_amounts"], [])
