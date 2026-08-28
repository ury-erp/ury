# V3-70 — Fulfilment/Accounting Transition Contract (Decision Checklist)

**Status: DRAFT — advisory only. Not yet signed. See "REQUIRES HUMAN SIGN-OFF" below.**

**Scope**: This document is a decision artifact. It contains no code changes, no bench
commands, and does not itself alter `update_stock` or any other live behavior. It exists
to satisfy V3-70's definition of done ("signed transition checklist") and to give V3-71
through V3-74 a concrete, consistent contract to implement against.

---

## 1. Why this document exists

`TODO.md` gates V3-71 (pre-produced fulfilment), V3-72 (MTO fulfilment/micro-batch
posting), V3-73 (POS stock authority behind a feature flag), and V3-74 (cost/variance
attribution) all behind V3-70. `PLAN.md`'s G7 gate states: *"fulfilment and accounting
evidence exists before POS stock authority changes."* `TRACKER.md` already records G7 as
**"blocked on human sign-off"** — this is not a technical deliverable a session can produce
alone, by the track's own design, because it gates the highest-stakes boundary in the
track: the code path that decides whether stock and money move correctly on every order.

This document proposes the shape of that contract. It does not close the gate itself.

---

## 2. Current state (verified against live code)

Read directly from `/Users/safwan/Code/URY/ury/ury/ury/doctype/ury_order/ury_order.py`
(2026-08-28):

- Line 728: `invoice.update_stock = 1` — set unconditionally when a new POS Invoice is
  created for a dine-in/take-away order.
- Line 775: `invoice.update_stock = 1` — set unconditionally in a second POS Invoice
  creation path (the "Payments"/no-existing-invoice branch).
- Line 596: `"update_stock"` is copied as a header field when an invoice is split
  (`header_fields` list used for bill-splitting), i.e. splits inherit whatever
  `update_stock` value was on the parent — currently always `1`.

**So: today, every POS Invoice posts stock directly via ERPNext's native
`update_stock=1` mechanism at invoice submission.** There is no fulfilment/manufacturing
layer standing between the sale and the stock ledger. This matches GOAL.md §76's
description: *"existing order logic carries `update_stock` through invoice operations."*

GOAL.md §76 states the target explicitly and states the risk explicitly in the same
breath: *"The eventual target should be `POS Invoice update_stock = 0` ... with stock
consumed through URY's fulfilment/manufacturing layer. But this must not be changed
before the replacement stock posting is complete. Simply turning POS stock update off
would break inventory and COGS."*

This checklist exists to define what "complete" means before that flag is ever flipped.

---

## 3. Target state — what changes, what doesn't, and in what order

**The order of operations is the load-bearing decision in this document.** Everything
else follows from it:

1. **V3-71 and V3-72 are built first, as inert/additive code.** They implement the new
   fulfilment paths (pre-produced finished-goods consumption, and MTO
   manufacture-then-fulfil with exactly-once micro-batch posting) as new services that
   exist alongside the current path, are not called by the live POS invoice flow, and do
   not touch `ury_order.py`. This mirrors the pattern already used successfully for
   V3-51/V3-52/V3-53/V3-54 (additive KOT/execution modules, never wired into
   `ury_kot_generate.py` / `ury_kot.py`) and V3-60/V3-61/V3-62 (additive
   manufacturing-depth modules never wired into a live Work Order). `TODO.md`'s
   "Must NOT touch" column for V3-71 is `MTO path` and for V3-72 is `POS invoice
   rewrite` — both already forbid a direct rewrite of the live posting path in those
   tasks.
2. **V3-73 adds the feature flag and the integration boundary**, and only then does the
   live POS invoice path gain a *branch*: flag-off keeps `update_stock=1` exactly as it
   is today (byte-for-byte the current behavior); flag-on routes to the new fulfilment
   services from V3-71/V3-72 and sets `update_stock=0`. `TODO.md`'s "Must NOT touch"
   column for V3-73 is `default rollout` — i.e. the flag's default state must stay off
   until this document's evidence bar (Section 5) is met, and flipping the default is
   an operational decision, not an engineering one.
