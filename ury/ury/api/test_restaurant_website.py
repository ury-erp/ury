"""Run with unittest: no Frappe test hooks, fixtures, or committed test bookings."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import frappe

from ury.ury.api import restaurant_website as api
from ury.ury.doctype.ury_website.ury_website import public_url


def settings(**overrides):
	values = dict(enable_reservations=1, max_guests=12, lead_minutes=30, advance_days=30,
		duration_minutes=90, hours=[frappe._dict(day="Monday", opens="12:00", closes="23:00")])
	values.update(overrides)
	return frappe._dict(values)


def reject(message, *args, **kwargs):
	raise ValueError(message)


def setUpModule():
	# Unit tests need neither a live translation cache nor site settings.
	global PATCHES
	PATCHES = [
		patch.object(api, "_", side_effect=lambda value: value),
		patch.object(api, "now_datetime", return_value=datetime(2026, 9, 21, 10)),
		patch("frappe.utils.data.get_system_timezone", return_value="UTC"),
	]
	for item in PATCHES:
		item.start()


def tearDownModule():
	for item in reversed(PATCHES):
		item.stop()


class TestBookingWindow(unittest.TestCase):
	def setUp(self):
		self.now = datetime(2026, 9, 21, 10)
		self.throw = patch.object(api.frappe, "throw", side_effect=reject)
		self.throw.start()
		self.addCleanup(self.throw.stop)

	def window(self, start, pax="2", **config):
		return api.booking_window(settings(**config), start, pax, now=self.now)

	def test_valid_sitting_and_exact_closing_boundary(self):
		start, end, pax = self.window("2026-09-21 21:30:00")
		self.assertEqual(end, datetime(2026, 9, 21, 23))
		self.assertEqual(pax, 2)

	def test_closed_day(self):
		with self.assertRaises(ValueError):
			self.window("2026-09-22 19:00:00")

	def test_full_duration_must_fit(self):
		with self.assertRaises(ValueError):
			self.window("2026-09-21 22:00:00")

	def test_disabled_reservations(self):
		with self.assertRaises(ValueError):
			self.window("2026-09-21 19:00:00", enable_reservations=0)

	def test_advance_notice(self):
		with self.assertRaises(ValueError):
			self.window("2026-09-21 12:00:00", lead_minutes=180)

	def test_booking_horizon(self):
		with self.assertRaises(ValueError):
			self.window("2026-11-02 19:00:00")

	def test_invalid_guest_counts(self):
		for pax in (0, -1, 13, "2.5", "NaN", None):
			with self.subTest(pax=pax), self.assertRaises(ValueError):
				self.window("2026-09-21 19:00:00", pax)

	def test_invalid_dates_and_non_slot_times(self):
		for start in (None, "invalid", "2026-09-21 19:07:00", "2026-09-21 19:00:01", "2026-09-21T19:00:00+03:00"):
			with self.subTest(start=start), self.assertRaises(ValueError):
				self.window(start)

	def test_overnight_hours_allow_arrival_after_midnight(self):
		_, end, _ = self.window("2026-09-22 00:30:00",
			hours=[frappe._dict(day="Monday", opens="18:00", closes="02:00")])
		self.assertEqual(end, datetime(2026, 9, 22, 2))

	def test_overnight_hours_do_not_admit_after_closing(self):
		with self.assertRaises(ValueError):
			self.window("2026-09-22 01:00:00", hours=[frappe._dict(day="Monday", opens="18:00", closes="02:00")])


class TestTableAvailability(unittest.TestCase):
	def state(self, bookings=(), start=None, **table):
		now = datetime(2026, 9, 21, 12)
		start = start or now + timedelta(hours=3)
		data = dict(name="T1", no_of_seats=4, minimum_seating=1, occupied=0, merged_with=None)
		data.update(table)
		return api.table_state(frappe._dict(data), [frappe._dict(table=t) for t in bookings], start,
			start + timedelta(minutes=90), 2, now)

	def test_free_table(self):
		self.assertEqual(self.state(), "available")

	def test_booked_table(self):
		self.assertEqual(self.state(["T1"]), "reserved")

	def test_other_table_booking_does_not_block(self):
		self.assertEqual(self.state(["T2"]), "available")

	def test_unassigned_booking_conservatively_blocks_online_sales(self):
		self.assertEqual(self.state([None]), "unavailable")

	def test_merged_and_unsuitable_tables(self):
		for values in ({"merged_with": "T2"}, {"no_of_seats": 1}, {"minimum_seating": 3}):
			with self.subTest(values=values):
				self.assertEqual(self.state(**values), "unavailable")

	def test_walk_in_blocks_near_term_not_all_future_dates(self):
		self.assertEqual(self.state(occupied=1, start=datetime(2026, 9, 21, 12, 30)), "unavailable")
		self.assertEqual(self.state(occupied=1), "available")

	def test_no_guest_details_are_returned_and_reads_are_locked_on_booking(self):
		table = frappe._dict(name="T1", no_of_seats=4, minimum_seating=1, occupied=0,
			merged_with=None, restaurant_room="Main", table_shape="Circle")
		with patch.object(api.frappe, "db", MagicMock()) as db:
			db.get_value.return_value = "Branch 1"
			db.sql.side_effect = [[table], []]
			result = api.table_availability(frappe._dict(restaurant="R1"),
				datetime(2030, 1, 1, 19), datetime(2030, 1, 1, 20, 30), 2, lock=True)
			self.assertEqual(set(result[0]), {"id", "seats", "room", "shape", "status"})
			self.assertTrue(all("FOR UPDATE" in call.args[0] for call in db.sql.call_args_list))


class TestPublicContentSecurity(unittest.TestCase):
	def test_unsafe_urls_are_rejected(self):
		for value in ("javascript:alert(1)", "data:image/svg+xml,test", "//evil.test/x", "/private/files/a.jpg",
			"https://user@evil.test/x", "https://good.test\\@evil.test/x", "/files/../private/a", "https://x.test/\nx",
			"https://[broken", "/files/%2e%2e/private/a", "/files/%5cx", "/files/%0ax"):
			with self.subTest(value=value):
				self.assertEqual(public_url(value, image=True), "")

	def test_public_images_and_https_links(self):
		for value in ("/files/photo.jpg", "/assets/ury/image.png", "https://example.com/photo.jpg"):
			self.assertEqual(public_url(value, image=True), value)
		self.assertEqual(public_url("/files/photo.jpg"), "")

	def test_unpublished_page_is_not_public(self):
		with patch.object(api.frappe, "db", MagicMock()) as db, patch.object(api.frappe, "get_doc") as get_doc, patch.object(api.frappe, "throw", side_effect=reject):
			db.get_value.return_value = "draft"
			get_doc.return_value = MagicMock(published=0)
			with self.assertRaises(ValueError):
				api.website("draft")

	def test_preview_checks_write_permission_even_if_published(self):
		with patch.object(api.frappe, "db", MagicMock()) as db, patch.object(api.frappe, "get_doc") as get_doc:
			db.get_value.return_value = "draft"
			get_doc.return_value.check_permission.side_effect = PermissionError
			with self.assertRaises(PermissionError):
				api.website("draft", preview=True)
			get_doc.return_value.check_permission.assert_called_once_with("write")


class TestPublicReservations(unittest.TestCase):
	def setUp(self):
		self.payload = dict(slug="restaurant", reserved_from="2026-09-21 19:00:00", no_of_pax="2",
			table="T1", guest_name="Test Guest", mobile_number="+9647701234567", request_id="a" * 32, consent="1")
		# Bypass only the HTTP rate-limit wrapper; all booking validation runs.
		self.reserve = api.reserve.__wrapped__
		self.throw = patch.object(api.frappe, "throw", side_effect=reject)
		self.throw.start()
		self.addCleanup(self.throw.stop)

	def test_invalid_inputs_never_write(self):
		for invalid in ({"consent": "0"}, {"company_website": "spam"}, {"no_of_pax": "bad", "guest_name": "X"},
			{"mobile_number": "abc123"}, {"request_id": "bad"}, {"notes": "x" * 501}):
			with self.subTest(invalid=invalid), patch.object(api.frappe, "get_doc") as get_doc:
				with self.assertRaises(ValueError):
					self.reserve(**{**self.payload, **invalid})
				get_doc.assert_not_called()

	def test_unavailable_table_cannot_be_reserved(self):
		with patch.object(api, "website", return_value=settings()), patch.object(api, "booking_window", return_value=(datetime(2026,9,21,19), datetime(2026,9,21,20,30),2)), patch.object(api.frappe, "db", MagicMock()) as db, patch.object(api, "table_availability", return_value=[{"id":"T1","status":"reserved"}]), patch.object(api.frappe, "get_doc") as get_doc:
			db.sql.return_value = []
			with self.assertRaises(ValueError):
				self.reserve(**self.payload)
			get_doc.assert_not_called()

	def test_valid_booking_requests_staff_confirmation(self):
		with patch.object(api, "website", return_value=settings()), patch.object(api, "booking_window", return_value=(datetime(2026,9,21,19), datetime(2026,9,21,20,30),2)), patch.object(api.frappe, "db", MagicMock()) as db, patch.object(api, "table_availability", return_value=[{"id":"T1","status":"available"}]), patch.object(api.frappe, "get_doc") as get_doc:
			db.sql.return_value = []
			self.reserve(**self.payload)
			values = get_doc.call_args.args[0]
			self.assertEqual(values["status"], "Requested")
			self.assertEqual(values["website_request_id"], "a" * 32)
			get_doc.return_value.insert.assert_called_once_with(ignore_permissions=True)
			self.assertIn("tabBranch", db.sql.call_args_list[0].args[0])

	def test_retry_returns_existing_booking_without_another_insert(self):
		existing = frappe._dict(name="RES-1", status="Requested", guest_name="Test Guest", mobile_number="+9647701234567", table="T1", reserved_from=datetime(2026,9,21,19), no_of_pax=2)
		with patch.object(api, "website", return_value=settings()), patch.object(api, "booking_window", return_value=(datetime(2026,9,21,19), datetime(2026,9,21,20,30),2)), patch.object(api.frappe, "db", MagicMock()) as db, patch.object(api.frappe, "get_doc") as get_doc:
			db.sql.side_effect = [[], [existing]]
			self.assertEqual(self.reserve(**self.payload), {"reference":"RES-1", "status":"Requested"})
			get_doc.assert_not_called()
