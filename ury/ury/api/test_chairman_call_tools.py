# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Pure tests: plain unittest, frappe stubbed. Run: python3 -m unittest test_chairman_call_tools
# from this directory. Site tests (real Agent Conversation / Agent Message rows) are NOT covered.

import sys
import types
import unittest
from unittest import mock

try:
	from ury.ury.api.test_chairman_tools import _stub_frappe  # noqa: E402
except ImportError:  # pure unit run from this directory
	from test_chairman_tools import _stub_frappe  # noqa: E402

_stub_frappe()

import frappe  # noqa: E402

if not hasattr(frappe, "flags"):
	frappe.flags = {}
if not hasattr(frappe, "session"):
	frappe.session = types.SimpleNamespace(user="chair@x.com")
if not hasattr(frappe, "db"):
	frappe.db = mock.MagicMock()
if not hasattr(frappe, "cache"):
	frappe.cache = mock.MagicMock()
if not hasattr(frappe, "get_doc"):
	frappe.get_doc = mock.MagicMock()

try:
	from ury.ury.api import chairman_call_tools as cct  # noqa: E402
except ImportError:  # pure unit run from this directory
	import chairman_call_tools as cct  # noqa: E402


class _Flags(dict):
	__getattr__ = dict.get

	def __setattr__(self, k, v):
		self[k] = v


class FakeCache:
	def __init__(self):
		self.sets = {}

	def make_key(self, k):
		return k

	def sadd(self, key, v):
		s = self.sets.setdefault(key, set())
		if v in s:
			return 0
		s.add(v)
		return 1

	def srem(self, key, v):
		self.sets.get(key, set()).discard(v)

	def scard(self, key):
		return len(self.sets.get(key, ()))

	def expire(self, *a):
		pass


class Base(unittest.TestCase):
	def setUp(self):
		self._saved = {k: getattr(frappe, k, None) for k in ("session", "flags", "cache", "db", "get_doc")}
		frappe.session = types.SimpleNamespace(user="chair@x.com")
		frappe.flags = _Flags()
		frappe.cache = FakeCache()
		self.state = {"user": "chair@x.com", "conversation": "CONV1", "agent": "ag", "tools_used": 0}

	def tearDown(self):
		for k, v in self._saved.items():
			setattr(frappe, k, v)


class RunToolTests(Base):
	def _patch(self, func, chat=None):
		spec = {"parameters": {"properties": {"date": {}}, "required": []}, "func": func}
		tools = types.SimpleNamespace(TOOLS_BY_NAME={"get_day_summary": spec}, clean_text=lambda t, n: t[:n])
		chat = chat or types.SimpleNamespace(assert_chairman_tool_context=mock.Mock())
		return (
			mock.patch.object(cct, "_tools", return_value=tools),
			mock.patch.object(cct, "_chat", return_value=chat),
			mock.patch.object(cct, "VOICE_TOOLS", frozenset({"get_day_summary"})),
			chat,
		)

	def _run(self, func, name="get_day_summary", args=None, chat=None):
		p1, p2, p3, chat = self._patch(func, chat)
		with p1, p2, p3:
			return cct.run_tool(self.state, name, args or {})

	def test_real_allow_list_excludes_card_tools(self):
		self.assertTrue(cct.VOICE_TOOLS)
		self.assertFalse(cct.VOICE_TOOLS & cct.VOICE_EXCLUDED)
		self.assertIn("get_day_summary", cct.VOICE_TOOLS)

	def test_unknown_tool(self):
		with self.assertRaises(ValueError):
			self._run(lambda **k: {}, name="compose_card")

	def test_cards_stripped_and_flag_restored(self):
		frappe.flags["chairman_conversation_id"] = "OLD"
		seen = {}

		def fn(**k):
			seen["id"] = frappe.flags.get("chairman_conversation_id")
			return {"x": 1, "cards": [{"a": 1}]}

		out = self._run(fn)
		self.assertEqual(out, {"x": 1})
		self.assertEqual(seen["id"], "CONV1")
		self.assertEqual(frappe.flags.get("chairman_conversation_id"), "OLD")
		self.assertEqual(self.state["tools_used"], 1)

	def test_flag_restored_on_error(self):
		def boom(**k):
			raise RuntimeError("x")

		with self.assertRaises(RuntimeError):
			self._run(boom)
		self.assertIsNone(frappe.flags.get("chairman_conversation_id"))

	def test_cap(self):
		self.state["tools_used"] = cct.MAX_TOOLS_PER_CALL
		with self.assertRaises(frappe.ValidationError):
			self._run(lambda **k: {})

	def test_administrator_refused_even_with_valid_state(self):
		frappe.session.user = "Administrator"
		self.state["user"] = "Administrator"
		called = []
		with self.assertRaises(frappe.PermissionError):
			self._run(lambda **k: called.append(1))
		self.assertFalse(called)

	def test_session_user_mismatch_refused(self):
		frappe.session.user = "other@x.com"
		with self.assertRaises(frappe.PermissionError):
			self._run(lambda **k: {})

	def test_context_assert_failure_propagates_and_restores(self):
		chat = types.SimpleNamespace(assert_chairman_tool_context=mock.Mock(side_effect=frappe.PermissionError("no")))
		with self.assertRaises(frappe.PermissionError):
			self._run(lambda **k: {}, chat=chat)
		self.assertIsNone(frappe.flags.get("chairman_conversation_id"))

	def test_errors_mapped(self):
		def bad(**k):
			raise ValueError("bad date")

		self.assertEqual(self._run(bad), {"error": "bad date"})
		self.assertEqual(self._run(lambda **k: {}, args={"nope": 1})["error"], "Unknown argument: nope")
		self.assertEqual(self._run(lambda **k: {"ok": 1}, args='{"date": "2026-01-01"}'), {"ok": 1})

		def val(**k):
			raise frappe.ValidationError("v")

		self.assertEqual(self._run(val), {"error": "v"})


