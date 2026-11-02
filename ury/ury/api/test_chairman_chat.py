# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# PureTests: plain unittest, no site (frappe stubbed if missing).
# SiteTests: bench site; Huf-dependent tests skip when huf is not installed.
#   bench --site <site> run-tests --module ury.ury.api.test_chairman_chat

import base64
import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace
from unittest import mock


def _stub_frappe():
	try:
		import frappe  # noqa: F401

		return
	except ImportError:
		pass
	f = types.ModuleType("frappe")
	f._ = lambda s: s
	f.whitelist = lambda *a, **k: (lambda fn: fn)
	f.PermissionError = type("PermissionError", (Exception,), {})
	f.ValidationError = type("ValidationError", (Exception,), {})
	u = types.ModuleType("frappe.utils")
	u.getdate = lambda d: d
	u.now_datetime = lambda: None
	u.nowdate = lambda: date(2026, 11, 2)

	def _throw(msg, exc=Exception):
		raise exc(msg)

	f.throw = _throw
	f.utils = u
	sys.modules["frappe"] = f
	sys.modules["frappe.utils"] = u


_stub_frappe()

try:
	from frappe.tests import IntegrationTestCase
except ImportError:

	class IntegrationTestCase(unittest.TestCase):
		pass


try:
	from ury.ury.api import chairman_chat as cc  # noqa: E402
except ImportError:
	import chairman_chat as cc  # noqa: E402

import frappe  # noqa: E402

FIVE_MB = 5 * 1024 * 1024


class PureTests(unittest.TestCase):
	def test_mime_allowlist(self):
		self.assertEqual(cc.audio_ext_for_mime("audio/webm;codecs=opus"), "webm")
		self.assertEqual(cc.audio_ext_for_mime("audio/mp4"), "m4a")
		self.assertEqual(cc.audio_ext_for_mime("AUDIO/OGG"), "ogg")
		for bad in ("image/png", "text/html", "application/octet-stream", "", None):
			with self.assertRaises(frappe.ValidationError):
				cc.audio_ext_for_mime(bad)

	def test_size_cap(self):
		self.assertEqual(cc.validate_audio(b"x" * FIVE_MB, "audio/webm"), "webm")
		with self.assertRaises(frappe.ValidationError):
			cc.validate_audio(b"x" * (FIVE_MB + 1), "audio/webm")
		with self.assertRaises(frappe.ValidationError):
			cc.validate_audio(b"", "audio/webm")
		with self.assertRaises(frappe.ValidationError):
			cc.validate_audio(b"abc", "image/png")

	def test_b64_decode_and_precheck(self):
		raw = b"\x1aE\xdf\xa3audio"
		b64 = base64.b64encode(raw).decode()
		self.assertEqual(cc.decode_audio_b64(b64), raw)
		self.assertEqual(cc.decode_audio_b64("data:audio/webm;base64," + b64), raw)
		with self.assertRaises(frappe.ValidationError):
			cc.decode_audio_b64("not base64 !!")
		with self.assertRaises(frappe.ValidationError):
			cc.decode_audio_b64("A" * (FIVE_MB * 2))
		with self.assertRaises(frappe.ValidationError):
			cc.decode_audio_b64("")

	def test_voice_file_name_matches_purge_contract(self):
		name = cc.voice_file_name("webm")
		self.assertTrue(name.startswith("ury-brief-voice-"))
		self.assertTrue(name.endswith(".webm"))
		self.assertNotEqual(name, cc.voice_file_name("webm"))

	def test_language_hint_never_forces_english(self):
		self.assertEqual(cc.normalize_language("hi-IN"), "hi")
		self.assertEqual(cc.normalize_language("ml"), "ml")
		self.assertEqual(cc.normalize_language("ar_AE"), "ar")
		self.assertIsNone(cc.normalize_language(None))
		self.assertIsNone(cc.normalize_language("fr"))
		self.assertEqual(cc.with_language_hint("hello", None), "hello")
		self.assertIn("Reply in Malayalam", cc.with_language_hint("x", "ml"))
		self.assertNotIn("English", cc.with_language_hint("x", "hi"))


def _huf_installed():
	try:
		return "huf" in frappe.get_installed_apps()
	except Exception:
		return False


CHAIR_A = "ury-chair-a@example.com"
CHAIR_B = "ury-chair-b@example.com"
PLAIN = "ury-chair-plain@example.com"


