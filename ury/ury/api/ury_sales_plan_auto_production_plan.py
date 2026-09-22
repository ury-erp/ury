# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Auto-create every department Production Plan when a ``URY Sales Plan`` is
locked for production.

Gated behind ``ury.ury.api.ury_production_settings.auto_production_plan_enabled``
(default off). When enabled, this is called from ``URYSalesPlan``'s
``before_update_after_submit`` hook on the ``Approved`` -> ``Locked for
Production`` transition (D14) and shares the same locked, idempotent
``create_or_get_department_production_plans`` the manual "Create Production
Plans" action uses -- the two routes cannot diverge or double-create.

Unlike the old (pre-D14) ``maybe_create_production_plan_on_approval``, this
function does **not** swallow its own failures. With the toggle on, the
manager has asked for Production Plans as part of locking the Sales Plan, so
a creation failure must abort the Lock transition -- leaving the plan
Approved -- rather than leave a locked, un-editable Sales Plan with no
Production Plans and nothing on screen to explain it. The caller
(``URYSalesPlan.before_update_after_submit``) does not catch this either.
"""

from ury.ury.api.ury_production_settings import auto_production_plan_enabled
from ury.ury.api.ury_sales_plan_production_plan import create_or_get_department_production_plans


def create_production_plans_on_lock(sales_plan_doc):
	"""Called when ``sales_plan_doc`` transitions into ``Locked for
	Production``. No-op unless auto-creation is enabled. Raises on any
	failure -- see module docstring.
	"""
	if not auto_production_plan_enabled():
		return

	create_or_get_department_production_plans(sales_plan_doc, submit=True)
