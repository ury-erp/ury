# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Integration and regression tests for the URY Production Plan Automation
feature (Agent 10, ``ongoing/production-plan-automation/PLAN.md``).

Unlike every other module's own unit tests (all mocked, per those modules'
own docstrings -- no bench was available while they were written), these run
against the real ``ury.localhost`` site: real Items, BOMs, Warehouses, Bins,
Sales Plans, Production Plans, Work Orders and Stock Entries, driven through
the real public functions of every module in the chain. Nothing here mocks
``frappe.db`` or ``frappe.get_doc``.

## Why most tests call the transfer/executor functions directly rather than
``ury_prepare_production.run_prepare_production_job``

``prepare_production()`` enqueues its background job with
``enqueue_after_commit=True``. Under ``FrappeTestCase`` nothing commits until
the test class tears down (``frappe.tests.utils.FrappeTestCase`` rolls back
the whole class's work in one shot at ``addClassCleanup``), so that job would
never actually run inside a test -- the after-commit callback is never
triggered. Calling ``run_prepare_production_job`` directly instead *would*
run it, but terminal ``_finish_*`` helpers call ``frappe.db.commit()``
(to persist the final Production Plan state), which would permanently write
to this shared dev site and defeat the class-level rollback for everything
created earlier in the same test class. Mid-job step/heartbeat no longer
commits on the Production Plan row -- those live in ``frappe.cache`` -- but
the terminal commit remains.

So: most tests here call the same real, non-committing functions the job
calls (``execute_store_to_department_transfer``,
``execute_department_targets``, the Material Request generators) directly --
this is exactly the work the job does, just invoked synchronously and without
forcing a commit, so ordinary rollback-based cleanup still works.

Exactly one test, ``TestFullHappyPathEndToEnd``, exercises the *actual*
``prepare_production`` -> ``run_prepare_production_job`` path, including its
commits, because that is the only way to prove the state-machine and
heartbeat/result-writing code genuinely runs end to end. That class does its
own explicit cleanup (cancelling every document it creates, in dependency
order) in ``tearDown`` rather than relying on rollback, and only ever touches
fixtures it created itself.

## Fixture policy

Every fixture below is created fresh, with a random suffix, inside each test
class's own ``setUpClass``/``setUp`` -- no dependency on demo data at all
(no ``Demo Branch``, no hard-coded Company/Cost Center/Store Warehouse), so
the module runs on a fresh CI site. ``ensure_base_fixtures()`` resolves the
site's own Company and get-or-creates this module's two test Branches; it
runs inside setUpClass/setUp, never at import time.

Per PLAN.md's own Wave 0 note: the Store Warehouse and every Department
Warehouse created here are distinct, correctly-oriented Warehouse records
(never randomly assigned), so a transfer test that "passes" is provably
moving stock in the right direction.

**Known, bounded residue.** ``TestFullHappyPathEndToEnd`` cancels and
deletes every transactional document it creates (Sales Plan, Production
Plan, Work Order, Stock Entries, Material Requests) and every piece of
master data (Item, BOM, Production Department/Unit) -- except its two
Warehouses. ERPNext's own ``Warehouse.on_trash`` refuses to hard-delete a
Warehouse that ever recorded a Stock Ledger Entry, even one that was fully
cancelled/reversed (cancelling a Stock Entry marks its SLE rows
``is_cancelled=1`` rather than removing them, and ``check_if_sle_exists``
does not filter those out) -- a platform-level constraint, not anything
this suite can work around. ``cleanup_docs`` falls back to disabling such a
Warehouse instead. Each full run of that one test class therefore leaves
exactly two disabled, uniquely-suffixed, otherwise-inert Warehouse records
behind; nothing else.
"""

from __future__ import annotations

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from ury.ury.api.ury_production_target_compiler import compile_production_targets
from ury.ury.api.ury_production_readiness import compute_readiness
from ury.ury.api.ury_sales_plan_production_plan import (
	create_or_get_department_production_plans,
	get_live_production_plans,
)
from ury.ury.api.ury_production_plan_material_request import (
	generate_purchase_material_request_for_sales_plan,
)
from ury.ury.api.ury_production_transfer import (
	generate_transfer_material_request_for_production_plan,
	execute_store_to_department_transfer,
)
from ury.ury.api.ury_production_plan_auto_work_order import (
	execute_department_targets,
	WorkOrderExecutionError,
)
from ury.ury.api.ury_prepare_production import (
	prepare_production,
	run_prepare_production_job,
	get_production_state,
)
from ury.ury.api.ury_sales_plan import advance_plan_to_approved, transition_sales_plan
from ury.ury.api.ury_sales_plan_auto_production_plan import create_production_plans_on_lock


#: Test-owned Branch records. Created (idempotently) by
#: ``ensure_base_fixtures()`` from every class's ``setUpClass``/``setUp`` --
#: never at import time -- so this module runs on a fresh CI site with no
#: demo data (no "Demo Branch", no "URY" company, no "Main - U"/"Stores - U").
BRANCH = "URY PP Integration Test Branch"
OTHER_BRANCH = "URY PP Integration Other Branch"

#: Resolved per site by ``ensure_base_fixtures()``: company, cost_center, currency.
_BASE = frappe._dict()


def _company():
	return _BASE.company


def _ensure_fiscal_year(company):
	"""A fresh CI site's Company may have no Fiscal Year covering today, and
	every Stock Entry / BOM / Work Order here would then raise
	FiscalYearError. Create a company-scoped calendar-year Fiscal Year if
	none applies (company-scoped so ERPNext's overlap check never collides
	with a global or other-company Fiscal Year)."""
	from erpnext.accounts.utils import FiscalYearError, get_fiscal_year
	from frappe.utils import getdate, nowdate

	today = getdate(nowdate())
	try:
		get_fiscal_year(today, company=company)
		return
	except FiscalYearError:
		pass

	year_name = f"URY PP Test FY {today.year} {company}"
	if not frappe.db.exists("Fiscal Year", year_name):
		frappe.get_doc(
			{
				"doctype": "Fiscal Year",
				"year": year_name,
				"year_start_date": f"{today.year}-01-01",
				"year_end_date": f"{today.year}-12-31",
				"companies": [{"company": company}],
			}
		).insert(ignore_permissions=True)
	frappe.cache().delete_key("fiscal_years")


def ensure_base_fixtures():
	"""Resolve the site's Company (whatever the test site was bootstrapped
	with -- "Test Company" on CI, "URY" on a dev bench) and get-or-create the
	Branch records this module uses. Re-run from every ``setUpClass``/``setUp``
	rather than cached forever, because ``FrappeTestCase`` rolls back each
	class's writes (a Branch created by an earlier class may be gone)."""
	company = (
		frappe.db.get_single_value("Global Defaults", "default_company")
		or frappe.db.get_value("Company", {}, "name", order_by="creation asc")
	)
	if not company:
		raise AssertionError("Test site has no Company; run the setup wizard / before_tests first.")
	company_doc = frappe.db.get_value(
		"Company", company, ["cost_center", "default_currency"], as_dict=True
	)
	cost_center = company_doc.cost_center or frappe.db.get_value(
		"Cost Center", {"company": company, "is_group": 0}, "name", order_by="creation asc"
	)
	_BASE.update(company=company, cost_center=cost_center, currency=company_doc.default_currency or "INR")

	_ensure_fiscal_year(company)

	for branch_name in (BRANCH, OTHER_BRANCH):
		if not frappe.db.exists("Branch", branch_name):
			frappe.get_doc(
				{
					"doctype": "Branch",
					"branch": branch_name,
					"company": company,
					"user": [{"user": "Administrator"}],
				}
			).insert(ignore_permissions=True)
	return _BASE


# ---------------------------------------------------------------------------
# Fixture factories -- real records only, no mocking of frappe itself.
# ---------------------------------------------------------------------------


def _uniq(prefix):
	return f"{prefix}{frappe.generate_hash(length=6).upper()}"


def make_item(item_code, stock_uom="Kg", item_group=None):
	if not item_group:
		item_group = "Products" if frappe.db.exists("Item Group", "Products") else "All Item Groups"
	if not frappe.db.exists("Item", item_code):
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": item_code,
				"item_name": item_code,
				"item_group": item_group,
				"stock_uom": stock_uom,
				"is_stock_item": 1,
			}
		).insert(ignore_permissions=True)
	return item_code


