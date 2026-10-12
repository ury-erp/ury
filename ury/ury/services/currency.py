"""Resolve persisted currency configuration without a country-specific fallback."""

import frappe
from frappe import _
from frappe.geo.country_info import get_country_info


def get_default_currency(company=None):
	company = company or frappe.defaults.get_user_default("Company")
	if company:
		currency = frappe.db.get_value("Company", company, "default_currency")
		if currency:
			return currency

	currency = frappe.defaults.get_global_default("currency")
	if currency:
		return currency

	country = frappe.db.get_single_value("Global Defaults", "country")
	if country:
		currency = get_country_info(country).get("currency")
		if currency:
			return currency

	frappe.throw(_("Configure the company currency before continuing."))
