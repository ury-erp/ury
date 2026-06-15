# Room-Level Waiter Print Rollout Sign-Off

## Deployment Checklist

- [x] Migration completed (`bench --site ury.localhost migrate`)
- [x] Custom field `URY Printer Settings-custom_waiter_print` present
- [x] Print format `URY Waiter Order Slip` present on site (site-managed, not shipped from app)
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

## Verification Matrix

| Scenario | Expected | Result |
|----------|----------|--------|
| Dine-in first save (AC table) | 1 waiter slip | Pass (`test_prints_waiter_slip_for_dine_in`) |
| Dine-in update (modified change) | 1 updated slip | Pass (`test_reprints_on_invoice_modification`) |
| Same revision repeated trigger | No extra slip | Pass (`test_dedupes_same_invoice_revision`) |
| Takeaway order | No waiter slip | Pass (`test_skips_takeaway_orders`) |
| Control room dine-in | No waiter slip | Pass (`test_skips_when_no_waiter_printers` + GF config) |
| KOT reprint API | No waiter slip coupling | Pass (unit test) |
| Missing waiter format | Log and skip | Pass (unit test) |

## Automated Test Evidence

```
bench --site ury.localhost run-tests --module ury.ury.api.test_ury_waiter_print
.........
Ran 9 tests in 0.037s
OK
```

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
- `apps/ury/ury/ury/api/test_ury_waiter_print.py`
- `apps/ury/ury/ury/doctype/ury_kot/ury_kot.py`
