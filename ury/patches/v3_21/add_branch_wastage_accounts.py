"""Add the Branch wastage-posting account/cost-center custom fields.

`ury.ury.api.ury_wastage.resolve_posting_accounts()` reads four explicitly
named `Branch` fields -- `wastage_expense_account`, `damage_expense_account`,
`staff_meal_expense_account` and `wastage_cost_center` -- when a
`URY Issue Wastage` row is approved with a posting disposition. They are
explicit configuration on purpose: v2/grillax resolved the account with
`Account.name LIKE '%Wastage%'`, a name-matching heuristic that silently picks
the wrong account, and that is deliberately not ported.

`create_custom_fields` only runs automatically via `after_install`, which does
not touch existing sites, so this patch applies the same definitions
idempotently on `bench migrate`. The fields are intentionally left EMPTY: an
unset account makes approval fail closed with a message naming the branch and
the field, which is the correct behaviour. Guessing a default here would
reintroduce exactly the inference this design rejects.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	fields = get_custom_fields().get("Branch")
	if not fields:
		return
	create_custom_fields({"Branch": fields}, update=True)
