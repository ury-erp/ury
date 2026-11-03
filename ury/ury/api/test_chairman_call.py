# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Pure tests: plain unittest, no site, no network. Run from this directory:
#   python3 -m unittest test_chairman_call

import json
import sys
import types
import unittest
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
	u.nowdate = lambda: "2026-11-02"

	def _throw(msg, exc=Exception):
		raise exc(msg)

	f.throw = _throw
	f.utils = u
	sys.modules["frappe"] = f
	sys.modules["frappe.utils"] = u


_stub_frappe()

try:
	from ury.ury.api import chairman as chairman_mod  # noqa: E402
	from ury.ury.api import chairman_call as cl  # noqa: E402
except ImportError:
	import chairman as chairman_mod  # noqa: E402
	import chairman_call as cl  # noqa: E402

import frappe  # noqa: E402

cc = cl.chairman_chat
KEY = "SECRET-GOOGLE-KEY"
FAKE_TOOLS = [
	{"name": n, "description": f"{n} desc", "parameters": {"type": "object", "properties": {}}, "func": object()}
	for n in ("get_day_summary", "get_sales_range", "show_card", "compose_card", "compose_dashboard")
]


class FakeCache:
	def __init__(self):
		self.d = {}

	def make_key(self, k):
		return k

	def get(self, k):
		v = self.d.get(k)
		return v.encode() if isinstance(v, str) else v

	def set(self, k, v, nx=False, ex=None):
		if nx and k in self.d:
			return None
		self.d[k] = v
		return True

	def delete(self, k):
		return 1 if self.d.pop(k, None) is not None else 0

	def incrby(self, k, n):
		self.d[k] = int(self.d.get(k, 0)) + n
		return self.d[k]

	def decrby(self, k, n):
		return self.incrby(k, -n)

	def incr(self, k):
		return self.incrby(k, 1)

	def expire(self, k, s):
		pass


def _fake_frappe(user="chair@example.com", roles=("URY Owner",)):
	f = mock.MagicMock()
	f.ValidationError = frappe.ValidationError
	f.PermissionError = frappe.PermissionError
	f.TooManyRequestsError = type("TooManyRequestsError", (Exception,), {})

	def _throw(msg, exc=Exception):
		raise exc(msg)

	f.throw = _throw
	f._ = lambda s: s
	f.session.user = user
	f.get_roles = lambda u=None: list(roles) if user not in ("Administrator", "Guest") else ["All", "URY Owner"]
	f.cache = FakeCache()
	f.db.get_value = lambda dt, n, field=None, *a, **k: {"provider": "Google", "instructions": "You are the chairman agent."}.get(field)
	return f


class CallBase(unittest.TestCase):
	def setUp(self):
		self.f = _fake_frappe()
		self.settings = {
			"voice_call_enabled": 1,
			"chat_agent": "Chairman",
			"call_max_seconds": 300,
			"call_daily_minutes_per_user": 30,
		}
		self.mint = mock.MagicMock(return_value="tok-123")
		self.minted_setup = None
		self.tools_mod = types.SimpleNamespace(TOOLS=FAKE_TOOLS)
		self.run_tool = mock.MagicMock(return_value={"total": 5, "cards": [{"x": 1}]})
		self.save_turns = mock.MagicMock(return_value=2)
		self.ct = types.SimpleNamespace(run_tool=self.run_tool, save_turns=self.save_turns)
		self.clock = [1_000_000.0]
		patches = [
			mock.patch.object(cl, "frappe", self.f),
			mock.patch.object(chairman_mod, "frappe", self.f),
			mock.patch.object(cc, "frappe", self.f),
			mock.patch.object(cc, "_settings_value", side_effect=lambda k: self.settings.get(k)),
			mock.patch.object(cc, "_enabled_agent", return_value="Chairman"),
			mock.patch.object(cc, "_require_agent", return_value="Chairman"),
			mock.patch.object(cc, "_new_conversation", return_value="CONV-1"),
			mock.patch.object(cl, "_api_key", return_value=KEY),
			mock.patch.object(cl, "_mint_token", self.mint),
			mock.patch.object(cl, "_tools_module", return_value=self.tools_mod),
			mock.patch.object(cl, "_call_tools_mod", return_value=self.ct),
			mock.patch.object(cl.time, "time", side_effect=lambda: self.clock[0]),
			mock.patch.object(cc.time, "time", side_effect=lambda: self.clock[0]),
		]
		for p in patches:
			p.start()
			self.addCleanup(p.stop)

	def start(self, language="en"):
		return cl.start_call(language)


