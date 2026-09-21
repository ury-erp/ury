"""Walk one submitted BOM's structure into a flat, normalized node list.

This module is a pure, read-only structural reader over ERPNext's `BOM` and
`BOM Item` data. It performs no writes and knows nothing about URY semantics:
no branch, no Production Department, no production policy, no warehouses, no
stock, no Production Plans, no Material Requests. It must not import
`ury_production_context`, `ury_availability`, `ury_production_settings`, or
any URY doctype. Callers that need any of that (department targets,
PRE_PRODUCED stop points, branch-scoped configuration) build it on top of the
plain structure this module returns -- see `ury_production_target_compiler`.

One entry point:

- `walk_bom_tree(bom_no, required_qty, company=None)`: given a submitted
  `bom_no` and the quantity of that BOM's own output item required, returns a
  flat list of every descendant component, scaled by `BOM.quantity` at every
  level (a BOM whose `quantity` is not 1 is scaled correctly, not treated as
  if it always produces exactly 1 unit per run), recursing into nested BOMs
  through each `BOM Item` row's own pinned `bom_no` field.

## Why only `bom_no`, never `item_code`

`ury_bom_compiler.compile_bom_vector` takes an `item_code` and resolves that
item's currently-active BOM via `_resolve_active_bom`. That is the right
behaviour for its callers (live availability), but it is exactly the wrong
behaviour here: the Sales Plan snapshot pins a specific `bom_no` at approval
time, and this service must never silently re-resolve a newer active BOM out
from under that snapshot. Accepting only a `bom_no`, with no item-code entry
point at all, makes that structurally impossible rather than a convention to
remember. This module has no `_resolve_active_bom` equivalent.

For the same reason, a nested sub-assembly's BOM is never looked up by
resolving "the active BOM for this item". It is read from the parent `BOM
Item` row's own `bom_no` field -- the specific sub-assembly BOM the parent
BOM's author pinned -- and that pinned BOM is itself required to be
submitted, or the walk fails loudly.

## Node shape

Each entry in the returned list:

    {
        "item_code": "BIRYANI-BASE",
        "bom_no": "BOM-BIRYANI-BASE-001",  # this item's own BOM, or None if it has none
        "required_qty": 20,
        "stock_uom": "Kg",
        "parent_item": "CHICKEN-BIRYANI",
        "level": 1,
        "path": ["CHICKEN-BIRYANI", "BIRYANI-BASE"],
        "has_bom": True,
    }

`path` is the chain of item codes from the root BOM's own output item down to
this node. `level` starts at 1 for the root BOM's direct components; a node
two levels deep (a component of a component) is `level: 2`, and so on. The
root BOM's own output item never appears as a node in the list -- the list
holds only what that item (or its descendants) consume.

`has_bom` is False for a leaf: a component with no `bom_no` pinned on its
`BOM Item` row. `bom_no` is None in that case.

Rows are read in each BOM's own `idx` order, so identical inputs against
identical BOM data always produce an identical, identically-ordered list.
"""

import frappe
from frappe import _


BOM_DOCTYPE = "BOM"
BOM_ITEM_DOCTYPE = "BOM Item"


def walk_bom_tree(bom_no, required_qty, company=None):
	"""Walk `bom_no`'s structure, scaled to `required_qty` of its own output.

	Returns a flat list of node dicts (see module docstring for the shape),
	one per descendant component across every level. Recursion follows only
	each `BOM Item` row's own pinned `bom_no` field -- never a fresh
	active-BOM lookup by item code.

	Raises `frappe.ValidationError` (via `frappe.throw`) when:
		- `bom_no` is not given, or `required_qty` is not greater than zero.
		- `bom_no`, or any nested BOM reached while walking, does not exist,
		  is not submitted (`docstatus != 1`), or (when `company` is given)
		  belongs to a different company.
		- the walk would recurse into a BOM it has already opened on the
		  current path (a circular reference); the error names the offending
		  `path`.
	"""
	if not bom_no:
		frappe.throw(_("A BOM number is required"), frappe.ValidationError)
	if required_qty is None or required_qty <= 0:
		frappe.throw(_("Required quantity must be greater than zero"), frappe.ValidationError)

	root_bom = _get_submitted_bom(bom_no, company)

	return _explode_bom(
		bom_no=bom_no,
		bom=root_bom,
		needed_qty=required_qty,
		parent_item=root_bom.item,
		level=1,
		path=[root_bom.item],
		visited_boms={bom_no},
		company=company,
	)


# --- internal helpers -------------------------------------------------------


def _get_submitted_bom(bom_no, company):
	"""Fetch `bom_no`, failing loudly unless it exists, is submitted, and matches `company`."""
	bom = frappe.db.get_value(
		BOM_DOCTYPE, bom_no, ["item", "quantity", "docstatus", "company"], as_dict=True
	)
	if not bom:
		frappe.throw(_("BOM {0} does not exist").format(bom_no), frappe.ValidationError)
	if bom.docstatus != 1:
		frappe.throw(
			_("BOM {0} is not submitted").format(bom_no),
			frappe.ValidationError,
		)
	if company and bom.company and bom.company != company:
		frappe.throw(
			_("BOM {0} belongs to company {1}, not {2}").format(bom_no, bom.company, company),
			frappe.ValidationError,
		)
	return bom


def _explode_bom(bom_no, bom, needed_qty, parent_item, level, path, visited_boms, company):
	"""Return the flat node list for everything `bom_no` consumes, at `needed_qty` of its output."""
	bom_quantity = bom.quantity or 1

	rows = frappe.get_all(
		BOM_ITEM_DOCTYPE,
		filters={"parent": bom_no, "parenttype": BOM_DOCTYPE, "docstatus": ("<", 2)},
		fields=["item_code", "stock_qty", "stock_uom", "bom_no"],
		order_by="idx asc",
	)

	nodes = []
	for row in rows:
		row_qty = ((row.stock_qty or 0) / bom_quantity) * needed_qty
		child_path = path + [row.item_code]
		child_bom_no = row.bom_no
		has_bom = bool(child_bom_no)

		nodes.append(
			{
				"item_code": row.item_code,
				"bom_no": child_bom_no or None,
				"required_qty": row_qty,
				"stock_uom": row.stock_uom,
				"parent_item": parent_item,
				"level": level,
				"path": child_path,
				"has_bom": has_bom,
			}
		)

		if not has_bom:
			continue

		if child_bom_no in visited_boms:
			frappe.throw(
				_("Circular BOM reference detected at {0} (path: {1})").format(
					child_bom_no, " -> ".join(child_path)
				),
				frappe.ValidationError,
			)

		child_bom = _get_submitted_bom(child_bom_no, company)
		nodes.extend(
			_explode_bom(
				bom_no=child_bom_no,
				bom=child_bom,
				needed_qty=row_qty,
				parent_item=row.item_code,
				level=level + 1,
				path=child_path,
				visited_boms=visited_boms | {child_bom_no},
				company=company,
			)
		)

	return nodes
