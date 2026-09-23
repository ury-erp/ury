"""Compile an approved Sales Plan snapshot into per-department production targets.

This is the middle layer of the three-layer architecture described in
``ongoing/production-plan-automation/PLAN.md`` ("Architecture: three separate
layers"):

    BOM Tree Service (ury_bom_tree.walk_bom_tree)
        | structural quantities, no URY semantics
    Production Target Compiler (this module)
        | department targets, dependency order, component vectors
    Readiness Engine (ury_production_readiness, a later agent)
        | purchase, transfer and stock blockers

One entry point:

    compile_production_targets(sales_plan_snapshot, branch, company=None)

``branch`` is mandatory, never optional, never defaulted (D3) -- branch
scoping lives here, and only here. This module never re-resolves a newer
active BOM: every ``walk_bom_tree`` call is seeded with a ``bom_no`` that was
either pinned on the frozen Sales Plan snapshot row itself (for a snapshot
row's own BOM) or read verbatim off a ``BOM Item`` row returned by
``walk_bom_tree`` (for a nested sub-assembly's own BOM) -- see ``ury_bom_tree``'s
own docstring for why that is the only safe source of a "pinned" BOM.

## Return shape

    departments, blockers = compile_production_targets(snapshot, branch, company)

``departments`` is a dict keyed by department name:

    {
        "Main Kitchen": {
            "department": "Main Kitchen",
            "warehouse": "Main Kitchen - WH",          # the Department Warehouse (D13)
            "targets": [ ... ],                          # everything with a real Production Plan Item row
            "external_receipt_targets": [ ... ],          # sourcing_mode == EXTERNAL_RECEIPT; NEVER build a Work Order for these
        },
        ...
    }

Both ``targets`` and ``external_receipt_targets`` are lists of target dicts,
already ordered dependency-first within the list (a nested PRE_PRODUCED
dependency appears before the target that consumes it -- see
``_order_by_dependency``). Each target dict:

    {
        "item_code": "BIRYANI-BASE",
        "bom_no": "BOM-BIRYANI-BASE-001",     # the BOM pinned for THIS target; never re-resolved
        "required_qty": 20.0,
        "stock_uom": "Kg",
        "department": "Main Kitchen",
        "warehouse": "Main Kitchen - WH",     # Department Warehouse, D13
        "production_unit": "Main Kitchen Unit",
        "sourcing_mode": "IN_HOUSE",          # or "EXTERNAL_RECEIPT"
        "skip_work_order": False,              # True only for a MADE_TO_ORDER row's own
                                                 # target -- see "MADE_TO_ORDER items" below
        "component_vector": [                  # D1: exactly what the Work Order's
            {"item_code": "Rice", "required_qty": 4.0, "stock_uom": "Kg"},
            {"item_code": "Masala", "required_qty": 0.8, "stock_uom": "Kg"},
        ],                                      # required_items must contain, verbatim
        "raw_material_vector": [                # what the READINESS engine wants instead
            {"item_code": "Rice", "required_qty": 4.0, "stock_uom": "Kg"},
        ],                                      # component_vector minus any PRE_PRODUCED
                                                 # node -- see "Two vectors, two purposes"
        "depends_on": ["OTHER-PRE-PRODUCED-ITEM"],  # nested PRE_PRODUCED items (same
                                                      # department) this target's own
                                                      # component vector produces as a
                                                      # line item -- i.e. targets that
                                                      # must be produced first
        "sources": [                            # provenance for diagnostics only
            {"parent_item": None, "required_qty": 20.0, "source_type": "direct_plan_row"},
        ],
    }

## Two vectors, two purposes

A target's BOM walk produces two vectors, not one, and they are read by two
different consumers for two different reasons.

``component_vector`` is unfiltered: raw materials, DIRECT_RETAIL components,
and any PRE_PRODUCED node the walk touched, as an item in its own right (D1).
This is exactly what the target's own Work Order ``required_items`` must
contain, because that Work Order genuinely consumes a PRE_PRODUCED
sub-assembly as an input.

``raw_material_vector`` excludes every PRE_PRODUCED node -- whether it went on
to become its own nested target, or was blocked as a cross-department
misconfiguration (D7) and became neither. This is what the READINESS ENGINE
must read instead: a PRE_PRODUCED sub-assembly is already its own separate
target with its own separate demand, Store never stocks it directly (it is an
in-house-manufactured intermediate, not a purchasable raw material), and
counting it again here would generate a Purchase Material Request asking a
supplier for something nobody sells. This is a real, confirmed defect if
``component_vector`` is used for readiness instead -- verified directly: a
target whose BOM contains a nested PRE_PRODUCED sub-assembly produces a
spurious Store/Purchase shortage for that sub-assembly's own item code unless
the readiness engine reads ``raw_material_vector``.

## MADE_TO_ORDER items

A MADE_TO_ORDER row IS a target (unlike an earlier revision of this module,
which excluded it from ``targets`` and routed its raw materials through a
separate mechanism -- reverted; see below). It gets a real Production Plan
Item row, so ERPNext's own mandatory ``po_items`` constraint is satisfied
without inventing a placeholder row, and its own raw materials reach the
readiness engine and the Purchase/Transfer Material Requests through the
exact same ``raw_material_vector`` path every other target already uses --
no separate concept needed.

``skip_work_order`` is what keeps this safe: the executor
(``ury_production_plan_auto_work_order.execute_department_targets``) never
builds a Work Order for a target with this flag set, and
``ury_work_order_hooks`` refuses one server-side for any Work Order whose
Production Plan Item row carries the corresponding
``custom_ury_no_work_order`` flag -- regardless of who tries to create it,
including ERPNext's own native "Create Work Order" button, which has no
knowledge of this module's rules and would otherwise happily offer to build
one. An MTO item is produced only from the actual order, never in advance;
this is the invariant the whole target-selection design exists to hold, so it
is enforced at the Work Order layer itself, not only by omission from a list.

A nested PRE_PRODUCED dependency under an MTO row (e.g. Biryani Base under
Chicken Biryani) is discovered and ordered exactly the same way it is under a
direct PRE_PRODUCED row -- the MTO row's own ``_expand()`` call is now the
same code path, not a special case.

**Superseded design, kept here as a pointer for anyone re-deriving this:**
an earlier revision gave MADE_TO_ORDER rows a separate ``raw_material_demand``
bucket key, since they were not targets and had no ``po_items`` row to attach
to. That failed against ERPNext directly: ``Production Plan.po_items`` is a
mandatory child table (``reqd: 1``), so a department whose only demand was
raw materials could never actually insert a Production Plan, aborting the
Lock transition for the whole Sales Plan the moment any department had no
PRE_PRODUCED item at all. Confirmed by inserting one directly:
``MandatoryError: [Production Plan, ...]: po_items``. Making the MTO row
itself a real target sidesteps this because it always gives ``po_items`` a
row when the department has any content at all. ``EXTERNAL_RECEIPT``-only
departments still have this exact problem, unresolved -- ``external_receipt_targets``
still never reaches ``po_items`` either -- and are not fixed by this change.

``blockers`` is a flat list of dicts, each shaped:

    {"type": "<blocker_type>", "item_code": ..., "message": "...", ...}

See the ``_*_blocker`` helpers below for the exact fields each ``type`` carries.
A blocked item never becomes a target (D7): it is reported, not silently
dropped and not silently turned into a target under the wrong department.

## Target selection rules (see PLAN.md, "Production target rules")

    PRE_PRODUCED node        -> target; STOP explosion of its own parent here
    MADE_TO_ORDER finished   -> no target; traverse its BOM for PRE_PRODUCED assemblies
    Unstocked intermediate   -> no target; continue traversal through it
    Raw material             -> no target
    DIRECT_RETAIL            -> no target; STOP (it has no BOM to continue through anyway)

## Aggregation and dependency ordering

Repeated demand for the same (department, item_code, bom_no, warehouse) is
summed into one target, whether it arrives directly from the Sales Plan
snapshot, from one MADE_TO_ORDER row's BOM, or as a nested dependency of
another PRE_PRODUCED target's own BOM (D1's "stop at nested PRE_PRODUCED"
rule applies recursively -- a PRE_PRODUCED target's own component vector can
itself contain a deeper PRE_PRODUCED dependency, which becomes its own
target, aggregated the same way). The same item in two different departments
is never merged -- department is part of the aggregation key.

Internally this aggregation is modelled as a small directed graph: every
contribution (a Sales Plan row, an MTO row's BOM walk, or a target's own BOM
walk) is an *edge* from a source to a target key, carrying a quantity. A
target's ``required_qty`` is always the sum of its current inbound edges.
Expanding a target (walking its own BOM) fully replaces the set of edges it
emits, so re-expanding it after a later-arriving contribution raises its
total never double-counts what it had already contributed downstream. This
converges for any BOM tree with no target-level cycles; see
``_MAX_EXPANSION_ROUNDS`` for the cycle guard.

## Branch scoping (D3)

Every nested item discovered while walking a BOM is classified by calling
``ury_production_context.resolve_production_context(item_code, branch,
company)``, which filters ``URY Item Production Configuration`` rows by
``branch`` (and, if given, cross-checks ``company``) before returning
anything. A configuration belonging to a different branch simply does not
match that filter and ``resolve_production_context`` returns ``None`` --
which this module treats exactly like "no configuration at all" (an
unstocked intermediate, if it has a BOM, or a raw material leaf if it does
not). It can never *stop* traversal, because traversal never even sees it.

## Same-department constraint (D7)

When a PRE_PRODUCED node is found nested under a MADE_TO_ORDER row (or under
another PRE_PRODUCED target's own BOM) and its configured department differs
from the department that is consuming it, this module emits a
``cross_department_dependency`` blocker instead of a target. This is
deliberately worded as an unsupported configuration for this release, not as
a data error -- see ``_cross_department_blocker``.

## EXTERNAL_RECEIPT routing

``sourcing_mode`` is a property of the production configuration, independent
of ``production_policy`` -- an EXTERNAL_RECEIPT PRE_PRODUCED item is still a
PRE_PRODUCED item (it still stops explosion the same way, wherever it is
found as a node in someone else's BOM walk) but it never has its own BOM
walked for a component vector or nested dependencies, and it is placed in
``external_receipt_targets`` rather than ``targets`` so that a Work Order is
never built for it (D1/Agent 6/Agent 7 must never see it mixed into
``targets``).

## Failure handling

A malformed snapshot row -- a PRE_PRODUCED or MADE_TO_ORDER row with no
pinned BOM, or no department for a PRE_PRODUCED row -- is a defect in the
frozen snapshot itself (it should never happen for a well-formed approval)
and this module fails loudly (``frappe.throw``) rather than silently
skipping it.

Everything that can legitimately go wrong *while walking* a BOM --
``walk_bom_tree`` raising because a nested BOM is missing, cancelled, or
part of a circular reference, an ambiguous (more than one active)
production configuration, or a PRE_PRODUCED node with no sub-assembly BOM
pinned on its own ``BOM Item`` row -- is caught and turned into a blocker
scoped to the affected item, so one bad branch of one department's tree
never prevents every other department (or every other target within the
same department) from compiling. This is the same principle PLAN.md states
for execution: "A department that is blocked must never block a department
that is ready."
"""

