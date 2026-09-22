"""Shared helper: which items are "used at a branch" for yield-tracking scope.

Both ``yield_check_reminders.get_due_yield_checks`` and
``ury_yield_variance.get_yield_check_compliance`` need to restrict the
yield-tracked-item universe to items that are actually relevant to a given
branch, instead of flooding every branch's report with every yield-tracked
item that exists anywhere in the system (the original, too-broad behaviour)
or (a since-corrected bug) filtering directly on
``URY Item Production Configuration`` (IPC), which can never intersect with
yield-tracked items at all.

Per docs/yield-tracking.md ("Why `Item`, not `BOM Item` or `URY Item
Production Configuration` (IPC)"): IPC only has rows for sellable menu items
(kitchen/bar routing) — it never has a row for a raw ingredient. Yield
tracking is set on raw ingredients (`Item.custom_yield_tracked`), so an IPC
row can never exist directly on a yield-tracked item. Scoping tracked-item
queries to `item in (IPC.item for this branch)` therefore always returns the
empty set — a silent total outage of both the reminder cron and the
compliance report, which is worse than the un-scoped noise it was meant to
fix.

The correct anchor: a branch's IPC rows describe which *sellable* items are
configured for production there, and each of those rows can reference a
`bom` (URY Item Production Configuration.bom). That BOM's component rows
(`BOM Item`) are the raw ingredients actually used to make that sellable
item at that branch. So "items used at this branch" = the union of BOM Item
component codes across every BOM referenced by an active IPC row for that
branch. Intersecting that set with yield-tracked items gives exactly the
raw ingredients relevant to the branch — mirroring the BOM-traversal pattern
in `ury_bom_compiler.get_items_affected_by_component`.
"""

from __future__ import annotations

import frappe

PRODUCTION_CONFIG_DOCTYPE = "URY Item Production Configuration"
BOM_ITEM_DOCTYPE = "BOM Item"
BOM_DOCTYPE = "BOM"


def branch_item_codes(branch):
	"""Return the set of item codes actually used at `branch`, or None.

	Returns:
		None: no branch filter should be applied (branch is falsy) — callers
			  treat this as "use the global/all-branches item set".
		set(): a branch was given but no items resolve to it (no active IPC
			   rows, no BOM on those rows, or no components on those BOMs) —
			   callers treat this as "nothing is in scope for this branch"
			   and should return early rather than fall through to the
			   unscoped/global set.
		set of item codes: the branch was given and resolved to a non-empty
			   set of BOM component items actually used there.

	This None-vs-empty-set distinction matters: collapsing them (e.g.
	returning set() for both "no branch" and "branch with nothing in scope")
	would make an all-branches aggregate call indistinguishable from a
	single branch that legitimately has zero configured production, and a
	caller might either wrongly skip the aggregate or wrongly show every
	item for an empty branch.
	"""
	if not branch:
		return None

	bom_names = frappe.get_all(
		PRODUCTION_CONFIG_DOCTYPE,
		filters={"branch": branch, "active": 1, "bom": ["is", "set"]},
		pluck="bom",
	)
	if not bom_names:
		return set()

	component_items = frappe.get_all(
		BOM_ITEM_DOCTYPE,
		filters={
			"parent": ["in", bom_names],
			"parenttype": BOM_DOCTYPE,
			"docstatus": ["<", 2],
		},
		pluck="item_code",
	)
	return set(component_items)
