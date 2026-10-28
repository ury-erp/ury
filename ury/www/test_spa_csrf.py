import importlib
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from jinja2 import Environment

REPO_ROOT = Path(__file__).resolve().parents[2]
SPA_PAGES = {
	"urypos": REPO_ROOT / "urypos" / "index.html",
	"mosaic": REPO_ROOT / "mosaic" / "index.html",
}


class TestLegacySpaCsrfToken(unittest.TestCase):
	"""/urypos and /mosaic must receive the same session CSRF token as /pos."""

	def test_templates_render_the_context_csrf_token(self):
		for page, template_path in SPA_PAGES.items():
			with self.subTest(page=page):
				template = Environment().from_string(template_path.read_text())
				html = template.render(
					csrf_token="session-token",
					frappe=SimpleNamespace(session=SimpleNamespace(csrf_token=None)),
				)
				self.assertIn("window.csrf_token = 'session-token';", html)

	def test_page_context_uses_session_csrf_token_without_caching(self):
		for page in SPA_PAGES:
			with self.subTest(page=page):
				controller = importlib.import_module(f"ury.www.{page}")
				context = {}
				db = MagicMock()
				with (
					patch.object(
						controller.frappe.sessions, "get_csrf_token", return_value="session-token"
					) as get_csrf_token,
					patch.object(controller.frappe, "db", db),
				):
					result = controller.get_context(context)

				self.assertEqual(controller.no_cache, 1)
				self.assertIs(result, context)
				self.assertEqual(context["csrf_token"], "session-token")
				get_csrf_token.assert_called_once_with()
				db.commit.assert_called_once_with()
