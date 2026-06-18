# Room-Level Waiter Print Rollout Sign-Off

## Deployment Checklist

- [x] Migration completed (`bench --site ury.localhost migrate`)
- [x] Custom field `URY Printer Settings-custom_waiter_print` present
- [x] Print format `URY Waiter Order Slip` present on site (`doc_type = URY KOT`, site-managed)
- [x] Room configuration validated (`AC` enabled, `Ground Floor` control)
- [x] Automated tests passed (`ury.ury.api.test_ury_waiter_print`)
- [x] Smoke eligibility checks passed on site `ury.localhost`

## Configuration

| Room | Waiter Print | Printer | Purpose |
|------|--------------|---------|---------|
| AC | Enabled | Waiter Printer | Waiter-enabled dine-in room |
| Ground Floor | Disabled | - | Control room |

Table mapping verified:
- `F1`, `F4`, `Waiting Table` (AC) -> waiter printer resolved
- `T5` (Ground Floor) -> no waiter printer

## Behavior

- Waiter slip prints **once per order save** from `kot_execute`
- Slip contains **combined delta items** from all KOTs created in that save (including cancellations)
- Print source is **`URY KOT`** (`kot_items`), not the full `POS Invoice`
- Kitchen KOT printing via `on_submit` is unchanged

## Verification Matrix

| Scenario | Expected | Result |
|----------|----------|--------|
| Dine-in order update with new items | 1 combined waiter slip with delta items only | Pass (`test_prints_combined_kot_for_dine_in`) |
| Multiple production-unit KOTs in one save | 1 combined slip with merged items | Pass (`test_build_combined_kot_doc_merges_multiple_kots`) |
| Same item across multiple KOTs | Quantities aggregated on one slip | Pass (`test_build_combined_kot_doc_aggregates_same_item`) |
| Item cancellation in same save | Cancel line included on combined slip | Pass (`test_build_combined_kot_doc_includes_cancel_lines`) |
| Takeaway order | No waiter slip | Pass (`test_skips_takeaway_tables`) |
| Control room dine-in | No waiter slip | Pass (`test_skips_when_no_waiter_printers` + GF config) |
| KOT reprint API | No waiter slip coupling | Pass (unit test) |
| Missing / wrong-doctype waiter format | Log and skip | Pass (unit tests) |

## Site Print Format Setup

The `URY Waiter Order Slip` format must use **`doc_type = URY KOT`** and iterate **`doc.kot_items`** (not `doc.items`).

Required fields in the template:
- Header: `doc.invoice`, `doc.restaurant_table`, `doc.customer_name`, `doc.date`, `doc.time`
- Items: `item.item_name`, `item.quantity` (add lines), `item.cancelled_qty` (cancel lines)

Run `bench migrate` after deploy — patch `fix_waiter_order_slip_print_format` updates existing sites automatically.

## Rollback Path

Disable waiter slips without code rollback:

1. Open `URY Room` records.
2. In `Printer Settings`, uncheck `Waiter Print` (`custom_waiter_print`) for affected rooms.
3. Save room configuration.

KOT split, bill print, and KOT reprint flows remain unchanged.

## Changed Files

- `apps/ury/ury/fixtures/custom_field.json`
- `apps/ury/ury/hooks.py`
- `apps/ury/ury/ury/api/ury_waiter_print.py`
- `apps/ury/ury/ury/api/ury_kot_generate.py`
- `apps/ury/ury/ury/api/test_ury_waiter_print.py`
- `apps/ury/ury/ury/doctype/ury_kot/ury_kot.py`
- `apps/ury/ury/ury/print_format/ury_waiter_order_slip/ury_waiter_order_slip.json`
- `apps/ury/ury/patches/v2_0/fix_waiter_order_slip_print_format.py`
