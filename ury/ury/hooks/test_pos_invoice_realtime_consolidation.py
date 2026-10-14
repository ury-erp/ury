"""Unit tests for opt-in consolidate-on-payment (no DB)."""

from unittest import TestCase
from unittest.mock import MagicMock, patch

from ury.ury.hooks.pos_invoice_realtime_consolidation import consolidate_on_payment


class _Doc:
	def __init__(self, **kwargs):
		self.doctype = "POS Invoice"
		self.docstatus = 1
		self.name = kwargs.get("name", "INV-TEST")
		self.consolidated_invoice = kwargs.get("consolidated_invoice")
		self.status = kwargs.get("status", "Paid")
		self.outstanding_amount = kwargs.get("outstanding_amount", 0)
		self.pos_profile = kwargs.get("pos_profile", "Profile A")
		self.company = "Co"
		self.customer = "Walk-In Customer"
		self.grand_total = 100
		self.posting_date = "2026-10-14"
		self.posting_time = "12:00:00"
		self.is_return = 0

	def get(self, key, default=None):
		return getattr(self, key, default)


def _paid_invoice(**kwargs):
	return _Doc(**kwargs)


class TestConsolidateOnPayment(TestCase):
	@patch("ury.ury.hooks.pos_invoice_realtime_consolidation._create_and_submit_merge_log")
	@patch("ury.ury.hooks.pos_invoice_realtime_consolidation.frappe")
	def test_skips_when_flag_off(self, mock_frappe, mock_create):
		mock_frappe.db.get_value.return_value = 0
		consolidate_on_payment(_paid_invoice())
		mock_create.assert_not_called()

	@patch("ury.ury.hooks.pos_invoice_realtime_consolidation._create_and_submit_merge_log")
	@patch("ury.ury.hooks.pos_invoice_realtime_consolidation.frappe")
	def test_runs_when_flag_on(self, mock_frappe, mock_create):
		doc = _paid_invoice()

		def get_value(doctype, name, field):
			if doctype == "POS Profile" and field == "custom_consolidate_on_payment":
				return 1
			if doctype == "POS Invoice" and field == "consolidated_invoice":
				return None
			return None

		mock_frappe.db.get_value.side_effect = get_value
		consolidate_on_payment(doc)
		mock_create.assert_called_once_with(doc)

	@patch("ury.ury.hooks.pos_invoice_realtime_consolidation._create_and_submit_merge_log")
	@patch("ury.ury.hooks.pos_invoice_realtime_consolidation.frappe")
	def test_skips_unpaid(self, mock_frappe, mock_create):
		doc = _paid_invoice(status="Unpaid", outstanding_amount=50)
		consolidate_on_payment(doc)
		mock_create.assert_not_called()
