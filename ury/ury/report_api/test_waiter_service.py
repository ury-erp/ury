"""Guest-funded waiter service is kept separate from sales commission."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.report_api.waiter_service import get_waiter_service_payables


class TestWaiterServiceReport(FrappeTestCase):
    def test_groups_submitted_charges_by_credited_waiter(self):
        rows = [
            frappe._dict(invoice="INV-1", employee="EMP-1", employee_name="Waiter One", currency="KZT", amount=23),
            frappe._dict(invoice="INV-2", employee="EMP-1", employee_name="Waiter One", currency="KZT", amount=10),
            frappe._dict(invoice="INV-3", employee="EMP-2", employee_name="Waiter Two", currency="KZT", amount=8),
        ]
        with patch("ury.ury.report_api.waiter_service.require_manager"), patch(
            "ury.ury.report_api.waiter_service.validate_date_range"
        ), patch("ury.ury.report_api.waiter_service.report_settings_join", return_value=""), patch(
            "ury.ury.report_api.waiter_service.get_business_day_range_condition", return_value="1=1"
        ), patch("ury.ury.report_api.waiter_service.frappe.db.sql", return_value=rows) as query:
            report = get_waiter_service_payables("2026-09-01", "2026-09-30", "Demo Branch")

        self.assertEqual(report["totals"], [{"currency": "KZT", "amount": 41}])
        self.assertEqual(report["employees"][0]["amount"], 33)
        self.assertEqual(report["employees"][0]["invoices"], 2)
        self.assertEqual(query.call_args.args[1]["branch"], "Demo Branch")
        self.assertIn("b.`docstatus` = 1", query.call_args.args[0])
