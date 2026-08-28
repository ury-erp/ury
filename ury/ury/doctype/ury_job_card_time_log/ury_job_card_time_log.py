# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYJobCardTimeLog(Document):
	"""Storage-only record of one chef/manager-logged time span against a Job
	Card reference (V3-62).

	This is a NEW, standalone, additive doctype -- it is NOT ERPNext's real
	`Job Card` `time_logs` child table (`Job Card Time Log`), and this
	controller never reads from, writes to, or otherwise touches that table
	or the referenced `Job Card` document itself. `job_card_ref` is stored
	as a plain reference for traceability only.

	All validation (time ordering, actor permission/role checks, fail-closed
	behavior on ambiguous scope) lives in
	`ury.ury.api.ury_job_card_controls.log_chef_time` so it can be unit
	tested without a live site, mirroring V3-53's `URY KOT Execution`
	controller pattern of keeping business rules in a separate, testable
	service module rather than in `Document.validate()`/hooks here.
	"""

	pass
