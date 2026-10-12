"""Run with unittest: no Frappe test hooks, fixtures, or committed deliveries."""
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

import frappe

from ury.ury.api import delivery as api
from ury.ury.doctype.ury_delivery import ury_delivery as model


NOW = datetime(2026, 9, 21, 20, 0)


def unwrapped(fn):
	return getattr(fn, "__wrapped__", fn)


quote_delivery = unwrapped(api.quote_delivery)
settle_driver_cash = unwrapped(api.settle_driver_cash)


def reject(message, *args, **kwargs):
	raise ValueError(message)


def delivery(**overrides):
	values = dict(
		ordered_at="2026-09-21 19:00:00", closed_at=None, promised_minutes=40,
		status="On The Way", order_total=100.0, delivery_fee=5.0,
		cash_on_delivery=1, cash_settled=0,
	)
	values.update(overrides)
	return values


class DeliveryCase(unittest.TestCase):
	def setUp(self):
		self.throw = patch.object(api.frappe, "throw", side_effect=reject)
		self.throw.start()
		self.addCleanup(self.throw.stop)
		self.translate = patch.object(api, "_", side_effect=lambda value: value)
		self.translate.start()
		self.addCleanup(self.translate.stop)


class TestElapsedAndLateness(unittest.TestCase):
	def test_counts_to_now_while_still_out(self):
		self.assertEqual(model.elapsed_minutes(delivery(), now=NOW), 60)

	def test_stops_at_the_moment_it_was_closed(self):
		row = delivery(closed_at="2026-09-21 19:35:00")
		self.assertEqual(model.elapsed_minutes(row, now=NOW), 35)

	def test_late_against_what_the_customer_was_told(self):
		result = model.lateness(delivery(promised_minutes=40), now=NOW)
		self.assertTrue(result["late"])
		self.assertEqual(result["over_by"], 20)
		self.assertEqual(result["against"], "promise")

	def test_within_the_promise_is_not_late(self):
		result = model.lateness(delivery(promised_minutes=90), now=NOW)
		self.assertFalse(result["late"])

	def test_an_unquoted_order_still_has_a_hard_limit(self):
		# Nobody promised anything, but two hours out is late by any reading.
		row = delivery(promised_minutes=0, ordered_at="2026-09-21 17:30:00")
		result = model.lateness(row, now=NOW)
		self.assertTrue(result["late"])
		self.assertEqual(result["against"], "limit")

	def test_an_unquoted_order_inside_the_limit_is_not_late(self):
		row = delivery(promised_minutes=0)
		self.assertFalse(model.lateness(row, now=NOW)["late"])


class TestTransitions(unittest.TestCase):
	def test_an_order_on_the_road_cannot_go_back_to_pending(self):
		self.assertNotIn("Pending", model.ALLOWED_TRANSITIONS["On The Way"])

	def test_a_delivered_order_is_final(self):
		self.assertEqual(model.ALLOWED_TRANSITIONS["Delivered"], {"Delivered"})

	def test_an_assignment_can_be_undone_before_departure(self):
		# A driver called in sick between taking the bag and leaving.
		self.assertIn("Pending", model.ALLOWED_TRANSITIONS["Assigned"])

	def test_only_an_order_that_left_can_be_returned(self):
		self.assertIn("Returned", model.ALLOWED_TRANSITIONS["On The Way"])
		self.assertNotIn("Returned", model.ALLOWED_TRANSITIONS["Pending"])


class TestQuote(DeliveryCase):
	def quote(self, zone, amount):
		db = MagicMock()
		db.get_value.return_value = zone
		with patch.object(api.frappe, "db", db):
			return quote_delivery("Zone A", amount)

	def zone(self, **overrides):
		values = dict(name="Zone A", zone_name="Karrada", delivery_fee=5.0,
					  minimum_order=20.0, estimated_minutes=40, active=1)
		values.update(overrides)
		return frappe._dict(values)

	def test_a_deliverable_order(self):
		result = self.quote(self.zone(), 30)
		self.assertTrue(result["deliverable"])
		self.assertEqual(result["delivery_fee"], 5.0)

	def test_below_the_minimum_is_refused_with_the_shortfall(self):
		result = self.quote(self.zone(), 12)
		self.assertFalse(result["deliverable"])
		self.assertEqual(result["reason"], "below_minimum")
		self.assertEqual(result["short_by"], 8.0)

	def test_an_inactive_zone_is_refused(self):
		self.assertEqual(self.quote(self.zone(active=0), 100)["reason"], "zone_inactive")

	def test_a_zone_with_no_minimum_takes_any_order(self):
		self.assertTrue(self.quote(self.zone(minimum_order=0), 1)["deliverable"])

	def test_an_unknown_zone_is_an_error_not_a_free_delivery(self):
		with self.assertRaises(ValueError):
			self.quote(None, 50)


class TestCashHeld(unittest.TestCase):
	def held(self, **overrides):
		row = delivery(**overrides)
		fake = MagicMock()
		fake.cash_on_delivery = row["cash_on_delivery"]
		fake.cash_settled = row["cash_settled"]
		fake.status = row["status"]
		fake.order_total = row["order_total"]
		fake.delivery_fee = row["delivery_fee"]
		return model.URYDelivery.cash_outstanding.fget(fake)

	def test_a_delivered_cash_order_is_money_the_driver_holds(self):
		self.assertEqual(self.held(status="Delivered"), 105.0)

	def test_a_failed_order_carries_no_cash(self):
		# The food came back and so did the money: charging the driver for it
		# would have them hand in cash they were never given.
		self.assertEqual(self.held(status="Failed"), 0.0)

	def test_an_order_still_on_the_road_is_not_yet_collected(self):
		self.assertEqual(self.held(status="On The Way"), 0.0)

	def test_a_card_order_is_never_counted(self):
		self.assertEqual(self.held(status="Delivered", cash_on_delivery=0), 0.0)

	def test_cash_already_handed_in_is_not_counted_twice(self):
		self.assertEqual(self.held(status="Delivered", cash_settled=1), 0.0)


class TestSettleDriverCash(DeliveryCase):
	def test_settles_every_open_cash_order_and_reports_the_total(self):
		rows = [
			frappe._dict(name="DLV-1", order_total=100.0, delivery_fee=5.0),
			frappe._dict(name="DLV-2", order_total=50.0, delivery_fee=5.0),
		]
		docs = [MagicMock(), MagicMock()]

		with patch.object(api, "_branch", return_value="Branch 1"), \
			patch.object(api.frappe, "get_all", return_value=rows), \
			patch.object(api.frappe, "get_doc", side_effect=docs), \
			patch.object(api, "now_datetime", return_value=NOW):
			result = settle_driver_cash("Ali")

		self.assertEqual(result["settled"], 2)
		self.assertEqual(result["amount"], 160.0)
		for doc in docs:
			self.assertEqual(doc.cash_settled, 1)
			doc.save.assert_called_once()

	def test_a_driver_holding_nothing_settles_nothing(self):
		with patch.object(api, "_branch", return_value="Branch 1"), \
			patch.object(api.frappe, "get_all", return_value=[]), \
			patch.object(api.frappe, "get_doc") as get_doc:
			result = settle_driver_cash("Ali")

		self.assertEqual(result, {"settled": 0, "amount": 0.0})
		get_doc.assert_not_called()


if __name__ == "__main__":
	unittest.main()
