# V3 reporting stock-dependency audit

Scope: Phase 8 reporting and day-close backend migration.

| Surface | Revenue source | Cost source | POS Profile warehouse dependency | V3 treatment |
|---|---|---|---|---|
| Sales reports | Submitted POS Invoice / Item | None | No | Preserve existing behavior. |
| Department profitability | Submitted POS Invoice / Item | Theoretical BOM attribution plus submitted fulfilment posting evidence | No | Expose theoretical and posted cost separately; missing posting is provisional. |
| Daily P&L | Submitted sales documents | Existing theoretical/estimated calculation | No direct dependency | Do not rewrite historical submitted P&L; label V3 authority output explicitly. |
| Day-close checklist | Operational documents | Fulfilment records and posting references | No | Block close when branch fulfilment records lack submitted posting evidence. |
| Stock widgets/reorder | ERPNext stock/Bin surfaces | ERPNext stock truth | Review required per endpoint | No Phase 8 rewrite; consumers must not treat POS Profile warehouse as universal truth. |

## Cost semantics

- Theoretical cost is calculated from BOM/component valuation inputs.
- Posted cost is present only when a fulfilment record has a posting reference and the linked Stock Entry is submitted for the same company.
- An unposted or unresolved fulfilment is a blocker/provisional result, never a zero or theoretical-equivalent posted cost.
- Historical Daily P&L records are not silently migrated.
