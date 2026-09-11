from unittest.mock import MagicMock, patch

import frappe as real_frappe
from frappe.tests.utils import FrappeTestCase

frappe_dict = real_frappe._dict

from ury.ury.api.ury_kot_generate import (
    create_order_items,
    process_items_for_cancel_kot,
    process_items_for_kot,
)
from ury.ury.api.ury_kot_routing import (
    ROUTING_AMBIGUOUS,
    ROUTING_NOT_CONFIGURED,
    RoutingError,
)

MODULE = "ury.ury.api.ury_kot_generate"


class TestProcessItemsForKot(FrappeTestCase):
    """Integration tests for process_items_for_kot() wired to the unified resolver.

    Tests verify that:
    1. The resolver is called for each item with correct company/branch
    2. Items are grouped by resolved production units
    3. One KOT is created per production unit
    4. RoutingErrors are handled gracefully (not breaking the batch)
    5. Legacy behavior is preserved for unmapped items (skip silently)
    """

    def _make_pos_profile(self, branch="Main Branch", company="URY Co"):
        return frappe_dict({"name": "POS-1", "branch": branch, "company": company})

    def _make_pos_invoice(self, company="URY Co"):
        return frappe_dict({"name": "INV-001", "company": company})

    def _make_order_items(self, item_codes_and_names):
        """Create order items from [(item_code, item_name), ...]"""
        items = []
        for item_code, item_name in item_codes_and_names:
            items.append(
                {
                    "item": item_code,
                    "item_name": item_name,
                    "qty": 1,
                    "comment": "",
                }
            )
        return items

    @patch(f"{MODULE}.resolve_production_context")
    @patch(f"{MODULE}.create_kot_doc")
    @patch(f"{MODULE}.resolve_production_units")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_items_routed_via_resolver_to_correct_production_units(
        self, mock_db_get_all, mock_get_doc, mock_resolve, mock_create_kot, mock_context
    ):
        """Verify resolver is called and items grouped correctly by production unit."""
        # Setup
        mock_db_get_all.return_value = [
            {"name": "Unit A"},
            {"name": "Unit B"},
        ]
        mock_get_doc.side_effect = [
            self._make_pos_profile(),
            self._make_pos_invoice(),
        ]
        mock_context.return_value = None
        # Item 1 routes to Unit A, Item 2 routes to both Unit A and Unit B
        mock_resolve.side_effect = [
            ["Unit A"],  # ITEM-1
            ["Unit A", "Unit B"],  # ITEM-2
        ]
        mock_create_kot.side_effect = ["KOT-1", "KOT-2", "KOT-3"]

        # Call
        order_items = self._make_order_items([("ITEM-1", "Item 1"), ("ITEM-2", "Item 2")])
        result = process_items_for_kot(
            invoice_id="INV-001",
            customer="John Doe",
            restaurant_table="T-01",
            items=order_items,
            comments="",
            pos_profile_id="POS-1",
            kot_naming_series="KOT-",
            kot_type="New Order",
        )

        # Verify resolver was called for each item
        self.assertEqual(mock_resolve.call_count, 2)
        mock_resolve.assert_any_call(
            item_code="ITEM-1", company="URY Co", branch="Main Branch", production_policy=None
        )
        mock_resolve.assert_any_call(
            item_code="ITEM-2", company="URY Co", branch="Main Branch", production_policy=None
        )

        # Verify KOTs were created: one for Unit A (with both items), one for Unit B (with Item 2)
        self.assertEqual(mock_create_kot.call_count, 2)
        self.assertEqual(result, ["KOT-1", "KOT-2"])

    @patch(f"{MODULE}.resolve_production_context")
    @patch(f"{MODULE}.create_kot_doc")
    @patch(f"{MODULE}.resolve_production_units")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_routing_not_configured_error_fails_the_batch(
        self, mock_db_get_all, mock_get_doc, mock_resolve, mock_create_kot, mock_context
    ):
        """ROUTING_NOT_CONFIGURED for a controlled item must fail the whole KOT
        batch closed (sa-post-373-review-fixes Blocker 2), not be silently
        skipped -- a customer must never be charged for an item the kitchen
        never sees."""
        mock_db_get_all.return_value = [{"name": "Unit A"}]
        mock_get_doc.side_effect = [
            self._make_pos_profile(),
            self._make_pos_invoice(),
        ]
        mock_context.return_value = None
        # Item 1 routes OK, Item 2 raises ROUTING_NOT_CONFIGURED
        mock_resolve.side_effect = [
            ["Unit A"],
            RoutingError(ROUTING_NOT_CONFIGURED, "No mapping found"),
        ]
        mock_create_kot.return_value = "KOT-1"

        order_items = self._make_order_items([("ITEM-1", "Item 1"), ("ITEM-2", "Item 2")])

        with self.assertRaises(RoutingError):
            process_items_for_kot(
                invoice_id="INV-001",
                customer="John Doe",
                restaurant_table="T-01",
                items=order_items,
                comments="",
                pos_profile_id="POS-1",
                kot_naming_series="KOT-",
                kot_type="New Order",
            )

    @patch(f"{MODULE}.resolve_production_context")
    @patch(f"{MODULE}.create_kot_doc")
    @patch(f"{MODULE}.resolve_production_units")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_direct_retail_item_is_exempt_without_raising(
        self, mock_db_get_all, mock_get_doc, mock_resolve, mock_create_kot, mock_context
    ):
        """A DIRECT_RETAIL item (resolve_production_units returning []) does not
        raise and does not get a KOT -- it genuinely has no production routing
        requirement."""
        mock_db_get_all.return_value = [{"name": "Unit A"}]
        mock_get_doc.side_effect = [
            self._make_pos_profile(),
            self._make_pos_invoice(),
        ]
        mock_context.return_value = real_frappe._dict({"production_policy": "DIRECT_RETAIL"})
        mock_resolve.return_value = []

        order_items = self._make_order_items([("ITEM-1", "Item 1")])
        result = process_items_for_kot(
            invoice_id="INV-001",
            customer="John Doe",
            restaurant_table="T-01",
            items=order_items,
            comments="",
            pos_profile_id="POS-1",
            kot_naming_series="KOT-",
            kot_type="New Order",
        )

        mock_resolve.assert_called_once_with(
            item_code="ITEM-1", company="URY Co", branch="Main Branch", production_policy="DIRECT_RETAIL"
        )
        self.assertEqual(mock_create_kot.call_count, 0)
        self.assertEqual(result, [])

    @patch(f"{MODULE}.resolve_production_context")
    @patch(f"{MODULE}.create_kot_doc")
    @patch(f"{MODULE}.resolve_production_units")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_validation_dedup_key_set_for_first_kot_only(
        self, mock_db_get_all, mock_get_doc, mock_resolve, mock_create_kot, mock_context
    ):
        """validation_dedup_key is only set for the first KOT per invoice+production."""
        mock_db_get_all.return_value = [{"name": "Unit A"}]
        mock_get_doc.side_effect = [
            self._make_pos_profile(),
            self._make_pos_invoice(),
        ]
        mock_context.return_value = None
        mock_resolve.return_value = ["Unit A"]

        # First KOT doesn't exist yet
        with patch(f"{MODULE}.frappe.db.exists", return_value=False):
            mock_create_kot.return_value = "KOT-1"

            order_items = self._make_order_items([("ITEM-1", "Item 1")])
            result = process_items_for_kot(
                invoice_id="INV-001",
                customer="John Doe",
                restaurant_table="T-01",
                items=order_items,
                comments="",
                pos_profile_id="POS-1",
                kot_naming_series="KOT-",
                kot_type="New Order",
            )

            # Verify dedup key was set
            call_args = mock_create_kot.call_args
            self.assertEqual(call_args.kwargs.get("validation_dedup_key"), "INV-001::Unit A")

    @patch(f"{MODULE}.resolve_production_context")
    @patch(f"{MODULE}.create_kot_doc")
    @patch(f"{MODULE}.resolve_production_units")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_existing_kot_uses_order_modified_type(
        self, mock_db_get_all, mock_get_doc, mock_resolve, mock_create_kot, mock_context
    ):
        """When KOT already exists, subsequent KOTs use 'Order Modified' type."""
        mock_db_get_all.return_value = [{"name": "Unit A"}]
        mock_get_doc.side_effect = [
            self._make_pos_profile(),
            self._make_pos_invoice(),
        ]
        mock_context.return_value = None
        mock_resolve.return_value = ["Unit A"]

        # KOT already exists
        with patch(f"{MODULE}.frappe.db.exists", return_value=True):
            mock_create_kot.return_value = "KOT-2"

            order_items = self._make_order_items([("ITEM-1", "Item 1")])
            result = process_items_for_kot(
                invoice_id="INV-001",
                customer="John Doe",
                restaurant_table="T-01",
                items=order_items,
                comments="",
                pos_profile_id="POS-1",
                kot_naming_series="KOT-",
                kot_type="New Order",
            )

            # Verify type was changed to "Order Modified"
            call_args = mock_create_kot.call_args
            self.assertEqual(call_args.args[4], "Order Modified")
            # Verify dedup key was NOT set
            self.assertIsNone(call_args.kwargs.get("validation_dedup_key"))

    @patch(f"{MODULE}.create_kot_doc")
    @patch(f"{MODULE}.resolve_production_units")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_no_production_units_raises_error(
        self, mock_db_get_all, mock_get_doc, mock_resolve, mock_create_kot
    ):
        """If no production units exist for branch, error is raised."""
        mock_db_get_all.return_value = []
        mock_get_doc.return_value = self._make_pos_profile()

        order_items = self._make_order_items([("ITEM-1", "Item 1")])

        with self.assertRaises(real_frappe.ValidationError):
            process_items_for_kot(
                invoice_id="INV-001",
                customer="John Doe",
                restaurant_table="T-01",
                items=order_items,
                comments="",
                pos_profile_id="POS-1",
                kot_naming_series="KOT-",
                kot_type="New Order",
            )


