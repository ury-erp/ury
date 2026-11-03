import unittest
from unittest.mock import patch

import frappe

from ury.chairman_jobs import (
	AUDIO_PREFIX,
	AUDIT_DOCTYPE,
	CARD_PREFIX,
	is_chairman_audio,
	is_chairman_card,
	purge_cards,
	purge_chairman_audio,
	purge_chairman_whatsapp,
	purge_whatsapp_audit,
)


class TestChairmanJobs(unittest.TestCase):
	def test_tag_predicate(self):
		self.assertTrue(is_chairman_audio(AUDIO_PREFIX + "abc.webm"))
		self.assertFalse(is_chairman_audio("invoice.pdf"))
		self.assertFalse(is_chairman_audio("other-voice.webm"))
		self.assertFalse(is_chairman_audio(AUDIO_PREFIX + "abc.pdf"))
		self.assertFalse(is_chairman_audio(None))

	def test_purge_deletes_only_tagged_old(self):
		rows = [
			frappe._dict(name="F1", file_name=AUDIO_PREFIX + "a.webm", attached_to_doctype=None, attached_to_name=None),
			frappe._dict(name="F2", file_name=AUDIO_PREFIX + "b.txt", attached_to_doctype=None, attached_to_name=None),
			frappe._dict(name="F3", file_name="report.webm", attached_to_doctype=None, attached_to_name=None),
		]
		with patch("ury.chairman_jobs.frappe.get_all", return_value=rows) as ga, patch(
			"ury.chairman_jobs.frappe.delete_doc"
		) as dd:
			out = purge_chairman_audio(retention_days=7)
		self.assertEqual(out, ["F1"])
		dd.assert_called_once()
		self.assertEqual(dd.call_args[0], ("File", "F1"))
		self.assertEqual(ga.call_args[1]["filters"]["file_name"], ["like", AUDIO_PREFIX + "%"])


class TestWhatsAppRetention(unittest.TestCase):
	def test_card_predicate(self):
		self.assertTrue(is_chairman_card(CARD_PREFIX + "abc.png"))
		self.assertFalse(is_chairman_card(CARD_PREFIX + "abc.pdf"))
		self.assertFalse(is_chairman_card("invoice.png"))
		self.assertFalse(is_chairman_card(AUDIO_PREFIX + "a.png"))
		self.assertFalse(is_chairman_card(None))

	def test_purge_cards_only_tagged_old(self):
		rows = [
			frappe._dict(name="C1", file_name=CARD_PREFIX + "a.png", attached_to_doctype="Agent Conversation", attached_to_name="X"),
			frappe._dict(name="C2", file_name=CARD_PREFIX + "b.txt", attached_to_doctype=None, attached_to_name=None),
			frappe._dict(name="C3", file_name="logo.png", attached_to_doctype=None, attached_to_name=None),
		]
		with patch("ury.chairman_jobs.frappe.get_all", return_value=rows) as ga, patch(
			"ury.chairman_jobs.frappe.delete_doc"
		) as dd:
			out = purge_cards()
		self.assertEqual(out, ["C1"])
		dd.assert_called_once()
		self.assertEqual(dd.call_args[0], ("File", "C1"))
		self.assertEqual(ga.call_args[1]["filters"]["file_name"], ["like", CARD_PREFIX + "%"])
		self.assertEqual(ga.call_args[1]["filters"]["creation"][0], "<")

	def test_purge_cards_cutoff_is_retention_hours(self):
		from datetime import datetime, timedelta

		now = datetime(2026, 11, 3, 12, 0, 0)
		with patch("ury.chairman_jobs.now_datetime", return_value=now), patch(
			"ury.chairman_jobs.frappe.get_all", return_value=[]
		) as ga:
			purge_cards()
		self.assertEqual(ga.call_args[1]["filters"]["creation"][1], now - timedelta(hours=24))

	def test_purge_audit_counts_and_deletes(self):
		with patch("ury.chairman_jobs.frappe.db.count", return_value=4) as cnt, patch(
			"ury.chairman_jobs.frappe.db.delete"
		) as dele:
			self.assertEqual(purge_whatsapp_audit(), 4)
		self.assertEqual(cnt.call_args[0][0], AUDIT_DOCTYPE)
		dele.assert_called_once()
		self.assertEqual(dele.call_args[0][0], AUDIT_DOCTYPE)

	def test_purge_audit_nothing_to_delete(self):
		with patch("ury.chairman_jobs.frappe.db.count", return_value=0), patch(
			"ury.chairman_jobs.frappe.db.delete"
		) as dele:
			self.assertEqual(purge_whatsapp_audit(), 0)
		dele.assert_not_called()

	def test_combined_entry_returns_counts(self):
		with patch("ury.chairman_jobs.purge_cards", return_value=["C1", "C2"]), patch(
			"ury.chairman_jobs.purge_whatsapp_audit", return_value=3
		):
			self.assertEqual(purge_chairman_whatsapp(), {"cards": 2, "audit": 3})
