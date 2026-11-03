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


def _fake_frappe(**over):
	"""MagicMock frappe for cc with real throw/exception classes."""
	f = mock.MagicMock()
	f.ValidationError = frappe.ValidationError
	f.PermissionError = frappe.PermissionError
	f.TooManyRequestsError = type("TooManyRequestsError", (Exception,), {})

	def _throw(msg, exc=Exception):
		raise exc(msg)

	f.throw = _throw
	f.session.user = "chair@example.com"
	f.flags = SimpleNamespace(chairman_conversation_id=None)
	for k, v in over.items():
		setattr(f, k, v)
	return f


PATHS = {"ury.ury.api.chairman_tools.get_day_summary", "ury.ury.api.chairman_tools.get_sales_range"}


def _good_agent(**over):
	a = {
		"name": "URY Chairman Assistant",
		"agent_tool": [SimpleNamespace(tool="T1"), SimpleNamespace(tool="T2")],
		"max_turns": 6,
		"allow_guest": 0,
		"allow_all_users": 0,
		"allowed_users": [],
		"allowed_roles": [SimpleNamespace(role="URY Chairman")],
		"agent_mcp_server": [],
		"agent_skill": [],
		"ssh_connections": [],
		"desktop_access_local_mcp": "off",
	}
	a.update(over)
	return a


def _good_tools():
	return [
		{"name": "T1", "types": "Custom Function", "function_path": "ury.ury.api.chairman_tools.get_day_summary"},
		{"name": "T2", "types": "Custom Function", "function_path": "ury.ury.api.chairman_tools.get_sales_range"},
	]