class TestProcessItemsForCancelKot(FrappeTestCase):
    """Integration tests for process_items_for_cancel_kot() wired to the unified resolver."""

    def _make_pos_profile(self, branch="Main Branch", company="URY Co"):
        return frappe_dict({"name": "POS-1", "branch": branch, "company": company})

    def _make_pos_invoice(self, company="URY Co"):
        return frappe_dict({"name": "INV-001", "company": company})

    def _make_order_items(self, item_codes_and_names):
        items = []
        for item_code, item_name in item_codes_and_names:
            items.append(
                {
                    "item": item_code,
                    "item_name": item_name,
                    "qty": 1,
                    "comment": "",
                }
            )
        return items

    @patch(f"{MODULE}.resolve_production_context")
    @patch(f"{MODULE}.create_cancel_kot_doc")
    @patch(f"{MODULE}.resolve_production_units")
    @patch(f"{MODULE}.frappe.get_doc")
    def test_cancel_items_routed_via_resolver(
        self, mock_get_doc, mock_resolve, mock_create_cancel_kot, mock_context
    ):
        """Verify resolver is called for cancel items and KOTs are created."""
        mock_get_doc.side_effect = [
            self._make_pos_profile(),
            self._make_pos_invoice(),
        ]
        mock_context.return_value = None
        # Item 1 routes to Unit A, Item 2 routes to both
        mock_resolve.side_effect = [
            ["Unit A"],
            ["Unit A", "Unit B"],
        ]
        mock_create_cancel_kot.side_effect = ["CNCL-KOT-1", "CNCL-KOT-2"]

        order_items = self._make_order_items([("ITEM-1", "Item 1"), ("ITEM-2", "Item 2")])
        invoice_items = order_items

        result = process_items_for_cancel_kot(
            invoice_id="INV-001",
            customer="John Doe",
            restaurant_table="T-01",
            items=order_items,
            comments="",
            pos_profile_id="POS-1",
            cancel_kot_naming_series="CNCL-KOT-",
            kot_type="Partially cancelled",
            invoiceItems=invoice_items,
        )

        # Verify resolver was called for each item
        self.assertEqual(mock_resolve.call_count, 2)
        mock_resolve.assert_any_call(
            item_code="ITEM-1", company="URY Co", branch="Main Branch", production_policy=None
        )
        mock_resolve.assert_any_call(
            item_code="ITEM-2", company="URY Co", branch="Main Branch", production_policy=None
        )

        # Verify cancel KOTs were created
        self.assertEqual(mock_create_cancel_kot.call_count, 2)
        self.assertEqual(result, ["CNCL-KOT-1", "CNCL-KOT-2"])

    @patch(f"{MODULE}.resolve_production_context")
    @patch(f"{MODULE}.create_cancel_kot_doc")
    @patch(f"{MODULE}.resolve_production_units")
    @patch(f"{MODULE}.frappe.get_doc")
    def test_cancel_routing_not_configured_fails_the_batch(
        self, mock_get_doc, mock_resolve, mock_create_cancel_kot, mock_context
    ):
        """ROUTING_NOT_CONFIGURED for a controlled cancel item must fail closed
        too, for the same reason as the New/Modified path (sa-post-373-review-
        fixes Blocker 2)."""
        mock_get_doc.side_effect = [
            self._make_pos_profile(),
            self._make_pos_invoice(),
        ]
        mock_context.return_value = None
        mock_resolve.side_effect = [
            ["Unit A"],
            RoutingError(ROUTING_NOT_CONFIGURED, "No mapping"),
        ]
        mock_create_cancel_kot.return_value = "CNCL-KOT-1"

        order_items = self._make_order_items([("ITEM-1", "Item 1"), ("ITEM-2", "Item 2")])
        invoice_items = order_items

        with self.assertRaises(RoutingError):
            process_items_for_cancel_kot(
                invoice_id="INV-001",
                customer="John Doe",
                restaurant_table="T-01",
                items=order_items,
                comments="",
                pos_profile_id="POS-1",
                cancel_kot_naming_series="CNCL-KOT-",
                kot_type="Partially cancelled",
                invoiceItems=invoice_items,
            )