import json

import frappe
from frappe import _
from frappe.utils import flt

from ury.ury.api.ury_bom_tree import walk_bom_tree
from ury.ury.api.ury_production_context import resolve_production_context


CONFIG_DOCTYPE = "URY Item Production Configuration"
DEPARTMENT_DOCTYPE = "URY Production Department"

POLICY_PRE_PRODUCED = "PRE_PRODUCED"
POLICY_MADE_TO_ORDER = "MADE_TO_ORDER"
POLICY_DIRECT_RETAIL = "DIRECT_RETAIL"

SOURCING_IN_HOUSE = "IN_HOUSE"
SOURCING_EXTERNAL_RECEIPT = "EXTERNAL_RECEIPT"

#: Cycle guard for the target-level expansion fixed point (see module
#: docstring, "Aggregation and dependency ordering"). A genuine BOM tree,
#: however deeply nested, converges in far fewer rounds than this; only a
#: cyclic *target-level* dependency (item A's own BOM ultimately depends on
#: item A again, across the PRE_PRODUCED stop boundary -- something
#: ``walk_bom_tree``'s own per-walk cycle detection cannot see, since each
#: target is walked in a separate call) could exhaust it.
_MAX_EXPANSION_ROUNDS = 2000


def compile_production_targets(sales_plan_snapshot, branch, company=None):
    """Compile ``sales_plan_snapshot`` into per-department production targets.

    ``sales_plan_snapshot`` is the frozen snapshot produced by
    ``ury_sales_plan.freeze_approval_snapshot`` -- either the decoded dict or
    its JSON-encoded string form (both are accepted, matching
    ``ury_production_plan_adapter``'s tolerance for the same value).

    ``branch`` is mandatory and is never defaulted (D3): every branch-scoped
    lookup this module performs uses exactly this value, never the
    snapshot's own ``branch`` field, so a caller can never accidentally
    compile targets against the wrong branch's configurations.

    Returns ``(departments, blockers)`` -- see the module docstring for the
    exact shape of each.
    """
    if not branch:
        frappe.throw(_("branch is required to compile production targets"), frappe.ValidationError)

    snapshot = _decode_snapshot(sales_plan_snapshot)
    rows = [row for row in (snapshot.get("items") or []) if flt(row.get("qty")) > 0]

    graph = _TargetGraph()
    blockers = []

    for row in rows:
        _seed_from_snapshot_row(row, branch, company, graph, blockers)

    graph.run_to_fixed_point(branch, company, blockers)

    return graph.build_department_collections(), blockers


