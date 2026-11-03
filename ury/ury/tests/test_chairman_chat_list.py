"""Pure unittest tests for ury.ury.api.chairman_chat_list_pure (no frappe needed)."""

import datetime
import importlib.util
import os
import unittest
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
	"chairman_chat_list_pure", os.path.join(os.path.dirname(HERE), "api", "chairman_chat_list_pure.py")
)
pure = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pure)

HINT = "\n\n[Language: Hindi. Reply in Hindi.]"


def row(**kw):
	base = dict(
		name="C1", title="", modified="2026-01-02 10:00:00", creation="2026-01-01 09:00:00",
		first_user="How were sales?" + HINT, last_role="agent", last_content="Sales were 10k.",
		started_by_voice=0,
	)
	base.update(kw)
	return base


class TestHelpers(unittest.TestCase):
	def test_strip_language_hint(self):
		self.assertEqual(pure.strip_language_hint("hi" + HINT), "hi")
		self.assertEqual(pure.strip_language_hint(None), "")

	def test_strip_both_hints_any_order(self):
		d = pure.date_hint(datetime.date(2026, 11, 3))
		self.assertEqual(pure.strip_language_hint("hi" + HINT + "\n" + d), "hi")
		self.assertEqual(pure.strip_language_hint("hi\n\n" + d), "hi")
		self.assertEqual(pure.strip_language_hint("hi\n\n" + d + HINT), "hi")
		self.assertEqual(pure.strip_language_hint("a [b] c" + HINT + "\n" + d), "a [b] c")
		self.assertEqual(pure.clean_title("x" + HINT + "\n" + d), "x")

	def test_date_hint(self):
		self.assertEqual(
			pure.date_hint(datetime.date(2026, 11, 3)),
			"[Today is Tuesday 2026-11-03; yesterday was Monday 2026-11-02. For 'yesterday' use 2026-11-02 "
			"(or leave the date empty); only use 2026-11-03 for 'today'. Use exact YYYY-MM-DD dates and never guess the year.]",
		)
		self.assertIn("Sunday 2025-12-28", pure.date_hint("2025-12-28"))
		self.assertIn("yesterday was Wednesday 2025-12-31", pure.date_hint(datetime.date(2026, 1, 1)))

	def test_clean_title(self):
		self.assertEqual(pure.clean_title("a\nb" + HINT), "a b")
		self.assertEqual(pure.clean_title(""), "Conversation")
		self.assertEqual(len(pure.clean_title("x" * 200)), 80)

	def test_limit(self):
		self.assertEqual(pure.coerce_list_limit(5), 5)
		self.assertEqual(pure.coerce_list_limit("500"), 100)
		self.assertEqual(pure.coerce_list_limit("0"), 1)
		self.assertEqual(pure.coerce_list_limit("abc"), 40)
		self.assertEqual(pure.coerce_list_limit(None), 40)

	def test_rename_title(self):
		self.assertEqual(pure.clean_rename_title("  a \n b  "), "a b")
		self.assertEqual(pure.clean_rename_title("   "), "")
		self.assertEqual(len(pure.clean_rename_title("y" * 200)), 80)


class TestConversationRow(unittest.TestCase):
	def test_auto_title_uses_first_question(self):
		r = pure.conversation_row(row(title="Conversation with Agent"))
		self.assertEqual(r["title"], "How were sales?")

	def test_custom_title_wins(self):
		self.assertEqual(pure.conversation_row(row(title="My title"))["title"], "My title")

	def test_pending_and_preview(self):
		r = pure.conversation_row(row(last_role="user", last_content="x\ny" + HINT * 1))
		self.assertTrue(r["pending"])
		self.assertEqual(r["preview"], "x y")
		self.assertEqual(r["last_role"], "user")
		self.assertFalse(pure.conversation_row(row())["pending"])

	def test_preview_truncated(self):
		self.assertEqual(len(pure.conversation_row(row(last_content="z" * 500))["preview"]), 120)

	def test_voice_and_dates_and_attr_rows(self):
		r = pure.conversation_row(SimpleNamespace(**row(started_by_voice=1)))
		self.assertIs(r["started_by_voice"], True)
		self.assertEqual(r["id"], "C1")
		self.assertEqual(r["last_at"], "2026-01-02 10:00:00")
		self.assertEqual(r["created_at"], "2026-01-01 09:00:00")


if __name__ == "__main__":
	unittest.main()