class TestAccess(CallBase):
	def test_administrator_and_guest_refused(self):
		# Administrator is an owner by default; this covers a site that opted out.
		optout = mock.patch.object(chairman_mod, "administrator_allowed", return_value=False)
		optout.start()
		self.addCleanup(optout.stop)
		for user in ("Administrator", "Guest"):
			self.f.session.user = user
			for fn, args in (
				(cl.start_call, ("en",)),
				(cl.call_tool, ("x", "get_day_summary", {})),
				(cl.call_turns, ("x", [])),
				(cl.end_call, ("x",)),
			):
				with self.assertRaises(frappe.PermissionError):
					fn(*args)
			caps = cl.call_capabilities()
			self.assertFalse(caps["available"])
			self.assertEqual(caps["reason"], "role")
		self.mint.assert_not_called()

	def test_non_chairman_refused(self):
		f = _fake_frappe(roles=("Cashier",))
		with mock.patch.object(cl, "frappe", f), mock.patch.object(chairman_mod, "frappe", f):
			with self.assertRaises(frappe.PermissionError):
				cl.start_call("en")

	def test_kill_switch_start_and_tool(self):
		call = self.start()
		self.settings["voice_call_enabled"] = 0
		with self.assertRaises(frappe.PermissionError):
			self.start()
		with self.assertRaises(frappe.PermissionError):
			cl.call_tool(call["call_id"], "get_day_summary", {})
		with self.assertRaises(frappe.PermissionError):
			cl.call_turns(call["call_id"], [])
		self.assertEqual(cl.call_capabilities()["reason"], "disabled")
		self.assertEqual(cl.end_call(call["call_id"]), {"ok": True})  # ending still works

	def test_policy_failure(self):
		with mock.patch.object(cc, "_require_agent", side_effect=frappe.PermissionError("bad")):
			with self.assertRaises(frappe.PermissionError):
				self.start()
			self.assertEqual(cl.call_capabilities()["reason"], "policy")
		self.mint.assert_not_called()

	def test_capabilities_reasons(self):
		with mock.patch.object(cc, "_enabled_agent", return_value=None):
			self.assertEqual(cl.call_capabilities()["reason"], "no_agent")
		with mock.patch.object(cl, "_api_key", return_value=None):
			self.assertEqual(cl.call_capabilities()["reason"], "no_key")
			with self.assertRaises(frappe.ValidationError):
				self.start()
		caps = cl.call_capabilities()
		self.assertTrue(caps["available"])
		self.assertEqual(caps["engines"], ["gemini_live"])
		self.assertEqual(caps["languages"], ["en", "hi", "ar", "ml"])
		self.assertEqual(caps["daily_minutes_left"], 30)
		self.assertNotIn(KEY, json.dumps(caps))

	def test_rate_limit_three_starts_per_minute(self):
		for _ in range(3):
			call = self.start()
			cl.end_call(call["call_id"])
		with self.assertRaises(self.f.TooManyRequestsError):
			self.start()

	def test_concurrency_lock_one_per_user(self):
		first = self.start()
		with self.assertRaises(self.f.TooManyRequestsError):
			self.start()
		cl.end_call(first["call_id"])
		self.assertTrue(self.start()["call_id"])

	def test_failed_mint_releases_lock_and_reservation(self):
		self.mint.side_effect = RuntimeError(f"boom {KEY}")
		with self.assertRaises(frappe.ValidationError) as ctx:
			self.start()
		self.assertNotIn(KEY, str(ctx.exception))
		self.assertEqual(cl._seconds_used_today("chair@example.com"), 0)
		self.mint.side_effect = None
		self.assertTrue(self.start()["call_id"])