class PolicyAndLimitTests(unittest.TestCase):
	"""Mock-based; run under plain python and under bench."""

	def test_good_agent_passes(self):
		self.assertEqual(cc.agent_policy_violations(_good_agent(), _good_tools(), PATHS), [])

	def test_unknown_or_wrong_type_tool_refused(self):
		bad = _good_tools()
		bad[1] = {"name": "T2", "types": "Custom Function", "function_path": "frappe.client.get_list"}
		self.assertTrue(cc.agent_policy_violations(_good_agent(), bad, PATHS))
		for kind in ("Get List", "Create Document", "POST", "GET", "Get Report Result", "Run Agent", "Code Execution"):
			bad = _good_tools()
			bad[0] = dict(bad[0], types=kind)
			self.assertTrue(cc.agent_policy_violations(_good_agent(), bad, PATHS), kind)
		self.assertTrue(cc.agent_policy_violations(_good_agent(), [_good_tools()[0], None], PATHS))
		self.assertTrue(cc.agent_policy_violations(_good_agent(agent_tool=[]), [], PATHS))

	def test_mcp_flags_and_access_refused(self):
		cases = [
			{"agent_mcp_server": [SimpleNamespace(mcp_server="X")]},
			{"agent_skill": [SimpleNamespace(skill="S")]},
			{"allow_code_execution": 1},
			{"allow_ssh": 1},
			{"enable_memory_write_tool": 1},
			{"enable_lazy_tools": 1},
			{"desktop_access_local_mcp": "allowed"},
			{"allow_guest": 1},
			{"allow_all_users": 1},
			{"allowed_users": [SimpleNamespace(user="x@example.com")]},
			{"allowed_roles": []},
			{"allowed_roles": [SimpleNamespace(role="URY Chairman"), SimpleNamespace(role="Employee")]},
			{"max_turns": 0},
			{"max_turns": cc.MAX_AGENT_TURNS + 1},
		]
		for over in cases:
			self.assertTrue(cc.agent_policy_violations(_good_agent(**over), _good_tools(), PATHS), over)

	def test_assert_agent_policy_fails_closed(self):
		doc = SimpleNamespace(**_good_agent())
		doc.get = lambda k, d=None: getattr(doc, k, d)
		f = _fake_frappe()
		f.db.get_value.side_effect = lambda dt, n, *a, **k: {
			"T1": _good_tools()[0], "T2": dict(_good_tools()[1], types="Delete Document")
		}[n]
		with mock.patch.object(cc, "frappe", f), mock.patch.object(cc, "allowed_tool_paths", return_value=PATHS):
			with self.assertRaises(frappe.PermissionError):
				cc.assert_agent_policy(doc)
		f.log_error.assert_called_once()

	def test_allowed_tool_paths_match_tools(self):
		try:
			paths = cc.allowed_tool_paths()
		except ImportError as e:  # chairman_tools needs frappe.query_builder etc.
			self.skipTest(f"chairman_tools not importable: {e}")
		self.assertIn("ury.ury.api.chairman_tools.get_day_summary", paths)
		self.assertTrue(all(p.startswith("ury.ury.api.chairman_tools.") for p in paths))

	def test_history_limit_coercion(self):
		self.assertEqual(cc.coerce_history_limit("abc"), cc.HISTORY_DEFAULT_LIMIT)
		self.assertEqual(cc.coerce_history_limit(None), cc.HISTORY_DEFAULT_LIMIT)
		self.assertEqual(cc.coerce_history_limit("0"), 1)
		self.assertEqual(cc.coerce_history_limit(-5), 1)
		self.assertEqual(cc.coerce_history_limit("1e9"), cc.HISTORY_DEFAULT_LIMIT)
		self.assertEqual(cc.coerce_history_limit(10**9), 100)
		self.assertEqual(cc.coerce_history_limit(" 25 "), 25)

	def test_message_length_cap(self):
		self.assertEqual(cc.validate_message("  hi "), "hi")
		self.assertEqual(len(cc.validate_message("x" * cc.MAX_MESSAGE_CHARS)), cc.MAX_MESSAGE_CHARS)
		for bad in ("", "   ", None, "x" * (cc.MAX_MESSAGE_CHARS + 1)):
			with self.assertRaises(frappe.ValidationError):
				cc.validate_message(bad)

	def test_rate_check_per_user(self):
		store = {}
		f = _fake_frappe()
		f.cache.make_key = lambda k: k
		f.cache.incr = lambda k: store.__setitem__(k, store.get(k, 0) + 1) or store[k]
		with mock.patch.object(cc, "frappe", f):
			for _i in range(3):
				cc.rate_check("audio", 3)
			with self.assertRaises(f.TooManyRequestsError):
				cc.rate_check("audio", 3)
			cc.rate_check("audio", 3, user="other@example.com")  # separate bucket
			cc.rate_check("msg", 3)
		f.cache.expire.assert_called()

	def test_send_rate_limited_and_length_checked_before_agent(self):
		f = _fake_frappe()
		with mock.patch.object(cc, "frappe", f), mock.patch.object(cc, "_check_role"), mock.patch.object(
			cc, "rate_check", side_effect=f.TooManyRequestsError("slow")
		) as rc, mock.patch.object(cc, "_require_agent") as ra:
			with self.assertRaises(f.TooManyRequestsError):
				cc.send(conversation="C", message="hi")
			rc.assert_called_with("msg", cc.RATE_LIMIT_MESSAGES)
			with self.assertRaises(frappe.ValidationError):
				cc.send(conversation="C", message="x" * 5000)
			ra.assert_not_called()

	def test_audio_endpoints_rate_limited(self):
		f = _fake_frappe()
		for fn, kw in ((cc.send_audio, {"b64data": "AAAA", "mime": "audio/webm"}), (cc.speak, {"message_id": "M"})):
			with mock.patch.object(cc, "frappe", f), mock.patch.object(cc, "_check_role"), mock.patch.object(
				cc, "rate_check", side_effect=f.TooManyRequestsError("slow")
			) as rc, mock.patch.object(cc, "_require_agent") as ra:
				with self.assertRaises(f.TooManyRequestsError):
					fn(**kw)
				rc.assert_called_with("audio", cc.RATE_LIMIT_AUDIO)
				ra.assert_not_called()

	def test_conversation_message_cap(self):
		f = _fake_frappe()
		f.db.count.return_value = cc.MAX_CONVERSATION_MESSAGES
		with mock.patch.object(cc, "frappe", f):
			with self.assertRaises(frappe.ValidationError):
				cc._assert_conversation_room("C")
			f.db.count.return_value = 3
			cc._assert_conversation_room("C")

	def _speak(self, f, gen_result):
		async def fake_gen(**kw):
			if isinstance(gen_result, Exception):
				raise gen_result
			return gen_result

		media = types.ModuleType("huf.ai.handlers.media")
		media.handle_generate_audio = fake_gen
		f.db.get_value.return_value = SimpleNamespace(conversation="C", content="hello", role="assistant")
		f.local.response_headers = {}
		with mock.patch.dict(sys.modules, {"huf.ai.handlers.media": media}), mock.patch.object(
			cc, "frappe", f
		), mock.patch.object(cc, "_check_role"), mock.patch.object(cc, "rate_check"), mock.patch.object(
			cc, "_require_agent", return_value="A"
		), mock.patch.object(cc, "_own_conversation"):
			return cc.speak("M1")

	def test_speak_deletes_huf_file_on_success(self):
		f = _fake_frappe()
		f.get_doc.return_value.file_url = "/private/files/x.mp3"
		out = self._speak(f, {"success": True, "audio": {"file_id": "HUF1", "format": "mp3"}})
		self.assertTrue(out["success"])
		f.delete_doc.assert_called_once_with("File", "HUF1", ignore_permissions=True, force=True)

	def test_speak_deletes_huf_file_on_failure_result(self):
		f = _fake_frappe()
		out = self._speak(f, {"success": False, "error": "x", "audio": {"file_id": "HUF2"}})
		self.assertFalse(out["success"])
		f.delete_doc.assert_called_once_with("File", "HUF2", ignore_permissions=True, force=True)

	def test_speak_deletes_huf_file_when_copy_raises(self):
		f = _fake_frappe()
		f.get_doc.side_effect = OSError("disk full")
		with self.assertRaises(OSError):
			self._speak(f, {"success": True, "audio": {"file_id": "HUF3", "format": "mp3"}})
		f.delete_doc.assert_called_once_with("File", "HUF3", ignore_permissions=True, force=True)

	def test_run_inline_sets_and_clears_conversation_flag(self):
		f = _fake_frappe()
		seen = []

		def fake_run_agent_sync(**kw):
			seen.append(f.flags.chairman_conversation_id)  # what guarded() would read
			return {"success": True}

		def boom(**kw):
			seen.append(f.flags.chairman_conversation_id)
			raise RuntimeError("model down")

		integ = types.ModuleType("huf.ai.agent.integration")
		with mock.patch.dict(sys.modules, {"huf.ai.agent.integration": integ}), mock.patch.object(cc, "frappe", f):
			integ.run_agent_sync = fake_run_agent_sync
			cc._run_inline("A", "CONV-1", "hi")
			self.assertIsNone(f.flags.chairman_conversation_id)
			integ.run_agent_sync = boom
			with self.assertRaises(RuntimeError):
				cc._run_inline("A", "CONV-2", "hi")
			self.assertIsNone(f.flags.chairman_conversation_id)
		self.assertEqual(seen, ["CONV-1", "CONV-2"])

	def test_run_with_cards_collects_caps_and_clears(self):
		f = _fake_frappe()
		f.db = mock.MagicMock()
		mk = lambda i: {"type": "bar", "title": "T%d" % i, "series": [{"label": "a", "value": i}]}

		def fake_run(agent, conv, prompt):
			f.flags.chairman_cards.extend(mk(i) for i in range(5))  # what guarded() does
			return {"success": True}

		with mock.patch.object(cc, "frappe", f), mock.patch.object(cc, "_run_inline", side_effect=fake_run), \
				mock.patch.object(cc, "_persist_cards") as persist:
			run, cards = cc.run_with_cards("A", "CONV", "hi")
		self.assertEqual(run, {"success": True})
		self.assertEqual(len(cards), 3)
		self.assertIsNone(f.flags.chairman_cards)
		persist.assert_called_once_with("CONV", cards)

	def test_run_with_cards_no_tools_no_cards(self):
		f = _fake_frappe()
		with mock.patch.object(cc, "frappe", f), mock.patch.object(cc, "_run_inline", return_value={"x": 1}), \
				mock.patch.object(cc, "_persist_cards") as persist:
			run, cards = cc.run_with_cards("A", "CONV", "hi")
		self.assertEqual(cards, [])
		persist.assert_not_called()