# --- snapshot seeding --------------------------------------------------------


def _seed_from_snapshot_row(row, branch, company, graph, blockers):
    item_code = row.get("item_code")
    policy = row.get("production_policy")

    if policy == POLICY_PRE_PRODUCED:
        bom_no = row.get("bom")
        department = row.get("department")
        if not bom_no:
            frappe.throw(
                _("Sales Plan row for item {0} is PRE_PRODUCED but has no pinned BOM").format(item_code),
                frappe.ValidationError,
            )
        if not department:
            frappe.throw(
                _("Sales Plan row for item {0} is PRE_PRODUCED but has no department").format(item_code),
                frappe.ValidationError,
            )
        warehouse = _department_warehouse(department)
        graph.ensure_target(
            department=department,
            item_code=item_code,
            bom_no=bom_no,
            warehouse=warehouse,
            stock_uom=row.get("stock_uom"),
            production_unit=row.get("production_unit"),
            sourcing_mode=_sourcing_mode_for(item_code, branch),
        )
        graph.add_edge(
            parent_key=("plan_row", item_code),
            child_key=graph.key(department, item_code, bom_no, warehouse),
            qty=flt(row.get("qty")),
            parent_item=None,
            source_type="direct_plan_row",
        )
        return

    if policy == POLICY_MADE_TO_ORDER:
        bom_no = row.get("bom")
        department = row.get("department")
        if not bom_no:
            frappe.throw(
                _("Sales Plan row for item {0} is MADE_TO_ORDER but has no pinned BOM").format(item_code),
                frappe.ValidationError,
            )
        if not department:
            frappe.throw(
                _("Sales Plan row for item {0} is MADE_TO_ORDER but has no department").format(item_code),
                frappe.ValidationError,
            )
        # The MTO item itself is a real target now (D-MTO-PO-ITEM), exactly
        # like a direct PRE_PRODUCED row -- same ensure_target/add_edge call,
        # same _expand() walk-and-classify machinery, same nested-PRE_PRODUCED
        # discovery. The one difference is skip_work_order=True: this target
        # gets a real Production Plan Item row (so ERPNext's own mandatory
        # po_items constraint is satisfied, and its own raw materials reach
        # readiness/Material Requests through the normal component-vector
        # path, no separate mechanism needed), but the executor never builds
        # a Work Order for it, and the Work Order hook refuses one server
        # side even if something else -- ERPNext's own native "Create Work
        # Order" button included -- tries. An MTO item is produced only from
        # the actual order, never in advance.
        warehouse = _department_warehouse(department)
        graph.ensure_target(
            department=department,
            item_code=item_code,
            bom_no=bom_no,
            warehouse=warehouse,
            stock_uom=row.get("stock_uom"),
            production_unit=row.get("production_unit"),
            sourcing_mode=SOURCING_IN_HOUSE,
            skip_work_order=True,
        )
        graph.add_edge(
            parent_key=("plan_row", item_code),
            child_key=graph.key(department, item_code, bom_no, warehouse),
            qty=flt(row.get("qty")),
            parent_item=None,
            source_type="direct_plan_row",
        )
        return

    # DIRECT_RETAIL, or any other/unclassified policy: not a target, and
    # nothing further to traverse -- a DIRECT_RETAIL row is never a BOM node
    # with children (URY Production Validation forbids a BOM on a
    # DIRECT_RETAIL configuration), so there is no tree to walk here.


