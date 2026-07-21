---
owner: sa-user
git_user: swafaalikkal
status: active
created: 2026-07-21
---

# Track: sa-restructure-ury-app

## Goal
Restructure the URY app to remove the sub-cashier closing model, support multiple POS profiles per branch, decouple room assignment from Branch, track order numbers at branch level, and decouple Production Unit from POS Profile. The restructure must be backward-compatible with existing sites, preserving historical data and ensuring a smooth migration without data loss.

---

## Design Decisions

### A. Should URY User child table remain in Branch?

**Current behavior**: `getBranch()`, `getBranchRoom()`, `getRoom()`, and `pos_extend.py:overrided_past_order_list()` all resolve the user's branch by joining `tabURY User` to `tabBranch`. The user-to-branch mapping is the only way to determine which branch a session user belongs to.

**Decision: Keep `URY User` in Branch (without the `room` column).**

Reasons:
- `getBranch()` is called by 8+ functions across `api.py`, `ury_kot_display.py`, and `pos_extend.py`. It is the foundational lookup for filtering all branch-scoped data. Removing it would require all callers to resolve branch through a POS Profile join, which is more fragile (a user could be in no profile, or in profiles across branches).
- Keeping the user-branch mapping in `Branch` gives a clear, single source of truth for "which branch does this user belong to".
- Only the `room` column is removed from the `URY User` child table. Room assignment moves to the POS Profile.

**Consequence**: `getPosProfile()` will continue calling `getBranch()` first, then find the correct POS Profile within that branch that lists the session user as either a cashier or captain.

---

### B. Order Number Strategy

**Problem with the existing approach**: `set_order_number()` derives the sequential order number by subtracting the invoice name suffix stored in `POS Opening Entry` from the current invoice name suffix. This only works when there is a single `POS Opening Entry` per profile. With multiple cashiers opening independent shifts on the same profile, or multiple profiles on the same branch, there is no single `POS Opening Entry` to anchor the sequence.

**Proposed approach: Track counters using custom fields on the existing `Branch` doctype.**

To avoid creating new doctypes, we will add tracking fields directly to the existing `Branch` doctype:
- `custom_order_counter` (Int, default 0)
- `custom_aggregator_order_counter` (Int, default 0)
- `custom_last_reset_date` (Date)

On every `after_insert` (or where the order number is currently set) of a `POS Invoice`:
1. Check if the date has changed since `custom_last_reset_date`. If daily reset is enabled and the date changed, reset counters to 0.
2. Use an atomic SQL update (`UPDATE tabBranch SET custom_order_counter = custom_order_counter + 1 WHERE name = %s`) to increment the counter. This avoids heavy ORM hooks and prevents race conditions.
3. Retrieve the updated counter.
4. Set `custom_ury_order_number` on the invoice using `frappe.db.set_value(..., update_modified=False)`.

This replaces the fragile invoice-name-suffix arithmetic and works correctly across any number of profiles and cashiers on the same branch, without requiring any new doctypes.

---

## Proposed Implementation Details by Component

---

### 1. Database Schema & Doctype Customizations

Custom fields and property setters are stored in fixture files:
- Custom Fields Fixture: [custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json)
- Property Setters Fixture: [property_setter.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/property_setter.json)

#### [MODIFY] URY User (Child Doctype in Branch)
**Why**: Room assignment is moving to POS Profile. The `room` field in `URY User` is only used by the old `getBranchRoom()` and `set_cashier_room()` functions that depend on the sub-cashier model.
- **Deprecate** field: `room` (Do not hide; instead, add "DEPRECATED: Will be removed in future. Use POS Profile for room assignment." to the field description in [custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json) to preserve historical data).

#### [MODIFY] Branch
**Why**: Track order counters directly on the Branch to avoid creating a new doctype.
- Add tracking fields to [custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json):
  - `custom_order_counter` (Int, default 0)
  - `custom_aggregator_order_counter` (Int, default 0)
  - `custom_last_reset_date` (Date)

