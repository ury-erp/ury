"""Run with unittest: no Frappe test hooks, fixtures, or committed waitlist rows."""
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

import frappe

from ury.ury.api import waitlist as api
from ury.ury.doctype.ury_waitlist_entry import ury_waitlist_entry as model


NOW = datetime(2026, 9, 21, 20, 0)


def table(name, seats=4, occupied=0, seated_at=None, minimum=0, room="Main", merged=None):
	return frappe._dict(
		name=name, no_of_seats=seats, minimum_seating=minimum, occupied=occupied,
		latest_invoice_time=seated_at, restaurant_room=room, merged_with=merged,
	)


class TestSuitableTables(unittest.TestCase):
	def suitable(self, rows, pax):
		with patch.object(api.frappe, "get_all", return_value=rows):
			return [row.name for row in api._suitable_tables("Branch 1", pax)]

	def test_excludes_tables_too_small(self):
		rows = [table("T2", seats=2), table("T4", seats=4), table("T8", seats=8)]
		self.assertEqual(self.suitable(rows, 4), ["T4", "T8"])

	def test_respects_minimum_seating(self):
		rows = [table("BIG", seats=10, minimum=6), table("T4", seats=4)]
		self.assertEqual(self.suitable(rows, 2), ["T4"])

	def test_excludes_merged_tables(self):
		rows = [table("T4"), table("T5", merged="T4")]
		self.assertEqual(self.suitable(rows, 2), ["T4"])

	def test_a_table_with_no_seat_count_is_not_ruled_out(self):
		# An unconfigured seat count is missing data, not a table for zero.
		self.assertEqual(self.suitable([table("T", seats=0)], 6), ["T"])


class TestMinutesUntilFree(unittest.TestCase):
	def test_a_free_table_is_free_now(self):
		self.assertEqual(api._minutes_until_free(table("T", occupied=0), 90, NOW), 0)

	def test_counts_down_from_the_average_turn(self):
		# Seated at 19:30, read at 20:00, 90-minute turn: an hour to go.
		self.assertEqual(api._minutes_until_free(table("T", occupied=1, seated_at="19:30:00"), 90, NOW), 60)

	def test_never_reports_negative_time(self):
		self.assertEqual(api._minutes_until_free(table("T", occupied=1, seated_at="12:00:00"), 90, NOW), 0)

	def test_a_sitting_that_began_before_midnight(self):
		# The trap: latest_invoice_time carries no date, so 23:30 read at
		# 00:10 looks like minus fourteen hours rather than forty minutes.
		midnight = datetime(2026, 9, 22, 0, 10)
		self.assertEqual(
			api._minutes_until_free(table("T", occupied=1, seated_at="23:30:00"), 90, midnight), 50
		)

	def test_occupied_with_no_seating_time_assumes_a_whole_sitting(self):
		self.assertEqual(api._minutes_until_free(table("T", occupied=1, seated_at=None), 90, NOW), 90)


class TestEstimateWait(unittest.TestCase):
	def estimate(self, rows, pax, ahead):
		with patch.object(api, "_suitable_tables", return_value=rows), \
			patch.object(api, "average_turn_minutes", return_value=90):
			return api.estimate_wait("Branch 1", pax, ahead=ahead, now=NOW)

	def test_a_free_table_means_no_wait(self):
		result = self.estimate([table("T4", occupied=0)], 4, ahead=0)
		self.assertEqual(result["minutes"], 0)
		self.assertEqual(result["reason"], "free_now")

	def test_the_party_ahead_takes_the_free_table(self):
		rows = [table("A", occupied=0), table("B", occupied=1, seated_at="19:30:00")]
		self.assertEqual(self.estimate(rows, 4, ahead=0)["minutes"], 0)
		self.assertEqual(self.estimate(rows, 4, ahead=1)["minutes"], 60)

	def test_a_queue_longer_than_the_room_waits_another_turn(self):
		rows = [table("A", occupied=0)]
		# Second in line waits for A to turn once; third, twice.
		self.assertEqual(self.estimate(rows, 2, ahead=1)["minutes"], 90)
		self.assertEqual(self.estimate(rows, 2, ahead=2)["minutes"], 180)

	def test_no_suitable_table_is_said_plainly(self):
		result = self.estimate([], 12, ahead=0)
		self.assertIsNone(result["minutes"])
		self.assertEqual(result["reason"], "no_suitable_table")


class TestAverageTurn(unittest.TestCase):
	def turn(self, value):
		db = MagicMock()
		db.sql.return_value = [frappe._dict(turn=value)]
		with patch.object(api.frappe, "db", db):
			return api.average_turn_minutes("Branch 1")

	def test_uses_history_when_there_is_some(self):
		self.assertEqual(self.turn(75), 75)

	def test_falls_back_when_a_branch_has_no_settled_bills(self):
		self.assertEqual(self.turn(None), api.DEFAULT_TURN_MINUTES)
		self.assertEqual(self.turn(0), api.DEFAULT_TURN_MINUTES)


class TestWaitedMinutes(unittest.TestCase):
	def test_counts_to_now_while_still_waiting(self):
		entry = {"joined_at": "2026-09-21 19:30:00", "seated_at": None}
		self.assertEqual(model.waited_minutes(entry, now=NOW), 30)

	def test_stops_at_the_moment_of_seating(self):
		entry = {"joined_at": "2026-09-21 19:00:00", "seated_at": "2026-09-21 19:25:00"}
		self.assertEqual(model.waited_minutes(entry, now=NOW), 25)

	def test_never_negative(self):
		entry = {"joined_at": "2026-09-21 21:00:00", "seated_at": None}
		self.assertEqual(model.waited_minutes(entry, now=NOW), 0)


class TestStatusTransitions(unittest.TestCase):
	def test_a_seated_party_cannot_re_enter_the_queue(self):
		self.assertNotIn("Waiting", model.ALLOWED_TRANSITIONS["Seated"])
		self.assertNotIn("Waiting", model.ALLOWED_TRANSITIONS["Cancelled"])

	def test_a_notified_party_can_go_back_to_waiting(self):
		# The host called them, they asked for a few more minutes. That is a
		# real thing that happens, not an error.
		self.assertIn("Waiting", model.ALLOWED_TRANSITIONS["Notified"])

	def test_every_active_status_can_end_in_a_seating(self):
		for status in model.ACTIVE_STATUSES:
			self.assertIn("Seated", model.ALLOWED_TRANSITIONS[status])


class TestActiveEntries(unittest.TestCase):
	def entries(self, rows, pax):
		with patch.object(api.frappe, "get_all", return_value=rows):
			return [row.name for row in api.active_entries("Branch 1", fitting_pax=pax)]

	def test_a_smaller_party_ahead_does_not_compete_for_a_big_table(self):
		rows = [frappe._dict(name="couple", no_of_pax=2), frappe._dict(name="family", no_of_pax=8)]
		self.assertEqual(self.entries(rows, 8), ["family"])
		self.assertEqual(self.entries(rows, 2), ["couple", "family"])


if __name__ == "__main__":
	unittest.main()
