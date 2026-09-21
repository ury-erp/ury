# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Doctype-level coverage for URY Self Ordering Profile.

TRACK.md Phase 2 item 2 / COVERAGE_GAP_ANALYSIS.md Table 3+4: the doctype's
test file had zero `def test_` methods, and its `before_insert()` hook (the
only controller logic -- generates a per-profile `qr_signing_secret` used to
sign stateless QR table/pickup tokens per `ury/ury/api/self_ordering.py`)
had no reference anywhere else in the suite. This is the entry point for
the entire self-ordering feature's token security and was confirmed a
genuine gap, not covered elsewhere.

`restaurant`/`pos_profile` are mandatory Links but are irrelevant to what
this file verifies (the secret-generation hook, not the ordering-profile's
relationship graph) -- bypassed via `ignore_mandatory`, matching the same
scope trade-off used in the payment-terminal-transaction test in this
phase.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.tests.factories import make_branch


class TestURYSelfOrderingProfile(FrappeTestCase):
	def tearDown(self):
		frappe.db.rollback()

	def _make_profile(self, **overrides):
		profile_name = overrides.pop("profile_name", None) or frappe.generate_hash(length=8)
		fields = {
			"doctype": "URY Self Ordering Profile",
			# autoname is "prompt" -- an explicit `name` is required in
			# addition to `profile_name`.
			"name": profile_name,
			"profile_name": profile_name,
			"branch": overrides.pop("branch", None) or make_branch().name,
		}
		fields.update(overrides)
		doc = frappe.get_doc(fields)
		doc.insert(ignore_permissions=True, ignore_mandatory=True)
		return doc

	def test_before_insert_generates_qr_signing_secret(self):
		profile = self._make_profile()
		self.assertTrue(profile.qr_signing_secret)
		# frappe.generate_hash(length=48) -- confirm the length contract,
		# since api/self_ordering.py's token signing depends on secret
		# entropy, not just presence.
		self.assertEqual(len(profile.qr_signing_secret), 48)

	def test_qr_signing_secret_is_unique_per_profile(self):
		profile_a = self._make_profile()
		profile_b = self._make_profile()
		self.assertNotEqual(profile_a.qr_signing_secret, profile_b.qr_signing_secret)

	def test_explicit_qr_signing_secret_is_not_overwritten(self):
		# before_insert only fills the secret "if not self.qr_signing_secret"
		# -- a caller-supplied value must survive.
		profile = self._make_profile(qr_signing_secret="explicit-secret-value")
		self.assertEqual(profile.qr_signing_secret, "explicit-secret-value")

	def test_secret_is_not_regenerated_on_update(self):
		profile = self._make_profile()
		original_secret = profile.qr_signing_secret
		profile.enabled = 0
		profile.save()
		profile.reload()
		self.assertEqual(profile.qr_signing_secret, original_secret)
