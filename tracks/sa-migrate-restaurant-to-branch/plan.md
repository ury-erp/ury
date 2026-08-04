---
owner: sa-user
git_user: swafaalikkal
status: active
created: 2026-07-23
branch: pos-user-branch-restructuring
---

# Track: sa-migrate-restaurant-to-branch

## Goal
Migrate all fields in `URY Restaurant` (except the address field) to the `Branch` Doctype under a separate section. Mark `URY Restaurant` and its fields as deprecated. Create migration patches to ensure it is existing site database-friendly and won't affect their process flow.

---

## Design Decisions
- **Restaurant Details Section**: Move the fields into a dedicated, clean section inside the `Branch` doctype (e.g., named "Restaurant Details" or similar).
- **Exclude Address**: The `address` field in `URY Restaurant` will not be migrated because the `Branch` doctype already handles location/address mapping or is structured differently, preventing redundant fields.
- **Deprecation**: Instead of deleting `URY Restaurant` immediately (which would break existing code referencing it during transactions/reporting), we mark the doctype description and fields with deprecation warnings ("DEPRECATED: Will be removed in future. Use Branch instead.").
- **Migration Patch**: A python patch executed during `bench migrate` to safely copy existing `URY Restaurant` records' field data into the corresponding `Branch` records.

---

## Proposed Implementation Details by Component

### 1. Database Schema & Doctype Customizations

#### [MODIFY] Branch
- Add a new section label named "Restaurant Details" to group the migrated fields.
- Migrate all fields from `URY Restaurant` (except address) into this section in custom fields (`[custom_field.json](file:///mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/fixtures/custom_field.json)`).

#### [DEPRECATE] URY Restaurant
- **Deprecate** doctype: Add "DEPRECATED: Will be removed in future. Use Branch instead." to the Doctype description.
- **Deprecate** fields: Add "DEPRECATED" to the description of all fields in `URY Restaurant` to preserve historical data.

---

### 2. Backward Compatibility & Data Migration (Patch)

1. **URY Restaurant to Branch Migration**:
   - The patch will fetch all existing `URY Restaurant` records.
   - It will map and copy all relevant field data (except address) from the restaurant record to the corresponding `Branch` record. This ensures existing setups lose no data and operations continue seamlessly.

---

## Todo Checklist

- [x] P0: Add new "Restaurant Details" fields to Branch in `custom_field.json`.
- [x] P1: Add deprecation messages to `URY Restaurant` and its fields in schema and patch execution.
- [x] P2: Write data migration patch for existing URY Restaurant data to Branch, and create POS Profile custom fields (`custom_captains`, `custom_rooms`, `custom_captain_access_to_other_profiles`, `custom_cashier_access_to_other_profiles`, `custom_captain_accessible_profiles`, `custom_cashier_accessible_profiles`).
- [x] P3: Verify the migration patch and export fixtures.