class TestStart(CallBase):
	def test_response_shape_and_hashed_storage(self):
		r = self.start("hi")
		self.assertEqual(
			set(r), {"call_id", "token", "model", "ws_url", "max_seconds", "languages", "tool_names", "greeting"}
		)
		self.assertGreaterEqual(len(r["call_id"]), 24)
		self.assertEqual(r["token"], "tok-123")
		self.assertEqual(r["model"], cl.DEFAULT_MODEL)
		self.assertTrue(r["ws_url"].endswith("BidiGenerateContentConstrained"))
		self.assertEqual(r["max_seconds"], 300)
		self.assertEqual(r["tool_names"], ["get_day_summary", "get_sales_range"])
		self.assertNotIn(KEY, json.dumps(r))
		stored = json.dumps(self.f.cache.d)
		self.assertNotIn(r["call_id"], stored)
		self.assertIn(cl.hash_call_id(r["call_id"]), stored)

	def test_token_payload_allow_listed_tools_only(self):
		r = self.start()
		setup, expire, new_session, key = self.mint.call_args[0]
		self.assertEqual(key, KEY)
		names = [d["name"] for d in setup["tools"][0]["functionDeclarations"]]
		self.assertEqual(names, ["get_day_summary", "get_sales_range"])
		for banned in cl.CARD_TOOLS:
			self.assertNotIn(banned, names)
			self.assertNotIn(banned, json.dumps(setup))
		self.assertEqual(len(setup["tools"]), 1)
		self.assertEqual(setup["generationConfig"]["responseModalities"], ["AUDIO"])
		sc = setup["generationConfig"]["speechConfig"]
		self.assertEqual(sc["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"], "Puck")
		self.assertEqual(setup["model"], r["model"])
		self.assertEqual(setup["inputAudioTranscription"], {})
		self.assertEqual(setup["outputAudioTranscription"], {})
		text = setup["systemInstruction"]["parts"][0]["text"]
		self.assertIn("You are the chairman agent.", text)
		self.assertIn("Respond only in English", text)
		self.assertIn("never invent numbers", text)
		self.assertLess(expire, "9999")
		self.assertTrue(expire > new_session)

	def test_language_mapping(self):
		expect = {"en": "en-IN", "hi": "hi-IN", "ar": cl.LANGUAGE_BCP47["ar"], "ml": "ml-IN", "fr": "en-IN", None: "en-IN"}
		for lang, code in expect.items():
			call = self.start(lang)
			setup = self.mint.call_args[0][0]
			# default model is native-audio: no languageCode (Gemini rejects it), language is in the instruction
			self.assertNotIn("languageCode", setup["generationConfig"]["speechConfig"])
			self.assertEqual(cl.LANGUAGE_BCP47[lang if lang in cl.LANGUAGE_BCP47 else "en"], code)
			cl.end_call(call["call_id"])
			self.f.cache.d = {k: v for k, v in self.f.cache.d.items() if "rl:" not in k}
		self.assertEqual(cl.LANGUAGE_BCP47["en"], "en-IN")

	def test_language_line_in_instruction(self):
		self.start("ml")
		text = self.mint.call_args[0][0]["systemInstruction"]["parts"][0]["text"]
		self.assertIn("Respond only in Malayalam", text)

	def test_max_seconds_clamped(self):
		for raw, want in ((5, 30), (99999, 900), ("abc", 300), (120, 120)):
			self.f.cache.d.clear()
			self.settings["call_max_seconds"] = raw
			self.assertEqual(self.start()["max_seconds"], want)

	def test_daily_cap(self):
		self.settings["call_daily_minutes_per_user"] = 1  # 60s
		first = self.start()
		self.assertEqual(first["max_seconds"], 60)
		self.clock[0] += 60
		cl.end_call(first["call_id"])  # used all 60s
		self.assertEqual(cl.call_capabilities()["reason"], "rate")
		with self.assertRaises(self.f.TooManyRequestsError):
			self.start()

	def test_daily_refund_on_early_end(self):
		call = self.start()
		self.clock[0] += 45
		cl.end_call(call["call_id"], seconds=0)  # client number ignored
		self.assertEqual(cl._seconds_used_today("chair@example.com"), 45)

	def test_expiry_charges_full_cap(self):
		self.start()
		self.assertEqual(cl._seconds_used_today("chair@example.com"), 300)


