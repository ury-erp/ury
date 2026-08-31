# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class URYFeatureFlags(Document):
	"""Single doctype holding operational kill-switches.

	V3-73: `pos_stock_authority_v2` gates whether POS Invoice creation routes
	stock authority through the new fulfilment services (V3-71/V3-72) instead
	of ERPNext's native `update_stock=1` posting. It defaults to 0/unchecked
	and must only ever be flipped by a deliberate, out-of-band admin action
	in a live deployment -- see
	tracks/sa-v3_nxt/outputs/V3-70-fulfilment-accounting-transition-checklist.md
	for the evidence bar that must be met before that happens anywhere real.
	No code path in this app may set this value; it is read-only from the
	application's perspective (see `ury_feature_flags.py` in `api/`).
	"""

	pass
