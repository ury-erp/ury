"""Frappe www controller for the Chairman Brief service worker (/ury/brief/sw.js)."""

from __future__ import annotations

import re
from pathlib import Path

import frappe

no_cache = 1
sitemap = 0
base_template_path = "www/brief-sw.js"


def load_brief_sw_source() -> str:
	path = Path(frappe.get_app_path("ury")) / "public" / "brief" / "sw.js"
	return path.read_text(encoding="utf-8")


def safe_build_version() -> str:
	try:
		version = str(frappe.utils.get_build_version() or "")
	except Exception:
		version = ""
	return re.sub(r"[^A-Za-z0-9._-]", "", version) or "dev"


def get_context(context):
	context.safe_render = False
	try:
		context.sw_source = load_brief_sw_source().replace("__BUILD_VERSION__", safe_build_version())
	except FileNotFoundError:
		frappe.log_error(title="Brief SW missing")
		context.sw_source = (
			"/* Brief service worker source missing */\n"
			"self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));\n"
			"self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));\n"
		)
	return context
