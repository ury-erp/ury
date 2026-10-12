# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Which optional URY features are on, and the Desk policy for restaurant
# roles. Read on every request through caches in ury.ury.features and
# ury.ury.controllers.access, which are dropped whenever this is saved.
# Edited from the URY Control Center page; changes are tracked (Version).

import frappe
from frappe import _
from frappe.model.document import Document

from ury.ury import features
from ury.ury.controllers import access


class URYFeatureSettings(Document):
	def validate(self):
		known = {f["key"] for f in features.FEATURES}
		seen = set()
		for row in self.features:
			if row.feature not in known:
				frappe.throw(_("Unknown feature {0}").format(row.feature))
			if row.feature in seen:
				frappe.throw(_("Feature {0} is listed twice").format(row.feature))
			seen.add(row.feature)

		roles = set()
		for row in self.role_access:
			if row.role in roles:
				frappe.throw(_("Role {0} is listed twice").format(row.role))
			roles.add(row.role)
			if row.role in access.ALWAYS_DESK_ROLES:
				frappe.throw(_("{0} always keeps Desk access and cannot be restricted").format(row.role))
			landing = (row.landing or "").strip()
			if landing:
				safe = access.safe_redirect(landing)
				if not safe:
					frappe.throw(_("Row {0}: the landing page must be a path on this site, such as /pos").format(row.idx))
				if row.block_desk and access._first_segment(safe) in access.DESK_PAGES:
					frappe.throw(_("Row {0}: a role kept out of Desk cannot land on a Desk page").format(row.idx))
				row.landing = safe
			elif row.block_desk:
				frappe.throw(_("Row {0}: choose where {1} lands, since Desk is blocked for it").format(row.idx, row.role))

	def on_update(self):
		features.clear_cache()
		access.clear_cache()
