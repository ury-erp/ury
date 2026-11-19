# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Tests for the URY Simulation Run DocType (phase 5).

Validates the two guardrails enforced in ``URY Simulation Run.validate()``:
the fail-closed simulator authorization check and the single-flight rule that
keeps at most one non-terminal run per (business_date, branch) scope.

Authorization is toggled through an in-memory ``frappe.conf`` patch -- the
site's ``site_config.json`` is never modified. Far-future business dates keep
the tests clear of real simulation runs and of each other, and every created
run is hard-deleted in cleanup because the tested code paths commit
internally (FrappeTestCase rolls back only at class teardown).

Run:
    bench --site uryv16.localhost run-tests --doctype "URY Simulation Run"
"""

from contextlib import contextmanager

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.simulator.guards import DISABLED_MESSAGE, TERMINAL_RUN_STATUSES

SIMULATION_RUN_DOCTYPE = "URY Simulation Run"

#: Real fixtures on uryv16.localhost (used by the phase 2-4 dev runs).
BRANCH = "URY JVC"
COMPANY = "URY UAE"
POS_PROFILE = "URY JVC"

_MISSING = object()


@contextmanager
def _sim_conf(remove=(), **overrides):
	"""Temporarily override site config in memory; restore on exit."""
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


def _purge_run(name):
	if frappe.db.exists(SIMULATION_RUN_DOCTYPE, name):
		frappe.delete_doc(SIMULATION_RUN_DOCTYPE, name, force=True, ignore_permissions=True)
		frappe.db.commit()


def _build_run(business_date):
	return frappe.get_doc(
		{
			"doctype": SIMULATION_RUN_DOCTYPE,
			"run_id": "SIM-TEST-{0}-{1}".format(
				str(business_date).replace("-", ""), frappe.generate_hash(length=6)
			),
			"status": "Pending",
			"business_date": business_date,
			"company": COMPANY,
			"branch": BRANCH,
			"pos_profile": POS_PROFILE,
		}
	)


class TestSimulationRunDocType(FrappeTestCase):
	def test_insert_fails_closed_without_authorization(self):
		with _sim_conf(remove=("allow_uat_simulator",)):
			run = _build_run("2030-10-01")
			with self.assertRaises(frappe.ValidationError) as cm:
				run.insert(ignore_permissions=True)
		self.assertIn(DISABLED_MESSAGE, str(cm.exception))
		# The failed insert must not have leaked a row.
		self.assertFalse(
			frappe.db.exists(SIMULATION_RUN_DOCTYPE, {"business_date": "2030-10-01", "branch": BRANCH})
		)

	def test_single_flight_blocks_second_active_run(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			business_date = "2030-10-02"
			first = _build_run(business_date)
			first.insert(ignore_permissions=True)
			self.addCleanup(_purge_run, first.name)

			second = _build_run(business_date)
			with self.assertRaises(frappe.ValidationError) as cm:
				second.insert(ignore_permissions=True)
			self.assertIn("already exists", str(cm.exception))
			self.assertIn(first.name, str(cm.exception))
			self.assertIn(BRANCH, str(cm.exception))

			# A different scope is unaffected.
			other = _build_run("2030-10-03")
			other.insert(ignore_permissions=True)
			self.addCleanup(_purge_run, other.name)

	def test_terminal_runs_do_not_block_new_run(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			for idx, terminal in enumerate(TERMINAL_RUN_STATUSES):
				business_date = "2030-11-{0:02d}".format(idx + 1)
				with self.subTest(terminal_status=terminal):
					first = _build_run(business_date)
					first.insert(ignore_permissions=True)
					self.addCleanup(_purge_run, first.name)
					# Move the first run to a terminal status without validate.
					frappe.db.set_value(SIMULATION_RUN_DOCTYPE, first.name, "status", terminal)

					second = _build_run(business_date)
					second.insert(ignore_permissions=True)
					self.addCleanup(_purge_run, second.name)
					self.assertEqual(second.status, "Pending")

	def test_valid_run_roundtrip(self):
		with _sim_conf(allow_uat_simulator=True, developer_mode=1):
			run = _build_run("2030-12-01")
			run.append(
				"slots",
				{"slot_number": 1, "slot_time": "09:05:00", "scenario": "Takeaway", "status": "Pending"},
			)
			run.insert(ignore_permissions=True)
			self.addCleanup(_purge_run, run.name)

			saved = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
			self.assertEqual(saved.branch, BRANCH)
			self.assertEqual(saved.company, COMPANY)
			self.assertEqual(saved.pos_profile, POS_PROFILE)
			self.assertEqual(len(saved.slots), 1)
			self.assertEqual(saved.slots[0].scenario, "Takeaway")
			self.assertEqual(saved.slots[0].status, "Pending")
			# Updating a run re-validates without tripping single-flight on itself.
			saved.total_invoices = 1
			saved.save(ignore_permissions=True)
