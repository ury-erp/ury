# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYSimulationSlot(Document):
	"""One scheduled invoice-generation slot inside a URY Simulation Run.

	Slots are rows of the run's `slots` table. Lease fields
	(leased_until / lease_owner) let parallel workers claim a slot without
	two of them generating the same invoice.
	"""
