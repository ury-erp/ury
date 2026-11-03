# Pure tests (no site): python3 -m unittest test_chairman_whatsapp  (run from this directory)
# SiteTests at the bottom need a bench site with huf + frappe_whatsapp; skipped without frappe.

import json
import os
import unittest
from datetime import datetime, timedelta

try:
	from ury.ury.api import chairman_whatsapp as m
except ImportError:
	import chairman_whatsapp as m

HERE = os.path.dirname(os.path.abspath(__file__))
NOW = datetime(2026, 11, 3, 12, 0, 0)
EPOCH_NOW = 1762171200 + 60  # one minute after the text fixture


def fixture(name):
	with open(os.path.join(HERE, "test_data", name)) as fh:
		return json.load(fh)


class FakeSender:
	def __init__(self, fail=False):
		self.texts, self.images, self.fail = [], [], fail

	def send_text(self, to, text, reply_to=None, account=None):
		if self.fail:
			raise m.SendError("boom")
		self.texts.append((to, text, reply_to))

	def send_image(self, to, png, caption="", filename="x.png", reply_to=None, account=None):
		if self.fail:
			raise m.SendError("boom")
		self.images.append((to, png, caption, filename))


class FakeRuntime:
	def __init__(self, user="chair@x.com", turn=None, err=None, age=60):
		self.user, self.turn, self.err, self.age = user, turn, err, age
		self.seen, self.audits, self.logs, self.stored = set(), [], [], []
		self.session_user, self.user_log, self.revoked, self.otp = "Guest", [], [], {}
		self.unknown_hits, self.pending, self.ran = 0, None, 0

	def now(self):
		return NOW

	def age_seconds(self, inb):
		return self.age

	def log(self, msg):
		self.logs.append(msg)

	def claim(self, mid):
		if mid in self.seen:
			return False
		self.seen.add(mid)
		return True

	def resolve(self, number):
		return self.user

	def pending_link(self, number):
		return self.pending

	def verify_otp(self, link, code):
		return {"ok": code == "123456"}

	def revoke(self, number):
		self.revoked.append(number)

	def touch_inbound(self, number, now):
		pass

	def unknown_rate_ok(self, number):
		self.unknown_hits += 1
		return self.unknown_hits <= 1

	def as_user(self, user):
		def setu(u):
			self.session_user = u
			self.user_log.append(u)

		return m.impersonate(user, setu, lambda: self.session_user)

	def run_turn(self, user, inb):
		self.ran += 1
		self.user_log.append("turn:" + self.session_user)
		if self.err:
			raise self.err
		return self.turn

	def render(self, card, lang):
		return b"PNG:" + card["title"].encode()

	def store_card(self, conversation, png):
		self.stored.append((conversation, png))

	def audit(self, row):
		self.audits.append(row)


def text_inbound(text="sales yesterday", mid="wamid.1", sender="971501234567"):
	return m.Inbound(message_id=mid, sender=sender, kind="text", text=text, epoch=EPOCH_NOW, account="WA1")


def kpi(title="Sales"):
	return {"v": 1, "type": "kpi", "title": title, "subtitle": "", "kpis": [{"label": "Net", "value": 10, "fmt": "money"}]}


def turn(cards, reply="Sales (yesterday): 1,000"):
	return m.Turn(reply=reply, cards=cards, conversation="CONV-1", intent="sales_day", fast_path=True, lang="en")


