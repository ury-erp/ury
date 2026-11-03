import json
import os
import unittest


class TestChairmanWhatsAppLinkDefinition(unittest.TestCase):
	"""DB-free: asserts the doctype definition."""

	def test_definition(self):
		path = os.path.join(os.path.dirname(__file__), "chairman_whatsapp_link.json")
		with open(path) as f:
			meta = json.load(f)
		self.assertEqual(meta["module"], "URY")
		fields = {f["fieldname"]: f for f in meta["fields"]}
		self.assertEqual(fields["user"].get("unique"), 1)
		self.assertEqual(fields["wa_number"].get("unique"), 1)
		self.assertEqual(fields["status"]["options"].split("\n"), ["Pending", "Active", "Revoked"])
		for f in ("consented_at", "consent_text_version", "otp_hash", "otp_expires", "otp_attempts"):
			self.assertIn(f, fields)
		self.assertEqual({p["role"] for p in meta["permissions"]}, {"System Manager"})


try:
	import frappe
	from frappe.tests import IntegrationTestCase
except Exception:  # pragma: no cover
	IntegrationTestCase = None

if IntegrationTestCase:
	from ury.ury.api import chairman_wa_identity as ident

	class TestChairmanWhatsAppLinkSite(IntegrationTestCase):
		"""Needs a site (bench run-tests). Written, not run by the author."""

		def _user(self, email, roles=("URY Chairman",), enabled=1):
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, force=1)
			u = frappe.get_doc({"doctype": "User", "email": email, "first_name": "T", "enabled": enabled, "send_welcome_email": 0})
			for r in roles:
				u.append("roles", {"role": r})
			u.insert(ignore_permissions=True)
			return u

		def _link(self, user, number="+971 50 123 4567", status="Pending"):
			return frappe.get_doc({"doctype": "Chairman WhatsApp Link", "user": user, "wa_number": number, "status": status}).insert(ignore_permissions=True)

		def test_resolve_active_only_and_otp_flow(self):
			u = self._user("cwl1@example.com")
			link = self._link(u.name)
			self.assertEqual(link.wa_number, "971501234567")
			self.assertIsNone(ident.resolve("971501234567"))
			otp = ident.issue_otp(link.name)
			self.assertFalse(ident.verify_otp(link.name, "000000" if otp != "000000" else "111111", "v1")["ok"])
			self.assertTrue(ident.verify_otp(link.name, otp, "v1")["ok"])
			self.assertEqual(ident.resolve("+971 50 123 4567"), u.name)

		def test_non_chairman_rejected(self):
			u = self._user("cwl2@example.com", roles=())
			with self.assertRaises(frappe.ValidationError):
				self._link(u.name, "971501110000")

		def test_admin_rejected(self):
			with self.assertRaises(frappe.ValidationError):
				self._link("Administrator", "971501110001")

		def test_revoke_on_disable(self):
			u = self._user("cwl3@example.com")
			link = self._link(u.name, "971501110002")
			ident.issue_otp(link.name)
			frappe.db.set_value("Chairman WhatsApp Link", link.name, "status", "Active")
			ident.revoke_for_user(u.name, "User disabled")
			self.assertEqual(frappe.db.get_value("Chairman WhatsApp Link", link.name, "status"), "Revoked")
			self.assertIsNone(ident.resolve("971501110002"))