#### [MODIFY] POS Profile
**Why**: Multiple POS profiles can now exist per branch. The profile itself must carry room and captain assignments since those are no longer derivable from Branch. Cross-profile visibility is controlled here per profile.
- **Deprecate** custom field: `custom_enable_multiple_cashier` (Do not hide; add "DEPRECATED" to description in [custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json))
- **Deprecate** section: `custom_multiple_cashier_configuration` (Do not hide; add "DEPRECATED" to section label/description in [custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json))
- Add fields to [custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json):
  - `custom_captains` (Table: `POS Profile Captain`, child table with `user` Link to `User`)
  - `custom_rooms` (Table MultiSelect, Link: `URY Room`)
  - `custom_captain_access_to_other_profiles` (Check)
  - `custom_cashier_access_to_other_profiles` (Check)
  - `custom_captain_accessible_profiles` (Table MultiSelect, Link: `POS Profile`)
  - `custom_cashier_accessible_profiles` (Table MultiSelect, Link: `POS Profile`)

#### [MODIFY] POS Profile User (Child Table)
**Why**: The main cashier concept is removed. All cashiers are equal within a profile; shift separation handles closing segregation.
- **Deprecate** custom field: `custom_main_cashier` (Do not hide; add "DEPRECATED" to description in [custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json))
- Add filter in the `user` field query: restrict selectable users to those present in the parent branch's `URY User` child table. This is configured in [property_setter.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/property_setter.json).

#### [MODIFY] POS Opening Entry
**Why**: `custom_rooms` child table was used solely for the multi-cashier room-lookup query in `getPosProfile()`. `custom_sub_pos_close_entry` tracked the linked sub POS close, which is being removed.
- **Deprecate** custom field: `custom_sub_pos_close_entry` (Do not hide; add "DEPRECATED" to description in [custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json))
- **Deprecate** custom child table field: `custom_rooms` (Do not hide; add "DEPRECATED" to description in [custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json))
- Retain `custom_room` (single Data field) - still used for display purposes
- **Do not remove `set_current_time` / `period_start_date` logic** - `period_start_date` is the shift start time and is still required for shift-based reconciliation.

#### [MODIFY] URY Production Unit
**Why**: Production units serve a kitchen or station, not a specific cashier profile. Tying them to a POS Profile prevents multi-profile setups from using the same kitchen.
- Location: [ury_production_unit.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_production_unit/ury_production_unit.json)
- Remove field: `pos_profile` (Link to POS Profile)
- Change `branch`: `read_only = 0`, `reqd = 1`
- Change `warehouse`: `read_only = 0`

#### [DEPRECATE] Sub POS Closing Doctypes
**Why**: The entire sub-cashier closing model is replaced by independent shift entries. There are no sub-cashier concepts remaining. However, to preserve historical financial records, we will not delete these doctypes.
- **Deprecate**: `Sub POS Closing` - Directory: [sub_pos_closing](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/sub_pos_closing/sub_pos_closing.json) (Add "DEPRECATED" to the doctype description/naming. Remove from Workspaces if possible)
- **Deprecate**: `Sub POS Closing Payment` - Directory: [sub_pos_closing_payment](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/sub_pos_closing_payment/sub_pos_closing_payment.json) (Add "DEPRECATED")
- **Deprecate**: `Sub POS Invoices` - Directory: [sub_pos_invoices](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/sub_pos_invoices/sub_pos_invoices.json) (Add "DEPRECATED")

---

### 2. Backward Compatibility & Data Migration (Patch)

To ensure smooth transition for existing sites, a `patch` (Python script executed on `bench migrate`) will be written to seamlessly migrate the existing setups:

1. **Order Counter Initialization**:
   - The patch will query the highest `custom_ury_order_number` from `POS Invoice` for the current date per branch.
   - It will initialize `custom_order_counter` and `custom_aggregator_order_counter` on each `Branch` so that the sequence continues smoothly without restarting at 1 in the middle of a business day.

2. **POS Profile Data Migration**:
   - For any POS Profile with `custom_enable_multiple_cashier` checked, the patch will migrate users from the deprecated `custom_multiple_cashier_configuration` into the standard `applicable_for_users` child table. This ensures users do not lose POS access.
   
3. **Room Mapping Migration**:
   - The patch will read the existing `room` assignments from `URY User` (in the `Branch` doctype).
   - It will identify the default POS Profile for that branch and insert these rooms into the new `custom_rooms` multiselect field on the POS Profile.