class TestCallIdAndEnd(CallBase):
	def test_unknown_expired_and_foreign_refused(self):
		call = self.start()
		cid = call["call_id"]
		with self.assertRaises(frappe.PermissionError):
			cl.call_tool("nope" * 8, "get_day_summary", {})
		other = _fake_frappe(user="other@example.com")
		other.cache = self.f.cache
		with mock.patch.object(cl, "frappe", other), mock.patch.object(chairman_mod, "frappe", other), mock.patch.object(cc, "frappe", other):
			for fn, args in ((cl.call_tool, (cid, "get_day_summary", {})), (cl.call_turns, (cid, [])), (cl.end_call, (cid,))):
				with self.assertRaises(frappe.PermissionError):
					fn(*args)
		self.clock[0] += 301
		with self.assertRaises(frappe.PermissionError):
			cl.call_tool(cid, "get_day_summary", {})
		self.run_tool.assert_not_called()
		self.assertTrue(self.start()["call_id"])  # expiry released the lock

	def test_end_call_idempotent(self):
		call = self.start()
		self.clock[0] += 10
		self.assertEqual(cl.end_call(call["call_id"]), {"ok": True})
		used = cl._seconds_used_today("chair@example.com")
		self.assertEqual(used, 10)
		self.assertEqual(cl.end_call(call["call_id"]), {"ok": True})
		self.assertEqual(cl._seconds_used_today("chair@example.com"), used)
		self.assertEqual(cl.end_call("never-existed-id"), {"ok": True})
		with self.assertRaises(frappe.PermissionError):
			cl.call_tool(call["call_id"], "get_day_summary", {})


class TestWrappers(CallBase):
	def test_call_tool_happy_path_and_cards_stripped(self):
		call = self.start()
		r = cl.call_tool(call["call_id"], "get_day_summary", '{"date": "2026-11-01"}')
		self.assertEqual(r, {"ok": True, "result": {"total": 5}, "error": None})
		state, name, args = self.run_tool.call_args[0]
		self.assertEqual((name, args), ("get_day_summary", {"date": "2026-11-01"}))
		self.assertEqual(
			set(state), {"call_id", "user", "conversation", "expires_at", "tools_used", "language", "started_at", "max_seconds"}
		)
		self.assertEqual(state["user"], "chair@example.com")
		self.assertEqual(state["conversation"], "CONV-1")

	def test_unknown_and_card_tools_rejected(self):
		call = self.start()
		for name in ("show_card", "compose_card", "compose_dashboard", "frappe.db.sql", None):
			r = cl.call_tool(call["call_id"], name, {})
			self.assertFalse(r["ok"])
		self.run_tool.assert_not_called()

	def test_bad_args(self):
		call = self.start()
		for bad in ("[1]", "not json", [1], "x" * 9000):
			with self.assertRaises(frappe.ValidationError):
				cl.call_tool(call["call_id"], "get_day_summary", bad)

	def test_per_call_tool_cap(self):
		call = self.start()
		for i in range(cl.MAX_TOOL_CALLS):
			self.f.cache.d = {k: v for k, v in self.f.cache.d.items() if "rl:" not in k}
			self.assertTrue(cl.call_tool(call["call_id"], "get_day_summary", {})["ok"])
		r = cl.call_tool(call["call_id"], "get_day_summary", {})
		self.assertFalse(r["ok"])
		self.assertEqual(self.run_tool.call_count, cl.MAX_TOOL_CALLS)

	def test_tool_error_is_generic(self):
		call = self.start()
		self.run_tool.side_effect = RuntimeError("db password leak")
		r = cl.call_tool(call["call_id"], "get_day_summary", {})
		self.assertEqual(r, {"ok": False, "result": None, "error": "tool failed"})

	def test_tool_permission_error_propagates(self):
		call = self.start()
		self.run_tool.side_effect = frappe.PermissionError("no")
		with self.assertRaises(frappe.PermissionError):
			cl.call_tool(call["call_id"], "get_day_summary", {})

	def test_call_turns(self):
		call = self.start()
		turns = [{"role": "user", "text": "hi", "seq": 1}, {"role": "agent", "text": "yo", "seq": 2}]
		self.assertEqual(cl.call_turns(call["call_id"], turns), {"saved": 2})
		self.assertEqual(self.save_turns.call_args[0][1], turns)
		with self.assertRaises(frappe.ValidationError):
			cl.call_turns(call["call_id"], "not a list")