# --- target-level dependency graph -------------------------------------------


class _TargetGraph:
    """Aggregates demand for (department, item_code, bom_no, warehouse) keys.

    See the module docstring's "Aggregation and dependency ordering" section
    for why contributions are modelled as edges rather than as a running sum
    mutated in place.
    """

    def __init__(self):
        self._targets = {}  # key -> target dict (item_code/department/bom_no/warehouse/... base fields)
        self._incoming = {}  # child_key -> {parent_key: {"qty":..., "parent_item":..., "source_type":...}}
        self._outgoing_keys = {}  # parent_key -> set(child_key) this parent currently emits an edge to
        self._dirty = set()

    @staticmethod
    def key(department, item_code, bom_no, warehouse):
        return (department, item_code, bom_no, warehouse)

    def ensure_target(self, department, item_code, bom_no, warehouse, stock_uom=None,
                       production_unit=None, sourcing_mode=None, skip_work_order=False, **_ignored):
        key = self.key(department, item_code, bom_no, warehouse)
        if key not in self._targets:
            self._targets[key] = {
                "item_code": item_code,
                "bom_no": bom_no,
                "department": department,
                "warehouse": warehouse,
                "stock_uom": stock_uom,
                "production_unit": production_unit,
                "sourcing_mode": (sourcing_mode or SOURCING_IN_HOUSE).upper(),
                # True only for a MADE_TO_ORDER row's own target (see
                # _seed_from_snapshot_row). A real Production Plan Item row
                # is still built for it -- see ury_sales_plan_production_plan
                # and the D-MTO-PO-ITEM note there -- but the executor never
                # builds a Work Order for it, and ury_work_order_hooks
                # refuses one server-side regardless of who tries.
                "skip_work_order": bool(skip_work_order),
                "component_vector": [],
                "raw_material_vector": [],
                "depends_on": [],
            }
        self._dirty.add(key)
        return key

    def add_edge(self, parent_key, child_key, qty, parent_item, source_type):
        self._incoming.setdefault(child_key, {})[parent_key] = {
            "qty": qty,
            "parent_item": parent_item,
            "source_type": source_type,
        }
        self._outgoing_keys.setdefault(parent_key, set()).add(child_key)
        self._dirty.add(child_key)

    def _clear_outgoing(self, parent_key):
        for child_key in self._outgoing_keys.get(parent_key, set()):
            edges = self._incoming.get(child_key)
            if edges and parent_key in edges:
                del edges[parent_key]
                self._dirty.add(child_key)
        self._outgoing_keys[parent_key] = set()

    def required_qty(self, key):
        return sum(edge["qty"] for edge in self._incoming.get(key, {}).values())

    def sources(self, key):
        return [
            {
                "parent_item": edge["parent_item"],
                "required_qty": edge["qty"],
                "source_type": edge["source_type"],
            }
            for edge in self._incoming.get(key, {}).values()
        ]

    def run_to_fixed_point(self, branch, company, blockers):
        rounds = 0
        while self._dirty:
            rounds += 1
            if rounds > _MAX_EXPANSION_ROUNDS:
                for key in self._dirty:
                    blockers.append(_cyclic_dependency_blocker(key))
                break
            key = self._dirty.pop()
            self._expand(key, branch, company, blockers)

    def _expand(self, key, branch, company, blockers):
        target = self._targets.get(key)
        if target is None:
            return

        # A target with no remaining inbound demand (every contributor was
        # itself retracted) simply has nothing to expand -- leave it in
        # place with zero required_qty rather than deleting it; the caller
        # decides what to do with a zero-quantity target, if that can ever
        # happen (contributions are only ever added in this module, never
        # withdrawn, so this is a defensive no-op today).
        total_qty = self.required_qty(key)
        self._clear_outgoing(key)
        target["depends_on"] = []
        if total_qty <= 0:
            target["component_vector"] = []
            target["raw_material_vector"] = []
            return

        if target["sourcing_mode"] == SOURCING_EXTERNAL_RECEIPT:
            # D-EXTERNAL_RECEIPT: no BOM consumption, never a Work Order --
            # nothing further to walk.
            target["component_vector"] = []
            target["raw_material_vector"] = []
            return

        try:
            nodes = walk_bom_tree(target["bom_no"], total_qty, company)
        except frappe.ValidationError as exc:
            blockers.append(_traversal_error_blocker(target["item_code"], target["bom_no"], exc))
            target["component_vector"] = []
            target["raw_material_vector"] = []
            return

        component_vector, raw_material_vector, nested, sub_blockers = _classify_walk(
            nodes, branch, company, consuming_department=target["department"], consuming_item=target["item_code"]
        )
        blockers.extend(sub_blockers)
        # D1: a target's own Work Order required_items wants the unfiltered
        # vector -- PRE_PRODUCED sub-assemblies included as items. The
        # readiness engine wants the filtered one instead (see
        # ury_production_readiness): a nested PRE_PRODUCED sub-assembly is
        # already its own separate target with its own separate demand: Store
        # never stocks it directly, and counting it again here as something
        # to request would treat an in-house-manufactured intermediate as if
        # it were a purchasable raw material.
        target["component_vector"] = component_vector
        target["raw_material_vector"] = raw_material_vector

        depends_on = []
        for candidate in nested:
            child_key = self.key(
                candidate["department"], candidate["item_code"], candidate["bom_no"], candidate["warehouse"]
            )
            self.ensure_target(**candidate)
            self.add_edge(
                parent_key=key,
                child_key=child_key,
                qty=candidate["qty"],
                parent_item=target["item_code"],
                source_type="nested_dependency",
            )
            depends_on.append(candidate["item_code"])
        target["depends_on"] = sorted(set(depends_on))

    def build_department_collections(self):
        departments = {}

        def _bucket_for(department, warehouse):
            return departments.setdefault(
                department,
                {
                    "department": department,
                    "warehouse": warehouse,
                    "targets": [],
                    "external_receipt_targets": [],
                },
            )

        for key, target in self._targets.items():
            required_qty = self.required_qty(key)
            if required_qty <= 0:
                continue
            department = target["department"]
            bucket = _bucket_for(department, target["warehouse"])
            row = dict(target)
            row["required_qty"] = required_qty
            row["sources"] = self.sources(key)
            dest = (
                bucket["targets"]
                if target["sourcing_mode"] != SOURCING_EXTERNAL_RECEIPT
                else bucket["external_receipt_targets"]
            )
            dest.append(row)

        for bucket in departments.values():
            bucket["targets"] = _order_by_dependency(bucket["targets"])
            bucket["external_receipt_targets"] = _order_by_dependency(bucket["external_receipt_targets"])
        return departments


