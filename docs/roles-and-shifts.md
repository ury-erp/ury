# Roles, tills and shifts

## Roles

URY has four roles. Each level can do everything the level below it can.

| Role | Shown as | Can do |
|---|---|---|
| URY Captain | Waiter | Take orders on their own tables, print the bill |
| URY Cashier | Cashier | + take payment, open and close the till, transfer tables, see every table |
| URY Manager | Manager | + cancel orders and remove items already sent to the kitchen without approval, close another cashier's shift, reports, staff and PINs |
| URY Admin | Admin | + restaurant setup, and everything in the Desk |

- Waiters and cashiers have **no Desk access**. After logging in they go
  straight to the POS: cashiers to `/pos`, waiters to `/pos/order`.
- Managers and admins keep the Desk, for example to reconcile M-Pesa and bank
  statements.
- The POS Profile's role tables ("Allowed for Billing", "Transfer Role
  Permissions") can give a capability to an extra role, but never take one
  away from a level that already has it. "Restricted for Table Order" still
  restricts.
- Managers add staff in `/ury` > Users. They can give the Waiter, Cashier and
  Manager roles; only an admin can make someone an admin.

## Manager approval

A cashier can **cancel an order**, and anyone below manager can **reduce or
remove items already sent to the kitchen**, only with a manager's approval.

1. The POS shows a PIN pad.
2. A manager types their **approval PIN** on the same screen. Nobody logs out.
3. The action goes through.

Every approval is recorded in *URY Order Approval Log*: what was done, to
which order, who asked, who approved, the reason and the time.

- **Setting an approval PIN:** each manager sets their own under Desk > *URY
  Manager PIN*. An admin can set one for any manager.
- **Separate from sign-in:** the approval PIN is never the same as any waiter's
  station sign-in PIN, and it never opens a session.
- **Wrong PINs:** five wrong PINs in a row lock that cashier out of approvals
  for five minutes.

## The till: opening and closing

There is **one open till (POS session) per POS Profile** at a time.

**Opening:** a cashier opens the till and enters the opening float for each
payment mode. Waiters and managers never need to open one: they work inside
the till that is open.

**During the shift:**
- Every order belongs to the cashier whose till is open now.
- An order taken in one shift and paid in the next belongs to the cashier who
  took the payment.

**Closing:** the cashier taps **Close Shift**, counts each payment mode and
enters the amounts. Closing books the shift's sales into the accounts.
- Afterwards the POS offers **Print shift report**. It is optional: managers
  can find every closing later in the system (Desk > *POS Closing Entry*).
- A shift with no takings and no float can be closed at zero.

**Shift handover (several cashiers in a day):**
1. Cashier A closes their shift.
2. Cashier B logs in and opens a new till.

If B tries to open while A's till is still open, the POS says whose shift is
open. If A has left, a **manager** can close A's shift from the POS: Close
Shift then shows "You are closing the shift opened by A", and the closing is
recorded under A.

**Midnight:** ERPNext refuses orders and payments against a till opened on an
earlier day. After midnight the cashier (or a manager) must close the till and
open a new one; the POS says so in plain words.

## For developers

| Part | Where |
|---|---|
| Role levels and capabilities | `ury/ury/roles.py` (`level`, `can_bill`, `can_manage_tables`, `pos_capabilities`) |
| Capabilities in the POS | `getPosProfile` and `get_captain_context` return `capabilities`; `derivePOSCapabilities` in `@ury/core` uses them |
| Staff management | `ury/ury/api/staff.py` |
| Manager approval | `ury/ury/approvals.py`; POS: `pos/src/components/ManagerApproval.tsx` |
| Till and handover | `ury/ury/pos_session.py`; `check_opening_entry` in `ury/ury_pos/api.py` |
| Desk access migration | `ury/patches/v3_0/staff_without_desk_access.py` |

Tests: `ury.ury.test_roles`, `ury.ury.test_approvals`,
`ury.ury.test_shift_handover`. The approval and handover tests need a working
restaurant with today's till open; they write real orders and closings, so run
them on a test site only.
