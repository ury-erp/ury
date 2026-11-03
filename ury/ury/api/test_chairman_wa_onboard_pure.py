import unittest

from ury.ury.api import chairman_wa_onboard as ob


class TestOnboardPure(unittest.TestCase):
	def test_mask(self):
		self.assertEqual(ob.mask_number("971501234567"), "+97 •••• 4567")
		self.assertEqual(ob.mask_number(""), "")
		self.assertNotIn("501234", ob.mask_number("971501234567"))

	def test_status_never_has_code(self):
		p = ob.status_payload({"status": "Pending", "wa_number": "971501234567", "verified_on": None}, "9715555", True)
		self.assertEqual(p["state"], "Pending")
		self.assertNotIn("code", p)
		self.assertNotIn("971501234567", str(p))
		self.assertEqual(p["consent_text_version"], "v1")

	def test_status_none_and_disabled(self):
		self.assertEqual(ob.status_payload(None, "x", True)["state"], "None")
		self.assertEqual(ob.status_payload({"status": "Revoked", "wa_number": "971501234567"}, "", True)["number_masked"], "")
		self.assertFalse(ob.status_payload(None, "", False)["enabled"])

	def test_command(self):
		self.assertEqual(ob.link_command("123456"), "LINK 123456")


if __name__ == "__main__":
	unittest.main()