4. **Production Unit Adjustment**:
   - The patch will iterate through existing `URY Production Unit` records. For units containing a `pos_profile`, it will ensure the `branch` is populated (by checking the linked POS Profile's branch) before the `pos_profile` field is ultimately removed or ignored.

---

### 2. Backend Logic & Hooks (Python)

#### [MODIFY] [hooks.py](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/hooks.py)
**Why**: Remove hooks tied to the sub-cashier closing flow.
- Under `POS Closing Entry` events:
  - Remove `"before_save": "ury.ury.hooks.ury_pos_closing_entry.before_save"`
  - Remove `"validate": "ury.ury.hooks.ury_pos_closing_entry.validate"`
- Under `POS Opening Entry` events:
  - Remove `"before_insert": "ury.ury.api.ury_kot_order_number.set_last_invoice_in_pos_open"` (replaced by branch-level counter approach)

#### [DELETE] [ury_pos_closing_entry.py](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/hooks/ury_pos_closing_entry.py)
**Why**: All three functions (`sub_pos_close_check`, `calculate_closing_amount`, `validate_cashier`) are tied to the sub-cashier model and have no use once that model is removed.
- Delete this file entirely.

#### [MODIFY] [ury_pos_opening_entry.py](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/hooks/ury_pos_opening_entry.py)
**Why**: `set_cashier_room()` currently reads room from `URY User.room` in Branch, which is being removed. `main_pos_open_check()` enforces main-cashier dependency, which no longer exists. `set_current_time()` sets `period_start_date` on the opening entry and **must be retained** as it anchors the shift start time used throughout the POS lifecycle.
- Remove function: `main_pos_open_check()`
- Modify `set_cashier_room()`:
  - Remove the query against `tabURY User.room`.
  - Instead, fetch the session user's assigned rooms from the active POS Profile's `custom_rooms` field and set `custom_room` on the opening entry from there.
- Retain `set_current_time()` unchanged.

#### [MODIFY] [ury_pos_invoice.py](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/hooks/ury_pos_invoice.py)
**Why**: With multiple cashiers sharing a single POS Profile, the submitting user must be written explicitly to the invoice so closing reconciliation can filter correctly per cashier.
- In `before_submit()`: add `doc.cashier = frappe.session.user` before other checks.

#### [MODIFY] [ury_kot_order_number.py](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/api/ury_kot_order_number.py)
**Why**: The current approach derives order number by subtracting invoice name suffixes anchored to a single `POS Opening Entry` per profile. With multiple cashiers and multiple profiles, there is no single anchor. A branch-level atomic counter is the correct replacement.
- Remove `set_last_invoice_in_pos_open()` entirely.
- Rewrite `set_order_number()`:
  - Check `custom_reset_order_number_daily` from the branch. If enabled and `custom_last_reset_date` is not today, reset both counters to 0 and update the date.
  - Increment `custom_order_counter` or `custom_aggregator_order_counter` depending on `doc.order_type` using an atomic SQL update on the `Branch` record.
  - Set `custom_ury_order_number` on the `POS Invoice` using `frappe.db.set_value(..., update_modified=False)`.

#### [MODIFY] [api.py](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury_pos/api.py)

**`getBranch()` (line 111)**
**Why**: The function currently queries `URY User` joined to `Branch` to find the user's branch. This logic remains valid because `URY User` still exists in Branch (only the `room` column is removed). No change is required to this function.

**`getBranchRoom()` (line 127) and `getRoom()` (line 152)**
**Why**: These currently read the `room` column from `URY User`, which is being removed. Room assignment now lives on the POS Profile.
- Rewrite both functions to:
  1. Call `getBranch()` to resolve the branch.
  2. Find the active POS Profile for the session user (by checking `applicable_for_users` or `custom_captains`).
  3. Return the rooms listed in that profile's `custom_rooms` field.

**`getPosProfile()` (line 644)**
**Why**: Currently resolves the profile by a single `frappe.db.exists("POS Profile", {"branch": branchName})` which assumes one profile per branch. The multiple cashier block must also be removed.
- Step 1: Call `getBranch()` to get the user's branch.
- Step 2: Query all POS Profiles where `branch = user_branch`.
- Step 3: From those, find the one where the session user appears in `applicable_for_users` (cashier) or `custom_captains` (captain). If a single profile exists on the branch, skip the captain table check.
- Step 4: Resolve `cashier` as `frappe.session.user` (no more main/sub logic).
- Step 5: Remove the entire `if multiple_cashier:` block.
- Step 6: Remove `multiple_cashier` and `owner` keys from the returned `invoice_details` dict.

**`getInvoiceForCashier()` (line 353) and `getPosInvoice()` (line 443)**
**Why**: Currently scopes queries by `branch`. With multiple profiles per branch, the correct scope is the set of POS Profiles the session user is permitted to see.
- Resolve the session user's primary profile.
- Check `custom_captain_access_to_other_profiles` / `custom_cashier_access_to_other_profiles` flags.
- Build an `allowed_profiles` list: primary profile + any entries in the accessible profiles multiselect.
- Change `WHERE branch = %s` to `WHERE pos_profile IN %(allowed_profiles)s` in all SQL queries in both functions.

#### [MODIFY] [pos_extend.py](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/api/pos_extend.py)
**Why**: `overrided_past_order_list()` fetches `room` from `URY User` (line 26-37) to scope invoice queries. The `room` column is being removed from `URY User`.
- Update branch resolution to use `getBranch()`.
- Fetch the user's rooms from their active POS Profile's `custom_rooms` instead of `URY User.room`.

#### [MODIFY] [ury_kot_display.py](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/api/ury_kot_display.py)
**Why**: `kot_list()` and related functions query `POS Profile` using `{"branch": branch}` (single-profile assumption). With multiple profiles per branch, resolve by the specific profile associated to the session user.
- Replace `frappe.db.get_value("POS Profile", {"branch": branch}, ...)` with the resolved POS Profile name for the session user.

---

### 3. Frontend App Updates

#### [MODIFY] React POS v2 / Legacy POS (urypos)
**Why**: The frontend receives `multiple_cashier` and `owner` fields from `getPosProfile()`. These will no longer be returned. Any conditional logic gating UI behavior on `multiple_cashier` must be removed.
- Locations:
  - JS asset / source: [pos_extend.js](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/public/js/pos_extend.js)
  - POS source directory: [/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/public/pos/](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/public/pos/)
  - URYPOS source directory: [/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/public/urypos/](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/public/urypos/)
- Search source files for references to `multiple_cashier` and `owner` fields from the POS profile API response.
- Remove or simplify these conditionals. Cashier identity is always the session user.

#### [MODIFY] URY Production Unit Form Client Script
**Why**: A client script likely auto-fetches `branch` and `warehouse` from the selected `pos_profile`. With `pos_profile` removed, these are set manually.
- Location: [ury_production_unit.js](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_production_unit/ury_production_unit.js)
- Remove any `pos_profile` fetch trigger or field dependency from form JS.

---

## Todo Checklist

- [x] P0: Analyze URY codebase structure, custom doctypes, hooks, and API methods.
- [x] P1: Draft the high-level Feature Proposal (`proposal.md`).
- [x] P2: Detailed implementation plan with file-level changes, design decisions, and rationale.
- [x] P3: User review and approval.
- [x] P4: Execute schema changes (fixtures / JSON modifications).
- [x] P5: Execute backend Python changes.
- [x] P6: Execute frontend changes.
- [x] P7: Write data migration patch for existing POS Profiles, Order Counters, and URY User room data.
- [x] P8: Test all affected flows end-to-end against a mock of an existing database.

---

## Follow-up Tasks
- [x] Removed `get_user_pos_profile` and `get_users_for_branch_filter` APIs.
- [x] Inlined the POS Profile resolution logic inside the existing `getPosProfile` API.
- [x] Updated all references (`pos_extend.py`, `ury_kot_display.py`, `getBranchRoom`, etc.) to use `getPosProfile().get("pos_profile")` instead.
- [x] Removed the custom frontend query for user filtering on POS Profile as requested.
- [x] Corrected `cashier` and `owner` assignment in `getPosProfile`: set them as the session user (`waiter`) for cashier profiles (`POS Profile User`), and as the mapped user in `applicable_for_users` for captain profiles (`POS Profile Captain`).
