# Intake dossier — PR #188: "feat(pos): support transaction discounts and float quantities"

- **Source:** https://github.com/ury-erp/ury/pull/188
- **State:** open, **draft** · **Base:** `develop` · **Head:** `ury-erp:pricing-rule-discount` @ `2940735` (same repo, not a fork)
- **Author:** ShahalaKP-Tridz (feature commit `4c72f75` authored by "Shahala") · **Created:** 2026-07-19 · **Last update:** 2026-07-19
- **Size:** 2 commits (1 feature commit + 1 merge of `develop` into the branch), 7 files, +56 / −23
- **Mergeable:** **yes** (`mergeable_state: clean`); local `git merge-tree --write-tree origin/develop pr/188` exits 0 with no conflicts. (`rebaseable: false` is an artifact of the branch already containing a merge of `develop`.)
- **PR body:** present and accurate (describes both features); **Reviews/comments:** none
- **Local refs:** head fetched to `refs/remotes/pr/188` (`2940735`); because the branch merged `develop` in, the merge-base with `develop` is the current `develop` tip `87e6d5e` — the effective diff is exactly the one feature commit.

## 1. Purpose and current implementation

Two small, loosely related POS features, both confined to the React POS v2 (`pos/`) plus field exposure in the Frappe API:

**A. Surface transaction-level discounts at checkout.** Invoices can already carry a discount applied upstream (pricing rule or a manual `additional_discount_percentage` / `discount_amount` on the POS Invoice), but the POS previously discarded those fields when fetching invoices, so the cashier reopened payment with a blank "Apply Discount" box and no visibility into the existing discount. The PR:

- adds `additional_discount_percentage` and `discount_amount` to the three invoice fetch paths in `ury/ury_pos/api.py` (`get_split_group` field list, both `getPosInvoice` raw-SQL column lists, `searchPosInvoice` field list);
- threads both fields through the frontend types (`POSInvoice` in `pos/src/lib/invoice-api.ts` and `pos/src/store/slices/orders-slice.ts`, plus `mapSplitGroupInvoiceToPOSInvoice`);
- passes them from `pos/src/pages/Orders.tsx` into `PaymentDialog` as new optional props;
- in `PaymentDialog.tsx`: pre-fills the discount input with the invoice's percentage, or — when only an amount exists — derives an *effective percentage* as `discountAmount / (grandTotal + discountAmount) * 100` (i.e. treats `grandTotal` as the post-discount total and reconstructs the pre-discount base); introduces `baseTotal = grandTotal + discountAmount` and computes percentage discounts against that base instead of the discounted total; displays the rounding adjustment (`roundedTotal − grandTotal`) when non-zero; sends `additionalDiscount` to `make_invoice` with `parseFloat` instead of `parseInt` so fractional percentages survive.

**B. Float (decimal) quantities.** For weighed items (grams), quantities like 1.5 / 0.5 must be representable:

- `ProductDialog.tsx`: `parseInt` → `parseFloat` for the quantity input; typed input validated with `/^\d*\.?\d*$/` (digits with at most one decimal point); increment/decrement round to 3 decimals to avoid float noise (`Math.round((x ± 1) * 1000) / 1000`); add-to-order rejects `<= 0` instead of `=== 0`.
- `OrderPanel.tsx`: the cart +/− buttons use the same 3-decimal rounding; an item is removed when the decremented quantity is `<= 0` (previously only `=== 0`).

No backend quantity changes — POS Invoice Item `qty` is already a Float in ERPNext, and `make_invoice` assigns `additional_discount_percentage` directly (`ury/ury/doctype/ury_order/ury_order.py:1225`), which accepts floats.

## 2. Diff and affected modules