3. **V3-74 adds cost/variance attribution** (posted vs. counted vs. theoretical COGS,
   per GOAL.md §78/§80/§81 and §"20. COGS: Posted, Counted, and ERPNext Truth") on top
   of whichever path is authoritative at the time — it must work correctly whether the
   flag is off (native `update_stock=1` postings are the input) or on (fulfilment-layer
   postings are the input), because the flag can be toggled per environment during the
   evidence-gathering period described in Section 5.

**What does NOT change as part of V3-70 itself, or as an immediate consequence of it:**

- `update_stock` stays `1` everywhere it is today. No line in `ury_order.py` changes.
- No existing POS Invoice, Stock Entry, or GL Entry behavior changes.
- No feature flag is created, defaulted on, or referenced by live code as part of this
  document.
- Mixed invoices (GOAL.md §77 — e.g. a bill with a pre-produced dish, an MTO dish, and a
  direct-retail drink on the same invoice) are **not required to route per-line before
  V3-73's flag exists** — per-line routing is V3-73/V3-74 implementation work, this
  document only fixes that the target shape is "one invoice, `update_stock=0`, each line
  fulfilled according to its own policy," not a redesign of the invoice document itself.

**Sequencing summary**: additive fulfilment paths (V3-71, V3-72) → flagged integration
point (V3-73) → attribution layer that spans both states (V3-74). At no point does this
document authorize touching the two `update_stock = 1` assignments in `ury_order.py`
directly; that edit belongs to V3-73 and is conditional on the evidence bar in Section 5
plus this document's sign-off.

---

## 4. Risk assessment

| Failure mode | Mechanism | Impact |
|---|---|---|
| Double-counted stock | Flag-on path both calls the new fulfilment service *and* leaves `update_stock=1` on the invoice (incomplete wiring), or a retried micro-batch post (V3-72) is not idempotent | Stock decremented twice for one sale; inventory understated; false stockouts; incorrect reorder signals |
| Lost sales / stuck orders | Fulfilment service fails after invoice submit but before stock posts, with no compensating mechanism | Invoice exists, payment taken, but stock never moves — orphaned discrepancy between sales and inventory |
| Incorrect COGS | Posted (fulfilment-layer) and counted (physical) COGS diverge silently, or V3-74 attribution reads from the wrong source depending on flag state | Wrong P&L, wrong department profitability (this directly feeds V3-80, which is downstream of V3-74) |
| Orphaned reservations | V3-43's reservation service reserves stock for an order whose fulfilment posting then fails or is skipped (flag toggled mid-order-lifecycle) | Reserved-but-never-consumed or never-released stock; availability (V3-44) reports wrong numbers |
| Exactly-once violation in micro-batch posting | V3-72's batch poster retries a partially-failed batch without a durable idempotency key, double-posting some lines | Same as double-counted stock, but harder to trace because it's batch-level, not per-invoice |
| Flag flips before evidence exists | Someone (human or automated process) sets the flag on in production without the evidence in Section 5 | All of the above, in production, with real money and real customers |

### Rollback plan

**The feature flag from V3-73 IS the rollback plan.** There is no separate rollback
mechanism proposed here, and none should be built — a second rollback path would be
another thing that can drift or fail silently. Concretely:

- Flag off = exactly today's code path (`update_stock=1`, no fulfilment service
  involved). This must remain true for the lifetime of the flag, i.e. V3-73 must not
  refactor or touch the flag-off branch beyond adding the `if` that selects it.
- If anything goes wrong after the flag is flipped on in any environment, the
  **first and only required action is flipping the flag back off**, restoring the
  untouched, previously-verified `update_stock=1` behavior. This is why the flag-off
  branch must remain byte-identical to current behavior — if it drifts, the rollback
  plan stops being a rollback plan.
- Per-branch or per-environment flag scoping (V3-73 to specify) is recommended so a
  problem discovered in one branch does not require a global flip, but that is an
  implementation detail V3-73 must decide, not this document.

---

## 5. Idempotency / exactly-once requirements for V3-72