class TestCreateOrderItems(FrappeTestCase):
    """Tests for create_order_items() helper (preserved functionality)."""

    def test_create_order_items_from_items_list(self):
        """Verify items are transformed correctly."""
        items = [
            {"item": "ITEM-1", "item_name": "Item 1", "qty": 2, "comment": "No onion"},
            {"item_code": "ITEM-2", "item_name": "Item 2", "qty": 1, "comments": "Extra sauce"},
        ]

        result = create_order_items(items)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["item_code"], "ITEM-1")
        self.assertEqual(result[0]["qty"], 2)
        self.assertEqual(result[0]["comments"], "No onion")
        self.assertEqual(result[1]["item_code"], "ITEM-2")
        self.assertEqual(result[1]["comments"], "Extra sauce")


class TestLineKeyedItems(FrappeTestCase):
    """Regression tests for _line_keyed_items(): the stable per-line key
    that replaced bare item_code matching for KOT delta/cancellation
    (sa-architecture-closure).

    Core scenario from the review: "2x Chicken Biryani" as two SEPARATE
    lines (different comments/courses, or a plain duplicate) must never be
    collapsed into a single item_code-keyed bucket -- doing so is exactly
    what let cancellation apply to the wrong line.
    """

    def test_two_identical_item_lines_get_distinct_keys(self):
        from ury.ury.api.ury_kot_generate import _line_keyed_items

        items = [
            {"item": "Biryani", "item_name": "Biryani", "qty": 1, "comment": "less spicy"},
            {"item": "Biryani", "item_name": "Biryani", "qty": 1, "comment": "extra spicy"},
        ]

        result = _line_keyed_items(items)

        self.assertEqual(len(result), 2, "distinct-comment lines must not collapse into one key")
        qtys = sorted(row["qty"] for row in result.values())
        self.assertEqual(qtys, [1, 1])

    def test_explicit_reservation_line_key_is_respected(self):
        from ury.ury.api.ury_kot_generate import _line_keyed_items

        items = [
            {"item": "Biryani", "item_name": "Biryani", "qty": 1, "reservation_line_key": "INVITEM-A"},
            {"item": "Biryani", "item_name": "Biryani", "qty": 1, "reservation_line_key": "INVITEM-B"},
        ]

        result = _line_keyed_items(items)

        self.assertEqual(len(result), 2)
        keys = set(result.keys())
        self.assertIn("ref:Biryani:INVITEM-A", keys)
        self.assertIn("ref:Biryani:INVITEM-B", keys)

    def test_plain_duplicate_lines_with_no_context_still_get_distinct_keys(self):
        """Same item, same (empty) comment/course, added twice separately --
        the occurrence counter must still keep them apart."""
        from ury.ury.api.ury_kot_generate import _line_keyed_items

        items = [
            {"item": "Coke", "item_name": "Coke", "qty": 1},
            {"item": "Coke", "item_name": "Coke", "qty": 1},
        ]

        result = _line_keyed_items(items)

        self.assertEqual(len(result), 2)


