# Open Questions — URY Approval & Control System

The following implementation choices remain available for human review. Resolved source and delivery questions are recorded at the end.

1. **Approver identity and default roles.** The implementation permits either a User or a Role at each level and creates/uses “Restaurant Manager” and “Finance Head” roles. Confirm whether these are the intended production roles and whether self-approval should remain a Branch setting.
2. **Purchase document coverage.** Purchase Order, Purchase Receipt, and Purchase Invoice are covered. Material Request is excluded. Confirm that this matches the intended meaning of “purchase document.”
3. **Expense DocTypes and advance account mapping.** Purchase Invoice, Purchase Order, HRMS Expense Claim, and Employee Advance are covered. Employee Advance uses explicit URY Budget Expense Account and URY Budget Cost Center fields because its native advance account is normally a balance-sheet account.
4. **Reservation timing and stale drafts.** Budget reservations are created on draft validation and updated on repeated saves; rejection/cancellation releases them and submission consumes them. Confirm whether a retention/expiry policy is needed for abandoned drafts.
5. **Backdated transaction coverage and finalization source.** Monthly URY Period Lock finalization is independent of URY Daily P and L. The configured transaction hooks cover Payment Entry, Employee Advance, invoices, purchase documents, Expense Claim, Journal Entry, Material Request, Stock Entry, Stock Reconciliation, and related existing hooks. Confirm whether any additional submittable DocTypes require coverage.
6. **Mixed-branch source of truth.** Branch detection uses explicit parent/row Branch fields plus Cost Center and Warehouse branch links. Confirm whether every transaction should instead require an explicit parent Branch even when URY controls are disabled.
7. **UPI classification.** Mode of Payment type `Phone` maps to UPI; explicit Mode of Payment links can further specialize branch payment rules. Confirm whether any site uses a different UPI classification.
8. **Approval workflow execution.** Decisions use the URY whitelisted API, which enforces per-branch User/Role and level rules. The ERPNext Workflow records the same states but is not the authorization mechanism.

## Resolved during this implementation

- **Price-control source and Item Group:** `upstream/Aggregator` at `255de52baf0341192d41fdc6a71f2ddf0d0174d3` was inspected, including its fixtures, hooks, and history. The described implementation was not present. The user explicitly directed an Item-wise reimplementation with Item Group excluded; this is now implemented without an Item Group fallback.
- **Branch buying Price List:** Branch `custom_ury_buying_price_list` takes precedence, with the purchase document's native `buying_price_list` as fallback. Comparison handles validity dates, supplier-specific prices, row/stock UOM conversion, and document currency conversion. Missing prices or unusable conversion produce a warning without blocking.
- **Item authority limits:** Each Item approval-limit row maps to a Branch purchase approval level. Crossing either the amount or percentage threshold escalates to the appropriate higher configured level; if every threshold is crossed, the highest configured level is used.
- **Push destination:** The user selected `upstream`; the feature branch tracks `upstream/feature/approval-control-system-v16`.