V3-72's TODO.md row explicitly requires "duplicate/retry tests" as its acceptance
evidence, and its output is "MTO fulfilment/exactly-once micro-batch posting." This
document specifies the pattern it must follow, not the implementation:

- **Use V3-53's idempotency-key pattern as the template.** V3-53 (execution lifecycle,
  accepted 2026-08-28) was independently reviewed and confirmed to have "idempotency
  dedup and stale-key no-op both hand-traced correct" with a "forward-only transition
  map... no reverse entries exist." V3-72's micro-batch poster must have the same shape:
  every batch-post attempt carries a durable, stable idempotency key (not a
  client-generated one that can differ across retries); a duplicate key with the same
  payload is a no-op; a duplicate key with a different payload is a hard error, not a
  silent overwrite; and the state transition the batch causes (stock consumed, GL
  posted) must be forward-only — no batch post may be un-posted by a later retry.
- **Batch posting must acquire whatever lock V3-43's reservation service already uses**
  (V3-43 uses sorted `SELECT ... FOR UPDATE` for all-or-nothing atomicity) rather than
  inventing a second locking discipline — two different locking strategies over the
  same stock rows is itself a source of the double-counting risk in Section 4.
- **A failed batch must leave the system in a state identical to "never attempted"** —
  no partial stock consumption, no partial GL entries — or must clearly and durably mark
  itself as partially-applied so a human/automated reconciler can find it. Silent
  partial application is not acceptable.
- V3-72's "duplicate/retry tests" (per TODO.md) should specifically include: same batch
  submitted twice concurrently; same batch submitted twice sequentially after a crash;
  batch resubmitted with a stale idempotency key after the underlying order has already
  moved to a terminal state (should no-op, matching V3-53's pattern for stale-key
  requests against terminal states).

---

## 6. Evidence required before the flag may ever be flipped in a real environment

None of the following exists yet. All of it must exist, and be reviewed, before V3-73's
flag default changes from off in any environment that touches real money or real stock.
This document does not produce this evidence — it specifies what the evidence must be:

1. **Test coverage** for V3-71 and V3-72 matching their TODO.md acceptance criteria
   ("stock/availability tests" and "duplicate/retry tests" respectively), independently
   reviewed the way V3-41 through V3-60 were (implementation agent + independent
   reviewer, per the pattern already established in `TRACKER.md`).
2. **A staging or parallel-run comparison period**: the new fulfilment paths run
   alongside the live `update_stock=1` path (flag off, but the new code path executed in
   shadow/dry-run mode, or run in a non-production environment against a realistic order
   mix) for a defined window, long enough to observe MTO, pre-produced, and direct-retail
   items, mixed invoices (GOAL.md §77), cancellations at every stage (V3-54's
   cancel-before/after-production dispositions), and at least one full physical count
   cycle.
