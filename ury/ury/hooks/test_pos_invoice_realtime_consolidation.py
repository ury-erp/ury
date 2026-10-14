"""Compat: consolidate_on_payment is a no-op (settlement moved to make_invoice)."""

import unittest

from ury.ury.hooks.pos_invoice_realtime_consolidation import consolidate_on_payment


class _Doc:
	def __init__(self, **kwargs):
		self.__dict__.update(kwargs)

	def get(self, key, default=None):
		return getattr(self, key, default)


class TestConsolidateNoOp(unittest.TestCase):
	def test_no_op(self):
		# Must not raise and must not create documents.
		self.assertIsNone(
			consolidate_on_payment(
				_Doc(doctype="POS Invoice", docstatus=1, name="INV-1", pos_profile="P")
			)
		)


if __name__ == "__main__":
	unittest.main()