class TestParse(unittest.TestCase):
	def test_text_fixture(self):
		(i,) = m.parse_webhook(fixture("meta_webhook_text.json"))
		self.assertEqual((i.kind, i.text, i.sender), ("text", "How were sales yesterday?", "971501234567"))
		self.assertTrue(i.message_id.startswith("wamid."))
		self.assertEqual(i.phone_id, "106540352242922")
		self.assertEqual(i.epoch, 1762171200)

	def test_audio_fixture(self):
		(i,) = m.parse_webhook(fixture("meta_webhook_audio.json"))
		self.assertEqual((i.kind, i.media_id), ("audio", "1234567890"))

	def test_status_only_payload_is_empty(self):
		self.assertEqual(m.parse_webhook(fixture("meta_webhook_status.json")), [])
		self.assertEqual(m.parse_webhook("not json"), [])
		self.assertEqual(m.parse_webhook(None), [])

	def test_commands(self):
		self.assertEqual(m.parse_command(" stop. "), ("stop", None))
		self.assertEqual(m.parse_command("LINK 123 456"), ("link", "123456"))
		self.assertEqual(m.parse_command("link 12345"), (None, None))
		self.assertEqual(m.parse_command("please stop the sales"), (None, None))

	def test_doc_form(self):
		d = {"type": "Incoming", "content_type": "text", "message": "hi", "message_id": "w1", "from": "9715", "creation": NOW, "whatsapp_account": "WA1", "name": "WM-1"}
		i = m.inbound_from_doc(d)
		self.assertEqual((i.kind, i.text, i.account), ("text", "hi", "WA1"))
		self.assertIsNone(m.inbound_from_doc(dict(d, type="Outgoing")))
		self.assertEqual(m.inbound_from_doc(dict(d, content_type="audio")).kind, "audio")
		self.assertEqual(m.inbound_from_doc(dict(d, content_type="reaction")).kind, "ignored")


class TestPolicy(unittest.TestCase):
	def test_table_drops_name_columns(self):
		card = {"v": 1, "type": "table", "title": "Top", "cols": ["Customer", "Orders", "Sales"], "rows": [["Ali", 3, 10], ["Bo", 2, 5]]}
		out = m.sanitize_card(card)
		self.assertEqual(out["cols"], ["Orders", "Sales"])
		self.assertEqual(out["rows"], [[3, 10], [2, 5]])
		self.assertEqual(card["cols"][0], "Customer")  # input untouched

	def test_all_name_columns_drops_card(self):
		self.assertIsNone(m.sanitize_card({"type": "table", "title": "T", "cols": ["Waiter"], "rows": [["x"]]}))

	def test_person_titled_card_dropped(self):
		self.assertIsNone(m.sanitize_card(kpi("Top customers")))
		self.assertIsNone(m.sanitize_card(dict(kpi(), subtitle="by cashier")))

	def test_series_points_and_kpis_filtered(self):
		bar = {"type": "bar", "title": "B", "series": [{"label": "Burger", "value": 1}, {"label": "Employee Sam", "value": 2}]}
		self.assertEqual([p["label"] for p in m.sanitize_card(bar)["series"]], ["Burger"])
		line = {"type": "line", "title": "L", "series": [{"label": "a", "value": 1}, {"label": "Customer x", "value": 2}]}
		self.assertIsNone(m.sanitize_card(line))  # a line needs >= 2 points
		k = dict(kpi(), kpis=[{"label": "Waiter tips", "value": 1}, {"label": "Net", "value": 2}])
		self.assertEqual(len(m.sanitize_card(k)["kpis"]), 1)

	def test_link_removed_and_cell_redacted(self):
		c = dict(kpi(), link="/app/sales-invoice/SINV-1")
		self.assertNotIn("link", m.sanitize_card(c))
		t = {"type": "table", "title": "T", "cols": ["Ref"], "rows": [["call +971 50 123 4567"]]}
		self.assertNotIn("971", m.sanitize_card(t)["rows"][0][0])

	def test_dashboard_panels_filtered(self):
		good, bad = kpi("Sales"), kpi("Customer list")
		d = {"type": "dashboard", "title": "D", "panels": [{"id": "a", "card": good}, {"id": "b", "card": bad}]}
		out = m.sanitize_card(d)
		self.assertEqual(out["type"], "kpi")  # one panel left -> the lone card
		d["panels"].append({"id": "c", "card": kpi("Other")})
		self.assertEqual(len(m.sanitize_card(d)["panels"]), 2)

	def test_redact_text(self):
		t = "Sales 1,000. Top customer is Ali Khan. Call +971 50 123 4567 or a@b.com, see SINV-2026-00012 https://x.y/app"
		out = m.redact_text(t)
		for bad in ("Ali", "971", "a@b.com", "SINV", "http"):
			self.assertNotIn(bad, out)
		self.assertIn("Sales 1,000", out)
		self.assertLessEqual(len(m.redact_text("x " * 1000)), m.MAX_TEXT_CHARS)

	def test_impersonate_restores_on_error_and_refuses_admin(self):
		state = {"u": "Guest"}
		with self.assertRaises(ValueError):
			with m.impersonate("c@x.com", lambda u: state.update(u=u), lambda: state["u"]):
				self.assertEqual(state["u"], "c@x.com")
				raise ValueError("x")
		self.assertEqual(state["u"], "Guest")
		for u in ("Administrator", "Guest", None, ""):
			with self.assertRaises(PermissionError):
				with m.impersonate(u, lambda x: None, lambda: "Guest"):
					pass


