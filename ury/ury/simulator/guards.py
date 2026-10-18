# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe

DISABLED_MESSAGE = (
	"URY UAT Simulator is disabled. Set allow_uat_simulator: true in site_config.json"
)

_PRODUCTION_CONFIG_KEYS = ("production", "is_production")

# Simulator runs for a given (business_date, branch) are single-flight: only
# one non-terminal run may exist per scope. Terminal statuses never block a
# new run for the same scope.
TERMINAL_RUN_STATUSES = ("Failed", "Closing Failed", "Completed")

# Local-only site suffixes that are treated as inherently non-production when
# developer_mode is on. Anything else must be listed explicitly in
# uat_simulator_allowed_sites.
_LOCAL_SITE_SUFFIXES = (".localhost", ".local")
_LOCAL_SITE_EXACT = "uryv16.localhost"


def assert_uat_simulator_authorized():
	"""Fail closed unless the UAT simulator is explicitly enabled for THIS site.

	Raises frappe.ValidationError on the first violated check; returns None
	when every check passes. `is_uat_simulator_enabled()` is the boolean
	wrapper for callers that must not throw.
	"""
	if frappe.conf.get("allow_uat_simulator") is not True:
		raise frappe.ValidationError(frappe._(DISABLED_MESSAGE))

	_check_site_allowed()
	_check_not_production()


def is_uat_simulator_enabled() -> bool:
	"""True iff every guard in assert_uat_simulator_authorised() passes.

	Never throws -- intended for UI affordances (hide simulator pages/actions)
	where a hard error would be worse than a silent disable.
	"""
	try:
		assert_uat_simulator_authorized()
	except frappe.ValidationError:
		return False
	return True


def _check_site_allowed():
	site = frappe.local.site
	allowed_sites = frappe.conf.get("uat_simulator_allowed_sites") or []

	if site in allowed_sites:
		return

	developer_mode = bool(frappe.conf.get("developer_mode"))
	is_local_site = site == _LOCAL_SITE_EXACT or site.endswith(_LOCAL_SITE_SUFFIXES)
	if developer_mode and is_local_site:
		return

	raise frappe.ValidationError(
		frappe._(
			"URY UAT Simulator is not authorized for site {0}. Add it to "
			"uat_simulator_allowed_sites in site_config.json, or run on a "
			".localhost/.local site with developer_mode enabled."
		).format(site)
	)


def _check_not_production():
	for key in _PRODUCTION_CONFIG_KEYS:
		if frappe.conf.get(key):
			raise frappe.ValidationError(
				frappe._(
					"URY UAT Simulator refused to run: site {0} is marked "
					"production ({1}: true) in site_config.json."
				).format(frappe.local.site, key)
			)