class SaveTurnsTests(Base):
	def setUp(self):
		super().setUp()
		self.added = []
		cm = mock.Mock()
		cm.add_message = lambda **kw: self.added.append(kw)
		mod = types.ModuleType("huf.ai.conversation_manager")
		mod.ConversationManager = mock.Mock(return_value=cm)
		self._mods = {}
		for n in ("huf", "huf.ai", "huf.ai.conversation_manager"):
			self._mods[n] = sys.modules.get(n)
		sys.modules["huf"] = types.ModuleType("huf")
		sys.modules["huf.ai"] = types.ModuleType("huf.ai")
		sys.modules["huf.ai.conversation_manager"] = mod
		self.owner = {"owner": "chair@x.com", "agent": "ag"}
		frappe.db = mock.MagicMock()
		frappe.db.get_value.side_effect = lambda dt, name, f=None, **k: (
			types.SimpleNamespace(**self.owner) if dt == "Agent Conversation" else "v"
		)
		frappe.get_doc = mock.Mock(return_value=object())
		tools = types.SimpleNamespace(clean_text=lambda t, n: " ".join(str(t).split())[:n])
		self._p = mock.patch.object(cct, "_tools", return_value=tools)
		self._p.start()

	def tearDown(self):
		self._p.stop()
		for n, m in self._mods.items():
			if m is None:
				sys.modules.pop(n, None)
			else:
				sys.modules[n] = m
		super().tearDown()

	def test_saves_and_idempotent(self):
		turns = [{"role": "user", "text": "hi", "seq": 1}, {"role": "agent", "text": "hello", "seq": 2}]
		self.assertEqual(cct.save_turns(self.state, turns), 2)
		self.assertEqual(cct.save_turns(self.state, turns), 0)
		self.assertEqual([m["role"] for m in self.added], ["user", "agent"])
		self.assertTrue(all(m["kind"] == "Message" for m in self.added))

	def test_ownership(self):
		self.owner = {"owner": "someone@else.com", "agent": "ag"}
		with self.assertRaises(frappe.PermissionError):
			cct.save_turns(self.state, [{"role": "user", "text": "x", "seq": 1}])
		self.assertFalse(self.added)

	def test_administrator_refused(self):
		frappe.session.user = "Administrator"
		self.state["user"] = "Administrator"
		with self.assertRaises(frappe.PermissionError):
			cct.save_turns(self.state, [{"role": "user", "text": "x", "seq": 1}])

	def test_cleaning_and_invalid_rows(self):
		turns = [
			{"role": "user", "text": "a   b\n c" + "z" * 3000, "seq": 1},
			{"role": "system", "text": "x", "seq": 2},
			{"role": "user", "text": "  ", "seq": 3},
			{"role": "user", "text": "x", "seq": "n"},
			"junk",
		]
		self.assertEqual(cct.save_turns(self.state, turns), 1)
		self.assertEqual(len(self.added[0]["content"]), cct.MAX_TURN_CHARS)
		self.assertTrue(self.added[0]["content"].startswith("a b c"))

	def test_max_turns(self):
		with self.assertRaises(ValueError):
			cct.save_turns(self.state, [{"role": "user", "text": "x", "seq": i} for i in range(201)])

	def test_failed_write_can_retry(self):
		turn = [{"role": "user", "text": "x", "seq": 1}]
		cm = sys.modules["huf.ai.conversation_manager"].ConversationManager.return_value
		cm.add_message = mock.Mock(side_effect=RuntimeError("db"))
		with self.assertRaises(RuntimeError):
			cct.save_turns(self.state, turn)
		cm.add_message = lambda **kw: self.added.append(kw)
		self.assertEqual(cct.save_turns(self.state, turn), 1)


if __name__ == "__main__":
	unittest.main()
