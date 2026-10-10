"""The QZ print queue: a job prints once, failures retry, then stay visible."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import qz_printing

MOD = "ury.ury.api.qz_printing"
BRANCH = "_Test QZ Branch"


class TestQzQueue(FrappeTestCase):

    def setUp(self):
        frappe.set_user("Administrator")
        if not frappe.db.exists("Branch", BRANCH):
            frappe.get_doc({"doctype": "Branch", "branch": BRANCH, "user": [{"user": "Administrator"}]}).insert(
                ignore_permissions=True
            )

    def tearDown(self):
        frappe.db.rollback()

    def _job(self, printer="Kitchen-1"):
        return frappe.get_doc({
            "doctype": "URY Print Job",
            "branch": BRANCH,
            "printer": printer,
            "reference_doctype": "Branch",
            "reference_name": BRANCH,
        }).insert(ignore_permissions=True).name

    def _claim(self, station):
        # claim_jobs commits; keep the test inside its transaction.
        with patch(f"{MOD}.frappe.db.commit"):
            return qz_printing.claim_jobs(BRANCH, station)

    def test_a_job_is_claimed_by_one_station_only(self):
        name = self._job()
        first = self._claim("station-a")
        second = self._claim("station-b")
        self.assertEqual([j["name"] for j in first], [name])
        self.assertEqual(second, [])
        self.assertTrue(first[0]["html"])

    def test_a_printed_job_is_not_claimed_again(self):
        name = self._job()
        self._claim("station-a")
        qz_printing.complete_job(name, 1)
        self.assertEqual(frappe.db.get_value("URY Print Job", name, "status"), "Printed")
        self.assertEqual(self._claim("station-a"), [])

    def test_a_failed_print_retries_then_gives_up(self):
        name = self._job()
        for _attempt in range(qz_printing.MAX_ATTEMPTS):
            self.assertEqual(len(self._claim("station-a")), 1)
            qz_printing.complete_job(name, 0, "paper out")
        job = frappe.db.get_value("URY Print Job", name, ["status", "error"], as_dict=True)
        self.assertEqual(job.status, "Failed")
        self.assertEqual(job.error, "paper out")
        self.assertEqual(self._claim("station-a"), [])

    def test_retry_puts_failed_jobs_back(self):
        name = self._job()
        frappe.db.set_value("URY Print Job", name, {"status": "Failed", "attempts": 3})
        with patch(f"{MOD}._nudge"):
            qz_printing.retry_failed(BRANCH)
        self.assertEqual(len(self._claim("station-a")), 1)

    def test_a_kitchen_without_a_qz_printer_keeps_network_printing(self):
        kot = frappe._dict(production="X", pos_profile="P", branch=BRANCH, name="KOT-1")
        with patch(f"{MOD}.branch_uses_qz", return_value=True), \
             patch(f"{MOD}.frappe.db.get_value", return_value=None):
            self.assertFalse(qz_printing.queue_kot(kot))

    def test_a_branch_without_qz_is_untouched(self):
        kot = frappe._dict(production="X", pos_profile="P", branch=BRANCH, name="KOT-1")
        with patch(f"{MOD}.branch_uses_qz", return_value=False):
            self.assertFalse(qz_printing.queue_kot(kot))
