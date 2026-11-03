# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Analytics environment: is Frappe Insights installed on this site? ury never
# imports insights; it only links to its dashboards. When Insights is absent the
# links are dropped (None) and callers surface INSTALL_HINT instead of a 404.
# Pure helpers take plain values so they can be unit-tested without a Frappe site.

import frappe

INSIGHTS_APP = "insights"

# Single registry of Insights dashboard ids (key -> id). Add new dashboards here only.
DASHBOARDS = {
	"owner": "58aq35af28",
}

INSTALL_HINT = {
	"title": "Install Frappe Insights",
	"cmd": "bench get-app insights && bench --site <site> install-app insights",
	"doc": "https://docs.frappe.io/insights",
}


# ---------------------------------------------------------------- pure helpers


def installed_from_apps(apps):
	"""True when `insights` is in the given installed-app list (testable seam)."""
	return INSIGHTS_APP in (apps or [])


def url_for(key, installed):
	"""Dashboard URL for `key`, or None when Insights is missing or the key is unknown."""
	dashboard_id = DASHBOARDS.get(key)
	if not installed or not dashboard_id:
		return None
	return f"/insights/dashboards/{dashboard_id}"


def install_hint_for(site=None):
	"""Copy of INSTALL_HINT with the `<site>` placeholder replaced by the real site name (when known)."""
	hint = dict(INSTALL_HINT)
	if site:
		hint["cmd"] = hint["cmd"].replace("<site>", str(site))
	return hint


def insights_flag(installed, site=None):
	"""Payload flag for clients: {installed, install_hint}; hint only when absent."""
	return {"installed": bool(installed), "install_hint": None if installed else install_hint_for(site)}


# ---------------------------------------------------------------- frappe layer


def insights_installed():
	return installed_from_apps(frappe.get_installed_apps())


def dashboard_url(key="owner"):
	return url_for(key, insights_installed())