class TestProcess(unittest.TestCase):
	def test_answer_sends_png_and_caption_with_audit_without_content(self):
		cards = [kpi("A"), kpi("B"), kpi("C"), kpi("D")]
		rt, s = FakeRuntime(turn=turn(cards)), FakeSender()
		self.assertEqual(m.process(text_inbound("secret question about sales"), rt, s), "answered")
		self.assertEqual(len(s.images), 3)
		self.assertEqual(s.images[0][2], "Sales (yesterday): 1,000")
		self.assertEqual(s.images[1][2], "")
		self.assertEqual(len(rt.stored), 3)
		self.assertEqual(s.texts, [])
		(a,) = rt.audits
		self.assertEqual((a["outcome"], a["card_count"], a["user"]), ("answered", 3, "chair@x.com"))
		blob = json.dumps(a)
		self.assertNotIn("secret question", blob)
		self.assertNotIn("1,000", blob)
		self.assertNotIn("971501234567", blob)
		self.assertTrue(a["wa_number"].endswith("4567") and a["wa_number"].startswith("*"))

	def test_user_set_during_turn_and_restored(self):
		rt = FakeRuntime(turn=turn([kpi()]))
		m.process(text_inbound(), rt, FakeSender())
		self.assertIn("turn:chair@x.com", rt.user_log)
		self.assertEqual(rt.session_user, "Guest")

	def test_user_restored_when_turn_crashes(self):
		rt = FakeRuntime(err=RuntimeError("agent exploded"))
		s = FakeSender()
		self.assertEqual(m.process(text_inbound(), rt, s), "error")
		self.assertEqual(rt.session_user, "Guest")
		self.assertEqual(s.texts[0][1], m.MESSAGES["failed"])
		self.assertNotIn("exploded", json.dumps(s.texts))

	def test_admin_link_is_never_impersonated(self):
		rt = FakeRuntime(user="Administrator", turn=turn([]))
		self.assertEqual(m.process(text_inbound(), rt, FakeSender()), "error")
		self.assertEqual(rt.ran, 0)
		self.assertEqual(rt.session_user, "Guest")

	def test_dedup(self):
		rt, s = FakeRuntime(turn=turn([kpi()])), FakeSender()
		self.assertEqual(m.process(text_inbound(), rt, s), "answered")
		self.assertEqual(m.process(text_inbound(), rt, s), "duplicate")
		self.assertEqual(len(s.images), 1)
		self.assertEqual(len(rt.audits), 1)  # duplicates leave no second audit row

	def test_unknown_number_neutral_no_data_and_rate_limited(self):
		rt, s = FakeRuntime(user=None), FakeSender()
		self.assertEqual(m.process(text_inbound(mid="a"), rt, s), "unknown_number")
		self.assertEqual(m.process(text_inbound(mid="b"), rt, s), "unknown_rate_limited")
		self.assertEqual(s.texts, [("971501234567", m.MESSAGES["neutral"], "a")])
		self.assertEqual(rt.ran, 0)
		self.assertEqual(s.images, [])
		self.assertNotIn("brief", m.MESSAGES["neutral"].lower())

	def test_unknown_number_stop_gets_neutral_not_revoke_message(self):
		rt, s = FakeRuntime(user=None), FakeSender()
		m.process(text_inbound("STOP"), rt, s)
		self.assertEqual(s.texts[0][1], m.MESSAGES["neutral"])

	def test_stop_revokes(self):
		rt, s = FakeRuntime(turn=turn([])), FakeSender()
		self.assertEqual(m.process(text_inbound("stop"), rt, s), "revoked")
		self.assertEqual(rt.revoked, ["971501234567"])
		self.assertEqual(rt.ran, 0)
		self.assertEqual(s.texts[0][1], m.MESSAGES["stopped"])

	def test_link_ok_fail_and_no_pending(self):
		rt, s = FakeRuntime(user=None), FakeSender()
		rt.pending = "CWL-00001"
		self.assertEqual(m.process(text_inbound("LINK 123456", mid="1"), rt, s), "linked")
		self.assertEqual(m.process(text_inbound("LINK 000000", mid="2"), rt, s), "link_failed")
		rt.pending = None
		self.assertEqual(m.process(text_inbound("LINK 123456", mid="3"), FakeRuntime(user=None), s), "unknown_number")
		self.assertEqual(s.texts[0][1], m.MESSAGES["linked"])
		self.assertEqual(s.texts[1][1], m.MESSAGES["link_failed"])

	def test_window_closed_does_nothing_and_logs(self):
		rt, s = FakeRuntime(turn=turn([kpi()]), age=24 * 3600 + 1), FakeSender()
		self.assertEqual(m.process(text_inbound(), rt, s), "window_closed")
		self.assertEqual((s.texts, s.images, rt.ran), ([], [], 0))
		self.assertTrue(rt.logs)
		self.assertEqual(rt.audits[0]["outcome"], "window_closed")

	def test_rate_limit_and_permission_messages(self):
		for kind in ("rate_limited", "not_permitted", "invalid"):
			rt, s = FakeRuntime(err=m.ChannelError(kind)), FakeSender()
			self.assertEqual(m.process(text_inbound(mid=kind), rt, s), "refused_" + kind)
			self.assertEqual(s.texts[0][1], m.MESSAGES.get(kind, m.MESSAGES["failed"]))
			self.assertEqual(rt.session_user, "Guest")

	def test_policy_applied_before_render(self):
		bad = {"v": 1, "type": "table", "title": "People", "cols": ["Customer", "Sales"], "rows": [["Ali", 5]]}
		rt, s = FakeRuntime(turn=turn([bad], reply="Top customer is Ali. Sales 5")), FakeSender()
		m.process(text_inbound(), rt, s)
		self.assertEqual(b"PNG:People", s.images[0][1])
		self.assertEqual(s.images[0][2], "Sales 5")
		rendered_cols = m.sanitize_card(bad)["cols"]
		self.assertEqual(rendered_cols, ["Sales"])

	def test_card_dropped_entirely_falls_back_to_text(self):
		rt, s = FakeRuntime(turn=turn([kpi("Top customers")], reply="Sales 5")), FakeSender()
		m.process(text_inbound(), rt, s)
		self.assertEqual((s.images, s.texts[0][1]), ([], "Sales 5"))

	def test_render_failure_falls_back_to_text(self):
		rt, s = FakeRuntime(turn=turn([kpi()])), FakeSender()
		rt.render = lambda c, l: (_ for _ in ()).throw(RuntimeError("no raqm"))
		self.assertEqual(m.process(text_inbound(), rt, s), "answered")
		self.assertEqual((s.images, len(s.texts)), ([], 1))

	def test_send_failure_audited(self):
		rt = FakeRuntime(turn=turn([kpi()]))
		self.assertEqual(m.process(text_inbound(), rt, FakeSender(fail=True)), "send_failed")
		self.assertEqual(rt.audits[0]["outcome"], "send_failed")

	def test_ignored_and_unsupported(self):
		rt, s = FakeRuntime(turn=turn([])), FakeSender()
		self.assertEqual(m.process(m.Inbound("r1", "971501234567", "ignored"), rt, s), "ignored")
		self.assertEqual(m.process(m.Inbound("o1", "971501234567", "other", epoch=EPOCH_NOW), rt, s), "unsupported")
		self.assertEqual(s.texts[0][1], m.MESSAGES["unsupported"])

	def test_webhook_fixture_end_to_end(self):
		(inb,) = m.parse_webhook(fixture("meta_webhook_text.json"))
		rt, s = FakeRuntime(turn=turn([kpi()])), FakeSender()
		rt.age_seconds = lambda i: 60
		self.assertEqual(m.process(inb, rt, s), "answered")
		self.assertEqual(s.images[0][0], "971501234567")


class TestHandleIncomingEntry(unittest.TestCase):
	def test_payload_entry_with_injected_runtime(self):
		rt, s = FakeRuntime(turn=turn([kpi()])), FakeSender()
		rt.age_seconds = lambda i: 60
		out = m.handle_incoming(payload=fixture("meta_webhook_text.json"), account="WA1", sender=s, runtime=rt)
		self.assertEqual(out, ["answered"])


if __name__ == "__main__":
	unittest.main()