3. **Explicit reconciliation between old and new paths** for that comparison window:
   stock consumed under `update_stock=1` vs. what the fulfilment layer would have
   consumed for the same orders, and posted COGS vs. counted COGS (GOAL.md's "posted and
   counted... gap is not noise, it is the leakage/variance figure" — §"20. COGS: Posted,
   Counted, and ERPNext Truth"). Discrepancies must be understood and explained, not just
   observed.
4. **Sign-off from whoever owns production operations** — not just the engineering
   review that accepts a task in this track. Every prior V3-4x/V3-5x/V3-6x task in this
   track was accepted by an implementation-agent + independent-reviewer pair; this is
   explicitly insufficient for V3-70/V3-73 because those tasks change what the live
   system does with real orders. That sign-off is the subject of Section 7.
5. **A rollback rehearsal**: flipping the flag off after having run flag-on for a period,
   confirming the system returns cleanly to `update_stock=1` behavior with no orphaned
   state, before the flag is trusted as a real rollback mechanism.

---

## 7. REQUIRES HUMAN SIGN-OFF

**This section is the operative part of this document.**

- This entire file is a **draft prepared for review**. It has not been approved.
- **V3-70 cannot be marked "accepted" by an autonomous process.** Per `TRACKER.md`'s own
  existing entry, G7 is "blocked on human sign-off" by the track's design, not by
  caution alone. No implementation agent, reviewer agent, or orchestrating session may
  change V3-70's status to accepted.
- **The user (Safwan) must explicitly approve this transition contract** — the
  sequencing in Section 3, the risk/rollback framing in Section 4, the idempotency
  requirement in Section 5, and the evidence bar in Section 6 — before V3-71 or any
  downstream task (V3-72, V3-73, V3-74) may be implemented.
- The reason this gate exists at all: this is the one decision in the entire `sa-v3_nxt`
  track that governs a change to code that directly handles **money, stock, and live
  orders in production**. Every other accepted task in this track (V3-41 through V3-62)
  was deliberately built as additive/unwired code specifically so it would not require
  this level of sign-off. V3-70 is the point where that pattern ends, by design.
- If you approve this contract as-is, the next step is to record that approval in
  `TRACKER.md` against V3-70 (with date and your name, matching the existing entry
  format) and unblock V3-71. If you want changes to the sequencing, risk framing, or
  evidence bar, this document should be revised and re-presented before any unblocking.

---

## 8. Open questions this checklist does NOT resolve

Per `PLAN.md`'s "Decision gates kept open" section, the following are explicitly named
as unresolved items requiring their own decision records, and this document does not
attempt to answer them. They are listed here because two of them are specifically
flagged in `PLAN.md` as needing *this* decision (V3-70) as a prerequisite, but "needing
this decision" is not the same as "resolved by this decision" — they still need the
user's input, not a default assumption:

- **Paired fulfilment document strategy** — GOAL.md's "16. Paired Manufacture and
  Fulfilment Batching" and its own open item "5. Exact ERPNext document strategy for
  paired fulfilment in every deployment" (§5735 area) is unresolved: whether paired
  manufacture/fulfilment uses Work Order + Stock Entry, a custom "Fulfilment Batch"
  doctype (sketched in GOAL.md around line 6562), or some other document shape. V3-71
  and V3-72 will need this decided before their document/DocType design is final — this
  checklist does not pick one.
- **Direct-retail migration** — GOAL.md §"4.3 DIRECT-RETAIL / NON-PRODUCED" and
  `PLAN.md`'s open item explicitly note: "Transitional deployments may let POS manage
  these through the conventional POS warehouse. The preferred ultimate model is to put
  them under a Retail or Beverage department warehouse" — and `PLAN.md`'s open item 10
  asks "Whether direct-retail stock should be migrated immediately or left transitional
  by client." This checklist does not decide the timing or trigger for that migration;
  V3-71/V3-73 must treat direct-retail items as still POS-warehouse-controlled unless a
  separate decision says otherwise.
- Also out of scope for this document (named in `PLAN.md`'s same gate list, not
  specific to V3-70 but worth flagging since V3-74 touches cost/variance): the exact
  variance-confidence threshold and whether physical-count COGS or posted COGS is
  authoritative per deployment — GOAL.md's §"20. COGS: Posted, Counted, and ERPNext
  Truth" sketches both but leaves the per-client default open.

These should each get their own short decision record, per `PLAN.md`'s instruction, before
the tasks that depend on them are assigned.

---

## 9. Summary for implementers (V3-71 – V3-74)

- V3-71 / V3-72: build new, additive fulfilment services. Do not touch
  `ury_order.py`'s two `update_stock = 1` assignments or the `header_fields` copy list.
  Do not assume the paired-fulfilment document shape — flag it as depending on the open
  question in Section 8 if your design needs to commit to one.
- V3-72 specifically: idempotency key + forward-only state transitions, modeled on
  V3-53; lock discipline consistent with V3-43's `SELECT ... FOR UPDATE` pattern.
- V3-73: add the flag and the branch point in `ury_order.py`. Flag-off branch must stay
  byte-identical to current behavior. Default is off. Flipping the default anywhere
  real requires the evidence in Section 6 and sign-off per Section 7 — this is a
  distinct approval from V3-70 itself.
- V3-74: must work against both flag states, since environments may run with the flag
  in different positions during the evidence-gathering period.
