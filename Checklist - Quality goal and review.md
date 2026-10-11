# Checklist — Quality Goal & Review: Manual Testing Guide

**Feature:** Grillax checklist port (branch `feat/checklist-migration`)
**Scope:** Dependent Checklist & Quality Checklist child tables, custom fields, POS Opening/Closing validations, Quality Review permissions, Captain & ordertaker APIs, desk JS
**Site used for testing:** `uryv16.localhost`

---

## 1. Prerequisites & Test Data Setup

Complete these once before running the test cases.

| # | Setup step | How |
|---|---|---|
| 1.1 | Pick/verify a test **Branch** (e.g. `URY`) | Branch list |
| 1.2 | Create a test **Role Profile** (e.g. `Cashier`) | Role Profile list |
| 1.3 | Create test **Role** (e.g. `Cashier`) linked to the profile | Role list |
| 1.4 | Create **Quality Goals** (see 2.1) | Quality Goal list |
| 1.5 | Create test **Employees** with `user_id` linked to system users, `branch` set, and field **Permit to View** (`permit_to_view`) set | Employee form |
| 1.6 | Create/verify **POS Profile** for the branch with a **Dependent Checklist** configured (see 3.1) | POS Profile form |
| 1.7 | Run `bench build` so the new desk JS is served | terminal |

**Users needed:** one admin (test setup), one branch user (e.g. `cashier1@example.com`) whose Employee has `permit_to_view` **unchecked**, and one with it **checked**.

---

## 2. Quality Goal

### 2.1 Create Quality Goals
1. Go to **Quality Goal > New**.
2. Fill mandatory fields (Name, Objectives, etc. per your standard).
3. Set field **Role** (`custom_role`) = `Cashier` (the Role Profile from 1.2).
4. Save.

**Expected:** saves without error; `custom_role` is visible on the form after the `goal` field.

### 2.2 Role filter on Quality Review (JS)
1. Open **Quality Review > New** as the branch user.
2. Click the **Goal** link field.

**Expected:** only Quality Goals whose **Role** matches your user's role profile appear in the dropdown (set_query filter from `autofetch_fields.js`).

---

## 3. POS Profile — Dependent Checklist

### 3.1 Configure the checklist
1. Open the branch's **POS Profile**.
2. Scroll to the **Dependent Checklist** table (after the checklist section break).
3. Add rows:

   | Checklist (Quality Goal) | Option | Role |
   |---|---|---|
   | Opening Checklist Goal | POS Opening Entry | Cashier |
   | Closing Checklist Goal | POS Closing Entry | Cashier |
   | Order Taker Opening Checklist | Order Taking | Waiter |

4. Save.

**Expected:** table saves; rows persist after reload.

### 3.2 Field presence check
Verify these fields render on their forms: Dependent Checklist table on POS Profile; **Quality Checklist** table on POS Opening Entry (after Balance Details) and POS Closing Entry (in the accounting section).

---

## 4. POS Opening Entry — Daily Checklist Block

### 4.1 Blocked when checklist is pending
1. Ensure **no Quality Review** exists today for the branch for the opening goal.
2. Create a new **POS Opening Entry** for the branch's POS Profile; set payment methods; click **Save**.

**Expected:** save is rejected with error — **"Daily Checklists not completed — Pending: Opening Checklist Goal"** (from `update_daily_checklists`).

### 4.2 Passes after review exists
1. Create a **Quality Review**: branch auto-fills (autofetch js), Employee auto-fills with your user, Goal = the opening goal, Status = Passed (or Open), Date = today.
2. Save & Submit the Quality Review.
3. Repeat 4.1.

**Expected:** POS Opening Entry saves normally.

### 4.3 inspected_by stamp
1. Re-open the Quality Review from 4.2.

**Expected:** **Inspected By** shows the user who last updated it (`update_accounts.checklist` on_update hook).

---

## 5. POS Closing Entry — Closing Checklist Validation

### 5.1 Blocked when closing checklist is pending
1. Ensure no Quality Review exists for the **Closing Checklist Goal** since the POS opening period start.
2. Create a **POS Closing Entry** for the open shift; click **Save**.

