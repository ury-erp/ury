"""Station sign-in tests.

These run on any site with URY installed. Whether a user is on a Branch and
POS Profile is patched here; test_order_attribution covers the real thing.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.station import eligibility, pin as pin_rules
from ury.ury.station import test_utils as utils
from ury.ury.station.test_utils import Browser


def on_a_branch():
	"""Pretend every user is on a Branch and POS Profile with an open session."""
	return patch.multiple(
		eligibility,
		branch_of=lambda user: "Test Branch",
		pos_profile_of=lambda user, branch=None: "Test Profile",
		open_pos_session=lambda profile: "POS-OPE-TEST",
	)


class StationTestCase(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		utils.run_jobs_inline(self)
		utils.cleanup()
		self.station = utils.make_station()
		patcher = on_a_branch()
		patcher.start()
		self.addCleanup(patcher.stop)
		self.addCleanup(utils.cleanup)


class TestPinRules(StationTestCase):
	def test_pin_must_be_unique_among_enabled_waiters(self):
		pin = utils.new_pin()
		utils.set_pin(utils.make_user("asha").name, pin)
		juma = utils.make_user("juma").name

		with self.assertRaises(frappe.ValidationError):
			utils.set_pin(juma, pin)
		utils.set_pin(juma, utils.new_pin())

	def test_disabled_waiter_frees_the_pin_and_cannot_take_it_back(self):
		pin = utils.new_pin()
		asha_pin = utils.set_pin(utils.make_user("asha").name, pin)
		asha_pin.enabled = 0
		asha_pin.save()

		utils.set_pin(utils.make_user("juma").name, pin)  # now free

		asha_pin.reload()
		asha_pin.enabled = 1
		with self.assertRaises(frappe.ValidationError):
			asha_pin.save()  # must choose a new PIN
		asha_pin.new_pin = pin
		with self.assertRaises(frappe.ValidationError):
			asha_pin.save()  # and not one that is now taken

	def test_changing_a_pin_to_its_own_value_is_allowed(self):
		pin = utils.new_pin()
		doc = utils.set_pin(utils.make_user("asha").name, pin)
		doc.new_pin = pin
		doc.save()

	def test_pin_length_and_digits(self):
		user = utils.make_user("asha").name
		for bad in ("123", "1234567", "12a4", "12 34", ""):
			with self.assertRaises(frappe.ValidationError, msg=bad):
				utils.set_pin(user, bad)

	def test_pin_is_never_stored_in_plain_text(self):
		pin = utils.new_pin()
		doc = utils.set_pin(utils.make_user("asha").name, pin)
		row = frappe.db.get_value("URY Waiter PIN", doc.name, ["new_pin", "pin_hash"], as_dict=True)

		self.assertFalse(row.new_pin)
		self.assertNotIn(pin, row.pin_hash)
		self.assertTrue(pin_rules.passlibctx.verify(pin, row.pin_hash))
		self.assertFalse(frappe.db.sql("select name from `__Auth` where doctype = 'URY Waiter PIN'"))
		self.assertNotIn(pin, utils.as_json(frappe.get_doc("URY Waiter PIN", doc.name).as_dict()))


class TestSignIn(StationTestCase):
	def setUp(self):
		super().setUp()
		self.asha_pin, self.juma_pin, self.wrong_pin = utils.new_pin(), utils.new_pin(), utils.new_pin()
		self.asha = utils.make_user("asha").name
		utils.set_pin(self.asha, self.asha_pin)
		self.juma = utils.make_user("juma").name
		utils.set_pin(self.juma, self.juma_pin)

	def test_sign_in_starts_a_session_as_the_waiter_with_that_pin(self):
		browser = Browser()
		self.assertIsNone(browser.logged_user())

		result = browser.sign_in(self.juma_pin)

		self.assertTrue(result["ok"], result)
		self.assertEqual(result["redirect"], "/pos/order")
		self.assertEqual(browser.logged_user(), self.juma)
		log = frappe.get_all(
			"URY Station Sign-in Log", filters={"station": utils.TEST_STATION}, fields=["user", "result"]
		)
		self.assertEqual([(row.user, row.result) for row in log], [(self.juma, "Success")])
		self.assertTrue(frappe.db.get_value("URY Waiter PIN", self.juma, "last_used"))

	def test_next_waiter_replaces_the_previous_session(self):
		browser = Browser()
		browser.sign_in(self.asha_pin)
		browser.get("/station")  # arriving at the PIN page signs the last waiter out
		self.assertIsNone(browser.logged_user())

		browser.sign_in(self.juma_pin)
		self.assertEqual(browser.logged_user(), self.juma)

	def test_response_never_contains_the_pin_or_hash(self):
		browser = Browser()
		response = browser._request(
			"post",
			"/api/method/ury.ury.station.signin.sign_in",
			json={"station": utils.TEST_STATION, "pin": self.asha_pin, "device_token": utils.DEVICE_TOKEN},
		)
		body = response.get_data(as_text=True)
		self.assertNotIn(self.asha_pin, body)
		self.assertNotIn("pbkdf2", body)

	def test_wrong_pin_is_refused_and_counted(self):
		browser = Browser()
		result = browser.sign_in(self.wrong_pin)

		self.assertFalse(result["ok"])
		self.assertIn("4 tries left", result["message"])
		self.assertIsNone(browser.logged_user())

	def test_station_locks_after_five_wrong_pins(self):
		browser = Browser()
		for _attempt in range(4):
			self.assertNotIn("locked_for", browser.sign_in(self.wrong_pin))

		fifth = browser.sign_in(self.wrong_pin)
		self.assertGreater(fifth["locked_for"], 0)

		# Even the right PIN is refused while the station is locked.
		locked = browser.sign_in(self.asha_pin)
		self.assertFalse(locked["ok"])
		self.assertGreater(locked["locked_for"], 0)
		self.assertIsNone(browser.logged_user())

		# A manager can unlock it.
		frappe.get_doc("URY Station", self.station.name).unlock()
		self.assertTrue(browser.sign_in(self.asha_pin)["ok"])

	def test_success_resets_the_wrong_pin_count(self):
		browser = Browser()
		for _attempt in range(3):
			browser.sign_in(self.wrong_pin)
		self.assertTrue(browser.sign_in(self.asha_pin)["ok"])
		browser.get("/station")

		self.assertIn("4 tries left", browser.sign_in(self.wrong_pin)["message"])

	def test_unknown_or_disabled_station_is_refused(self):
		browser = Browser()
		self.assertFalse(browser.sign_in(self.asha_pin, station="RCNOPE")["ok"])

		frappe.db.set_value("URY Station", self.station.name, "enabled", 0)
		self.assertFalse(browser.sign_in(self.asha_pin)["ok"])
		self.assertIsNone(browser.logged_user())

	def test_screen_that_was_not_activated_is_refused(self):
		browser = Browser()
		result = browser.sign_in(self.asha_pin, device_token="some-other-device")

		self.assertFalse(result["ok"])
		self.assertTrue(result["reset_station"])
		self.assertIsNone(browser.logged_user())

	def test_protections_stay_on_when_only_some_settings_were_saved(self):
		# Saving one setting must not turn the never-saved checkboxes off.
		self.addCleanup(utils.restore_settings, utils.stored_settings())
		frappe.db.delete("Singles", {"doctype": "URY Station Settings"})
		frappe.db.set_single_value("URY Station Settings", "idle_seconds", 120)
		frappe.clear_document_cache("URY Station Settings", "URY Station Settings")

		settings = pin_rules.get_settings()
		self.assertEqual(int(settings.require_device_activation), 1)
		self.assertEqual(int(settings.block_desk), 1)
		self.assertEqual(int(settings.idle_seconds), 120)
		self.assertFalse(Browser().sign_in(self.asha_pin, device_token="some-other-device")["ok"])

	def test_activation_code_binds_a_screen_once(self):
		browser = Browser()
		code = frappe.get_doc("URY Station", self.station.name).new_activation_code()["code"]

		status, wrong = browser.call(
			"ury.ury.station.signin.activate", station=utils.TEST_STATION, activation_code="000000"
		)
		self.assertFalse(wrong["ok"])

		status, activated = browser.call(
			"ury.ury.station.signin.activate", station=utils.TEST_STATION, activation_code=code
		)
		self.assertTrue(activated["ok"])
		self.assertTrue(browser.sign_in(self.asha_pin, device_token=activated["device_token"])["ok"])

		# The code is single-use, and the old screen's token no longer works.
		status, again = Browser().call(
			"ury.ury.station.signin.activate", station=utils.TEST_STATION, activation_code=code
		)
		self.assertFalse(again["ok"])
		self.assertFalse(Browser().sign_in(self.asha_pin)["ok"])


class TestWhoMaySignIn(StationTestCase):
	def assert_refused(self, name, roles):
		pin = utils.new_pin()
		user = utils.make_user(name, roles=roles).name
		utils.set_pin(user, pin)
		browser = Browser()

		result = browser.sign_in(pin)

		self.assertFalse(result["ok"], f"{roles} signed in with a PIN")
		self.assertIsNone(browser.logged_user())
		self.assertEqual(
			frappe.db.get_value("URY Station Sign-in Log", {"user": user}, "result"), "Not Eligible"
		)
		return result

	def test_admin_and_manager_roles_are_refused(self):
		for index, role in enumerate(("System Manager", "Accounts Manager", "URY Manager", "URY Admin")):
			with self.subTest(role=role):
				self.assert_refused(f"boss{index}", ("URY Captain", role))

	def test_roles_outside_the_allowed_list_are_refused(self):
		self.assert_refused("cashier", ("URY Captain", "URY Cashier"))

	def test_user_without_captain_role_is_refused(self):
		self.assert_refused("stranger", ("Sales User",))

	def test_forbidden_roles_cannot_be_added_to_the_allowed_list(self):
		settings = frappe.get_single("URY Station Settings")
		settings.append("allowed_roles", {"role": "System Manager"})
		with self.assertRaises(frappe.ValidationError):
			settings.save()
		frappe.db.rollback()
		self.assertNotIn("System Manager", eligibility.allowed_roles())

	def test_disabled_user_is_refused(self):
		pin = utils.new_pin()
		user = utils.make_user("gone").name
		utils.set_pin(user, pin)
		frappe.db.set_value("User", user, "enabled", 0)

		browser = Browser()
		self.assertFalse(browser.sign_in(pin)["ok"])
		self.assertIsNone(browser.logged_user())

	def test_disabled_pin_is_refused(self):
		pin = utils.new_pin()
		user = utils.make_user("paused").name
		doc = utils.set_pin(user, pin)
		doc.enabled = 0
		doc.save()

		self.assertFalse(Browser().sign_in(pin)["ok"])


class TestNotOnBranch(FrappeTestCase):
	"""Without the patch: a captain who was never added to a Branch."""

	def setUp(self):
		frappe.set_user("Administrator")
		utils.run_jobs_inline(self)
		utils.cleanup()
		utils.make_station()
		self.addCleanup(utils.cleanup)

	def test_user_missing_from_branch_gets_a_clear_error(self):
		pin = utils.new_pin()
		user = utils.make_user("newbie").name
		utils.set_pin(user, pin)
		browser = Browser()

		result = browser.sign_in(pin)

		self.assertFalse(result["ok"])
		self.assertIn("Branch", result["message"])
		self.assertIsNone(browser.logged_user())
