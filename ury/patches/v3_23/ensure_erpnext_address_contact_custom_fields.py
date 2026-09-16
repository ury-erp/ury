"""Ensure ERPNext's Address/Contact custom fields exist (notably
`Contact.is_billing_contact`), regardless of whether erpnext's own
`after_install` hook created them on this site.

CI job provisioning (and some site-restore/clone flows) has left these
fields missing even though `erpnext.setup.install.after_install` normally
creates them, causing query failures such as:

    Unknown column 'tabContact.is_billing_contact' in 'WHERE'

`create_address_and_contact_custom_fields()` uses frappe's idempotent
`create_custom_fields` helper, so re-running it here is a safe no-op on
sites where the fields already exist.
"""

import frappe


def execute():
	from erpnext.setup.install import create_address_and_contact_custom_fields

	create_address_and_contact_custom_fields()
	frappe.db.commit()
