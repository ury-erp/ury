"""Report (never rewrite) every active PRE_PRODUCED `URY Item Production
Configuration` whose `direct_retail_warehouse` differs from its
department's `department_warehouse`.

D13 makes the Department Warehouse the PRE_PRODUCED stock authority.
`direct_retail_warehouse` is for DIRECT_RETAIL goods only (bought in, not
prepared) -- from this release on, PRE_PRODUCED availability, batch
manufacture and the Production Plan path all resolve a PRE_PRODUCED
item's finished-goods warehouse from its department, never from
`direct_retail_warehouse` (see `ury_production_context.resolve_production_
context`, `ury_batch_manufacture_service.start_batch`,
`ury_production_validation.validate_item_production_configuration`).

Sizing on `ury.localhost` (2026-09-21) found 7 active PRE_PRODUCED
configurations, all with `direct_retail_warehouse` blank, none differing
from their department warehouse -- so on that site this is a pure bug fix
with no stock stranded anywhere. Other sites may not be so clean: a row
whose `direct_retail_warehouse` differs from its department warehouse may
have real stock sitting in the warehouse that is about to stop being
authoritative for it. Deciding what to do with that stock (transfer it,
leave it, write it off) is a product decision, not a technical one, so
this patch only reports every such row -- it must never rewrite a
`direct_retail_warehouse` value itself.
"""

import frappe


def execute():
	rows = frappe.db.sql(
		"""
		SELECT
			config.name AS configuration,
			config.item,
			config.branch,
			config.department,
			config.direct_retail_warehouse,
			department.department_warehouse
		FROM `tabURY Item Production Configuration` config
		LEFT JOIN `tabURY Production Department` department
			ON department.name = config.department
		WHERE config.active = 1
			AND config.production_policy = 'PRE_PRODUCED'
			AND config.direct_retail_warehouse IS NOT NULL
			AND config.direct_retail_warehouse != ''
		""",
		as_dict=True,
	)

	mismatched = [
		row
		for row in rows
		if (row.get("direct_retail_warehouse") or None) != (row.get("department_warehouse") or None)
	]

	logger = frappe.logger("ury", allow_site=frappe.local.site)

	if not mismatched:
		message = (
			"D13 PRE_PRODUCED stock-authority check: no active PRE_PRODUCED "
			"configuration has a direct_retail_warehouse differing from its "
			"department warehouse. No migration required."
		)
		logger.info(message)
		print(message)
		return

	message = (
		"D13 PRE_PRODUCED stock-authority check: {0} active PRE_PRODUCED "
		"configuration(s) have a direct_retail_warehouse that differs from "
		"their department warehouse. PRE_PRODUCED availability/production now "
		"reads the department warehouse for these items; the rows below may "
		"have stock stranded in direct_retail_warehouse that needs a manual "
		"decision. No values were changed by this patch."
	).format(len(mismatched))
	logger.warning(message)
	print(message)

	for row in mismatched:
		detail = (
			"  configuration={configuration} item={item} branch={branch} "
			"department={department} direct_retail_warehouse={direct_retail_warehouse} "
			"department_warehouse={department_warehouse}"
		).format(
			configuration=row.get("configuration"),
			item=row.get("item"),
			branch=row.get("branch"),
			department=row.get("department"),
			direct_retail_warehouse=row.get("direct_retail_warehouse"),
			department_warehouse=row.get("department_warehouse"),
		)
		logger.warning(detail)
		print(detail)
