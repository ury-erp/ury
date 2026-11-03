# Copyright (c) 2026, Safwan Erooth and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

CALL_MAX_SECONDS_MIN = 30
CALL_MAX_SECONDS_MAX = 900


def check_call_max_seconds(value):
	"""Raise unless value is None/0 (default applies) or within 30..900."""
	if value in (None, "", 0):
		return
	if not CALL_MAX_SECONDS_MIN <= int(value) <= CALL_MAX_SECONDS_MAX:
		frappe.throw(
			_("Call Max Seconds must be between {0} and {1}").format(CALL_MAX_SECONDS_MIN, CALL_MAX_SECONDS_MAX)
		)


class URYChairmanSettings(Document):
	def validate(self):
		check_call_max_seconds(self.call_max_seconds)