**Expected:** validation error listing **"Pending checklist: Closing Checklist Goal"** (from `validate_daily_checklists`).

### 5.2 Passes after review exists
1. Create & submit a Quality Review (branch auto-filled, Goal = closing goal, Date = today).
2. Repeat 5.1.

**Expected:** closing entry saves; its **Quality Checklist** table auto-populates with the closing goal row and **check_2** ticked.

---

## 6. Quality Review — Permission Visibility

### 6.1 permit_to_view unchecked (owner-only)
1. As admin, create a Quality Review owned by `cashier1`.
2. Log in as `cashier1` (Employee `permit_to_view` = 0) → open Quality Review list.

**Expected:** `cashier1` sees **only their own** reviews (permission query condition: `owner = user`).

### 6.2 permit_to_view checked
1. Set `cashier1`'s Employee **Permit to View** = 1.
2. Repeat 6.1.

**Expected:** `cashier1` now sees **all** Quality Reviews of all branches.

---

## 7. Captain Checklist API (`check_list.checklist`)

Run as the branch user from **console** (or the Captain UI if wired):

```python
import frappe
frappe.set_user("cashier1@example.com")
from ury.ury.hooks.check_list import checklist
print(checklist())
```

| Scenario | Expected result |
|---|---|
| No open POS Opening for branch | `{"pos_open": 0}` |
| POS open, no dependent checklist on profile | `{"pos_open": 1, "checklist": 1}` |
| POS open, checklist rows exist but none match user's roles | `{"pos_open": 1, "checklist": 1}` |
| POS open, role-matched checklist exists, **no** Quality Review today by this user | `{"pos_open": 1, "checklist": 0, "checklist_doc": [...], "pos_posting_date": "..."}` |
| Same, but review exists (status Open/Passed, owner = user) | `checklist: 1` |

---

## 8. Ordertaker Flow (`order_taking.ordertaker_checklist` + URY Order JS)

### 8.1 Setup
Ensure a Quality Goal named exactly **"Order Taker Opening Checklist"** exists, and a checklist row with Option = `Order Taking` for the user's role on the branch POS Profile.

### 8.2 Blocked order taking
1. Log in as a **Waiter** (role profile ≠ Restaurant Manager, no Quality Review yet).
2. Open **URY Order > New** (with POS open for the branch).

**Expected:** on load, "Complete Order Taker Checklist" message shows and the page redirects to `/app` on click (checklist pending).

### 8.3 Restaurant Manager bypass
1. Log in as a user with role profile **Restaurant Manager**.

**Expected:** URY Order loads with no checklist gate.

### 8.4 Passes after review
1. As the waiter, submit a Quality Review for goal "Order Taker Opening Checklist" (date ≥ POS open date).
2. Open URY Order again.

**Expected:** loads normally, no redirect.

---

## 9. Regression Checks

| # | Check | Expected |
|---|---|---|
| 9.1 | Existing POS Opening/Closing validations (cashier/room, stock gate, reconciliation) still fire | Unchanged behavior alongside the new checklist validations |
| 9.2 | POS Profile without any Dependent Checklist rows | Opening/Closing save normally (no checklist errors) |
| 9.3 | Branch with no URY Report Settings | Not affected — checklist logic doesn't read report settings |
| 9.4 | Quality Review created by Administrator (no Employee record) | Form loads; branch may not auto-fill (no employee match) — no crash |

---

## 10. Quick Console Smoke Test

```bash
bench --site uryv16.localhost console
```

```python
# doctypes + fields
frappe.get_doc("DocType", "Dependent Checklist").istable   # -> 1
[p.fieldname for p in frappe.get_meta("POS Profile").fields if p.fieldname == "dependent_checklist"]  # -> ['dependent_checklist']

# hooks registered
frappe.get_hooks("doc_events")["POS Opening Entry"]["before_save"]
# -> ['ury.ury.hooks.ury_pos_opening_entry.before_save', 'ury.ury.hooks.pos_opening.update_daily_checklists']
frappe.get_hooks("permission_query_conditions")["Quality Review"]
# -> ['ury.ury.hooks.checklist.permission_checklists']
```

---

**Sign-off checklist:** all sections 2–9 pass → feature ready for merge with `feat/grillax-report-migration`.
