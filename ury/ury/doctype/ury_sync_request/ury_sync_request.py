# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_to_date, now_datetime

# How long a key stays meaningful.
#
# A replay comes from a POS that lost its link and is catching up, which is a
# matter of minutes — hours at the very worst, if a terminal was left closed
# overnight. Seven days is far beyond any real replay window and keeps the
# table from growing without bound on a busy site.
RETENTION_DAYS = 7


class URYSyncRequest(Document):
	pass


def clear_old_sync_requests():
	"""Scheduled: drop keys no replay could still be referring to."""
	frappe.db.delete(
		"URY Sync Request",
		{"creation": ["<", add_to_date(now_datetime(), days=-RETENTION_DAYS)]},
	)
