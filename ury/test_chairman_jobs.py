import unittest
from unittest.mock import patch

import frappe

from ury.chairman_jobs import AUDIO_PREFIX, is_chairman_audio, purge_chairman_audio


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