def make_warehouse(hint, company=None):
	company = company or _company()
	doc = frappe.get_doc(
		{"doctype": "Warehouse", "warehouse_name": hint, "company": company}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def make_department(department_name, warehouse, branch=BRANCH, company=None, cost_center=None):
	company = company or _company()
	cost_center = cost_center or _BASE.cost_center
	frappe.get_doc(
		{
			"doctype": "URY Production Department",
			"department_name": department_name,
			"company": company,
			"branch": branch,
			"department_warehouse": warehouse,
			"cost_center": cost_center,
			"enabled": 1,
		}
	).insert(ignore_permissions=True)
	return department_name


def make_production_unit(unit_name, department, branch=BRANCH, company=None):
	company = company or _company()
	frappe.get_doc(
		{
			"doctype": "URY Production Unit",
			"production": unit_name,
			"department": department,
			"branch": branch,
			"company": company,
			"enabled": 1,
		}
	).insert(ignore_permissions=True)
	return unit_name


def make_bom(item_code, components, company=None, quantity=1):
	"""``components``: list of ``(item_code, qty, uom, bom_no_or_None)``."""
	company = company or _company()
	doc = frappe.get_doc(
		{
			"doctype": "BOM",
			"item": item_code,
			"company": company,
			"quantity": quantity,
			"currency": _BASE.currency,
			"conversion_rate": 1,
			"items": [
				{
					"item_code": component[0],
					"qty": component[1],
					"uom": component[2],
					"rate": 1,
					"bom_no": component[3] if len(component) > 3 else None,
				}
				for component in components
			],
		}
	)
	doc.insert(ignore_permissions=True)
	doc.submit()
	return doc.name


def make_config(item, department, production_unit, bom, branch=BRANCH, policy="PRE_PRODUCED", sourcing_mode="IN_HOUSE"):
	frappe.get_doc(
		{
			"doctype": "URY Item Production Configuration",
			"item": item,
			"branch": branch,
			"department": department if policy != "DIRECT_RETAIL" else None,
			"production_unit": production_unit,
			"production_policy": policy,
			"sourcing_mode": sourcing_mode,
			"bom": bom,
			"active": 1,
			"controlled_by_sales_plan": 1,
			"availability_mode": "Plan Available",
		}
	).insert(ignore_permissions=True)
	return item


def stock_receipt(item_code, warehouse, qty, company=None):
	"""A real, submitted Material Receipt Stock Entry -- the honest way to
	seed Bin quantity, exercising the same stock ledger every other
	production entry in these tests reads through."""
	company = company or _company()
	doc = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"company": company,
			"items": [
				{
					"item_code": item_code,
					"qty": qty,
					"t_warehouse": warehouse,
					"basic_rate": 1,
				}
			],
		}
	)
	doc.insert(ignore_permissions=True)
	doc.submit()
	return doc.name


def bin_qty(item_code, warehouse):
	return flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))


def make_sales_plan_snapshot(items, branch=BRANCH, company=None):
	"""Build a decoded snapshot dict in exactly the shape
	``ury_sales_plan.freeze_approval_snapshot``/``snapshot_item`` produces,
	for tests that only need ``compile_production_targets`` and do not need
	a real ``URY Sales Plan`` document. ``items``: list of dicts with at
	least ``item_code``, ``qty``, ``production_policy``, ``bom``; PRE_PRODUCED
	rows also need ``department``.
	"""
	return {"branch": branch, "company": company or _company(), "items": items}


#: `validate_no_overlapping_plan_scope` refuses two Approved/Locked plans for
#: the same (item, branch, day). Every Sales Plan this file creates gets its
#: own, never-repeated `plan_date` from this counter, so tests that each
#: approve a plan for the *same* fixture item (several tests per class,
#: sharing one `setUpClass` item) never collide with each other regardless
#: of run order.
import itertools as _itertools
from frappe.utils import add_days as _add_days, nowdate as _nowdate

_plan_date_offsets = _itertools.count(1)


def _next_plan_date():
	return _add_days(_nowdate(), next(_plan_date_offsets))