class FastPathAndCleanTests(unittest.TestCase):
	def test_strip_unterminated_artifact(self):
		t = 'Sales are up.\n<artifact type="chart" language="jsx" title="x">const a = [...'
		self.assertEqual(cc.strip_rich_markup(t), "Sales are up.")

	def test_strip_terminated_artifact_script_style_fence(self):
		t = (
			'A <artifact type="x">stuff</artifact>  B\n\n\n\n<script>alert(1)</script>C<style>p{}</style>'
			"\n```jsx\nconst X = () => <div/>;\n```\nD ```python\nprint(1)\n```"
		)
		out = cc.strip_rich_markup(t)
		self.assertNotIn("artifact", out)
		self.assertNotIn("alert", out)
		self.assertNotIn("jsx", out)
		self.assertIn("print(1)", out)  # non-jsx fence kept
		self.assertNotIn("  ", out)
		self.assertNotIn("\n\n\n", out)

	def test_strip_plain_and_non_string(self):
		self.assertEqual(cc.strip_rich_markup("  hello   world "), "hello world")
		self.assertIsNone(cc.strip_rich_markup(None))

	def test_clean_run(self):
		run, ch = cc.clean_run({"response": "ok <artifact a>x"})
		self.assertEqual((run["response"], ch), ("ok", "ok"))
		same = {"response": "fine"}
		self.assertEqual(cc.clean_run(same), (same, None))

	def test_select_cards_prefers_latest(self):
		mk = lambda t: {"type": "bar", "title": t, "series": [{"label": "a", "value": 1}]}
		raw = [mk("Day sales"), mk("Old"), mk("Mid"), mk("Q1"), mk("Q2")]
		out = cc.select_cards(raw)
		self.assertEqual([c["title"] for c in out], ["Q2", "Q1", "Mid"])
		few = cc.select_cards([mk("A"), mk("B")])
		self.assertEqual([c["title"] for c in few], ["A", "B"])

	def _patched(self, f, **kw):
		return mock.patch.multiple(cc, frappe=f, **kw)

	def test_fast_path_skips_llm_and_persists(self):
		f = _fake_frappe()
		f.flags = types.SimpleNamespace(chairman_cards=None, chairman_conversation_id=None)
		intent = SimpleNamespace(name="sales_day")
		router = mock.MagicMock()
		router.match.return_value = intent
		router.detect_language.return_value = "en"
		card = {"type": "bar", "title": "Day", "series": [{"label": "a", "value": 1}]}

		def ans(i, lang):
			self.assertEqual(f.flags.chairman_conversation_id, "CONV")
			f.flags.chairman_cards.append(card)
			return {"reply": "Sales: 10", "tool": "get_day_summary", "data": {}, "intent": "sales_day"}

		router.answer.side_effect = ans
		with self._patched(f, _router_mod=lambda: router), \
				mock.patch.object(cc, "_store_fast_turn") as store, \
				mock.patch.object(cc, "_run_inline") as llm, \
				mock.patch.object(cc, "_today", create=True), \
				mock.patch.dict(sys.modules, {"ury.ury.api.chairman": mock.MagicMock(_today=lambda: date(2026, 11, 2))}):
			run, cards, fast = cc.run_turn("A", "CONV", "yesterday's sales")
		llm.assert_not_called()
		self.assertTrue(fast)
		self.assertEqual(run["response"], "Sales: 10")
		self.assertEqual(len(cards), 1)
		store.assert_called_once()
		self.assertIsNone(f.flags.chairman_cards)

	def test_fast_path_falls_through(self):
		f = _fake_frappe()
		f.flags = types.SimpleNamespace(chairman_cards=None, chairman_conversation_id=None)
		for res in (None, RuntimeError("boom")):
			router = mock.MagicMock()
			router.match.return_value = SimpleNamespace()
			router.detect_language.return_value = "en"
			if isinstance(res, Exception):
				router.answer.side_effect = res
			else:
				router.answer.return_value = res
			with self._patched(f, _router_mod=lambda r=router: r), \
					mock.patch.dict(sys.modules, {"ury.ury.api.chairman": mock.MagicMock(_today=lambda: date(2026, 11, 2))}), \
					mock.patch.object(cc, "run_clean", return_value=({"response": "llm"}, [])) as llm:
				run, cards, fast = cc.run_turn("A", "CONV", "why")
			self.assertFalse(fast)
			self.assertEqual(run, {"response": "llm"})
			llm.assert_called_once()

	def test_kill_switch(self):
		with mock.patch.object(cc, "FAST_PATH_ENABLED", False):
			self.assertIsNone(cc.try_fast_path("A", "C", "yesterday's sales"))


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
	def test_require_agent_refuses_unsafe_real_agent_doc(self):
		"""H1 on a real (unsaved) Huf Agent doc: MCP row / open access / no tools => refused."""
		agent = frappe.new_doc("Agent")
		agent.name = "URY Chairman Unsafe Test"
		agent.max_turns = 5
		agent.append("agent_mcp_server", {})
		agent.allow_all_users = 1
		frappe.set_user(CHAIR_A)
		with mock.patch.object(cc, "_enabled_agent", return_value=agent.name), mock.patch.object(
			frappe, "get_doc", return_value=agent
		), mock.patch.object(frappe, "log_error") as log:
			with self.assertRaises(frappe.PermissionError):
				cc._require_agent()
		self.assertIn("agent_mcp_server", log.call_args.args[0])

	@unittest.skipUnless(_huf_installed(), "huf not installed")
	def test_history_bad_limit_is_not_500(self):
		import huf.ai.agent.chat as chat

		frappe.set_user(CHAIR_A)
		with mock.patch.object(cc, "_require_agent", return_value="A"), mock.patch.object(
			cc, "_own_conversation"
		), mock.patch.object(chat, "get_history", return_value=[]) as gh:
			cc.history(conversation="C", limit="abc")
			self.assertEqual(gh.call_args.kwargs["limit"], cc.HISTORY_DEFAULT_LIMIT)
			cc.history(conversation="C", limit="9999")
			self.assertEqual(gh.call_args.kwargs["limit"], 100)

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


class MaxRoundsTests(unittest.TestCase):
	def test_max_rounds_reply_replaced(self):
		run, changed = cc.clean_run({"response": "Agent stopped after max rounds of tool calls."})
		self.assertEqual(run["response"], cc.MAX_ROUNDS_REPLY)
		self.assertEqual(changed, cc.MAX_ROUNDS_REPLY)