# --- BOM-node classification --------------------------------------------------


def _classify_walk(nodes, branch, company, consuming_department, consuming_item):
    """Classify every node of one flat ``walk_bom_tree`` result.

    Returns ``(component_vector, raw_material_vector, nested_targets, blockers)``:

    - ``component_vector``: the rows that belong directly in the consuming
      target's/row's own ``required_items`` -- raw materials, DIRECT_RETAIL
      components, and PRE_PRODUCED nodes themselves (D1: a PRE_PRODUCED
      sub-assembly appears as an item; an unstocked intermediate never does,
      only its own descendants do, once classified in turn).
    - ``raw_material_vector``: the strict subset of ``component_vector`` that
      is NOT a PRE_PRODUCED node -- true raw materials and DIRECT_RETAIL
      components only. A PRE_PRODUCED node is excluded here even when it was
      blocked as a cross-department misconfiguration (D7) and never became a
      target at all: its own target or its own blocker already accounts for
      it, and it must never additionally surface as something to purchase or
      transfer. Used only for a MADE_TO_ORDER row's own raw-material demand
      (``_TargetGraph.add_raw_material_demand``) -- a target's own
      ``component_vector`` (Work Order ``required_items``) always wants the
      unfiltered vector, never this one.
    - ``nested_targets``: PRE_PRODUCED nodes found in ``consuming_department``
      (candidates for ``_TargetGraph.ensure_target``/``add_edge``), each a
      dict with item_code/department/bom_no/warehouse/qty/stock_uom/
      production_unit/sourcing_mode.
    - ``blockers``: anything that could not be classified safely.
    """
    component_vector_by_item = {}
    nested_targets = []
    blockers = []
    stopped_prefixes = []

    for node in nodes:
        path = tuple(node["path"])
        if _is_under_any(path, stopped_prefixes):
            continue

        context, blocker = _resolve_context(node["item_code"], branch, company)
        if blocker:
            blockers.append(blocker)
            stopped_prefixes.append(path)
            continue

        policy = context.get("production_policy") if context else None

        if policy == POLICY_PRE_PRODUCED:
            stopped_prefixes.append(path)
            _accumulate_component(component_vector_by_item, node, is_pre_produced=True)

            department = context.get("department")
            if department != consuming_department:
                blockers.append(
                    _cross_department_blocker(
                        component_item=node["item_code"],
                        configured_department=department,
                        consuming_department=consuming_department,
                        consuming_item=node["parent_item"],
                    )
                )
                continue

            bom_no = node.get("bom_no")
            if not bom_no:
                blockers.append(_missing_pinned_bom_blocker(node["item_code"], node["parent_item"]))
                continue

            nested_targets.append(
                {
                    "item_code": node["item_code"],
                    "department": department,
                    "bom_no": bom_no,
                    "warehouse": context.get("warehouse"),
                    "qty": node["required_qty"],
                    "stock_uom": node["stock_uom"],
                    "production_unit": context.get("production_unit"),
                    "sourcing_mode": context.get("sourcing_mode") or SOURCING_IN_HOUSE,
                }
            )
            continue

        if policy == POLICY_DIRECT_RETAIL:
            stopped_prefixes.append(path)
            _accumulate_component(component_vector_by_item, node)
            continue

        if not node["has_bom"]:
            # Raw material leaf (no config, or a config with a policy this
            # module does not stop on, e.g. a nested MADE_TO_ORDER node with
            # no further recipe) -- consumed directly.
            _accumulate_component(component_vector_by_item, node)
        # else: unstocked intermediate (has a BOM, not classified
        # PRE_PRODUCED/DIRECT_RETAIL) or a nested MADE_TO_ORDER node with its
        # own BOM -- pass through silently; its own children are already
        # present later in this same flat node list and are classified in
        # their own right.

    component_vector = [
        {"item_code": row["item_code"], "required_qty": row["required_qty"], "stock_uom": row["stock_uom"]}
        for row in component_vector_by_item.values()
    ]
    raw_material_vector = [
        {"item_code": row["item_code"], "required_qty": row["required_qty"], "stock_uom": row["stock_uom"]}
        for row in component_vector_by_item.values()
        if not row["is_pre_produced"]
    ]
    return component_vector, raw_material_vector, nested_targets, blockers