def make_real_sales_plan(items, branch=BRANCH, company=None, plan_date=None):
	"""Insert a real, Draft ``URY Sales Plan`` with ``items`` rows. Does not
	advance its workflow state -- callers do that explicitly (via
	``advance_plan_to_approved``/``transition_sales_plan``) so every test is
	explicit about which lifecycle hooks it wants to exercise."""
	doc = frappe.get_doc(
		{
			"doctype": "URY Sales Plan",
			"branch": branch,
			"company": company or _company(),
			"plan_date": plan_date or _next_plan_date(),
			"items": items,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc


def cleanup_docs(specs):
	"""Best-effort cancel (docstatus 1 -> 2) then delete, in the given
	order, swallowing "already gone"/"already cancelled" errors. Used only
	by the one test class that deliberately commits (see module docstring).
	``specs``: list of ``(doctype, name)`` in the order they must be undone
	-- dependents (Manufacture entries, Work Orders) before what they
	depend on (Production Plan, Sales Plan)."""
	for doctype, name in specs:
		if not name or not frappe.db.exists(doctype, name):
			continue
		try:
			doc = frappe.get_doc(doctype, name)
			if doc.docstatus == 1:
				doc.flags.ignore_links = True
				doc.cancel()
			frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
			# Commit after each successful step, not just at the end: a
			# `frappe.db.rollback()` from a LATER failure in this same
			# loop (below) must never undo an EARLIER step that already
			# succeeded -- rolling back the whole shared connection would
			# do exactly that, since nothing here runs in its own
			# sub-transaction. Commit-per-step trades that away for a
			# small window where a mid-loop crash leaves a partial
			# cleanup, which is still strictly better than "any single
			# failure silently undoes every prior cancellation."
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			if doctype == "Warehouse":
				# ERPNext's `Warehouse.on_trash` refuses to delete a
				# Warehouse that ever recorded a Stock Ledger Entry, even
				# one that was fully cancelled/reversed (cancelling a
				# Stock Entry marks its SLE rows `is_cancelled=1`, it does
				# not remove them, and `check_if_sle_exists` does not
				# filter those out) -- a platform-level constraint, not
				# anything specific to URY. A Warehouse this test created
				# and moved real stock through therefore cannot always be
				# hard-deleted; disabling it is the correct fallback so it
				# at least cannot be picked for anything else, and it is
				# harmless, uniquely-suffixed leftover master data rather
				# than a transactional document.
				try:
					frappe.db.set_value(doctype, name, "disabled", 1)
					frappe.db.commit()
				except Exception:
					frappe.db.rollback()
	frappe.db.commit()


# ---------------------------------------------------------------------------
# A. Target compiler against real BOMs/configs (scenarios 10-14, 19, 22)
# ---------------------------------------------------------------------------


class TestTargetCompilerRealRecords(FrappeTestCase):
	"""Real Items/BOMs/configurations, no mocking -- exercises
	``ury_bom_tree.walk_bom_tree`` and ``ury_production_target_compiler``
	together, the way the rest of the chain actually calls them."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		ensure_base_fixtures()
		cls.suffix = _uniq("AGT10A")
		cls.warehouse = make_warehouse(f"{cls.suffix} Dept WH")
		cls.department = make_department(f"{cls.suffix} Dept", cls.warehouse)
		cls.unit = make_production_unit(f"{cls.suffix} Unit", cls.department)
		# Store warehouse handed straight to compute_readiness (no reliance on
		# a pre-configured URY Production Settings.store_warehouse).
		cls.store = make_warehouse(f"{cls.suffix} Store")

		# Nested tree: MTO finished item -> PRE_PRODUCED assembly -> raw
		# material, plus a second, deeper PRE_PRODUCED dependency nested
		# inside the first assembly's own BOM (scenario 11, "nested
		# PRE_PRODUCED dependencies within one department").
		cls.rice = make_item(f"{cls.suffix}-RICE")
		cls.masala = make_item(f"{cls.suffix}-MASALA")
		cls.deep_assembly = make_item(f"{cls.suffix}-DEEPBASE")
		cls.deep_bom = make_bom(cls.deep_assembly, [(cls.rice, 2, "Kg")])
		make_config(cls.deep_assembly, cls.department, cls.unit, cls.deep_bom)

		cls.assembly = make_item(f"{cls.suffix}-BASE")
		cls.assembly_bom = make_bom(
			cls.assembly, [(cls.masala, 1, "Kg"), (cls.deep_assembly, 3, "Kg", cls.deep_bom)]
		)
		make_config(cls.assembly, cls.department, cls.unit, cls.assembly_bom)

		cls.finished = make_item(f"{cls.suffix}-FINISHED")
		cls.finished_bom = make_bom(cls.finished, [(cls.assembly, 4, "Kg", cls.assembly_bom)])
		make_config(cls.finished, cls.department, cls.unit, None, policy="MADE_TO_ORDER")

		# A second department for the cross-department blocker (scenario 14).
		cls.other_warehouse = make_warehouse(f"{cls.suffix} Other WH")
		cls.other_department = make_department(f"{cls.suffix} Other Dept", cls.other_warehouse)
		cls.other_unit = make_production_unit(f"{cls.suffix} Other Unit", cls.other_department)
		cls.cross_item = make_item(f"{cls.suffix}-CROSS")
		cls.cross_bom = make_bom(cls.cross_item, [(cls.rice, 1, "Kg")])
		make_config(cls.cross_item, cls.other_department, cls.other_unit, cls.cross_bom)

		cls.cross_finished = make_item(f"{cls.suffix}-CROSSHOST")
		cls.cross_finished_bom = make_bom(cls.cross_finished, [(cls.cross_item, 1, "Kg", cls.cross_bom)])
		make_config(cls.cross_finished, cls.department, cls.unit, None, policy="MADE_TO_ORDER")

		# EXTERNAL_RECEIPT target (scenario 19). A BOM is still pinned on
		# the snapshot row (the compiler requires every PRE_PRODUCED row to
		# carry one -- see _seed_from_snapshot_row), even though
		# EXTERNAL_RECEIPT sourcing means it is never walked (the target
		# compiler stops before calling walk_bom_tree for it).
		cls.external_item = make_item(f"{cls.suffix}-EXTERNAL")
		cls.external_bom = make_bom(cls.external_item, [(cls.rice, 1, "Kg")])
		make_config(
			cls.external_item, cls.department, cls.unit, cls.external_bom,
			policy="PRE_PRODUCED", sourcing_mode="EXTERNAL_RECEIPT",
		)

		# A cyclic BOM pair for scenario 22 (bom_tree cannot see this cycle
		# itself since it never walks the same bom_no twice in one call --
		# it is a *target-level* cycle: A's own BOM ultimately needs A
		# again through B).
		cls.cycle_a = make_item(f"{cls.suffix}-CYCLEA")
		cls.cycle_b = make_item(f"{cls.suffix}-CYCLEB")
		# Build B first with a placeholder, self-referencing structural
		# cycle is exercised directly via walk_bom_tree instead (see
		# test_bom_cycle_is_reported_not_recursed), since a *structural*
		# cycle (same bom_no nested under itself) is what walk_bom_tree
		# itself detects -- that is simpler to construct than a genuine
		# target-level one and exercises the same D1 "raises, names path"
		# acceptance criterion (scenario 22).

	def test_mto_excludes_finished_item_includes_scaled_preproduced_assembly(self):
		"""Scenario 10: its PRE_PRODUCED assembly is included at the scaled
		quantity. Since 11122ebcac ("make a MADE_TO_ORDER row a real target,
		guarded against ever getting a Work Order") the MTO finished item is
		itself a target too, flagged ``skip_work_order`` -- see the
		"MADE_TO_ORDER items" section of ury_production_target_compiler."""
		snapshot = make_sales_plan_snapshot(
			[{"item_code": self.finished, "qty": 5, "production_policy": "MADE_TO_ORDER", "bom": self.finished_bom, "department": self.department}]
		)
		departments, blockers = compile_production_targets(snapshot, BRANCH, _company())

		self.assertEqual(blockers, [])
		bucket = departments[self.department]
		by_item = {t["item_code"]: t for t in bucket["targets"]}
		self.assertIn(self.finished, by_item)
		self.assertTrue(by_item[self.finished]["skip_work_order"])
		self.assertEqual(flt(by_item[self.finished]["required_qty"]), 5.0)
		self.assertIn(self.assembly, by_item)
		self.assertFalse(by_item[self.assembly]["skip_work_order"])
		# finished_bom: 4 Kg BASE per FINISHED, needed_qty 5 -> 20 Kg.
		self.assertEqual(flt(by_item[self.assembly]["required_qty"]), 20.0)

	def test_nested_preproduced_dependency_ordered_before_its_consumer(self):
		"""Scenario 11/12: the deeper PRE_PRODUCED node appears as its own
		target, aggregated, in dependency order, and as an item (not
		exploded) inside the shallower target's own component vector."""
		snapshot = make_sales_plan_snapshot(
			[{"item_code": self.finished, "qty": 5, "production_policy": "MADE_TO_ORDER", "bom": self.finished_bom, "department": self.department}]
		)
		departments, blockers = compile_production_targets(snapshot, BRANCH, _company())
		self.assertEqual(blockers, [])

		targets = departments[self.department]["targets"]
		order = [t["item_code"] for t in targets]
		self.assertLess(order.index(self.deep_assembly), order.index(self.assembly))

		by_item = {t["item_code"]: t for t in targets}
		base_vector_items = {c["item_code"] for c in by_item[self.assembly]["component_vector"]}
		# D1: the nested PRE_PRODUCED sub-assembly appears as an item in its
		# consumer's component vector; it is not exploded into Rice here.
		self.assertIn(self.deep_assembly, base_vector_items)
		self.assertNotIn(self.rice, base_vector_items)
		self.assertIn(self.deep_assembly, by_item[self.assembly]["depends_on"])

	def test_branch_scoped_configuration_does_not_leak_across_branches(self):
		"""Scenario 13: a configuration belonging to another branch must not
		stop traversal -- an item with no config for the branch actually
		passed is read straight through as a raw material."""
		# Reuse an existing, unrelated branch rather than constructing a new
		# `Branch` record -- its `user` child table is mandatory (at least
		# one row) and irrelevant to what this test actually needs, which
		# is simply a branch that carries no configuration for `self.finished`
		# or any of its BOM's items.
		other_branch = OTHER_BRANCH

		snapshot = make_sales_plan_snapshot(
			[{"item_code": self.finished, "qty": 2, "production_policy": "MADE_TO_ORDER", "bom": self.finished_bom, "department": self.department}],
			branch=other_branch,
		)
		departments, blockers = compile_production_targets(snapshot, other_branch, _company())

		# No department has a config for `other_branch`, so the assembly is
		# never recognised as PRE_PRODUCED there and never becomes a
		# target -- traversal passes straight through it as an unstocked
		# intermediate (it has a BOM) down to Masala/Rice/deep BOM raw
		# materials, none of which are targets either. The MTO row itself
		# is still a (skip_work_order) target in the department the
		# snapshot row names (11122ebcac), and nothing else is.
		self.assertEqual(blockers, [])
		self.assertEqual(list(departments), [self.department])
		targets = departments[self.department]["targets"]
		self.assertEqual([t["item_code"] for t in targets], [self.finished])
		self.assertTrue(targets[0]["skip_work_order"])

	def test_cross_department_dependency_produces_blocker_not_target(self):
		"""Scenario 14 (D7): an MTO parent in one department consuming a
		PRE_PRODUCED component configured for a different department emits
		a `cross_department_dependency` blocker, never a transfer/target."""
		snapshot = make_sales_plan_snapshot(
			[{"item_code": self.cross_finished, "qty": 3, "production_policy": "MADE_TO_ORDER", "bom": self.cross_finished_bom, "department": self.department}]
		)
		departments, blockers = compile_production_targets(snapshot, BRANCH, _company())

		types = [b["type"] for b in blockers]
		self.assertIn("cross_department_dependency", types)
		blocker = next(b for b in blockers if b["type"] == "cross_department_dependency")
		self.assertEqual(blocker["item_code"], self.cross_item)
		self.assertEqual(blocker["configured_department"], self.other_department)
		self.assertEqual(blocker["consuming_department"], self.department)
		# Never silently turned into a target under the wrong department.
		all_items = {
			t["item_code"]
			for bucket in departments.values()
			for t in bucket["targets"] + bucket["external_receipt_targets"]
		}
		self.assertNotIn(self.cross_item, all_items)

	def test_external_receipt_target_routed_away_from_targets(self):
		"""Scenario 19 (D19): an EXTERNAL_RECEIPT PRE_PRODUCED row is
		compiled into `external_receipt_targets`, never `targets` -- so
		Agent 7's Work Order executor (which only ever consumes `targets`)
		can never build a Work Order for it -- and its demand still reaches
		the readiness engine's Purchase-side calculation."""
		snapshot = make_sales_plan_snapshot(
			[{
				"item_code": self.external_item, "qty": 7, "production_policy": "PRE_PRODUCED",
				"bom": self.external_bom, "department": self.department,
			}]
		)
		departments, blockers = compile_production_targets(snapshot, BRANCH, _company())
		self.assertEqual(blockers, [])
		bucket = departments[self.department]
		self.assertEqual(bucket["targets"], [])
		self.assertEqual(len(bucket["external_receipt_targets"]), 1)
		self.assertEqual(bucket["external_receipt_targets"][0]["item_code"], self.external_item)

		# D19's second half: the demand still reaches the readiness engine's
		# Purchase-side requirement rather than vanishing.
		readiness = compute_readiness(departments, store_warehouse=self.store)
		rows_for_item = [r for r in readiness["rows"] if r["item_code"] == self.external_item]
		self.assertEqual(len(rows_for_item), 1)
		self.assertEqual(flt(rows_for_item[0]["required_qty"]), 7.0)

	def test_bom_cycle_is_reported_not_recursed(self):
		"""Scenario 22 (Agent 1): a structurally circular BOM raises,
		naming the path, rather than recursing forever. Exercised through
		the real `walk_bom_tree` a real BOM structure reaches when a BOM
		Item row points back at an ancestor's own bom_no."""
		from ury.ury.api.ury_bom_tree import walk_bom_tree

		item_x = make_item(_uniq("AGT10-CYCX"))
		item_y = make_item(_uniq("AGT10-CYCY"))
		bom_y = make_bom(item_y, [(item_x, 1, "Kg")])
		bom_x = make_bom(item_x, [(item_y, 1, "Kg", bom_y)])
		# Point Y's own BOM Item row for X back at bom_x, creating a real
		# cycle bom_x -> bom_y -> bom_x.
		frappe.db.set_value(
			"BOM Item",
			{"parent": bom_y, "item_code": item_x},
			"bom_no",
			bom_x,
		)

		with self.assertRaises(frappe.ValidationError) as ctx:
			walk_bom_tree(bom_x, 10, _company())
		self.assertIn("Circular BOM reference", str(ctx.exception))


# ---------------------------------------------------------------------------
# B. Production Plan creation against real BOMs/configs (D2, D14, D11)
# ---------------------------------------------------------------------------


class TestProductionPlanCreationRealRecords(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		ensure_base_fixtures()
		cls.suffix = _uniq("AGT10B")
		cls.warehouse = make_warehouse(f"{cls.suffix} Dept WH")
		cls.department = make_department(f"{cls.suffix} Dept", cls.warehouse)
		cls.unit = make_production_unit(f"{cls.suffix} Unit", cls.department)
		cls.raw = make_item(f"{cls.suffix}-RAW")
		cls.item = make_item(f"{cls.suffix}-ITEM")
		cls.bom = make_bom(cls.item, [(cls.raw, 2, "Kg")])
		make_config(cls.item, cls.department, cls.unit, cls.bom)

	def _approved_sales_plan(self):
		doc = make_real_sales_plan(
			[{"item_code": self.item, "qty": 10, "production_policy": "PRE_PRODUCED", "department": self.department, "bom": self.bom}]
		)
		return advance_plan_to_approved(doc)

	def test_creates_one_plan_per_department_with_include_exploded_items_zero(self):
		doc = self._approved_sales_plan()
		result = create_or_get_department_production_plans(doc, submit=True)

		self.assertEqual(len(result["production_plans"]), 1)
		row = result["production_plans"][0]
		self.assertEqual(row["department"], self.department)
		self.assertTrue(row["created"])

		plan = frappe.get_doc("Production Plan", row["production_plan"])
		self.assertEqual(plan.custom_ury_department, self.department)
		self.assertEqual(plan.custom_ury_department_warehouse, self.warehouse)
		for item_row in plan.po_items:
			# D2: every row is 0, unconditionally, never copied from a target.
			self.assertEqual(item_row.include_exploded_items, 0)

	def test_repeated_calls_create_no_duplicate_department_plans(self):
		doc = self._approved_sales_plan()
		first = create_or_get_department_production_plans(doc, submit=True)
		second = create_or_get_department_production_plans(doc, submit=True)

		self.assertTrue(first["production_plans"][0]["created"])
		self.assertFalse(second["production_plans"][0]["created"])
		self.assertEqual(
			first["production_plans"][0]["production_plan"],
			second["production_plans"][0]["production_plan"],
		)
		live = get_live_production_plans(doc.name)
		self.assertEqual(len(live), 1)

	def test_deprecated_singular_pointer_is_never_written(self):
		"""D11: `URY Sales Plan.custom_ury_production_plan` is never written
		by the locked, department-plural creation path, against a real
		Sales Plan row (not a fake dict, unlike Agent 3's own unit test)."""
		doc = self._approved_sales_plan()
		create_or_get_department_production_plans(doc, submit=True)
		value = frappe.db.get_value("URY Sales Plan", doc.name, "custom_ury_production_plan")
		self.assertFalse(value)


# ---------------------------------------------------------------------------
# C. Locking a Sales Plan (D14): approve creates nothing, lock creates plans
# ---------------------------------------------------------------------------


class TestSalesPlanLockCreatesProductionPlans(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		ensure_base_fixtures()
		cls.suffix = _uniq("AGT10C")
		cls.warehouse = make_warehouse(f"{cls.suffix} Dept WH")
		cls.department = make_department(f"{cls.suffix} Dept", cls.warehouse)
		cls.unit = make_production_unit(f"{cls.suffix} Unit", cls.department)
		cls.raw = make_item(f"{cls.suffix}-RAW")
		cls.item = make_item(f"{cls.suffix}-ITEM")
		cls.bom = make_bom(cls.item, [(cls.raw, 1, "Kg")])
		make_config(cls.item, cls.department, cls.unit, cls.bom)

	def setUp(self):
		ensure_base_fixtures()
		frappe.set_user("Administrator")
		self._toggle_before = frappe.db.get_single_value("URY Production Settings", "enable_auto_production_plan")

	def tearDown(self):
		frappe.db.set_single_value(
			"URY Production Settings", "enable_auto_production_plan", self._toggle_before or 0
		)

	def _draft(self, qty=4):
		return make_real_sales_plan(
			[{"item_code": self.item, "qty": qty, "production_policy": "PRE_PRODUCED", "department": self.department, "bom": self.bom}]
		)

	def test_approving_creates_nothing_locking_with_toggle_on_creates_plans(self):
		"""Scenario 24."""
		frappe.db.set_single_value("URY Production Settings", "enable_auto_production_plan", 1)
		doc = self._draft()
		doc = advance_plan_to_approved(doc)
		self.assertEqual(get_live_production_plans(doc.name), [])

		doc = transition_sales_plan(doc, "Locked for Production")
		live = get_live_production_plans(doc.name)
		self.assertEqual(len(live), 1)
		self.assertEqual(live[0]["custom_ury_department"], self.department)
		# Manual route on the already-locked plan converges, no double-create.
		result = create_or_get_department_production_plans(doc, submit=False)
		self.assertFalse(result["production_plans"][0]["created"])

	def test_toggle_off_locks_with_nothing_then_manual_route_creates_same_plans(self):
		"""Scenario 25."""
		frappe.db.set_single_value("URY Production Settings", "enable_auto_production_plan", 0)
		doc = self._draft()
		doc = advance_plan_to_approved(doc)
		doc = transition_sales_plan(doc, "Locked for Production")

		self.assertEqual(get_live_production_plans(doc.name), [])

		result = create_or_get_department_production_plans(doc, submit=False)
		self.assertEqual(len(result["production_plans"]), 1)
		self.assertTrue(result["production_plans"][0]["created"])

	def test_creation_failure_with_toggle_on_aborts_lock_leaves_plan_approved(self):
		"""Scenario 26. Only the compiler call is patched (to simulate a
		defect that would otherwise be caught upstream) -- the Sales Plan
		lifecycle itself, and the `before_update_after_submit` hook under
		test, are entirely real."""
		frappe.db.set_single_value("URY Production Settings", "enable_auto_production_plan", 1)
		doc = self._draft()
		doc = advance_plan_to_approved(doc)

		with patch(
			"ury.ury.api.ury_sales_plan_production_plan.compile_production_targets",
			side_effect=RuntimeError("simulated compiler failure"),
		):
			with self.assertRaises(RuntimeError):
				transition_sales_plan(doc, "Locked for Production")

		doc.reload()
		self.assertEqual(doc.status, "Approved")
		self.assertEqual(get_live_production_plans(doc.name), [])


# ---------------------------------------------------------------------------
# D. Readiness, Store contention and transfer execution (scenarios 3, 6, 8)
# ---------------------------------------------------------------------------


class TestReadinessAndTransferRealStock(FrappeTestCase):
	"""Fixtures are rebuilt fresh in ``setUp`` (per test method), not
	``setUpClass``. ``FrappeTestCase`` only rolls back once, at class
	teardown (``addClassCleanup(_rollback_db)``) -- it does **not** roll
	back between individual test methods in the same class. Several tests
	here deliberately move real stock between warehouses, so sharing one
	set of warehouses/items across every test method in this class would
	let one test's leftover Bin quantities silently feed the next test's
	readiness calculation (exactly the kind of cross-test pollution that
	first made ``test_two_departments_compete_first_succeeds_second_blocked``
	fail with department A's own transfer inexplicably moving nothing --
	diagnosed and fixed here, not a defect in Agent 4's or Agent 5's
	module: department A's Department Warehouse already held leftover raw
	material from an earlier test method in this same class, so its own
	``department_shortage`` read as zero and nothing needed transferring)."""

	def setUp(self):
		ensure_base_fixtures()
		frappe.set_user("Administrator")
		self.suffix = _uniq("AGT10D")
		self.store = make_warehouse(f"{self.suffix} Store")
		self.dept_a_wh = make_warehouse(f"{self.suffix} DeptA WH")
		self.dept_b_wh = make_warehouse(f"{self.suffix} DeptB WH")
		self.dept_a = make_department(f"{self.suffix} Dept A", self.dept_a_wh)
		self.dept_b = make_department(f"{self.suffix} Dept B", self.dept_b_wh)
		self.unit_a = make_production_unit(f"{self.suffix} Unit A", self.dept_a)
		self.unit_b = make_production_unit(f"{self.suffix} Unit B", self.dept_b)

		self.raw = make_item(f"{self.suffix}-RICE")
		self.item_a = make_item(f"{self.suffix}-ITEMA")
		self.item_b = make_item(f"{self.suffix}-ITEMB")
		self.bom_a = make_bom(self.item_a, [(self.raw, 10, "Kg")])
		self.bom_b = make_bom(self.item_b, [(self.raw, 10, "Kg")])
		make_config(self.item_a, self.dept_a, self.unit_a, self.bom_a)
		make_config(self.item_b, self.dept_b, self.unit_b, self.bom_b)

		self._store_before = frappe.db.get_single_value("URY Production Settings", "store_warehouse")
		frappe.db.set_single_value("URY Production Settings", "store_warehouse", self.store)

	def tearDown(self):
		frappe.db.set_single_value("URY Production Settings", "store_warehouse", self._store_before)

	def _department_plan(self, item, department, warehouse, unit, bom, qty):
		snapshot = make_sales_plan_snapshot(
			[{"item_code": item, "qty": qty, "production_policy": "PRE_PRODUCED", "department": department, "bom": bom}]
		)
		doc = make_real_sales_plan(
			[{"item_code": item, "qty": qty, "production_policy": "PRE_PRODUCED", "department": department, "bom": bom}]
		)
		doc = advance_plan_to_approved(doc)
		result = create_or_get_department_production_plans(doc, submit=True)
		plan_name = result["production_plans"][0]["production_plan"]
		return doc, frappe.get_doc("Production Plan", plan_name)

	def test_store_shortage_blocks_with_zero_writes(self):
		"""Scenario 3: no Store stock at all -> the transfer executor
		refuses before creating a single document."""
		sales_plan, plan = self._department_plan(
			self.item_a, self.dept_a, self.dept_a_wh, self.unit_a, self.bom_a, qty=5
		)
		mr_count_before = frappe.db.count("Material Request")
		se_count_before = frappe.db.count("Stock Entry")

		generate_transfer_material_request_for_production_plan(plan.name)
		result = execute_store_to_department_transfer(plan.name)

		self.assertEqual(result["stock_entries"], [])
		self.assertTrue(any(b["type"] == "store_shortage" for b in result["blockers"]))
		self.assertEqual(frappe.db.count("Stock Entry") - se_count_before, 0)
		# The Transfer MR itself is allowed to exist (D15 creates it up
		# front); what must be zero is Stock Entries / Work Orders / ME.
		self.assertEqual(frappe.db.count("Work Order", {"production_plan": plan.name}), 0)

	def test_two_departments_compete_first_succeeds_second_blocked(self):
		"""Scenario 6: Store has enough Rice for exactly one department's
		10 Kg requirement (qty=1 * bom 10 Kg/unit), not both."""
		stock_receipt(self.raw, self.store, 10)

		sales_plan_a, plan_a = self._department_plan(
			self.item_a, self.dept_a, self.dept_a_wh, self.unit_a, self.bom_a, qty=1
		)
		sales_plan_b, plan_b = self._department_plan(
			self.item_b, self.dept_b, self.dept_b_wh, self.unit_b, self.bom_b, qty=1
		)

		generate_transfer_material_request_for_production_plan(plan_a.name)
		generate_transfer_material_request_for_production_plan(plan_b.name)

		result_a = execute_store_to_department_transfer(plan_a.name)
		self.assertEqual(result_a["blockers"], [])
		self.assertEqual(len(result_a["stock_entries"]), 1)
		self.assertEqual(bin_qty(self.raw, self.dept_a_wh), 10.0)

		result_b = execute_store_to_department_transfer(plan_b.name)
		self.assertEqual(result_b["stock_entries"], [])
		self.assertTrue(any(b["type"] == "store_shortage" for b in result_b["blockers"]))
		self.assertEqual(bin_qty(self.raw, self.dept_b_wh), 0.0)

	def test_partial_prior_transfer_is_respected_on_retry(self):
		"""Scenario 8: a first transfer moves half; a retry after more
		Store stock arrives moves only the remainder, never double-moves."""
		stock_receipt(self.raw, self.store, 5)  # covers half of the 10 Kg need
		sales_plan, plan = self._department_plan(
			self.item_a, self.dept_a, self.dept_a_wh, self.unit_a, self.bom_a, qty=1
		)
		generate_transfer_material_request_for_production_plan(plan.name)
		first = execute_store_to_department_transfer(plan.name)
		self.assertTrue(any(b["type"] == "store_shortage" for b in first["blockers"]))
		# Store had 5, department shortage was 10 -> preflight blocks before
		# any write at all (store_shortage still > 0 for the full 10 Kg
		# requirement), so nothing transferred yet.
		self.assertEqual(bin_qty(self.raw, self.dept_a_wh), 0.0)

		stock_receipt(self.raw, self.store, 5)  # now Store has 10, fully covers it
		generate_transfer_material_request_for_production_plan(plan.name)
		second = execute_store_to_department_transfer(plan.name)
		self.assertEqual(second["blockers"], [])
		self.assertEqual(len(second["stock_entries"]), 1)
		self.assertEqual(bin_qty(self.raw, self.dept_a_wh), 10.0)

		# Retrying again with nothing new owed creates no further Stock Entry.
		third = generate_transfer_material_request_for_production_plan(plan.name)
		self.assertIsNone(third["material_request"])


# ---------------------------------------------------------------------------
# E. Work Order / Manufacture execution against real stock (non-committing)
# ---------------------------------------------------------------------------


class TestWorkOrderExecutionRealRecords(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		ensure_base_fixtures()
		cls.suffix = _uniq("AGT10E")
		cls.warehouse = make_warehouse(f"{cls.suffix} Dept WH")
		cls.department = make_department(f"{cls.suffix} Dept", cls.warehouse)
		cls.unit = make_production_unit(f"{cls.suffix} Unit", cls.department)
		cls.raw = make_item(f"{cls.suffix}-RAW")
		cls.item = make_item(f"{cls.suffix}-ITEM")
		cls.bom = make_bom(cls.item, [(cls.raw, 2, "Kg")])
		make_config(cls.item, cls.department, cls.unit, cls.bom)

	def _plan_with_target(self, qty=10):
		# Pre-stock the raw material directly in the Department Warehouse
		# so no Store transfer is needed -- isolates Work Order/Manufacture
		# behaviour from the transfer layer already covered above.
		stock_receipt(self.raw, self.warehouse, qty * 2)
		doc = make_real_sales_plan(
			[{"item_code": self.item, "qty": qty, "production_policy": "PRE_PRODUCED", "department": self.department, "bom": self.bom}]
		)
		doc = advance_plan_to_approved(doc)
		result = create_or_get_department_production_plans(doc, submit=True)
		plan_name = result["production_plans"][0]["production_plan"]
		departments, blockers = compile_production_targets(doc.get("approval_snapshot"), BRANCH, _company())
		self.assertEqual(blockers, [])
		return frappe.get_doc("Production Plan", plan_name), departments[self.department]["targets"]

	def test_happy_path_produces_work_order_and_manufacture_entry(self):
		"""Scenario 1 (materials layer): all materials already available ->
		one Work Order, one Manufacture Stock Entry, fully produced."""
		plan, targets = self._plan_with_target(qty=6)
		results = execute_department_targets(plan, targets)

		self.assertEqual(len(results), 1)
		row = results[0]
		self.assertIsNotNone(row["work_order"])
		self.assertIsNotNone(row["manufacture_stock_entry"])
		self.assertEqual(flt(row["remaining_qty"]), 0.0)

		work_order = frappe.get_doc("Work Order", row["work_order"])
		self.assertEqual(work_order.docstatus, 1)
		self.assertEqual(work_order.skip_transfer, 1)
		self.assertIsNone(work_order.wip_warehouse)
		self.assertEqual(work_order.source_warehouse, self.warehouse)
		self.assertEqual(work_order.fg_warehouse, self.warehouse)
		required_items = {row.item_code: flt(row.required_qty) for row in work_order.required_items}
		self.assertEqual(required_items, {self.raw: 12.0})  # 2 Kg/unit * 6

		self.assertEqual(bin_qty(self.item, self.warehouse), 6.0)

	def test_repeated_execution_does_not_manufacture_twice(self):
		"""Scenario 9 (execution layer): calling execute_department_targets
		again for an already-fully-produced target reuses the Work Order
		and creates no second Manufacture Stock Entry."""
		plan, targets = self._plan_with_target(qty=4)
		first = execute_department_targets(plan, targets)
		second = execute_department_targets(plan, targets)

		self.assertEqual(first[0]["work_order"], second[0]["work_order"])
		self.assertFalse(second[0]["work_order_created"])
		self.assertIsNone(second[0]["manufacture_stock_entry"])
		self.assertEqual(flt(second[0]["remaining_qty"]), 0.0)
		work_orders = frappe.get_all(
			"Work Order", filters={"production_plan": plan.name, "docstatus": ["<", 2]}, pluck="name"
		)
		self.assertEqual(len(work_orders), 1)

	def test_ordinary_non_ury_work_order_is_unaffected(self):
		"""Scenario 18: a plain ERPNext Work Order with no linked URY
		Production Plan keeps ERPNext's own warehouse/required_items
		behaviour -- the D16 safeguard hook must no-op for it."""
		plain_item = make_item(_uniq("AGT10-PLAIN"))
		plain_bom = make_bom(plain_item, [(self.raw, 1, "Kg")])
		stock_receipt(self.raw, "Stores - U", 100) if frappe.db.exists("Warehouse", "Stores - U") else None

		work_order = frappe.get_doc(
			{
				"doctype": "Work Order",
				"production_item": plain_item,
				"bom_no": plain_bom,
				"qty": 3,
				"company": _company(),
				"fg_warehouse": self.warehouse,
				"wip_warehouse": self.warehouse,
			}
		)
		work_order.insert(ignore_permissions=True)
		# Never touched by URY's warehouse policy: no production_plan link
		# at all, so `is_ury_work_order` is False and `validate()` no-ops.
		self.assertNotEqual(work_order.skip_transfer, 1)
		self.assertEqual(work_order.wip_warehouse, self.warehouse)


# ---------------------------------------------------------------------------
# F. Cancel guards (D6, scenario 20)
# ---------------------------------------------------------------------------


class TestCancelGuardsRealRecords(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		ensure_base_fixtures()
		cls.suffix = _uniq("AGT10F")
		cls.warehouse = make_warehouse(f"{cls.suffix} Dept WH")
		cls.department = make_department(f"{cls.suffix} Dept", cls.warehouse)
		cls.unit = make_production_unit(f"{cls.suffix} Unit", cls.department)
		cls.raw = make_item(f"{cls.suffix}-RAW")
		cls.item = make_item(f"{cls.suffix}-ITEM")
		cls.bom = make_bom(cls.item, [(cls.raw, 1, "Kg")])
		make_config(cls.item, cls.department, cls.unit, cls.bom)

	def _plan(self, qty=3, stock=None):
		amount = stock if stock is not None else qty * 2
		if amount:
			stock_receipt(self.raw, self.warehouse, amount)
		doc = make_real_sales_plan(
			[{"item_code": self.item, "qty": qty, "production_policy": "PRE_PRODUCED", "department": self.department, "bom": self.bom}]
		)
		doc = advance_plan_to_approved(doc)
		result = create_or_get_department_production_plans(doc, submit=True)
		plan_name = result["production_plans"][0]["production_plan"]
		departments, blockers = compile_production_targets(doc.get("approval_snapshot"), BRANCH, _company())
		self.assertEqual(blockers, [])
		return frappe.get_doc("Production Plan", plan_name), departments[self.department]["targets"]

	def test_cancel_refused_after_manufacture_entry_posted(self):
		plan, targets = self._plan(qty=2)
		execute_department_targets(plan, targets)

		plan.reload()
		with self.assertRaises(frappe.ValidationError):
			plan.cancel()

	def test_cancel_allowed_with_only_unstarted_submitted_work_order(self):
		"""D6 / scenario 20's second half, as documented:
		``ury_production_plan_cancel_hooks``'s own module docstring and
		PLAN.md both say a submitted Work Order with nothing produced does
		NOT block cancellation -- only a warning is expected
		(``frappe.msgprint``), and the plan should cancel.

		Change 2 fixed the defect this test used to document (and used to
		assert the defective behaviour of): ``_guard_posted_production``'s
		"allowed, only warn" branch now also adds ``"Work Order"`` to
		``doc.ignore_linked_doctypes``, so Frappe's own
		``check_no_back_links_exist`` -> ``check_if_doc_is_linked`` -- which
		runs after the hook and previously refused the cancel outright the
		moment any submitted Work Order was still linked, regardless of what
		the guard decided -- no longer treats an unstarted submitted Work
		Order as a blocking back-link. Cancelling now succeeds."""
		plan, targets = self._plan(qty=2, stock=0)
		# No stock at all -> Work Order gets created (execute_department_targets
		# does not itself require raw-material stock; Manufacture Stock
		# Entry submission is what would fail for lack of stock, so build
		# the Work Order directly instead of relying on a real shortage to
		# stop the Manufacture step, keeping this test deterministic.
		from ury.ury.api.ury_production_plan_auto_work_order import get_or_create_work_order

		work_order, _created = get_or_create_work_order(plan, targets[0])
		self.assertEqual(work_order.docstatus, 1)
		self.assertEqual(flt(work_order.produced_qty), 0.0)

		plan.reload()
		plan.cancel()

		plan.reload()
		self.assertEqual(plan.docstatus, 2)

	def test_processing_state_refuses_cancel(self):
		plan, _targets = self._plan(qty=1)
		frappe.db.set_value("Production Plan", plan.name, "custom_ury_production_state", "Processing")
		plan.reload()
		with self.assertRaises(frappe.ValidationError):
			plan.cancel()


# ---------------------------------------------------------------------------
# G. Purchase/Transfer Material Requests: submitted, supplementary (D15)
# ---------------------------------------------------------------------------


class TestMaterialRequestsRealRecords(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		ensure_base_fixtures()
		cls.suffix = _uniq("AGT10G")
		cls.store = make_warehouse(f"{cls.suffix} Store")
		cls.warehouse = make_warehouse(f"{cls.suffix} Dept WH")
		cls.department = make_department(f"{cls.suffix} Dept", cls.warehouse)
		cls.unit = make_production_unit(f"{cls.suffix} Unit", cls.department)
		cls.raw = make_item(f"{cls.suffix}-RAW")
		cls.item = make_item(f"{cls.suffix}-ITEM")
		cls.bom = make_bom(cls.item, [(cls.raw, 5, "Kg")])
		make_config(cls.item, cls.department, cls.unit, cls.bom)

	def setUp(self):
		ensure_base_fixtures()
		self._store_before = frappe.db.get_single_value("URY Production Settings", "store_warehouse")
		frappe.db.set_single_value("URY Production Settings", "store_warehouse", self.store)

	def tearDown(self):
		frappe.db.set_single_value("URY Production Settings", "store_warehouse", self._store_before)

	def _locked_plan(self, qty):
		doc = make_real_sales_plan(
			[{"item_code": self.item, "qty": qty, "production_policy": "PRE_PRODUCED", "department": self.department, "bom": self.bom}]
		)
		doc = advance_plan_to_approved(doc)
		result = create_or_get_department_production_plans(doc, submit=True)
		return doc, frappe.get_doc("Production Plan", result["production_plans"][0]["production_plan"])

	def test_purchase_and_transfer_material_requests_are_submitted_not_draft(self):
		"""Scenario 28 (D15).

		Change 1: ``_locked_plan`` (``create_or_get_department_production_plans``,
		``submit=True``) now generates both requests itself as part of plan
		creation, so calling the generators again here would find nothing left
		owed (D15) and create nothing. This asserts against what creation
		already produced, then proves a repeat call is genuinely a no-op."""
		sales_plan, plan = self._locked_plan(qty=4)

		linked = frappe.db.sql(
			"""
			select mri.parent as name, mr.material_request_type as material_request_type, mr.docstatus as docstatus
			from `tabMaterial Request Item` mri
			inner join `tabMaterial Request` mr on mr.name = mri.parent
			where mri.production_plan = %s and mr.docstatus = 1
			""",
			(plan.name,),
			as_dict=True,
		)
		purchase_mrs = {row.name for row in linked if row.material_request_type == "Purchase"}
		transfer_mrs = {row.name for row in linked if row.material_request_type == "Material Transfer"}
		self.assertEqual(len(purchase_mrs), 1)
		self.assertEqual(len(transfer_mrs), 1)

		purchase_mr = frappe.get_doc("Material Request", next(iter(purchase_mrs)))
		self.assertEqual(purchase_mr.docstatus, 1)
		transfer_mr = frappe.get_doc("Material Request", next(iter(transfer_mrs)))
		self.assertEqual(transfer_mr.docstatus, 1)

		# D8: every row resolves back to this department plan through
		# native fields alone.
		for row in transfer_mr.items:
			self.assertEqual(row.production_plan, plan.name)

		# Generation already ran once at plan-creation time (D15): a fresh
		# call finds nothing new owed and creates nothing.
		self.assertEqual(
			generate_purchase_material_request_for_sales_plan(sales_plan.name)["material_requests"],
			[],
		)
		self.assertIsNone(
			generate_transfer_material_request_for_production_plan(plan.name)["material_request"]
		)

	def test_raised_requirement_creates_supplementary_request_not_amendment(self):
		"""Scenario 28's second half: a second, larger call after the first
		submitted MR never amends it -- it creates a new supplementary MR
		for the delta only, and the first MR is untouched.

		Change 1: the first Transfer MR already exists by the time
		``_locked_plan`` returns (plan creation generates it), so this reads
		it back rather than generating it a second time here."""
		sales_plan, plan = self._locked_plan(qty=4)

		first_mr_name = frappe.db.sql(
			"""
			select mri.parent
			from `tabMaterial Request Item` mri
			inner join `tabMaterial Request` mr on mr.name = mri.parent
			where mri.production_plan = %s
			  and mr.material_request_type = 'Material Transfer'
			  and mr.docstatus = 1
			""",
			(plan.name,),
		)[0][0]
		first_qty = flt(frappe.get_doc("Material Request", first_mr_name).items[0].qty)
		self.assertEqual(first_qty, 20.0)  # 5 Kg/unit * 4

		# A repeated call with nothing new owed creates nothing.
		repeat = generate_transfer_material_request_for_production_plan(plan.name)
		self.assertIsNone(repeat["material_request"])

		# Grow the requirement by editing the plan's own po_items qty
		# in-place (the same "recompute found the picture changed" shape
		# a re-approved/larger snapshot would produce) and recompiling.
		plan.reload()
		for row in plan.po_items:
			if row.item_code == self.item:
				row.planned_qty = 8  # was 4
		plan.flags.ignore_validate_update_after_submit = True
		plan.save(ignore_permissions=True)

		with patch(
			"ury.ury.api.ury_production_transfer.compile_production_targets",
			return_value=(
				{
					self.department: {
						"department": self.department,
						"warehouse": self.warehouse,
						"targets": [
							{
								"item_code": self.item, "bom_no": self.bom, "required_qty": 8.0,
								"stock_uom": "Kg", "department": self.department, "warehouse": self.warehouse,
								"component_vector": [{"item_code": self.raw, "required_qty": 40.0, "stock_uom": "Kg"}],
								"sourcing_mode": "IN_HOUSE",
							}
						],
						"external_receipt_targets": [],
					}
				},
				[],
			),
		):
			grown = generate_transfer_material_request_for_production_plan(plan.name)

		self.assertIsNotNone(grown["material_request"])
		self.assertNotEqual(grown["material_request"], first_mr_name)
		self.assertEqual(grown["rows"][0]["qty"], 20.0)  # 40 Kg owed - 20 Kg already requested

		# The first MR is untouched -- never amended.
		original = frappe.get_doc("Material Request", first_mr_name)
		self.assertEqual(original.docstatus, 1)
		self.assertEqual(flt(original.items[0].qty), 20.0)

	def test_creating_department_plan_generates_submitted_requests_once(self):
		"""Change 1: ``create_or_get_department_production_plans`` now raises
		the Purchase and Transfer Material Requests itself, as part of plan
		creation -- a submitted Transfer request per department plus one
		Purchase request per department plan -- without anything else calling
		either generator. A second call for the same (unchanged) picture must
		not duplicate either request (D15's supplementary logic makes the
		repeat safe, layered under D14's own idempotent plan creation)."""
		doc = make_real_sales_plan(
			[{"item_code": self.item, "qty": 4, "production_policy": "PRE_PRODUCED", "department": self.department, "bom": self.bom}]
		)
		doc = advance_plan_to_approved(doc)

		first = create_or_get_department_production_plans(doc, submit=True)
		plan_name = first["production_plans"][0]["production_plan"]

		self.assertEqual(first["material_requests"]["errors"], [])
		self.assertEqual(len(first["material_requests"]["purchases"]), 1)
		self.assertEqual(first["material_requests"]["purchases"][0]["department"], self.department)
		self.assertEqual(first["material_requests"]["purchases"][0]["production_plan"], plan_name)
		self.assertEqual(len(first["material_requests"]["transfers"]), 1)
		self.assertEqual(first["material_requests"]["transfers"][0]["department"], self.department)

		purchase_mr = frappe.get_doc(
			"Material Request", first["material_requests"]["purchases"][0]["material_request"]
		)
		self.assertEqual(purchase_mr.docstatus, 1)
		self.assertEqual(purchase_mr.material_request_type, "Purchase")
		for row in purchase_mr.items:
			self.assertEqual(row.production_plan, plan_name)

		transfer_mr = frappe.get_doc(
			"Material Request", first["material_requests"]["transfers"][0]["material_request"]
		)
		self.assertEqual(transfer_mr.docstatus, 1)
		self.assertEqual(transfer_mr.material_request_type, "Material Transfer")

		# A second call for the same picture creates neither department plan
		# nor request again.
		second = create_or_get_department_production_plans(doc, submit=True)
		self.assertFalse(second["production_plans"][0]["created"])
		self.assertEqual(second["material_requests"]["purchases"], [])
		self.assertEqual(second["material_requests"]["transfers"], [])
		self.assertEqual(second["material_requests"]["errors"], [])

		linked = frappe.db.sql(
			"""
			select mr.material_request_type as material_request_type,
			       count(distinct mri.parent) as request_count
			from `tabMaterial Request Item` mri
			inner join `tabMaterial Request` mr on mr.name = mri.parent
			where mri.production_plan = %s and mr.docstatus = 1
			group by mr.material_request_type
			""",
			(plan_name,),
			as_dict=True,
		)
		counts = {row.material_request_type: row.request_count for row in linked}
		self.assertEqual(counts.get("Purchase"), 1)
		self.assertEqual(counts.get("Material Transfer"), 1)


# ---------------------------------------------------------------------------
# H. The one fully-committing end-to-end test (real prepare_production job)
# ---------------------------------------------------------------------------


class TestFullHappyPathEndToEnd(FrappeTestCase):
	"""Scenario 1, run through the *actual* whitelisted entry points a
	manager's click would invoke, including the real background job body
	(``run_prepare_production_job``) -- not the equivalent direct calls
	used elsewhere in this file. This is the only test in the suite that
	commits, and it is solely responsible for undoing everything it does
	(see module docstring)."""

	def setUp(self):
		ensure_base_fixtures()
		frappe.set_user("Administrator")
		self.suffix = _uniq("AGT10H")
		self.store = make_warehouse(f"{self.suffix} Store")
		self.warehouse = make_warehouse(f"{self.suffix} Dept WH")
		self.department = make_department(f"{self.suffix} Dept", self.warehouse)
		self.unit = make_production_unit(f"{self.suffix} Unit", self.department)
		self.raw = make_item(f"{self.suffix}-RAW")
		self.item = make_item(f"{self.suffix}-ITEM")
		self.bom = make_bom(self.item, [(self.raw, 2, "Kg")])
		make_config(self.item, self.department, self.unit, self.bom)

		self._store_before = frappe.db.get_single_value("URY Production Settings", "store_warehouse")
		frappe.db.set_single_value("URY Production Settings", "store_warehouse", self.store)
		frappe.db.commit()

		self._cleanup = []  # (doctype, name) undone in this order in tearDown

	def tearDown(self):
		# Undo transactional documents first (Sales Plan, Production Plan,
		# Work Order, Stock Entries, Material Requests) -- everything else
		# below links to these, so master data can only be deleted once
		# they are gone.
		cleanup_docs(self._cleanup)
		frappe.db.set_single_value("URY Production Settings", "store_warehouse", self._store_before)
		# Then the master data this test created, so this genuinely
		# committing test leaves nothing behind on the shared dev site.
		# Routed through `cleanup_docs` too (it cancels a submitted BOM
		# before deleting it, and commits after each successful step) --
		# an earlier version of this method used its own inline loop that
		# both skipped cancelling the submitted BOM and shared
		# `cleanup_docs`'s original bug of rolling back the whole
		# connection, undoing earlier successful deletes, on the first
		# failure later in the same loop.
		config_name = frappe.db.get_value(
			"URY Item Production Configuration", {"item": self.item, "branch": BRANCH}, "name"
		)
		cleanup_docs(
			[
				("URY Item Production Configuration", config_name),
				("BOM", self.bom),
				("Item", self.item),
				("Item", self.raw),
				("URY Production Unit", self.unit),
				("URY Production Department", self.department),
				("Warehouse", self.warehouse),
				("Warehouse", self.store),
			]
		)

	def test_lock_to_production_completed_through_the_real_job(self):
		receipt_name = stock_receipt(self.raw, self.store, 100)
		self._cleanup.insert(0, ("Stock Entry", receipt_name))
		frappe.db.commit()

		doc = make_real_sales_plan(
			[{"item_code": self.item, "qty": 5, "production_policy": "PRE_PRODUCED", "department": self.department, "bom": self.bom}]
		)
		self._cleanup.insert(0, ("URY Sales Plan", doc.name))
		doc = advance_plan_to_approved(doc)
		frappe.db.set_single_value("URY Production Settings", "enable_auto_production_plan", 1)
		frappe.db.commit()

		doc = transition_sales_plan(doc, "Locked for Production")
		live = get_live_production_plans(doc.name)
		self.assertEqual(len(live), 1)
		plan_name = live[0]["name"]
		self._cleanup.insert(0, ("Production Plan", plan_name))
		frappe.db.commit()

		generate_transfer_material_request_for_production_plan(plan_name)
		frappe.db.commit()

		# This dev environment has real `bench worker` processes running
		# (verified: two live `bench worker` processes at test-writing
		# time). `prepare_production`'s own `frappe.enqueue(...,
		# enqueue_after_commit=True)` genuinely fires once we commit below
		# -- a live worker would then race this test's own direct call to
		# `run_prepare_production_job` a few lines down, executing the same
		# job body against the same Production Plan from two separate DB
		# connections. That raced, non-deterministically, into ERPNext's
		# own `Production Plan.db_set()` -> `load_doc_before_save()` and
		# surfaced as `QueryDeadlockError: Record has changed since last
		# read` the first time this test was written without this patch --
		# a genuine environmental hazard worth recording (see this
		# module's test report), not a defect in any URY module. Patching
		# out the enqueue call is the correct fix for *this test*: it
		# already intends to run the job body itself, synchronously, right
		# below, so a second, real, concurrent execution must not also
		# happen.
		with patch("ury.ury.api.ury_prepare_production.frappe.enqueue"):
			outcome = prepare_production(plan_name)
		self.assertEqual(outcome["status"], "processing")
		frappe.db.commit()

		# Simulate the worker: call the real job body synchronously.
		run_prepare_production_job(plan_name, outcome["attempt"])

		state = get_production_state(plan_name)
		self.assertEqual(state["production_state"], "Production Completed")
		result = state["result"]
		self.assertTrue(result["work_orders"])
		self.assertTrue(result["manufacture_stock_entries"])

		# Build the cleanup order explicitly, most-dependent-first: ERPNext
		# refuses to cancel a Work Order while a submitted Stock Entry still
		# links to it, and refuses to cancel a Material Request while a
		# submitted Stock Entry still references it, so every Stock Entry
		# this run created must be cancelled *before* the Work Orders and
		# Material Requests below it in this list. `self._cleanup` already
		# has (in this order) [Production Plan, Sales Plan, raw-material
		# receipt Stock Entry] from earlier in this test -- prepending here
		# keeps the receipt (the very first stock movement, chronologically)
		# last, which is also the correct order for unwinding the stock
		# ledger.
		transfer_mrs = frappe.get_all(
			"Material Request Item", filters={"production_plan": plan_name}, pluck="parent"
		)
		ordered_new_cleanup = (
			[("Stock Entry", name) for name in result["manufacture_stock_entries"]]
			+ [("Stock Entry", name) for name in result.get("stock_entries", [])]
			+ [("Work Order", name) for name in result["work_orders"]]
			+ [("Material Request", name) for name in set(transfer_mrs)]
		)
		self._cleanup = ordered_new_cleanup + self._cleanup

		# The manager never had to open a Work Order: everything reachable
		# through the whitelisted, department-scoped API surface alone.
		work_order = frappe.get_doc("Work Order", result["work_orders"][0])
		self.assertEqual(work_order.docstatus, 1)
		self.assertEqual(flt(work_order.produced_qty), 5.0)
		self.assertEqual(bin_qty(self.item, self.warehouse), 5.0)
