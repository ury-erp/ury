# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# boot_session hook: tell the desk whether Frappe Insights is installed so
# public/js/insights_guard.js can hide dead /insights/ shortcuts. Never raises.

import frappe

from ury.ury.api.analytics_env import insights_flag, insights_installed


def build_flag(installed, is_system_manager):
	flag = insights_flag(installed)
	if not is_system_manager:
		flag["install_hint"] = None
	return flag


def boot_session(bootinfo):
	try:
		installed = insights_installed()
		is_sm = "System Manager" in (frappe.get_roles() or [])
		bootinfo.ury_insights = build_flag(installed, is_sm)
	except Exception:
		bootinfo.ury_insights = {"installed": True, "install_hint": None}  # fail open: change nothing