def _accumulate_component(component_vector_by_item, node, is_pre_produced=False):
    """Fold ``node`` into ``component_vector_by_item``, keyed by (item_code, uom).

    ``is_pre_produced`` marks a PRE_PRODUCED node -- whether it went on to
    become its own nested target, or was blocked as a cross-department
    misconfiguration (D7) and became neither. Either way its own production
    or its own blocker already accounts for it entirely; it must never also
    be counted as a plain raw material or DIRECT_RETAIL component by
    whichever caller wants only those (see ``_classify_walk``'s
    ``raw_material_vector`` return value). A component's own Work Order
    ``required_items`` (D1) still wants it, hence the flag is carried but
    never used to exclude anything from ``component_vector`` itself.
    """
    key = (node["item_code"], node["stock_uom"])
    existing = component_vector_by_item.get(key)
    if existing:
        existing["required_qty"] = flt(existing["required_qty"]) + flt(node["required_qty"])
        existing["is_pre_produced"] = existing["is_pre_produced"] or is_pre_produced
    else:
        component_vector_by_item[key] = {
            "item_code": node["item_code"],
            "required_qty": node["required_qty"],
            "stock_uom": node["stock_uom"],
            "is_pre_produced": is_pre_produced,
        }


def _is_under_any(path, stopped_prefixes):
    for prefix in stopped_prefixes:
        if path[: len(prefix)] == prefix:
            return True
    return False


