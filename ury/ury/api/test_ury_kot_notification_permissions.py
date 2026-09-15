"""Real (non-mock), live-DB negative-permission test for
`order_delay_notification()` in `ury_kot_notification.py` (Phase 4 round 4).

`order_delay_notification` loads the target `URY KOT` document and then
explicitly checks `frappe.has_permission("URY KOT", "write", doc=kot_doc)`,
throwing `frappe.PermissionError` if the caller lacks write access. `URY
KOT`'s own DocType permission rules (see `ury/ury/doctype/ury_kot/ury_kot.json`)
grant write only to System Manager / URY Captain / URY Manager / URY Cashier
-- a plain user holding none of those roles must be rejected before any
notification logic runs. This is exercised end-to-end against a real
site/DB with `frappe.set_user()`, not a mock of `has_permission` itself.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_notification import order_delay_notification

PLAIN_USER = "phase4-r4-kot-notification-plain-user@ury.test"


class TestOrderDelayNotificationPermission(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")

		if not frappe.db.exists("User", PLAIN_USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": PLAIN_USER,
					"first_name": "Phase4R4",
					"last_name": "KotNotificationPlain",
					"send_welcome_email": 0,
					"roles": [{"role": "Employee"}] if frappe.db.exists("Role", "Employee") else [],
				}
			).insert(ignore_permissions=True, ignore_mandatory=True)

		cls.kot_name = frappe.db.get_value(
			"URY KOT", {"owner": PLAIN_USER, "type": "New Order"}, "name"
		)
		if not cls.kot_name:
			kot = frappe.get_doc(
				{
					"doctype": "URY KOT",
					"naming_series": "KOT-PHASE4R4-.####",
					"order_status": "Ready For Prepare",
					"type": "New Order",
				}
			)
			kot.insert(ignore_permissions=True, ignore_mandatory=True)
			cls.kot_name = kot.name

	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		super().tearDownClass()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_plain_user_without_kot_write_role_is_rejected(self):
		frappe.set_user(PLAIN_USER)
		with self.assertRaises(frappe.PermissionError):
			order_delay_notification(self.kot_name)

	def test_administrator_is_not_rejected_by_the_permission_gate(self):
		# Sanity check on the same fixture: a user WITH write access must not
		# be turned away by the has_permission gate itself (any failure past
		# that point -- e.g. missing invoice/pos_profile data on this bare
		# fixture -- is a different, unrelated failure mode, not a
		# permission error).
		frappe.set_user("Administrator")
		try:
			order_delay_notification(self.kot_name)
		except frappe.PermissionError:
			self.fail("Administrator must not be rejected by the has_permission gate")
		except Exception:
			# Any non-permission exception past the gate (e.g. this bare
			# fixture has no invoice/pos_profile to look up recipients for)
			# is acceptable here -- this test only pins the permission gate.
			pass