| Area | Files | Nature |
|---|---|---|
| Frappe POS API (`ury/ury_pos/api.py`) | +10/−2 | additive: two discount fields added to `get_split_group`, `getPosInvoice` (×2 SQL blocks), `searchPosInvoice` |
| POS types (`pos/src/lib/invoice-api.ts`, `pos/src/store/slices/orders-slice.ts`) | +6 | optional fields on `POSInvoice` + mapper passthrough |
| Payment flow (`pos/src/components/PaymentDialog.tsx`, `pos/src/pages/Orders.tsx`) | +33/−7 | discount prefill, `baseTotal` math, rounding-adjustment display, float `additionalDiscount` |
| Quantity input (`pos/src/components/ProductDialog.tsx`, `pos/src/components/OrderPanel.tsx`) | +17/−14 | `parseFloat`, regex input validation, 3-decimal-safe increment/decrement |

Everything is additive or behavior-narrowing; no doctype, fixture, hook, or migration changes. No committed build output.

## 3. Relationship to `develop`

The branch already contains a merge of current `develop` (`87e6d5e`, post-#181 shared-packages refactor), so it is **up to date and merges cleanly** — zero conflict files. `develop` has **no counterpart** for either feature: invoice fetches do not return discount fields, `PaymentDialog` always starts with an empty discount box and computes percentage discounts on the (possibly already discounted) `grandTotal`, and quantity inputs are integer-only.

### Conflicts

None against `develop` today. Textual conflicts are only expected if other in-flight PRs touching the same lines land first (see §4): PR-185 rewrites the same `getPosInvoice` SQL blocks and touches `OrderPanel.tsx`, `invoice-api.ts`, and `Orders.tsx`; the stale `decimal-qty` branch edits the same `parseInt` lines in `ProductDialog.tsx`.

## 4. Overlapping PRs

- **`origin/decimal-qty`** (branch only, **no open PR**; 2 commits by swafa-as, 2026-07-07): the same `parseInt` → `parseFloat` change in `ProductDialog.tsx`, plus decimal-quantity support in the **legacy Vue POS** (`urypos/src/components/Cart.vue`, `Menu.vue`) which PR-188 does not touch. Functionally a subset/duplicate of PR-188's feature B for the React POS. If it is ever opened as a PR it will conflict trivially; the correct resolution is PR-188's version, and its `urypos/` changes are the only unique part.
- **PR #185** ("Feat/thermal printing v2", open, `dirty`): overlaps the same `getPosInvoice` SQL column lists and `pos/src` files (`OrderPanel.tsx`, `invoice-api.ts`, `Orders.tsx`). No functional contradiction — whichever merges second needs a small rebase in those spots. See `intake/intake-PR-185.md` on `task/PR-185-intake`.
- **PR #179**: subset of #185; same remarks apply transitively.
- No other open PR touches `PaymentDialog.tsx`, `ProductDialog.tsx`, or the discount fields.

## 5. Remaining work (before merge)

- Undraft the PR (it is currently marked draft).
- Restore a sane upper bound on typed quantity: the old `0–99` guard was dropped from `handleQuantityChange` — the regex accepts `99999` while the increment button still caps at 99, an inconsistency that also lets a typo create a huge line total.
- Reconcile with `origin/decimal-qty`: confirm PR-188 supersedes its React-side change and decide whether the legacy `urypos/` decimal support (Cart.vue/Menu.vue) should be ported in or the branch deleted.
- Decide the intended precedence when an invoice has **both** `additional_discount_percentage` and `discount_amount` set (current code silently prefers the percentage and ignores the amount in the prefill, though `baseTotal` still adds the amount — a mixed state would double-count).
- Verify the prefill UX end-to-end: prefilled `discountValue` is display-only until the cashier taps "Apply" — confirm this matches the intended flow (re-applying an already-applied pricing-rule discount via `make_invoice` would set `additional_discount_percentage` again on submit).
- Optional: add screenshots to the PR body; no description gaps otherwise.

## 6. Risks

- **Low overall** — 56 added lines, additive API fields, clean merge, no schema changes.
- **Unbounded typed quantity** (regression introduced by this PR): removing the `num <= 99` check means any magnitude can be typed; only regex shape is validated.
- **Effective-percentage derivation assumes `grandTotal` is the post-discount total.** That holds for invoices fetched after a pricing rule/manual discount is applied, but if a future caller passes a pre-discount total with `discountAmount`, the derived percentage is wrong (denominator off by `discountAmount`).
- **Mixed percentage+amount invoices** are displayed inconsistently (percentage preferred for prefill, amount still added into `baseTotal`).
- **Double-discount hazard**: pre-filling the discount box with an already-applied invoice discount makes it one tap away from being re-applied as a *new* `additional_discount_percentage` on top of the pricing-rule discount, depending on how `make_invoice`/`calculate_taxes_and_totals` treats the existing values — needs manual verification.
- **3-decimal rounding is UI-side only**; backend/item-master precision (`qty` float precision, UOM `must_be_whole_number` in ERPNext) is not enforced — a decimal qty on a whole-number UOM item would fail later at invoice validation, not at the cart.
- **No tests** added; none exist for this area of the repo.

## 7. Required tests

No automated tests exist in the repo for this area, and the PR adds none. Required validation before merge:

- **Discount surfacing (bench + site):** create a POS Invoice with (a) `additional_discount_percentage` only, (b) `discount_amount` only, (c) both, (d) neither — via pricing rule and via manual entry; confirm the payment dialog prefill, `baseTotal`, and rounding-adjustment line are correct in each case, and that proceeding to payment does not double-apply the discount.
- **API regression:** `getPosInvoice`, `searchPosInvoice`, and `get_split_group` return the new fields without breaking existing consumers (Orders list, split/merge views); SQL column lists remain valid against a migrated site.
- **Float quantities:** add 0.5 / 1.5 kg items via typed input and +/− buttons; verify totals, order submission, KOT payloads, and the resulting POS Invoice item qty; verify decrement from 0.5 removes the item; verify typing `9999` (post-fix: should be capped); verify an item whose UOM forbids decimals fails gracefully.
- **Frontend:** `cd pos && yarn build` and lint/typecheck pass; `yarn workspace @ury/core typecheck` unaffected (no shared-package changes).

## 8. Recommended disposition

**Merge after undrafting, with one required fix and one verification.** This is a small, well-scoped, cleanly-mergeable PR against current `develop` — the opposite of the #179/#185 situation. Required before merge: restore an upper bound on typed quantity (§5). Required verification: the double-discount behavior on already-discounted invoices (§6) — if `make_invoice` re-applies the prefilled percentage, the prefill should be read-only display or the submit path should skip re-applying an unchanged discount. Absorb or close the stale `decimal-qty` branch in the same pass. Do not split the PR — at this size the two features are fine together.

## 9. Atomic subtasks (if rework is preferred over merge)

| # | Subtask | Difficulty | Risk | Uncertainty |
|---|---|---|---|---|
| 1 | Expose `additional_discount_percentage`/`discount_amount` in the three `ury_pos/api.py` fetch paths + frontend types | Low | Low | Low |
| 2 | PaymentDialog discount prefill + `baseTotal`/rounding-adjustment math, incl. mixed percentage+amount handling and double-apply guard | Medium | Medium | Medium (depends on `make_invoice`/`calculate_taxes_and_totals` behavior with pre-existing discounts — needs bench verification) |
| 3 | Float quantities in `ProductDialog`/`OrderPanel` (parseFloat, regex validation, 3-decimal-safe buttons) **with** restored upper bound | Low | Low | Low |
| 4 | Port (or explicitly drop) decimal-quantity support for the legacy `urypos/` Vue app from `origin/decimal-qty`; delete the stale branch | Low | Low | Low |

## 10. Acceptance criteria (for the PR itself)

- Invoice-level discounts applied upstream (pricing rule or manual) are visible and correctly reflected in the payment dialog for all four discount states (percentage-only, amount-only, both, neither), and completing payment never double-applies them.
- `getPosInvoice`, `searchPosInvoice`, and `get_split_group` responses include the two discount fields with no regression to split/merge order views.
- Decimal quantities can be entered (typed and via +/−) end-to-end from cart to submitted POS Invoice; quantities stay within a sane bounded range; float noise (e.g. `0.30000000004`) never appears in the UI.
- `cd pos && yarn build` succeeds; no changes to shared packages, fixtures, doctypes, or committed build output.
