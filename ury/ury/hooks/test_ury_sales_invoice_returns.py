"""Regression tests for G-05: return/credit-note fulfilment reversal policy.

Decision under test (see `ury_sales_invoice.fulfil_reservations_on_consolidation`
and `ury_fulfilment_posting_service`'s module docstring): a consolidated
credit note (`is_return=1`) must never trigger any URY-side production or
reservation reversal. Only native ERPNext's own `update_stock=1` sale-side
ledger movement (finished good back into the warehouse) is affected by a
return. These tests pin that behaviour at the two points where it could
regress:

  1. `fulfil_reservations_on_consolidation` must short-circuit for a return
     before it ever looks at reservations -- it must not attempt to
     fulfil/release/re-touch a `URY Stock Reservation` group just because a
     credit note references the same orders as the original sale.
  2. A reservation group that already reached the terminal `Fulfilled`
     status (the normal state for a sale that later gets returned, since
     fulfilment happens at production/first-closing time, before any
     return can exist) is excluded from `ACTIVE_STATUSES` and therefore
     from `_fulfil_reservations_for_consolidated_invoice`'s own query --
     confirming there is nothing left on the reservation side for a return
     to touch even on the non-return code path.

Point 3 of T7 (does a returned pre-produced item now get credited back
exactly once, with no residual double-deduction-era compensation code) and
point 3's "production Stock Entry is untouched" claim are verified by code
inspection, matching this module's existing test style (mock-based unit
tests, not full production-to-return integration runs -- see
`test_ury_fulfilment_posting_service.py` for the established pattern):

  - `ury_fulfilment_posting_service.py` only ever posts a Manufacture Stock
    Entry for `MADE_TO_ORDER` items (`_authorize_and_execute_posting`'s
    `payload["production_policy"] != MADE_TO_ORDER` early return for
    `PRE_PRODUCED`/`DIRECT_RETAIL`). Nothing in this codebase's `is_return`
    handling (grepped across `ury/ury/**/*.py`) calls into the posting
    service, the batch manufacture service, or cancels/amends a Stock
    Entry -- a return path never reaches production-side stock code at all,
    so the Manufacture Stock Entry it created stays submitted and
    unmodified.
  - The READY-time `Material Issue` for `PRE_PRODUCED`/`DIRECT_RETAIL` items
    (the double-deduction bug, G-02) was removed by the merged Phase 0/1
    fix; no compensating "credit it back a second time" code was ever added
    for it to leave behind, so a returned pre-produced item is credited
    back exactly once, by the consolidated credit note's own
    `update_stock=1` Stock Entry -- the same single mechanism that credits
    back a returned direct-retail item.
"""

from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.hooks.ury_sales_invoice import (
    fulfil_reservations_on_consolidation,
)


MODULE = "ury.ury.hooks.ury_sales_invoice"


def _doc(data):
    doc = dict(data)
    wrapper = type("Doc", (), {})()
    wrapper.get = lambda key, default=None, _doc=doc: _doc.get(key, default)
    return wrapper


class TestReturnsDoNotTriggerReservationCloseOut(FrappeTestCase):
    def test_return_short_circuits_before_touching_reservations(self):
        """A consolidated credit note must never reach reservation close-out."""
        doc = _doc({"is_consolidated": 1, "is_return": 1, "name": "SINV-CN-1"})
        with patch(
            f"{MODULE}._fulfil_reservations_for_consolidated_invoice"
        ) as close_out:
            fulfil_reservations_on_consolidation(doc)
        close_out.assert_not_called()

    def test_non_return_consolidated_invoice_still_closes_out_reservations(self):
        """Sanity check: the guard is specific to `is_return`, not a general
        regression that disables reservation close-out entirely."""
        doc = _doc({"is_consolidated": 1, "is_return": 0, "name": "SINV-1"})
        with patch(
            f"{MODULE}._fulfil_reservations_for_consolidated_invoice"
        ) as close_out:
            fulfil_reservations_on_consolidation(doc)
        close_out.assert_called_once_with(doc)

    def test_non_consolidated_invoice_is_ignored_regardless_of_return_flag(self):
        doc = _doc({"is_consolidated": 0, "is_return": 1, "name": "SINV-CN-2"})
        with patch(
            f"{MODULE}._fulfil_reservations_for_consolidated_invoice"
        ) as close_out:
            fulfil_reservations_on_consolidation(doc)
        close_out.assert_not_called()

    def test_fulfilled_reservation_group_is_not_in_active_statuses(self):
        """A group already `Fulfilled` before any return can exist (fulfilment
        happens at production/first-closing time) is excluded from
        `ACTIVE_STATUSES` -- there is nothing left for a later return to
        release or re-fulfil on the reservation side."""
        from ury.ury.api.ury_reservation_service import ACTIVE_STATUSES, FULFILLED

        self.assertNotIn(FULFILLED, ACTIVE_STATUSES)