@unittest.skipIf(getattr(frappe, "__file__", None) is None, "needs a Frappe bench site")
class SiteTests(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		if not frappe.db.exists("Role", "URY Chairman"):
			frappe.get_doc({"doctype": "Role", "role_name": "URY Chairman", "desk_access": 0}).insert()
		for email, roles in ((CHAIR_A, ["URY Chairman"]), (CHAIR_B, ["URY Chairman"]), (PLAIN, [])):
			if not frappe.db.exists("User", email):
				u = frappe.get_doc(
					{"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0}
				).insert()
				if roles:
					u.add_roles(*roles)

	def tearDown(self):
		frappe.set_user("Administrator")

	# ---- gating

	def test_role_required_everywhere(self):
		frappe.set_user(PLAIN)
		for fn, kwargs in (
			(cc.call_capabilities, {}),
			(cc.start, {}),
			(cc.send, {"conversation": "x", "message": "hi"}),
			(cc.history, {"conversation": "x"}),
			(cc.send_audio, {"b64data": "AAAA", "mime": "audio/webm"}),
			(cc.speak, {"message_id": "x"}),
		):
			with self.assertRaises(frappe.PermissionError, msg=fn.__name__):
				fn(**kwargs)

	def test_administrator_is_not_a_chairman(self):
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.PermissionError):
			cc.start()

	def test_start_disabled_without_huf(self):
		frappe.set_user(CHAIR_A)
		with mock.patch.object(frappe, "get_installed_apps", return_value=["frappe", "erpnext", "ury"]):
			self.assertEqual(cc.start(message="hi"), {"enabled": False})

	def test_start_disabled_without_agent(self):
		frappe.set_user(CHAIR_A)
		with mock.patch.object(cc, "_settings_value", return_value=None):
			self.assertEqual(cc.start(message="hi"), {"enabled": False})

	def test_call_capabilities_stub(self):
		frappe.set_user(CHAIR_A)
		out = cc.call_capabilities()
		self.assertFalse(out["available"])

	# ---- tool guard

	def test_tool_guard_rejects_administrator_and_non_owner(self):
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.PermissionError):
			cc.assert_chairman_tool_context()
		frappe.set_user(PLAIN)
		with self.assertRaises(frappe.PermissionError):
			cc.assert_chairman_tool_context()
		frappe.set_user(CHAIR_A)
		self.assertEqual(cc.assert_chairman_tool_context(), CHAIR_A)
		with mock.patch.object(frappe.db, "get_value", return_value=CHAIR_B):
			with self.assertRaises(frappe.PermissionError):
				cc.assert_chairman_tool_context("CONV-B")

	# ---- huf-backed


	def test_cross_user_conversation_is_denied(self):
		frappe.set_user(CHAIR_B)
		row = frappe._dict(owner=CHAIR_A, agent="URY Chairman Assistant")
		with mock.patch.object(cc, "_require_agent", return_value="URY Chairman Assistant"), mock.patch.object(
			frappe.db, "get_value", return_value=row
		):
			for fn, kwargs in (
				(cc.history, {"conversation": "CONV-A"}),
				(cc.send, {"conversation": "CONV-A", "message": "hi"}),
				(cc.send_audio, {"conversation": "CONV-A", "b64data": "AAAA", "mime": "audio/webm"}),
			):
				with self.assertRaises(frappe.PermissionError, msg=fn.__name__):
					fn(**kwargs)

	def test_other_agent_conversation_is_denied(self):
		frappe.set_user(CHAIR_A)
		row = frappe._dict(owner=CHAIR_A, agent="URY Restaurant Assistant")
		with mock.patch.object(cc, "_require_agent", return_value="URY Chairman Assistant"), mock.patch.object(
			frappe.db, "get_value", return_value=row
		):
			with self.assertRaises(frappe.PermissionError):
				cc.history(conversation="CONV-A")

	def test_send_audio_rejects_oversize_and_non_audio(self):
		frappe.set_user(CHAIR_A)
		big = base64.b64encode(b"x" * (FIVE_MB + 1)).decode()
		with mock.patch.object(cc, "_require_agent", return_value="URY Chairman Assistant"):
			with self.assertRaises(frappe.ValidationError):
				cc.send_audio(b64data=big, mime="audio/webm")
			with self.assertRaises(frappe.ValidationError):
				cc.send_audio(b64data=base64.b64encode(b"abc").decode(), mime="image/png")

	def test_speak_sets_no_store(self):
		frappe.set_user(CHAIR_A)
		frappe.local.response_headers = __import__("werkzeug.datastructures").datastructures.Headers()
		with mock.patch.object(cc, "_require_agent", return_value="URY Chairman Assistant"):
			with self.assertRaises(frappe.PermissionError):
				cc.speak(message_id="does-not-exist")
		self.assertEqual(frappe.local.response_headers.get("Cache-Control"), "no-store")

	@unittest.skipUnless(_huf_installed(), "huf not installed")
	def test_huf_queued_drainer_does_not_restore_owner(self):
		"""PROOF of the hazard: Huf's real drainer runs the queued run (and thus its
		tools) as whatever user the job carries; it does not restore the owner."""
		from huf.ai.agent import integration

		captured = []
		fake_run = SimpleNamespace(name="RUN-FAKE", status="Queued", conversation="CONV-FAKE-H1")

		def fake_drain(run_doc, lock_key):
			captured.append(frappe.session.user)  # the "tool" observes its identity
			return {"success": True}

		for job_user in (CHAIR_A, "Administrator"):
			frappe.set_user(job_user)
			with mock.patch.object(integration, "_next_queued_run", side_effect=["RUN-FAKE", None]), mock.patch.object(
				integration.frappe, "get_doc", return_value=fake_run
			), mock.patch.object(integration, "_drain_run", side_effect=fake_drain), mock.patch.object(
				integration, "_has_queued_runs", return_value=False
			):
				integration._run_queued_agent(conversation_id="CONV-FAKE-H1")
		# Run owned by CHAIR_A executed as Administrator when the job carried Administrator.
		self.assertEqual(captured, [CHAIR_A, "Administrator"])

	@unittest.skipUnless(_huf_installed(), "huf not installed")
	def test_wrapper_runs_tools_as_chairman(self):
		"""Our wrapper must execute inline (now=1) so the tool sees the chairman.
		The fake Huf models the real semantics: queued => drained by the sweeper
		as Administrator; now=1 => inline in the request."""
		from huf.ai.agent import integration

		seen = []

		def fake_tool():
			seen.append(frappe.session.user)
			cc.assert_chairman_tool_context()  # must not raise
			return "ok"

		def fake_run_agent_sync(**kw):
			if kw.get("now"):
				return {"success": True, "response": fake_tool(), "conversation_id": kw["conversation_id"]}
			user = frappe.session.user
			frappe.set_user("Administrator")  # sweeper identity
			try:
				fake_tool()
			finally:
				frappe.set_user(user)
			return {"success": True, "queued": True, "agent_run_id": None}

		frappe.set_user(CHAIR_A)
		row = frappe._dict(owner=CHAIR_A, agent="URY Chairman Assistant")
		with mock.patch.object(cc, "_require_agent", return_value="URY Chairman Assistant"), mock.patch.object(
			cc, "_enabled_agent", return_value="URY Chairman Assistant"
		), mock.patch.object(cc, "_new_conversation", return_value="CONV-A"), mock.patch.object(
			integration, "run_agent_sync", side_effect=fake_run_agent_sync
		) as ras, mock.patch.object(frappe.db, "get_value", return_value=row):
			out = cc.send(conversation="CONV-A", message="sales yesterday?", language="hi")
			cc.start(message="hello")
		self.assertEqual(seen, [CHAIR_A, CHAIR_A])
		self.assertEqual(out["run"]["response"], "ok")
		for call in ras.call_args_list:
			self.assertEqual(call.kwargs.get("now"), 1)
		self.assertIn("Reply in Hindi", ras.call_args_list[0].kwargs["prompt"])

	@unittest.skipUnless(_huf_installed(), "huf not installed")
	def test_wrapper_fails_closed_if_huf_queues(self):
		from huf.ai.agent import integration

		frappe.set_user(CHAIR_A)
		row = frappe._dict(owner=CHAIR_A, agent="URY Chairman Assistant")
		with mock.patch.object(cc, "_require_agent", return_value="URY Chairman Assistant"), mock.patch.object(
			integration, "run_agent_sync", return_value={"queued": True, "agent_run_id": "RUN-X"}
		), mock.patch.object(cc, "_fail_run") as fail, mock.patch.object(frappe.db, "get_value", return_value=row):
			with self.assertRaises(frappe.ValidationError):
				cc.send(conversation="CONV-A", message="hi")
		fail.assert_called_once()

	@unittest.skipUnless(_huf_installed(), "huf not installed")
	def test_send_audio_stores_private_prefixed_file(self):
		frappe.set_user(CHAIR_A)
		import huf.ai.audio_service as audio_service
		from huf.ai.agent import integration

		raw = b"\x1aE\xdf\xa3" + b"0" * 64
		with mock.patch.object(cc, "_require_agent", return_value="URY Chairman Assistant"), mock.patch.object(
			cc, "_new_conversation", return_value="CONV-AUDIO-H1"
		), mock.patch.object(
			audio_service, "transcribe_audio_file", return_value={"success": True, "text": "നമസ്കാരം"}
		) as tr, mock.patch.object(
			integration, "run_agent_sync", return_value={"success": True, "response": "ok"}
		) as ras:
			out = cc.send_audio(b64data=base64.b64encode(raw).decode(), mime="audio/webm;codecs=opus", language="ml")
		self.assertTrue(out["success"])
		file_id = tr.call_args.kwargs["file_id"]
		self.assertEqual(tr.call_args.kwargs["language"], "ml")
		f = frappe.get_doc("File", file_id)
		self.assertTrue(f.file_name.startswith("ury-brief-voice-") and f.file_name.endswith(".webm"))
		self.assertEqual(f.is_private, 1)
		self.assertEqual(ras.call_args.kwargs["now"], 1)
		frappe.set_user("Administrator")
		f.delete()
