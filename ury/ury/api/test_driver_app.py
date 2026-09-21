"""Run with unittest: no Frappe test hooks, fixtures, or committed positions."""
import base64
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

import frappe

from ury.ury import signed_links
from ury.ury.api import driver_app as api
from ury.ury.api import feedback


NOW = datetime(2026, 9, 21, 20, 0)


def unwrapped(fn):
	return getattr(fn, "__wrapped__", fn)


driver_state = unwrapped(api.driver_state)
report_position = unwrapped(api.report_position)
driver_set_status = unwrapped(api.driver_set_status)


def reject(message, *args, **kwargs):
	raise ValueError(message)


def driver(**overrides):
	values = dict(name="Ali", driver_name="Ali", branch="Branch 1", active=1)
	values.update(overrides)
	return frappe._dict(values)


class DriverCase(unittest.TestCase):
	def setUp(self):
		for module in (api, signed_links):
			throw = patch.object(module.frappe, "throw", side_effect=reject)
			throw.start()
			self.addCleanup(throw.stop)
			translate = patch.object(module, "_", side_effect=lambda value: value)
			translate.start()
			self.addCleanup(translate.stop)

		key = patch.object(signed_links, "get_encryption_key", return_value="test-key")
		key.start()
		self.addCleanup(key.stop)

		# `now_datetime` reads System Settings for the site's timezone, which
		# needs a site. These tests have none, and the clock is not what they
		# are about.
		clock = patch.object(api, "now_datetime", return_value=NOW)
		clock.start()
		self.addCleanup(clock.stop)

	def token(self, reference="Ali"):
		return signed_links.make_token(api.DRIVER_SCOPE, reference)

	def with_driver(self, row, open_deliveries=None):
		db = MagicMock()
		db.get_value.return_value = row
		return patch.object(api.frappe, "db", db), patch.object(
			api, "_open_deliveries", return_value=open_deliveries or []
		)


class TestDriverLinkScope(DriverCase):
	def test_a_valid_link_names_its_driver(self):
		db, _open = self.with_driver(driver())
		with db:
			self.assertEqual(api.driver_from_token(self.token()).name, "Ali")

	def test_a_feedback_link_cannot_be_used_as_a_driver_link(self):
		# Both are signed with the same site key, so scope is the only thing
		# keeping one endpoint from honouring the other's links.
		feedback_token = signed_links.make_token(feedback.BRANCH_SCOPE, "Branch 1")
		with self.assertRaises(ValueError):
			api.driver_from_token(feedback_token)

	def test_a_driver_link_cannot_be_used_for_feedback(self):
		with patch.object(feedback, "_", side_effect=lambda value: value), \
			patch.object(feedback.frappe, "throw", side_effect=reject):
			with self.assertRaises(ValueError):
				feedback.read_token(self.token())

	def test_another_driver_cannot_be_substituted(self):
		raw = f"driver|Ali|{signed_links.sign('driver|Ali')}".replace("Ali", "Omar", 1)
		tampered = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")
		with self.assertRaises(ValueError):
			api.driver_from_token(tampered)

	def test_a_driver_who_has_left_loses_their_link(self):
		db, _open = self.with_driver(driver(active=0))
		with db:
			with self.assertRaises(ValueError):
				api.driver_from_token(self.token())


class TestTrackingPolicy(DriverCase):
	def test_no_open_delivery_means_no_tracking(self):
		db, open_rows = self.with_driver(driver(), open_deliveries=[])
		with db, open_rows:
			state = driver_state(self.token())
		self.assertFalse(state["tracking"])

	def test_an_open_delivery_turns_tracking_on(self):
		db, open_rows = self.with_driver(driver(), open_deliveries=[{"name": "DLV-1"}])
		with db, open_rows:
			state = driver_state(self.token())
		self.assertTrue(state["tracking"])

	def test_a_position_sent_with_nothing_out_is_not_stored(self):
		db_mock = MagicMock()
		db_mock.get_value.return_value = driver()
		with patch.object(api.frappe, "db", db_mock), \
			patch.object(api, "_open_deliveries", return_value=[]):
			result = report_position(self.token(), 33.3, 44.4)

		self.assertFalse(result["tracking"])
		db_mock.set_value.assert_not_called()

	def test_a_position_is_stored_while_an_order_is_out(self):
		db_mock = MagicMock()
		db_mock.get_value.return_value = driver()
		with patch.object(api.frappe, "db", db_mock), \
			patch.object(api, "_open_deliveries", return_value=[{"name": "DLV-1"}]):
			result = report_position(self.token(), 33.3152, 44.3661, accuracy=12)

		self.assertTrue(result["tracking"])
		written = db_mock.set_value.call_args.args[2]
		self.assertEqual(written["last_latitude"], 33.3152)
		self.assertEqual(written["position_accuracy"], 12)

	def test_an_impossible_position_is_refused(self):
		db_mock = MagicMock()
		db_mock.get_value.return_value = driver()
		for lat, lng in ((91, 44), (33, 181), (0, 0)):
			with patch.object(api.frappe, "db", db_mock), \
				patch.object(api, "_open_deliveries", return_value=[{"name": "DLV-1"}]):
				with self.assertRaises(ValueError):
					report_position(self.token(), lat, lng)


class TestDriverStatusChanges(DriverCase):
	def test_a_driver_cannot_close_somebody_elses_order(self):
		db, open_rows = self.with_driver(driver())
		doc = MagicMock(driver="Omar")
		with db, open_rows, patch.object(api.frappe, "get_doc", return_value=doc):
			with self.assertRaises(ValueError):
				driver_set_status(self.token(), "DLV-1", "Delivered")
		doc.save.assert_not_called()

	def test_a_driver_cannot_set_a_status_that_is_not_theirs_to_set(self):
		db, open_rows = self.with_driver(driver())
		doc = MagicMock(driver="Ali")
		with db, open_rows, patch.object(api.frappe, "get_doc", return_value=doc):
			with self.assertRaises(ValueError):
				driver_set_status(self.token(), "DLV-1", "Pending")

	def test_a_driver_can_close_their_own_order(self):
		db, open_rows = self.with_driver(driver())
		doc = MagicMock(driver="Ali")
		with db, open_rows, patch.object(api.frappe, "get_doc", return_value=doc):
			driver_set_status(self.token(), "DLV-1", "Delivered")
		self.assertEqual(doc.status, "Delivered")
		doc.save.assert_called_once()


class TestPositionAge(unittest.TestCase):
	def test_no_position_is_not_a_fresh_one(self):
		self.assertIsNone(api.position_age_minutes({"last_seen_at": None}, now=NOW))
		self.assertTrue(api.is_stale(None))

	def test_a_recent_position_is_live(self):
		age = api.position_age_minutes({"last_seen_at": "2026-09-21 19:58:00"}, now=NOW)
		self.assertEqual(age, 2)
		self.assertFalse(api.is_stale(age))

	def test_an_old_position_means_was_not_is(self):
		age = api.position_age_minutes({"last_seen_at": "2026-09-21 19:40:00"}, now=NOW)
		self.assertEqual(age, 20)
		self.assertTrue(api.is_stale(age))


if __name__ == "__main__":
	unittest.main()