class TestKotExecuteLineIdentity(FrappeTestCase):
    """End-to-end regression: cancelling one of two identical-item lines
    must only affect that line's KOT delta, never the sibling line."""

    @patch("ury.ury.api.ury_waiter_print.print_combined_waiter_order_slip")
    @patch(f"{MODULE}.process_items_for_cancel_kot")
    @patch(f"{MODULE}.process_items_for_kot")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.has_permission")
    def test_removing_one_of_two_identical_lines_cancels_only_that_line(
        self, mock_has_perm, mock_get_doc, mock_process_kot, mock_process_cancel_kot, mock_print
    ):
        mock_has_perm.return_value = True
        mock_process_cancel_kot.return_value = []
        mock_process_kot.return_value = []

        pos_invoice = frappe_dict({"name": "INV-001", "pos_profile": "POS-1"})
        pos_profile = frappe_dict({"name": "POS-1", "custom_kot_naming_series": "KOT-"})
        mock_get_doc.side_effect = [pos_invoice, pos_profile]

        # Two Biryani lines on the invoice, distinguished by comment (the
        # kind of duplicate line the review called out) -- each carries the
        # stable reservation_line_key sync_order() attaches from the
        # underlying POS Invoice Item row name.
        previous_items = [
            {
                "item_code": "Biryani",
                "item_name": "Biryani",
                "qty": 1,
                "comments": "less spicy",
                "reservation_line_key": "INVITEM-1",
            },
            {
                "item_code": "Biryani",
                "item_name": "Biryani",
                "qty": 1,
                "comments": "extra spicy",
                "reservation_line_key": "INVITEM-2",
            },
        ]
        # The customer removes ONLY the "extra spicy" line.
        current_items = [
            {
                "item": "Biryani",
                "item_name": "Biryani",
                "qty": 1,
                "comment": "less spicy",
                "reservation_line_key": "INVITEM-1",
            },
        ]

        from ury.ury.api.ury_kot_generate import kot_execute

        kot_execute("INV-001", "John Doe", "T-01", current_items, previous_items, None)

        # No new/increased line -> process_items_for_kot must not run.
        mock_process_kot.assert_not_called()

        # Exactly one cancel item, for the removed line only.
        self.assertEqual(mock_process_cancel_kot.call_count, 1)
        cancel_items_arg = mock_process_cancel_kot.call_args[0][3]
        self.assertEqual(len(cancel_items_arg), 1)
        cancelled = cancel_items_arg[0]
        self.assertEqual(cancelled["reservation_line_key"], "ref:Biryani:INVITEM-2")
        self.assertEqual(cancelled["qty"], -1)


