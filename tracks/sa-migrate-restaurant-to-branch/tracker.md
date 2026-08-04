# Tracker: sa-migrate-restaurant-to-branch

## Checklist

- [x] **Phase 1: Schema & Fixture Customizations**
  - [x] Analyze `URY Restaurant` doctype structure in the WSL environment to compile a complete list of fields to migrate.
  - [x] Modify `custom_field.json` to add a new "Restaurant Details" section break inside the `Branch` doctype.
  - [x] Map and define all `URY Restaurant` fields (excluding the `address` field) under the new section in `custom_field.json`.
  - [x] Add "DEPRECATED: Will be removed in future. Use Branch instead." to the description of the `URY Restaurant` doctype.
  - [x] Add "DEPRECATED" prefix to the descriptions of all fields in the `URY Restaurant` doctype.
  - [x] Run `bench migrate` to verify the schema updates apply correctly.

- [x] **Phase 2: Codebase Reference Updates**
  - [x] Search the codebase for references to `URY Restaurant` doctype and its API endpoints.
  - [x] Update any backend scripts, hooks, or print formats that reference `URY Restaurant` to reference the corresponding fields in `Branch`.
  - [x] Search frontend files (Vue/React POS sources) for references to `URY Restaurant` and update them to use `Branch`.

- [x] **Phase 3: Migration Patch Development**
  - [x] Create a new python patch file under the app's patches directory (e.g. `migrate_ury_restaurant_to_branch.py`).
  - [x] Register the new patch in the app's `patches.txt`.
  - [x] Implement query logic in the patch to retrieve all records from `tabURY Restaurant`.
  - [x] Implement mapping and update logic in the patch to copy field values (excluding `address`) into the corresponding `Branch` records.
  - [x] Handle edge cases (e.g., matching `Branch` and `URY Restaurant` by name/ID, missing records, or uninitialized fields).

- [x] **Phase 4: Testing & Verification**
  - [x] Restore/create a mock database containing existing `URY Restaurant` and `Branch` data.
  - [x] Execute `bench migrate` to run the migration patch.
  - [x] Verify that all mapped fields in `Branch` are successfully populated.
  - [x] Verify that no transaction flows or existing features are broken.