class TestMintTokenShape(unittest.TestCase):
	def test_request_shape_and_timeout(self):
		resp = mock.MagicMock()
		resp.json.return_value = {"name": "auth_tokens/abc"}
		fake_requests = types.SimpleNamespace(post=mock.MagicMock(return_value=resp))
		with mock.patch.dict(sys.modules, {"requests": fake_requests}):
			tok = cl._mint_token({"model": "m"}, "E", "N", KEY)
		self.assertEqual(tok, "auth_tokens/abc")
		args, kw = fake_requests.post.call_args
		self.assertEqual(args[0], cl.TOKEN_URL)
		self.assertEqual(kw["timeout"], 15)
		self.assertEqual(kw["headers"], {"x-goog-api-key": KEY})
		self.assertEqual(
			kw["json"],
			{"uses": 1, "expireTime": "E", "newSessionExpireTime": "N", "bidiGenerateContentSetup": {"model": "m"}},
		)


if __name__ == "__main__":
	unittest.main()


class IntSettingDefaultTests(unittest.TestCase):
	def test_zero_means_default(self):
		with mock.patch.object(cl.chairman_chat, "_settings_value", lambda f: 0):
			self.assertEqual(cl._int_setting("call_daily_minutes_per_user", 30), 30)
		with mock.patch.object(cl.chairman_chat, "_settings_value", lambda f: "45"):
			self.assertEqual(cl._int_setting("call_daily_minutes_per_user", 30), 45)


class GeminiSchemaTests(unittest.TestCase):
	def test_strips_additional_properties_and_uppercases_types(self):
		out = cl.gemini_schema({"type": "object", "additionalProperties": False, "properties": {"a": {"type": "string", "description": "d", "additionalProperties": False}, "b": {"type": "array", "items": {"type": "number"}}}, "required": ["a"]})
		self.assertEqual(out["type"], "OBJECT")
		self.assertNotIn("additionalProperties", out)
		self.assertNotIn("additionalProperties", out["properties"]["a"])
		self.assertEqual(out["properties"]["b"]["items"]["type"], "NUMBER")
		self.assertEqual(out["required"], ["a"])

	def test_declarations_have_no_unknown_keys(self):
		for d in cl.function_declarations():
			self.assertNotIn("additionalProperties", json.dumps(d["parameters"]))


class NonNativeModelLanguageCodeTests(unittest.TestCase):
	def test_language_code_only_for_non_native_audio_models(self):
		a = cl.build_setup("models/gemini-3.8-live", "Puck", "hi", "x")
		self.assertEqual(a["generationConfig"]["speechConfig"]["languageCode"], "hi-IN")
		b = cl.build_setup("models/gemini-2.5-flash-native-audio-latest", "Puck", "hi", "x")
		self.assertNotIn("languageCode", b["generationConfig"]["speechConfig"])