# --- configuration resolution -------------------------------------------------


def _resolve_context(item_code, branch, company):
    """Resolve one item's branch-scoped production context, plus its ``sourcing_mode``.

    Returns ``(context, None)`` on a clean single match (``context`` may
    itself be ``None`` when no active configuration exists at all -- not a
    blocker, just "unclassified"), or ``(None, blocker)`` when more than one
    active configuration matches (an ``ambiguous_configuration`` blocker;
    ``resolve_production_context`` alone cannot distinguish "none" from
    "more than one", since both return ``None``).
    """
    rows = frappe.get_all(
        CONFIG_DOCTYPE,
        filters={"item": item_code, "branch": branch, "active": 1},
        fields=["name", "sourcing_mode"],
        limit=3,
    )
    if len(rows) > 1:
        return None, _ambiguous_configuration_blocker(item_code, branch)

    context = resolve_production_context(item_code, branch, company)
    if not context:
        return None, None

    context = dict(context)
    context["sourcing_mode"] = ((rows[0].get("sourcing_mode") if rows else None) or SOURCING_IN_HOUSE).upper()
    return context, None


def _sourcing_mode_for(item_code, branch):
    rows = frappe.get_all(
        CONFIG_DOCTYPE,
        filters={"item": item_code, "branch": branch, "active": 1},
        fields=["sourcing_mode"],
        limit=1,
    )
    return ((rows[0].get("sourcing_mode") if rows else None) or SOURCING_IN_HOUSE).upper()


