# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# What one sale took off the shelves, according to its recipes.
#
# One log per submitted POS Invoice: the ingredients its dishes used, worked
# out from the recipes in force at the moment of sale, and the Material Issue
# Stock Entry that took them out of stock. The log exists so that a deduction
# that failed (not enough oranges recorded in the bar) is visible and can be
# retried, rather than lost — the sale itself is never blocked by it.
# Created and updated only by ury.ury.api.consumption.

from frappe.model.document import Document


class URYConsumptionLog(Document):
	pass
