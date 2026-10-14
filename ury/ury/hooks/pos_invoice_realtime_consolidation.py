"""Compat stub for the previous Merge-Log-on-pay path.

Local Cowheel settlement now converts the draft POS Invoice into a Sales
Invoice with the same name via ``pos_invoice_settle_as_sales_invoice`` from
``make_invoice``. That path never submits the POS Invoice when the flag is
on, so this ``on_submit`` hook is a no-op for the active feature.

Kept so existing hook registrations and unit tests that import
``consolidate_on_payment`` do not break. Do not reintroduce Merge Log here
unless upstream explicitly wants dual-document consolidation.
"""

from __future__ import annotations


def consolidate_on_payment(doc, method=None):
	"""No-op: Sales Invoice on payment is handled in make_invoice."""
	return
