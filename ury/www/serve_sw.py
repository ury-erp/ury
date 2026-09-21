"""Frappe www controller for the Serve service worker page (serve-sw.js).

Prefer registering at /ury/serve/sw.js (routed here) so the default SW scope is
/ury/serve/. The after_request hook also sets Service-Worker-Allowed.
"""

from __future__ import annotations

import frappe

from ury.ury.controllers.serve_pwa import load_service_worker_source

no_cache = 1
sitemap = 0
base_template_path = "www/serve-sw.js"


def get_context(context):
	context.safe_render = False
	try:
		context.sw_source = load_service_worker_source()
	except FileNotFoundError:
		frappe.log_error(title="Serve SW missing")
		context.sw_source = (
			"/* Serve service worker source missing — rebuild serve app */\n"
			"self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));\n"
			"self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));\n"
		)
	return context
