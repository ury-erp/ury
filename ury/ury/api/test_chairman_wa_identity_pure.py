import unittest
from datetime import datetime, timedelta

try:
	from ury.ury.api import chairman_wa_identity as m
except ImportError:  # pure unit run from this directory
	import chairman_wa_identity as m


class TestPure(unittest.TestCase):
	def test_normalize(self):
		self.assertEqual(m.normalize_wa_number("+971 50-123 4567"), "971501234567")
		self.assertEqual(m.normalize_wa_number("00971501234567"), "971501234567")
		for bad in (None, "", "abc", "123", "0501234567", "1" * 16):
			self.assertIsNone(m.normalize_wa_number(bad))

	def test_user_facts(self):
		self.assertEqual(m.validate_user_facts("a@x.com", 1, ["URY Owner"]), [])
		self.assertTrue(m.validate_user_facts("Administrator", 1, ["URY Owner"]))
		self.assertTrue(m.validate_user_facts("Guest", 1, ["URY Owner"]))
		self.assertTrue(m.validate_user_facts("a@x.com", 0, ["URY Owner"]))
		self.assertTrue(m.validate_user_facts("a@x.com", 1, ["Sales"]))

	def test_otp_flow(self):
		now = datetime(2026, 1, 1, 12, 0)
		otp = m.generate_otp()
		self.assertEqual(len(otp), 6)
		st = m.new_otp_state("L1", otp, now, "s")
		self.assertNotIn(otp, str(st))
		ok, r, st2 = m.check_otp(st, "L1", otp, now + timedelta(minutes=9), "s")
		self.assertTrue(ok)
		self.assertIsNone(st2["otp_hash"])

	def test_otp_expiry_and_lock(self):
		now = datetime(2026, 1, 1, 12, 0)
		st = m.new_otp_state("L1", "123456", now, "s")
		self.assertEqual(m.check_otp(st, "L1", "123456", now + timedelta(minutes=11), "s")[1], "expired")
		for i in range(4):
			ok, r, st = m.check_otp(st, "L1", "000000", now, "s")
			self.assertEqual(r, "mismatch")
		ok, r, st = m.check_otp(st, "L1", "000000", now, "s")
		self.assertEqual(r, "locked")
		self.assertEqual(m.check_otp(st, "L1", "123456", now, "s")[1], "no_otp")

	def test_wrong_link_binding(self):
		now = datetime(2026, 1, 1)
		st = m.new_otp_state("L1", "123456", now, "s")
		self.assertFalse(m.check_otp(st, "L2", "123456", now, "s")[0])


if __name__ == "__main__":
	unittest.main()
