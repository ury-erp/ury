"""Run with unittest: no Frappe test hooks, fixtures, or committed feedback rows."""
import unittest
from unittest.mock import MagicMock, patch

import frappe

from ury.ury import signed_links
from ury.ury.api import feedback as api
from ury.ury.doctype.ury_guest_feedback.ury_guest_feedback import net_promoter_score


def reject(message, *args, **kwargs):
	raise ValueError(message)


class TokenCase(unittest.TestCase):
	"""Signing needs a site key; a fixed fake one keeps these tests offline."""

	def setUp(self):
		self.key = patch.object(signed_links, "get_encryption_key", return_value="test-key-not-a-real-one")
		self.key.start()
		self.addCleanup(self.key.stop)
		self.throw = patch.object(api.frappe, "throw", side_effect=reject)
		self.throw.start()
		self.addCleanup(self.throw.stop)
		self.translate = patch.object(api, "_", side_effect=lambda value: value)
		self.translate.start()
		self.addCleanup(self.translate.stop)
		self.shared_translate = patch.object(signed_links, "_", side_effect=lambda value: value)
		self.shared_translate.start()
		self.addCleanup(self.shared_translate.stop)
		self.shared_throw = patch.object(signed_links.frappe, "throw", side_effect=reject)
		self.shared_throw.start()
		self.addCleanup(self.shared_throw.stop)


class TestTokens(TokenCase):
	def test_a_token_round_trips(self):
		token = api.make_token(api.INVOICE_SCOPE, "ACC-PSINV-0001")
		self.assertEqual(api.read_token(token), (api.INVOICE_SCOPE, "ACC-PSINV-0001"))

	def test_a_token_carries_no_readable_reference_without_the_signature(self):
		# Base64 is not secrecy and is not claimed to be; what matters is that
		# the reference cannot be *changed*, which the next tests check.
		token = api.make_token(api.BRANCH_SCOPE, "Branch 1")
		self.assertNotEqual(token, "branch|Branch 1")

	def test_another_branch_cannot_be_substituted(self):
		import base64

		raw = "branch|Branch 1|" + signed_links.sign("branch|Branch 1")
		tampered = raw.replace("Branch 1", "Branch 2", 1)
		token = base64.urlsafe_b64encode(tampered.encode()).decode().rstrip("=")

		with self.assertRaises(ValueError):
			api.read_token(token)

	def test_garbage_is_refused_rather_than_crashing(self):
		for value in ("", None, "not-base64!!", "YWJj"):
			with self.assertRaises(ValueError):
				api.read_token(value)

	def test_an_unknown_scope_is_refused(self):
		import base64

		raw = "everything|Branch 1|" + signed_links.sign("everything|Branch 1")
		token = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")
		with self.assertRaises(ValueError):
			api.read_token(token)

	def test_a_signature_from_a_different_key_is_refused(self):
		token = api.make_token(api.BRANCH_SCOPE, "Branch 1")
		with patch.object(signed_links, "get_encryption_key", return_value="a-different-site-key"):
			with self.assertRaises(ValueError):
				api.read_token(token)


class TestPublicContext(TokenCase):
	def test_an_invoice_link_never_exposes_the_bill(self):
		invoice = frappe._dict(
			name="ACC-PSINV-0001", branch="Branch 1", restaurant_table="T1",
			owner="cashier@example.com", posting_date="2026-09-21",
		)
		db = MagicMock()
		db.get_value.return_value = invoice
		db.exists.return_value = False

		with patch.object(api.frappe, "db", db):
			context = api._context_for(api.INVOICE_SCOPE, "ACC-PSINV-0001")

		self.assertEqual(context["branch"], "Branch 1")
		for leaked in ("grand_total", "items", "customer", "paid_amount"):
			self.assertNotIn(leaked, context)

	def test_the_public_endpoint_drops_the_staff_name(self):
		db = MagicMock()
		db.get_value.side_effect = lambda *args, **kwargs: (
			frappe._dict(name="ACC-PSINV-0001", branch="Branch 1", restaurant_table="T1",
						 owner="cashier@example.com", posting_date="2026-09-21")
			if args[0] == "POS Invoice" else "Branch 1"
		)
		db.exists.return_value = False
		token = api.make_token(api.INVOICE_SCOPE, "ACC-PSINV-0001")

		with patch.object(api.frappe, "db", db):
			public = getattr(api.page_context, "__wrapped__", api.page_context)(token)

		self.assertNotIn("served_by", public)

	def test_a_second_rating_for_one_bill_is_reported_not_written(self):
		db = MagicMock()
		db.get_value.return_value = frappe._dict(
			name="ACC-PSINV-0001", branch="Branch 1", restaurant_table="T1",
			owner="cashier@example.com", posting_date="2026-09-21",
		)
		db.exists.return_value = True  # a rating already exists
		token = api.make_token(api.INVOICE_SCOPE, "ACC-PSINV-0001")
		submit = getattr(api.submit_feedback, "__wrapped__", api.submit_feedback)

		with patch.object(api.frappe, "db", db), patch.object(api.frappe, "get_doc") as get_doc:
			result = submit(token, overall=5)

		self.assertEqual(result["status"], "already_submitted")
		get_doc.assert_not_called()


class TestNetPromoterScore(unittest.TestCase):
	def test_all_promoters(self):
		self.assertEqual(net_promoter_score([9, 10, 10]), 100)

	def test_all_detractors(self):
		self.assertEqual(net_promoter_score([0, 3, 6]), -100)

	def test_passives_dilute_without_counting_against(self):
		# Two promoters, two passives: 50% promoters, no detractors.
		self.assertEqual(net_promoter_score([9, 10, 7, 8]), 50)

	def test_a_skipped_question_is_not_a_zero(self):
		self.assertEqual(net_promoter_score([10, None, ""]), 100)

	def test_nobody_answered_is_not_a_score_of_zero(self):
		self.assertIsNone(net_promoter_score([None, ""]))
		self.assertIsNone(net_promoter_score([]))


if __name__ == "__main__":
	unittest.main()
