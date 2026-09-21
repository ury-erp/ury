"""Tests for Serve PWA headers, SW source policy, and route precedence."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from frappe.tests.utils import FrappeTestCase
from werkzeug.routing import Map, Rule

from ury.ury.controllers.serve_pwa import (
	SERVE_SCOPE,
	SERVE_SW_PAGE,
	SERVE_SW_PATH,
	after_request,
	load_service_worker_source,
)


def _match_route(path: str, rules: list[dict]) -> tuple[str, dict] | None:
	"""Test-only Werkzeug matcher (not shipped in the runtime controller)."""
	adapter = Map([Rule(r["from_route"], endpoint=r["to_route"]) for r in rules]).bind("localhost")
	try:
		endpoint, args = adapter.match(path if path.startswith("/") else f"/{path}")
	except Exception:
		return None
	return endpoint, args


def _serve_route_fixture() -> list[dict]:
	"""Minimal rule set mirroring hooks.py order for Serve vs siblings."""
	return [
		{"from_route": SERVE_SW_PATH, "to_route": SERVE_SW_PAGE},
		{"from_route": "/ury/serve", "to_route": "serve"},
		{"from_route": "/ury/serve/", "to_route": "serve"},
		{"from_route": "/ury/serve/<path:app_path>", "to_route": "serve"},
		{"from_route": "/ury/order/<path:app_path>", "to_route": "order"},
		{"from_route": "/ury/<path:app_path>", "to_route": "ury"},
		{"from_route": "/pos/<path:app_path>", "to_route": "pos"},
	]


class TestServeRouteMatching(FrappeTestCase):
	def test_exact_and_nested_serve_routes(self):
		rules = _serve_route_fixture()
		cases = [
			("/ury/serve", "serve", {}),
			("/ury/serve/", "serve", {}),
			("/ury/serve/tables", "serve", {"app_path": "tables"}),
			("/ury/serve/tables/T-1", "serve", {"app_path": "tables/T-1"}),
			(SERVE_SW_PATH, SERVE_SW_PAGE, {}),
		]
		for path, endpoint, args in cases:
			matched = _match_route(path, rules)
			self.assertIsNotNone(matched, path)
			self.assertEqual(matched[0], endpoint, path)
			self.assertEqual(matched[1], args, path)

	def test_serve_precedes_ury_catchall(self):
		rules = _serve_route_fixture()
		self.assertEqual(_match_route("/ury/serve/foo", rules)[0], "serve")
		self.assertEqual(_match_route("/ury/dashboard", rules)[0], "ury")
		self.assertEqual(_match_route("/ury/order/x", rules)[0], "order")
		self.assertEqual(_match_route("/pos/bar", rules)[0], "pos")

	def test_hooks_declare_sw_before_spa_catchall(self):
		from ury.hooks import website_route_rules

		from_routes = [r["from_route"] for r in website_route_rules]
		self.assertIn(SERVE_SW_PATH, from_routes)
		self.assertLess(from_routes.index(SERVE_SW_PATH), from_routes.index("/ury/serve/<path:app_path>"))
		self.assertLess(from_routes.index("/ury/serve/<path:app_path>"), from_routes.index("/ury/<path:app_path>"))


class TestServeServiceWorkerHeaders(FrappeTestCase):
	def test_sets_scope_and_javascript_content_type(self):
		response = MagicMock()
		response.status_code = 200
		response.mimetype = "application/javascript"
		response.headers = {}
		request = MagicMock()
		request.path = SERVE_SW_PATH

		after_request(response=response, request=request)

		self.assertEqual(response.headers["Service-Worker-Allowed"], SERVE_SCOPE)
		self.assertEqual(response.headers["Content-Type"], "application/javascript; charset=utf-8")
		self.assertEqual(response.headers["Cache-Control"], "no-cache")

	def test_ignores_unrelated_paths(self):
		response = MagicMock()
		response.status_code = 200
		response.headers = {}
		request = MagicMock()
		request.path = "/pos/sw.js"

		after_request(response=response, request=request)
		self.assertEqual(response.headers, {})

	def test_www_alias_also_gets_headers(self):
		response = MagicMock()
		response.status_code = 200
		response.mimetype = "application/javascript"
		response.headers = {}
		request = MagicMock()
		request.path = "/serve-sw.js"

		after_request(response=response, request=request)
		self.assertEqual(response.headers["Service-Worker-Allowed"], SERVE_SCOPE)

	def test_does_not_relabel_error_html_as_javascript(self):
		response = MagicMock()
		response.status_code = 404
		response.mimetype = "text/html"
		response.headers = {"Content-Type": "text/html; charset=utf-8"}
		request = MagicMock()
		request.path = SERVE_SW_PATH

		after_request(response=response, request=request)
		self.assertNotIn("Service-Worker-Allowed", response.headers)
		self.assertEqual(response.headers["Content-Type"], "text/html; charset=utf-8")

	def test_does_not_relabel_login_html_as_javascript(self):
		response = MagicMock()
		response.status_code = 200
		response.mimetype = "text/html"
		response.headers = {"Content-Type": "text/html; charset=utf-8"}
		request = MagicMock()
		request.path = SERVE_SW_PATH

		after_request(response=response, request=request)
		self.assertNotIn("Service-Worker-Allowed", response.headers)


class TestServeServiceWorkerSource(FrappeTestCase):
	def _source(self) -> str:
		app_path = Path(__file__).resolve().parents[2]
		return load_service_worker_source(app_path=app_path)

	def test_loads_workspace_public_sw(self):
		app_path = Path(__file__).resolve().parents[2]
		source = self._source()
		self.assertIn("ury-serve-shell", source)
		self.assertIn("/ury/serve", source)
		self.assertIn("isApiRequest", source)
		offline = (app_path.parent / "serve" / "public" / "offline.html").read_text(encoding="utf-8")
		self.assertIn("Connection required", offline)
		self.assertIn("not saved or replayed", offline)

	def test_activate_only_deletes_ury_serve_prefix_caches(self):
		"""Regression: must not wipe POS / order / management Cache Storage."""
		source = self._source()
		self.assertIn('CACHE_PREFIX = "ury-serve-"', source)
		self.assertIn("staleServeCacheNames", source)
		self.assertIn("key.startsWith(CACHE_PREFIX)", source)

		activate_block = source.split('addEventListener("activate"')[1].split('addEventListener("fetch"')[0]
		self.assertIn("staleServeCacheNames(keys, CACHE_NAME)", activate_block)
		# Dangerous prior pattern: delete every key except current cache name.
		self.assertNotIn("keys.filter((key) => key !== CACHE_NAME)", activate_block)

	def test_sw_script_not_handled_as_navigation_offline_fallback(self):
		source = self._source()
		self.assertIn("isServiceWorkerScript", source)
		fetch_block = source.split('addEventListener("fetch"')[1]
		self.assertLess(fetch_block.index("isServiceWorkerScript"), fetch_block.index("navigate"))

	def test_stale_cache_helper_preserves_foreign_keys(self):
		"""Run the SW helper in Node so POS/order caches are proven untouched."""
		import json
		import subprocess

		source = self._source()
		start = source.index("const CACHE_PREFIX")
		end = source.index("self.addEventListener(\"install\"")
		helper_src = source[start:end]
		keys = [
			"ury-serve-shell-v1",
			"ury-serve-shell-v0",
			"pos-shell-v1",
			"order-shell-v1",
			"ury-mgmt-v1",
			"workbox-precache-v2-https://example/",
		]
		script = (
			helper_src
			+ "\nconst keys = "
			+ json.dumps(keys)
			+ ';\nprocess.stdout.write(JSON.stringify(staleServeCacheNames(keys, "ury-serve-shell-v1")));\n'
		)
		proc = subprocess.run(
			["node", "--input-type=module", "-e", script],
			capture_output=True,
			text=True,
			check=False,
		)
		self.assertEqual(proc.returncode, 0, proc.stderr)
		self.assertEqual(json.loads(proc.stdout), ["ury-serve-shell-v0"])
