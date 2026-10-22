# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Unit & integration tests for the URY UAT data simulator (phase 5).

Covers the guard module, the POS runner, the manufacturing runner and the
phase-4 service coordinator. Everything runs against the real site
(uryv16.localhost) with its real fixtures -- branch "URY JVC" / POS Profile
"URY JVC" / company "URY UAE", the sim cashier user, free URY Tables -- while
authorization is toggled through an in-memory ``frappe.conf`` patch, so
``site_config.json`` is never touched.

The tested code commits internally, and FrappeTestCase rolls back only at
class teardown, so every test registers explicit cleanup for the documents it
creates and uses far-future business dates to stay clear of both real runs
and single-flight scopes used by other tests.

Run:
    bench --site uryv16.localhost run-tests --module ury.ury.simulator.test_simulator
"""

from contextlib import ExitStack, contextmanager
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, get_datetime, getdate, now_datetime

from ury.ury.api.ury_prepare_production import STATE_COMPLETED
from ury.ury.simulator import manufacturing_runner, pos_runner, service
from ury.ury.simulator.guards import DISABLED_MESSAGE

SIMULATION_RUN_DOCTYPE = "URY Simulation Run"
POS_OPENING_DOCTYPE = "POS Opening Entry"

#: Real fixtures on uryv16.localhost (verified phase 2-4 dev runs).
BRANCH = "URY JVC"
COMPANY = "URY UAE"
POS_PROFILE = "URY JVC"
SIM_CASHIER = service.SIM_CASHIER_USER

_MISSING = object()


@contextmanager
def _sim_conf(remove=(), **overrides):
	"""Temporarily override site config values in memory (never on disk).

	``remove`` lists keys that must be unset entirely (simulating a config
	where the key was never written). Original values are restored on exit.
	"""
	keys = set(overrides or {}) | set(remove)
	saved = {key: frappe.conf.get(key, _MISSING) for key in keys}
	for key in remove:
		frappe.conf.pop(key, None)
	frappe.conf.update(overrides or {})
	try:
		yield
	finally:
		for key, value in saved.items():
			if value is _MISSING:
				frappe.conf.pop(key, None)
			else:
				frappe.conf[key] = value


def _purge_doc(doctype, name):
	"""Hard-delete a document created by a test and commit the removal."""
	if frappe.db.exists(doctype, name):
		frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
		frappe.db.commit()


def _build_run_doc(business_date, branch=BRANCH, status="Pending", slots=0):
	run = frappe.get_doc(
		{
			"doctype": SIMULATION_RUN_DOCTYPE,
			"run_id": "SIM-TEST-{0}-{1}".format(
				str(business_date).replace("-", ""), frappe.generate_hash(length=6)
			),
			"status": status,
			"business_date": business_date,
			"company": COMPANY,
			"branch": branch,
			"pos_profile": POS_PROFILE,
		}
	)
	for i in range(slots):
		run.append(
			"slots",
			{
				"slot_number": i + 1,
				"slot_time": "09:00:00",
				"scenario": pos_runner.SCENARIO_CYCLE[i % len(pos_runner.SCENARIO_CYCLE)],
				"status": "Pending",
			},
		)
	return run


def _make_run(test, business_date, slots=0, branch=BRANCH):
	"""Insert a run doc (caller must hold authorization) and register cleanup."""
	run = _build_run_doc(business_date, branch=branch, slots=slots)
	run.insert(ignore_permissions=True)
	test.addCleanup(_purge_doc, SIMULATION_RUN_DOCTYPE, run.name)
	return run


def _make_draft_opening(test, period_start):
	"""Insert a draft POS Opening Entry (never submitted) as a link target.

	Draft because the slot generator only reads ``period_start_date``; a draft
	carries no stock or session side effects and is deleted in cleanup. The
	sim cashier is used because pre-existing users carry stale open sessions
	(phase 3, Finding A) and the cashier has none on this site.
	"""
	profile = frappe.get_doc("POS Profile", POS_PROFILE)
	balance_details = [
		{"mode_of_payment": payment.mode_of_payment, "opening_amount": 0.0}
		for payment in profile.payments
		if payment.mode_of_payment
	]
	opening = frappe.get_doc(
		{
			"doctype": POS_OPENING_DOCTYPE,
			"company": COMPANY,
			"pos_profile": POS_PROFILE,
			"user": SIM_CASHIER,
			"period_start_date": period_start,
			"posting_date": str(getdate(period_start)),
			"balance_details": balance_details,
		}
	)
	opening.insert(ignore_permissions=True)
	test.addCleanup(_purge_doc, POS_OPENING_DOCTYPE, opening.name)
	return opening


class TestSimulatorGuards(FrappeTestCase):
	def test_guard_fails_closed_by_default(self):
		with _sim_conf(remove=("allow_uat_simulator",)):
			with self.assertRaises(frappe.ValidationError) as cm:
				from ury.ury.simulator.guards import assert_uat_simulator_authorized

				assert_uat_simulator_authorized()
		self.assertIn(DISABLED_MESSAGE, str(cm.exception))

	def test_guard_allows_authorized_site(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			from ury.ury.simulator.guards import assert_uat_simulator_authorized

			# Must not raise: allow_uat_simulator + developer_mode on a .localhost site.
			assert_uat_simulator_authorized()

	def test_guard_refuses_production(self):
		from ury.ury.simulator.guards import assert_uat_simulator_authorized

		for key in ("production", "is_production"):
			with _sim_conf(allow_uat_simulator=True, developer_mode=1, **{key: True}):
				with self.assertRaises(frappe.ValidationError) as cm:
					assert_uat_simulator_authorized()
			self.assertIn("is marked production", str(cm.exception))
			self.assertIn(key, str(cm.exception))

	def test_guard_refuses_non_allowed_site(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=0):
			with self.assertRaises(frappe.ValidationError) as cm:
				from ury.ury.simulator.guards import assert_uat_simulator_authorized

				assert_uat_simulator_authorized()
		self.assertIn("not authorized for site", str(cm.exception))
		self.assertIn(frappe.local.site, str(cm.exception))

	def test_guard_allows_explicit_allowed_sites(self):
		with _sim_conf(
			allow_uat_simulator=True,
			developer_mode=0,
			uat_simulator_allowed_sites=[frappe.local.site],
		):
			from ury.ury.simulator.guards import assert_uat_simulator_authorized

			# developer_mode off, but the site is listed explicitly: allowed.
			assert_uat_simulator_authorized()

	def test_is_uat_simulator_enabled(self):
		from ury.ury.simulator.guards import is_uat_simulator_enabled

		with _sim_conf(remove=("allow_uat_simulator",)):
			self.assertFalse(is_uat_simulator_enabled())
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			self.assertTrue(is_uat_simulator_enabled())
		# Even a "hostile" config (production flag set) must not throw.
		with _sim_conf(allow_uat_simulator=True, production=True):
			self.assertFalse(is_uat_simulator_enabled())
		# And the result is always a real bool, never None.
		self.assertIsInstance(is_uat_simulator_enabled(), bool)


class TestPosRunner(FrappeTestCase):
	def test_entry_points_fail_closed(self):
		cases = [
			(pos_runner.open_pos_session, ("SIM-NOPE",)),
			(pos_runner.generate_simulation_slots, ("SIM-NOPE",)),
			(pos_runner.process_slot_order, ("SIM-NOPE", 1)),
			(pos_runner.close_pos_session, ("SIM-NOPE",)),
			(pos_runner.run_pos_simulation, ("SIM-NOPE",)),
		]
		with _sim_conf(remove=("allow_uat_simulator",)):
			for fn, args in cases:
				with self.subTest(entry_point=fn.__name__):
					with self.assertRaises(frappe.ValidationError) as cm:
						fn(*args)
					self.assertIn("disabled", str(cm.exception))

	def test_generate_simulation_slots_distribution_and_times(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			period_start = datetime(2030, 1, 1, 9, 0, 0)
			opening = _make_draft_opening(self, period_start)
			run = _make_run(self, "2030-01-01")
			run.pos_opening_entry = opening.name
			run.save(ignore_permissions=True)

			slots = pos_runner.generate_simulation_slots(run, count=8)

			self.assertEqual(len(slots), 8)
			# Scenario cycle: Takeaway / Dine-in / Delivery / Aggregator, repeated.
			scenarios = [slot.scenario for slot in slots]
			self.assertEqual(
				scenarios,
				["Takeaway", "Dine-in", "Delivery", "Aggregator"] * 2,
			)
			# Slots are anchored to the opening's period_start and spaced
			# SLOT_INTERVAL_MINUTES apart, starting one interval in.
			for i, slot in enumerate(slots):
				expected = (
					period_start + timedelta(minutes=pos_runner.SLOT_INTERVAL_MINUTES * (i + 1))
				).time()
				self.assertEqual(pos_runner._as_time(slot.slot_time), expected)
				self.assertEqual(slot.status, "Pending")
				self.assertEqual(slot.slot_number, i + 1)

			# Idempotent: a second call returns the existing table untouched.
			again = pos_runner.generate_simulation_slots(
				frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name), count=4
			)
			self.assertEqual(len(again), 8)
			self.assertEqual([s.name for s in again], [s.name for s in slots])

	def test_generate_slots_requires_opening_entry(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			run = _make_run(self, "2030-01-02")
			with self.assertRaises(frappe.ValidationError) as cm:
				pos_runner.generate_simulation_slots(run, count=4)
			self.assertIn("Open a POS session", str(cm.exception))

	def test_table_lease_and_release(self):
		branch = "URY Barsha"
		free_table = frappe.db.get_value(
			"URY Table", {"branch": branch, "occupied": 0, "is_take_away": 0}, "name"
		)
		self.assertTrue(free_table, "expected a free non-takeaway URY Table on this site")

		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			leased = pos_runner._lease_table(branch)
			self.assertTrue(leased)
			self.addCleanup(
				lambda: (frappe.db.set_value("URY Table", leased, "occupied", 0), frappe.db.commit())
			)
			self.assertEqual(frappe.db.get_value("URY Table", leased, "occupied"), 1)

			pos_runner._free_table(leased)
			self.assertEqual(frappe.db.get_value("URY Table", leased, "occupied"), 0)

	def test_lease_table_returns_none_when_full(self):
		branch = "URY Barsha"
		# Occupy every free table, then _lease_table must give up with None.
		free_tables = frappe.get_all(
			"URY Table",
			filters={"branch": branch, "occupied": 0, "is_take_away": 0},
			pluck="name",
		)
		self.assertTrue(free_tables)
		for name in free_tables:
			frappe.db.set_value("URY Table", name, "occupied", 1)
		self.addCleanup(
			lambda: (
				[frappe.db.set_value("URY Table", n, "occupied", 0) for n in free_tables],
				frappe.db.commit(),
			)
		)
		self.assertIsNone(pos_runner._lease_table(branch))

	def test_as_time_coercions(self):
		from datetime import time as dt_time
		from datetime import timedelta

		self.assertEqual(pos_runner._as_time(dt_time(9, 5)), dt_time(9, 5))
		self.assertEqual(pos_runner._as_time(timedelta(hours=9, minutes=5)), dt_time(9, 5))
		self.assertEqual(pos_runner._as_time("09:05:00"), dt_time(9, 5))


class TestManufacturingRunner(FrappeTestCase):
	def test_run_manufacturing_simulation_fails_closed(self):
		with _sim_conf(remove=("allow_uat_simulator",)):
			with self.assertRaises(frappe.ValidationError) as cm:
				manufacturing_runner.run_manufacturing_simulation("SIM-NOPE")
		self.assertIn("disabled", str(cm.exception))

	def test_active_bom_configs_returns_only_configured_items(self):
		rows = manufacturing_runner._active_bom_configs(BRANCH)
		self.assertTrue(rows)
		for row in rows:
			self.assertTrue(row["item"])
			self.assertTrue(row["bom"])

	def test_discover_items_returns_menu_items_with_active_bom_configs(self):
		items = manufacturing_runner._discover_items(BRANCH)
		self.assertTrue(items)
		self.assertTrue(all(isinstance(item, str) for item in items))
		# Every discovered item must hold an active production config with a BOM.
		configured = {row["item"] for row in manufacturing_runner._active_bom_configs(BRANCH)}
		self.assertTrue(set(items) <= configured)
		# Menu-first: the branch has an enabled menu, so discovery is menu-driven
		# and deterministic (deduplicated, order-preserved).
		self.assertEqual(len(items), len(set(items)))

	def test_mocked_pipeline_marks_run_manufacturing_done(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			# The pipeline stamps a fake Sales Plan link onto the real run doc;
			# skip only the link-existence check for that fake target.
			link_patch = patch("frappe.model.document.Document._validate_links", lambda self: None)
			link_patch.start()
			self.addCleanup(link_patch.stop)

			run = _make_run(self, "2030-05-05")
			with patch.multiple(
				"ury.ury.simulator.manufacturing_runner",
				_get_or_create_sales_plan=lambda *a, **k: (SimpleNamespace(name="SIM-TEST-SP-1"), True),
				_advance_sales_plan_to_locked=lambda sp: sp,
				_ensure_department_production_plans=lambda sp: ["PP-SIM-1"],
				get_store_warehouse=lambda company: "Stores - SIM",
				_replenish_store=lambda *a, **k: {"stocked": {}},
				_prepare_all_plans=lambda plans: [
					{"production_plan": "PP-SIM-1", "state": STATE_COMPLETED}
				],
			):
				result = manufacturing_runner.run_manufacturing_simulation(
					run, items=["ITEM-SIM-1"], target_quantities={"ITEM-SIM-1": 5}
				)

			self.assertEqual(result["status"], "completed")
			self.assertEqual(result["sales_plan"], "SIM-TEST-SP-1")
			self.assertEqual(result["production_plans"], ["PP-SIM-1"])
			fresh = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
			self.assertEqual(fresh.status, "Manufacturing Done")
			self.assertEqual(fresh.sales_plan, "SIM-TEST-SP-1")

	def test_mocked_pipeline_failure_stamps_run_failed(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			link_patch = patch("frappe.model.document.Document._validate_links", lambda self: None)
			link_patch.start()
			self.addCleanup(link_patch.stop)

			run = _make_run(self, "2030-05-06")
			with patch.multiple(
				"ury.ury.simulator.manufacturing_runner",
				_get_or_create_sales_plan=lambda *a, **k: (SimpleNamespace(name="SIM-TEST-SP-2"), True),
				_advance_sales_plan_to_locked=lambda sp: sp,
				_ensure_department_production_plans=lambda sp: ["PP-SIM-2"],
				get_store_warehouse=lambda company: "Stores - SIM",
				_replenish_store=lambda *a, **k: {"stocked": {}},
				_prepare_all_plans=lambda plans: [
					{"production_plan": "PP-SIM-2", "state": "Production Failed", "error": "boom"}
				],
			):
				with self.assertRaises(frappe.ValidationError) as cm:
					manufacturing_runner.run_manufacturing_simulation(run, items=["ITEM-SIM-2"])

			self.assertIn("Production Failed", str(cm.exception))
			fresh = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
			self.assertEqual(fresh.status, "Failed")
			self.assertIn("Production Failed", fresh.error_summary or "")


class TestServiceCoordinator(FrappeTestCase):
	def test_run_daily_simulation_fails_closed(self):
		with _sim_conf(remove=("allow_uat_simulator",)):
			with self.assertRaises(frappe.ValidationError):
				service.run_daily_simulation(BRANCH, business_date="2030-09-09")

	def test_process_scheduled_slot_fail_silent_when_disabled(self):
		with patch.object(service, "is_uat_simulator_enabled", return_value=False), patch.object(
			service, "_assume_sim_cashier"
		) as mock_cashier, patch.object(service, "_process_one_scheduled_slot") as mock_process:
			result = service.process_scheduled_slot()
		self.assertIsNone(result)
		mock_cashier.assert_not_called()
		mock_process.assert_not_called()

	def test_get_or_create_daily_run_single_flight(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			business_date = "2030-07-04"
			run1 = service.get_or_create_daily_run(BRANCH, business_date=business_date)
			self.addCleanup(_purge_doc, SIMULATION_RUN_DOCTYPE, run1.name)
			self.assertEqual(run1.branch, BRANCH)
			self.assertEqual(run1.business_date, getdate(business_date))
			self.assertEqual(run1.status, "Pending")
			self.assertEqual(str(run1.pos_profile), POS_PROFILE)
			self.assertEqual(str(run1.company), COMPANY)

			# Second call for the same scope returns the existing run.
			run2 = service.get_or_create_daily_run(BRANCH, business_date=business_date)
			self.assertEqual(run2.name, run1.name)

			# A terminal run no longer blocks: a fresh run is created.
			frappe.db.set_value(SIMULATION_RUN_DOCTYPE, run1.name, "status", "Failed")
			run3 = service.get_or_create_daily_run(BRANCH, business_date=business_date)
			self.addCleanup(_purge_doc, SIMULATION_RUN_DOCTYPE, run3.name)
			self.assertNotEqual(run3.name, run1.name)
			self.assertEqual(run3.status, "Pending")

	def test_claim_slot_atomic_lease(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			run = _make_run(self, "2030-06-01", slots=2)
			run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
			now = now_datetime()

			claimed = service._claim_slot(run, run.slots[0], now)
			self.assertTrue(claimed)

			run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
			slot = run.slots[0]
			self.assertEqual(slot.status, "Processing")
			self.assertEqual(slot.attempts, 1)
			self.assertTrue(slot.lease_owner)
			self.assertEqual(get_datetime(slot.leased_until), add_to_date(now, minutes=service.LEASE_MINUTES))
			# The sibling slot is untouched.
			self.assertEqual(run.slots[1].status, "Pending")
			self.assertFalse(run.slots[1].leased_until)

			# A second claim while the lease is held loses (single-flight lease).
			self.assertFalse(service._claim_slot(run, run.slots[0], now))

	def test_find_claimable_slot_skips_active_lease(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			run = _make_run(self, "2030-06-02", slots=3)
			run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
			now = now_datetime()

			first = service._find_claimable_slot(run, now)
			self.assertEqual(first.slot_number, 1)

			service._claim_slot(run, first, now)

			run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
			second = service._find_claimable_slot(run, now)
			self.assertEqual(second.slot_number, 2)

	def test_generate_run_report_formats_markdown(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			run = _make_run(self, "2030-08-08", slots=3)
			run.total_invoices = 2
			run.total_revenue = 123.5
			run.takeaway_invoices = 1
			run.dine_in_invoices = 1
			run.save(ignore_permissions=True)

			report = service.generate_run_report(frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name))

			self.assertIn("# URY UAT Simulation Report", report)
			self.assertIn(run.name, report)  # run ID
			self.assertIn(BRANCH, report)  # branch
			self.assertIn("## Manufacturing", report)
			self.assertIn("## Invoices", report)
			self.assertIn("## Slots", report)
			# Scenario counters.
			self.assertIn("Takeaway: 1", report)
			self.assertIn("Dine-in: 1", report)
			self.assertIn("Delivery: 0", report)
			self.assertIn("Aggregator: 0", report)
			# Slot table rows, one per slot, in slot-number order.
			for i in range(1, 4):
				self.assertIn("| {0} |".format(i), report)
			self.assertIn("Takeaway", report)
			self.assertIn("Dine-in", report)
			# Session links render (empty session -> placeholder dash).
			self.assertIn("Opening Entry: -", report)

	def test_slot_terminal_logic(self):
		run = _build_run_doc("2030-08-09", slots=4)
		run.slots[0].status = "Completed"
		run.slots[1].status = "Skipped"
		run.slots[2].status = "Failed"
		run.slots[2].attempts = 3
		run.slots[2].max_attempts = 3
		run.slots[3].status = "Failed"
		run.slots[3].attempts = 1
		run.slots[3].max_attempts = 3
		self.assertTrue(service._slot_terminal(run.slots[0]))
		self.assertTrue(service._slot_terminal(run.slots[1]))
		self.assertTrue(service._slot_terminal(run.slots[2]))
		self.assertFalse(service._slot_terminal(run.slots[3]))


class TestPerBranchCashier(FrappeTestCase):
	"""Phase 3 (multi-branch audit): one simulator cashier per branch."""

	def test_get_or_create_sim_cashier_creates_user_with_roles(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			branch = "Sim Cashier Test Branch"
			email = service.get_or_create_sim_cashier(branch)
			try:
				self.assertEqual(email, "sim.cashier.sim_cashier_test_branch@ury.local")
				user = frappe.get_doc("User", email)
				self.assertEqual(user.first_name, "Sim Cashier {0}".format(branch))
				self.assertEqual(user.user_type, "System User")
				self.assertEqual(user.enabled, 1)
				roles = {row.role for row in user.roles}
				self.assertIn("URY Cashier", roles)
				self.assertIn("System Manager", roles)
				# Idempotent: a second call returns the existing user untouched.
				self.assertEqual(service.get_or_create_sim_cashier(branch), email)
			finally:
				_purge_doc("User", email)

	def test_get_or_create_sim_cashier_scrambles_branch_into_email_local_part(self):
		# frappe.scrub keeps the mapping deterministic and collision-free.
		self.assertEqual(
			frappe.scrub("URY Barsha"),
			"ury_barsha",
		)
		self.assertEqual(
			frappe.scrub("Golden Fork Jumeirah"),
			"golden_fork_jumeirah",
		)

	def test_get_or_create_sim_cashier_fails_closed(self):
		with _sim_conf(remove=("allow_uat_simulator",)):
			with self.assertRaises(frappe.ValidationError) as cm:
				service.get_or_create_sim_cashier("Nope Branch")
		self.assertIn("disabled", str(cm.exception))
		# The guard fired before any user could be created.
		self.assertFalse(frappe.db.exists("User", "sim.cashier.nope_branch@ury.local"))

	def test_assume_sim_cashier_switches_to_branch_user(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			branch = "Sim Cashier Test Branch"
			email = service.get_or_create_sim_cashier(branch)
			# LIFO: restore the session user BEFORE deleting the cashier.
			self.addCleanup(_purge_doc, "User", email)
			self.addCleanup(frappe.set_user, frappe.session.user)

			service._assume_sim_cashier(branch)
			self.assertEqual(frappe.session.user, email)


class TestStaleSessionCleanup(FrappeTestCase):
	"""Phase 3 (multi-branch audit): abandoned prior-day sessions unblock."""

	def test_cancel_stale_open_sessions_noop_when_nothing_stale(self):
		self.assertEqual(
			pos_runner.cancel_stale_open_sessions(POS_PROFILE, business_date="2030-01-01"),
			[],
		)

	def test_cancel_stale_open_sessions_cancels_abandoned_session(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			opening = _make_draft_opening(self, datetime(2026, 1, 1, 9, 0, 0))
			opening.submit()  # docstatus 1, status Open, opened long ago
			self.assertEqual(frappe.db.get_value(POS_OPENING_DOCTYPE, opening.name, "status"), "Open")
			self.addCleanup(_purge_doc, POS_OPENING_DOCTYPE, opening.name)

			cancelled = pos_runner.cancel_stale_open_sessions(
				POS_PROFILE, business_date="2030-01-01"
			)
			self.assertEqual(cancelled, [opening.name])
			fresh = frappe.get_doc(POS_OPENING_DOCTYPE, opening.name)
			self.assertEqual(fresh.docstatus, 2)
			self.assertEqual(fresh.status, "Cancelled")

			# Idempotent: nothing stale remains.
			self.assertEqual(
				pos_runner.cancel_stale_open_sessions(POS_PROFILE, business_date="2030-01-01"),
				[],
			)


class TestMultiBranchDiscovery(FrappeTestCase):
	"""Phase 3 (multi-branch audit): branch discovery for the initiator."""

	def test_get_active_simulation_branches(self):
		branches = service.get_active_simulation_branches()
		self.assertIsInstance(branches, list)
		# Every branch on this site has an enabled POS Profile AND menu
		# (verified in ongoing/multi-company-simulator-audit/01-recon.md, T3).
		for expected in (
			"URY",
			"URY Barsha",
			"URY JVC",
			"URY Muscat",
			"URY Salalah",
			"Golden Fork Jumeirah",
		):
			self.assertIn(expected, branches)
		self.assertEqual(len(branches), len(set(branches)))

	def test_discovery_skips_branch_without_menu(self):
		branch = "SIM Menuless Branch"
		if not frappe.db.exists("Branch", branch):
			branch_doc = frappe.get_doc({"doctype": "Branch", "branch": branch})
			branch_doc.append("user", {"user": frappe.session.user})
			branch_doc.insert(ignore_permissions=True)
		self.addCleanup(_purge_doc, "Branch", branch)

		profile = frappe.copy_doc(frappe.get_doc("POS Profile", POS_PROFILE), ignore_no_copy=True)
		profile.name = "SIM Menuless Profile"
		profile.branch = branch
		# The copy inherits applicable_for_users rows whose per-user
		# "default" flag is unique across profiles -- drop them.
		profile.set("applicable_for_users", [])
		profile.insert(ignore_permissions=True)
		self.addCleanup(_purge_doc, "POS Profile", profile.name)

		self.assertNotIn(branch, service.get_active_simulation_branches())


class TestAllBranchesInitiation(FrappeTestCase):
	"""Phase 3 (multi-branch audit): the morning initiator fan-out."""

	def test_initiate_silent_noop_when_disabled(self):
		with _sim_conf(remove=("allow_uat_simulator",)):
			self.assertEqual(service.initiate_daily_simulation_for_all_branches(), [])

	def _patch_branch_pipeline(self, runs, calls, opening_names):
		"""Patch the per-branch pipeline; fakes persist state like the real steps.

		``opening_names`` maps branch -> a real (draft) POS Opening Entry name:
		``run.pos_opening_entry`` is a Link field, so fakes must point at
		existing documents. Returns ``(patches, fake_manufacturing)``.
		"""

		def fake_get_or_create_daily_run(branch=None, company=None, pos_profile=None, business_date=None):
			return runs[branch]

		def fake_manufacturing(run):
			calls["manufactured"].append(run.branch)
			calls["mfg_user"].append(frappe.session.user)
			frappe.db.set_value(SIMULATION_RUN_DOCTYPE, run.name, "status", "Manufacturing Done")
			return {"status": "completed"}

		def fake_open(run):
			calls["opened"].append(run.branch)
			frappe.db.set_value(
				SIMULATION_RUN_DOCTYPE,
				run.name,
				{
					"status": "POS Open",
					"pos_opening_entry": opening_names[run.branch],
				},
			)

		def fake_slots(run, count=12):
			calls["slots"].append((run.branch, count))
			run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
			for i in range(count):
				run.append(
					"slots",
					{
						"slot_number": i + 1,
						"slot_time": "09:00:00",
						"scenario": "Takeaway",
						"status": "Pending",
					},
				)
			run.save(ignore_permissions=True)

		patches = [
			patch.object(
				service, "get_or_create_daily_run", side_effect=fake_get_or_create_daily_run
			),
			patch.object(service, "run_manufacturing_simulation", side_effect=fake_manufacturing),
			patch.object(service, "open_pos_session", side_effect=fake_open),
			patch.object(service, "generate_simulation_slots", side_effect=fake_slots),
			# The fake switches the session user for real, like production:
			# without the initiator's per-branch reset, branch 2's
			# manufacturing would run as branch 1's cashier.
			patch.object(
				service,
				"_assume_sim_cashier",
				side_effect=lambda branch=None: (
					calls["cashier"].append(branch),
					frappe.set_user("sim.cashier.{0}@ury.local".format(frappe.scrub(branch))),
				),
			),
		]
		return patches, fake_manufacturing

	def _make_committed_run_with_opening(self, business_date, branch):
		"""A real run + real (draft) opening entry, committed so a branch's
		error rollback inside the initiator cannot wipe the fixture."""
		run = _make_run(self, business_date, branch=branch)
		opening = _make_draft_opening(self, datetime(2030, 1, 1, 8, 0, 0))
		frappe.db.commit()
		return run, opening

	def test_initiate_fanout_manufacture_open_and_slot_each_branch(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			branches = ["URY JVC", "Golden Fork Jumeirah"]
			runs, opening_names = {}, {}
			for branch in branches:
				run, opening = self._make_committed_run_with_opening("2030-03-01", branch)
				runs[branch] = run
				opening_names[branch] = opening.name
			calls = {
				"manufactured": [],
				"mfg_user": [],
				"opened": [],
				"slots": [],
				"cashier": [],
			}
			original_user = frappe.session.user
			self.addCleanup(frappe.set_user, original_user)
			patches, _ = self._patch_branch_pipeline(runs, calls, opening_names)
			patches.insert(0, patch.object(service, "get_active_simulation_branches", return_value=branches))
			with ExitStack() as stack:
				for p in patches:
					stack.enter_context(p)
				results = service.initiate_daily_simulation_for_all_branches(
					business_date="2030-03-01", slot_count=7
				)

			self.assertEqual(len(results), 2)
			by_branch = {row["branch"]: row for row in results}
			for branch in branches:
				row = by_branch[branch]
				self.assertEqual(row["run_id"], runs[branch].name)
				self.assertEqual(row["status"], "POS Open")
				self.assertEqual(row["business_date"], "2030-03-01")
				self.assertEqual(row["pos_opening_entry"], opening_names[branch])
				self.assertEqual(row["slots"], 7)
			self.assertEqual(calls["manufactured"], branches)
			self.assertEqual(calls["opened"], branches)
			self.assertEqual(calls["slots"], [(branch, 7) for branch in branches])
			# Each branch ran as its own cashier.
			self.assertEqual(calls["cashier"], branches)
			# Regression: every branch's manufacturing ran as the CALLING
			# user, never as a previous branch's cashier.
			self.assertEqual(calls["mfg_user"], [original_user] * len(branches))

	def test_initiate_isolates_failing_branch(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			branches = ["URY JVC", "Golden Fork Jumeirah"]
			runs, opening_names = {}, {}
			for branch in branches:
				run, opening = self._make_committed_run_with_opening("2030-03-02", branch)
				runs[branch] = run
				opening_names[branch] = opening.name
			calls = {
				"manufactured": [],
				"mfg_user": [],
				"opened": [],
				"slots": [],
				"cashier": [],
			}
			original_user = frappe.session.user
			self.addCleanup(frappe.set_user, original_user)
			patches, fake_manufacturing = self._patch_branch_pipeline(runs, calls, opening_names)

			def failing_manufacturing(run):
				if run.branch == "Golden Fork Jumeirah":
					calls["manufactured"].append(run.branch)
					raise frappe.ValidationError("boom {0}".format(run.branch))
				return fake_manufacturing(run)

			patches[1] = patch.object(
				service, "run_manufacturing_simulation", side_effect=failing_manufacturing
			)
			patches.insert(0, patch.object(service, "get_active_simulation_branches", return_value=branches))
			log_patcher = patch.object(service.frappe, "log_error")
			with ExitStack() as stack:
				for p in patches:
					stack.enter_context(p)
				log_mock = stack.enter_context(log_patcher)
				results = service.initiate_daily_simulation_for_all_branches(
					business_date="2030-03-02"
				)

			by_branch = {row["branch"]: row for row in results}
			# The healthy branch still opened its session ...
			self.assertEqual(by_branch["URY JVC"]["status"], "POS Open")
			self.assertEqual(by_branch["URY JVC"]["pos_opening_entry"], opening_names["URY JVC"])
			self.assertEqual(calls["opened"], ["URY JVC"])
			# ... while the broken branch was recorded as Failed, not raised.
			self.assertEqual(by_branch["Golden Fork Jumeirah"]["status"], "Failed")
			self.assertIn("boom Golden Fork Jumeirah", by_branch["Golden Fork Jumeirah"]["error"])
			self.assertEqual(calls["manufactured"], branches)
			# The healthy branch's manufacturing ran as the caller (the
			# failing branch raised before its own manufacturing ran).
			self.assertEqual(calls["mfg_user"], [original_user])
			# log_error was called exactly once, for the failing branch.
			self.assertEqual(log_mock.call_count, 1)
			self.assertIn("Golden Fork Jumeirah", log_mock.call_args[0][1])

	def test_initiate_resumes_open_run_without_reopening(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			branch = "URY JVC"
			run, opening = self._make_committed_run_with_opening("2030-03-03", branch)
			frappe.db.set_value(
				SIMULATION_RUN_DOCTYPE,
				run.name,
				{"status": "POS Open", "pos_opening_entry": opening.name},
			)
			runs = {branch: frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)}
			calls = {"manufactured": [], "mfg_user": [], "opened": [], "slots": [], "cashier": []}
			original_user = frappe.session.user
			self.addCleanup(frappe.set_user, original_user)
			patches, _ = self._patch_branch_pipeline(runs, calls, {branch: opening.name})
			patches.insert(0, patch.object(service, "get_active_simulation_branches", return_value=[branch]))
			with ExitStack() as stack:
				for p in patches:
					stack.enter_context(p)
				results = service.initiate_daily_simulation_for_all_branches(
					business_date="2030-03-03", slot_count=5
				)

			self.assertEqual(calls["manufactured"], [])
			self.assertEqual(calls["opened"], [])
			self.assertEqual(calls["slots"], [(branch, 5)])
			self.assertEqual(results[0]["status"], "POS Open")
			self.assertEqual(results[0]["pos_opening_entry"], opening.name)
			self.assertEqual(results[0]["slots"], 5)


class TestDepartmentSafetyStockSharedWarehouse(FrappeTestCase):
	"""Verify that when multiple department buckets share the same physical
	department warehouse, _ensure_department_safety_stock aggregates the direct
	BOM requirements across all buckets before checking Bin availability.
	"""

	def test_shared_warehouse_aggregates_requirements_across_departments(self):
		from ury.ury.simulator import manufacturing_runner

		buckets = {
			"Kitchen - Salalah": {
				"warehouse": "Shared Kitchen - UO",
				"targets": [
					{"item_code": "DISH_A", "bom_no": "BOM_A", "required_qty": 2.0},
				],
			},
			"Salad - Salalah": {
				"warehouse": "Shared Kitchen - UO",
				"targets": [
					{"item_code": "DISH_B", "bom_no": "BOM_B", "required_qty": 3.0},
				],
			},
		}

		# Dish A requires 2.5 units of TMT per dish -> 2.0 * 2.5 = 5.0 TMT
		# Dish B requires 2.0 units of TMT per dish -> 3.0 * 2.0 = 6.0 TMT
		# Total required for Shared Kitchen - UO = 11.0 TMT.
		def fake_bom_direct_rows(bom_no):
			if bom_no == "BOM_A":
				return [{"item_code": "TMT", "qty": 2.5, "stock_qty": 2.5}]
			if bom_no == "BOM_B":
				return [{"item_code": "TMT", "qty": 2.0, "stock_qty": 2.0}]
			return []

		# Available in Shared Kitchen - UO is 4.0 units.
		# Total shortage must be 11.0 - 4.0 = 7.0 units.
		with patch.object(manufacturing_runner, "_bom_direct_rows", side_effect=fake_bom_direct_rows), \
			 patch("frappe.db.get_value", return_value=4.0), \
			 patch.object(manufacturing_runner, "_create_material_receipt", return_value="STE-RECEIPT-001") as mock_receipt:

			receipts = manufacturing_runner._ensure_department_safety_stock(
				buckets, company="URY OMAN", business_date="2030-01-01"
			)

			self.assertEqual(receipts, ["STE-RECEIPT-001"])
			mock_receipt.assert_called_once_with(
				"URY OMAN",
				"Shared Kitchen - UO",
				{"TMT": 7.0},
				"2030-01-01",
			)

	def test_ensure_transfer_material_requests_generates_supplementary_mr(self):
		from ury.ury.simulator import manufacturing_runner

		production_plans = ["MFG-PP-2026-00087", "MFG-PP-2026-00088"]

		def fake_generate(pp_name):
			if pp_name == "MFG-PP-2026-00087":
				return {"production_plan": pp_name, "material_request": "MAT-MR-2026-00099"}
			return {"production_plan": pp_name, "material_request": None}

		with patch.object(
			manufacturing_runner,
			"generate_transfer_material_request_for_production_plan",
			side_effect=fake_generate,
		) as mock_gen:
			mrs = manufacturing_runner._ensure_transfer_material_requests(production_plans)
			self.assertEqual(mrs, ["MAT-MR-2026-00099"])
			self.assertEqual(mock_gen.call_count, 2)

	def test_single_pos_opening_and_closing_per_day(self):
		"""Verify that if a branch already has a Completed run for today,
		initiate_daily_simulation_for_all_branches does not open a second session
		or run manufacturing again.
		"""
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			branch = "URY JVC"
			run = _make_run(self, "2030-05-05", branch=branch)
			frappe.db.set_value(
				SIMULATION_RUN_DOCTYPE,
				run.name,
				{
					"status": "Completed",
					"pos_opening_entry": "POS-OPEN-FAKE-001",
					"pos_closing_entry": "POS-CLOS-FAKE-001",
				},
			)
			calls = {"manufactured": [], "opened": []}

			with patch.object(service, "get_active_simulation_branches", return_value=[branch]), \
				 patch.object(service, "run_manufacturing_simulation", side_effect=lambda r: calls["manufactured"].append(r.name)), \
				 patch.object(service, "open_pos_session", side_effect=lambda r: calls["opened"].append(r.name)):

				results = service.initiate_daily_simulation_for_all_branches(
					business_date="2030-05-05", slot_count=5
				)

				self.assertEqual(len(results), 1)
				self.assertEqual(results[0]["status"], "Completed")
				self.assertEqual(results[0]["pos_opening_entry"], "POS-OPEN-FAKE-001")
				# Neither manufacturing nor opening should be called
				self.assertEqual(calls["manufactured"], [])
				self.assertEqual(calls["opened"], [])

	def test_slot_interval_is_ten_minutes(self):
		self.assertEqual(pos_runner.SLOT_INTERVAL_MINUTES, 10)
		self.assertEqual(service.CLOSING_CUTOFF.hour, 22)


