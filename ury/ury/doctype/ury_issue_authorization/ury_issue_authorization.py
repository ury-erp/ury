# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYIssueAuthorization(Document):
	"""Storage-only record of a material issue authorization amount.

	Business rules live in ury.ury.api.ury_issue_authorization so they can be
	unit tested without a live site. This controller intentionally does not
	recompute or override anything the API module already validated.
	"""

	pass
