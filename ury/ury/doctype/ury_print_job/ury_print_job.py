# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYPrintJob(Document):
	"""Queue entry for printing through a branch's QZ Tray station.

	Written by the server (kitchen tickets on submit, bills on reprint) and
	claimed atomically by whichever POS screen at the branch is running QZ —
	see ury.ury.api.qz_printing.
	"""

	pass