class TestCreateCancelKotDocLineIdentity(FrappeTestCase):
    """Regression: create_cancel_kot_doc() must attach the cancellation to
    the exact original KOT line (by reservation_line_key), not to every KOT
    line sharing the same item_code -- and must not duplicate the cancel
    row across sibling lines."""

    def _kot_items(self, rows):
        return [frappe_dict(r) for r in rows]

    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_list")
    @patch(f"{MODULE}.frappe.db.get_value")
    def test_cancel_only_matches_the_tagged_line(
        self, mock_get_value, mock_get_list, mock_get_doc
    ):
        from ury.ury.api.ury_kot_generate import create_cancel_kot_doc

        pos_invoice = frappe_dict(
            {"name": "INV-001", "custom_ury_order_number": "1", "order_type": "Dine In"}
        )
        mock_get_list.return_value = [frappe_dict({"name": "KOT-A"}), frappe_dict({"name": "KOT-B"})]
        mock_get_value.return_value = None  # room/restaurant/menu/course lookups -- irrelevant here

        kot_a = frappe_dict(
            {
                "name": "KOT-A",
                "kot_items": self._kot_items(
                    [{"item": "Biryani", "reservation_line_key": "ref:Biryani:INVITEM-1"}]
                ),
            }
        )
        kot_b = frappe_dict(
            {
                "name": "KOT-B",
                "kot_items": self._kot_items(
                    [{"item": "Biryani", "reservation_line_key": "ref:Biryani:INVITEM-2"}]
                ),
            }
        )

        kot_cancel_doc = MagicMock()
        kot_cancel_doc.name = "CNCL-KOT-1"

        def get_doc_side_effect(*args, **kwargs):
            if args and args[0] == "POS Invoice":
                return pos_invoice
            if args and args[0] == "URY KOT":
                return {"KOT-A": kot_a, "KOT-B": kot_b}[args[1]]
            if args and isinstance(args[0], dict):
                for key, value in args[0].items():
                    setattr(kot_cancel_doc, key, value)
                return kot_cancel_doc
            return kot_cancel_doc

        mock_get_doc.side_effect = get_doc_side_effect

        cancel_items = [
            {
                "item_code": "Biryani",
                "item_name": "Biryani",
                "qty": -1,
                "comments": "extra spicy",
                "reservation_line_key": "ref:Biryani:INVITEM-2",
            }
        ]
        invoice_items = [
            {"item_code": "Biryani", "qty": 1, "reservation_line_key": "ref:Biryani:INVITEM-2"},
        ]

        create_cancel_kot_doc(
            invoice_id="INV-001",
            restaurant_table=None,
            cancel_items=cancel_items,
            kot_type="Partially cancelled",
            customer="John Doe",
            comments="",
            pos_profile_id="POS-1",
            cancel_kot_naming_series="CNCL-KOT-",
            invoiceItems=invoice_items,
            production="Unit A",
        )

        # Only the KOT that actually carries the cancelled line is linked.
        self.assertEqual(kot_cancel_doc.original_kot, "KOT-B")

        # Exactly one kot_items row was appended for the cancellation --
        # not one per sibling line sharing the item_code.
        self.assertEqual(kot_cancel_doc.append.call_count, 1)
        append_args = kot_cancel_doc.append.call_args[0]
        self.assertEqual(append_args[0], "kot_items")
        self.assertEqual(append_args[1]["reservation_line_key"], "ref:Biryani:INVITEM-2")
        self.assertEqual(append_args[1]["cancelled_qty"], 1)
