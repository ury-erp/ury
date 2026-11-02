import json
import os
import unittest


class TestURYChairmanSettings(unittest.TestCase):
	"""DB-free: asserts the doctype definition (fields, defaults, single)."""

	def _meta(self):
		path = os.path.join(os.path.dirname(__file__), "ury_chairman_settings.json")
		with open(path) as f:
			return json.load(f)

	def test_definition(self):
		meta = self._meta()
		self.assertEqual(meta["issingle"], 1)
		self.assertEqual(meta["name"], "URY Chairman Settings")
		fields = {f["fieldname"]: f for f in meta["fields"]}
		self.assertEqual(fields["chat_agent"]["fieldtype"], "Data")
		self.assertEqual(fields["voice_call_enabled"]["fieldtype"], "Check")
		self.assertEqual(fields["audio_retention_days"]["fieldtype"], "Int")
		self.assertEqual(fields["audio_retention_days"]["default"], "7")