def _department_warehouse(department):
    if not department:
        return None
    return frappe.db.get_value(DEPARTMENT_DOCTYPE, department, "department_warehouse")


# --- dependency ordering ------------------------------------------------------


def _order_by_dependency(targets):
    """Order ``targets`` so a nested PRE_PRODUCED dependency precedes its consumer.

    Ordering is by ``item_code`` (a target's ``depends_on`` lists item codes,
    all within the same department by construction -- see D7). A cycle
    should never occur (it would already have been reported as a
    ``cyclic_target_dependency`` blocker upstream), but the guard below
    leaves a partially-ordered result rather than recursing forever if one
    somehow reaches here.
    """
    by_item = {}
    for target in targets:
        by_item.setdefault(target["item_code"], []).append(target)

    ordered = []
    visited = set()
    visiting = set()

    def visit(item_code):
        if item_code in visited or item_code not in by_item:
            return
        if item_code in visiting:
            return
        visiting.add(item_code)
        for target in by_item[item_code]:
            for dep in target.get("depends_on") or []:
                visit(dep)
        visiting.discard(item_code)
        visited.add(item_code)
        ordered.extend(by_item[item_code])

    for target in targets:
        visit(target["item_code"])
    return ordered


# --- blockers -----------------------------------------------------------------


def _ambiguous_configuration_blocker(item_code, branch):
    return {
        "type": "ambiguous_configuration",
        "item_code": item_code,
        "branch": branch,
        "message": _(
            "Item {0} has more than one active production configuration for Branch {1}. "
            "Resolve the duplicate configuration before this item can be planned."
        ).format(item_code, branch),
    }


def _cross_department_blocker(component_item, configured_department, consuming_department, consuming_item):
    return {
        "type": "cross_department_dependency",
        "item_code": component_item,
        "configured_department": configured_department,
        "consuming_department": consuming_department,
        "consuming_item": consuming_item,
        "message": _(
            "Cross-department production is not supported in this release. `{0}` is "
            "configured under `{1}` but is consumed by `{2}` under `{3}`. Configure `{0}` "
            "under `{3}`, or wait for cross-department support."
        ).format(component_item, configured_department, consuming_item, consuming_department),
    }


def _missing_pinned_bom_blocker(item_code, parent_item):
    return {
        "type": "missing_pinned_bom",
        "item_code": item_code,
        "parent_item": parent_item,
        "message": _(
            "{0} is configured as PRE_PRODUCED but its component row under {1} has no "
            "sub-assembly BOM pinned. Pin a BOM for {0} on {1}'s BOM before this can be planned."
        ).format(item_code, parent_item),
    }


def _traversal_error_blocker(item_code, bom_no, exc):
    message = str(exc)
    blocker_type = "bom_cycle" if "Circular BOM reference" in message else "bom_traversal_error"
    return {
        "type": blocker_type,
        "item_code": item_code,
        "bom_no": bom_no,
        "message": message,
    }


def _cyclic_dependency_blocker(key):
    department, item_code, bom_no, warehouse = key
    return {
        "type": "cyclic_target_dependency",
        "item_code": item_code,
        "department": department,
        "bom_no": bom_no,
        "message": _(
            "{0} could not be resolved to a stable required quantity; its production "
            "dependencies appear to reference each other in a cycle."
        ).format(item_code),
    }


# --- snapshot decoding ---------------------------------------------------------


def _decode_snapshot(sales_plan_snapshot):
    if isinstance(sales_plan_snapshot, str):
        return json.loads(sales_plan_snapshot)
    return sales_plan_snapshot or {}
