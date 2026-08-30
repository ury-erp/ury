# Copyright (c) 2024
# License: GNU General Public License v3

import frappe
from frappe import _
from frappe.utils import cint
from ury.setup.demo import process_masters, process_transactions
from ury.setup.pos_demo import generate_pos_demo


def get_setup_stages(args=None):
	"""URY stages run only when the wizard asks for demo data.

	Stages are synchronous so Frappe's setup_task progress ticks after each
	one actually finishes, and demo records land on the company ERPNext just
	created (args.company_name) rather than a second "(Demo)" company.
	"""
	if not _wants_ury_demo(args):
		return []

	return [
		{
			"status": _("Loading restaurant demo masters"),
			"fail_msg": _("Failed to load restaurant demo masters"),
			"tasks": [
				{
					"fn": load_demo_masters,
					"args": args,
					"fail_msg": _("Failed to load restaurant demo masters"),
				}
			],
		},
		{
			"status": _("Creating demo transactions"),
			"fail_msg": _("Failed to create demo transactions"),
			"tasks": [
				{
					"fn": load_demo_transactions,
					"args": args,
					"fail_msg": _("Failed to create demo transactions"),
				}
			],
		},
		{
			"status": _("Setting up POS demo"),
			"fail_msg": _("Failed to set up POS demo"),
			"tasks": [
				{
					"fn": load_demo_pos,
					"args": args,
					"fail_msg": _("Failed to set up POS demo"),
				}
			],
		},
	]


def _wants_ury_demo(args):
	if not args:
		return False
	value = args.get("setup_ury_demo")
	if value in (True, "true", "True"):
		return True
	return bool(cint(value))


def _prepare_demo_company(args=None):
	company = (args or {}).get("company_name")
	if not company or not frappe.db.exists("Company", company):
		companies = frappe.get_all("Company", pluck="name", limit=1)
		if not companies:
			frappe.throw(_("No company found for URY demo data"))
		company = companies[0]

	frappe.defaults.set_user_default("Company", company)
	frappe.db.set_default("company", company)
	frappe.db.set_default("demo_data_type", "ury")
	frappe.db.set_single_value("Global Defaults", "demo_company", company)
	return company


def _cleanup_demo_flags():
	frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 0)
	frappe.flags.mute_messages = False


def load_demo_masters(args=None):
	company = _prepare_demo_company(args)
	frappe.flags.mute_messages = True
	frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
	try:
		process_masters(company)
	except Exception:
		_cleanup_demo_flags()
		raise


def load_demo_transactions(args=None):
	company = _prepare_demo_company(args)
	try:
		process_transactions(company)
	except Exception:
		_cleanup_demo_flags()
		raise


def load_demo_pos(args=None):
	_prepare_demo_company(args)
	try:
		generate_pos_demo()
		admin = frappe.get_doc("User", "Administrator")
		admin.add_roles("URY Cashier", "URY Captain", "URY Manager")
		frappe.cache.delete_keys("bootinfo")
		if hasattr(frappe.local, "message_log"):
			frappe.local.message_log = []
	finally:
		_cleanup_demo_flags()
