"""Frappe www controller for the Chairman Brief service worker (/ury/brief/sw.js)."""

from __future__ import annotations

from pathlib import Path

import frappe

no_cache = 1
sitemap = 0
base_template_path = "www/brief-sw.js"


def load_brief_sw_source() -> str:
	path = Path(frappe.get_app_path("ury")) / "public" / "brief" / "sw.js"
	return path.read_text(encoding="utf-8")


def get_context(context):
	context.safe_render = False
	try:
		context.sw_source = load_brief_sw_source()
	except FileNotFoundError:
		frappe.log_error(title="Brief SW missing")
		context.sw_source = (
			"/* Brief service worker source missing */\n"
			"self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));\n"
			"self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));\n"
		)
	return context
