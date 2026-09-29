"""
Patch: Enable KOT reprint flags on existing URY Printer Settings rows.

Background
----------
Prior to PR #145 (Dynamic KOT Reprint Logic by Production Unit, Room, and Profile),
KOT reprint was triggered via three flat fields on ``POS Profile``:

- ``custom_enable_kot_reprint``  – master kill-switch (still used; not migrated)
- ``custom_reprint_kot_format``  – single print format for all reprints (deprecated)
- ``custom_table_order_printer`` – static dine-in printer (deprecated)
- ``custom_parcel_order_printer``– static takeaway printer (deprecated)

The new code routes reprints through the per-row ``custom_kot_reprint`` /
``custom_kot_reprint_format`` flags on existing ``URY Printer Settings`` child
rows on **POS Profile**, **URY Production Unit**, and **URY Room**.

Migration strategy
------------------
**Do NOT create or remove any printer rows.**  The existing rows in each
``printer_settings`` child table are already the correct printers for that
parent — the only thing missing is the two new flags.

For each ``POS Profile`` that has ``custom_enable_kot_reprint = 1`` and a
``custom_reprint_kot_format`` value set:

  1. Iterate over its existing ``printer_settings`` rows.
  2. Set ``custom_kot_reprint = 1`` and
     ``custom_kot_reprint_format = profile.custom_reprint_kot_format``
     on every row that doesn't already have it.

For ``URY Production Unit`` and ``URY Room``:

  These doctypes had no equivalent legacy static-printer fields, so their
  existing rows are migrated using the reprint format discovered from the
  POS Profile(s) in the same branch.  Only rows that have no
  ``custom_kot_reprint_format`` set yet are touched.

Idempotency
-----------
A profile / production-unit / room whose rows *already* have at least one
``custom_kot_reprint = 1`` row is skipped — it was already configured
manually or by a previous run of this patch.
"""

import frappe


def execute():
	"""Run the migration patch."""

	if not _custom_fields_exist():
		frappe.log_error(
			"kot_reprint_migration",
			"Skipped migration patch: custom_kot_reprint / custom_kot_reprint_format "
			"fields do not exist on URY Printer Settings yet. "
			"Run `bench migrate` after installing the new fixtures first.",
		)
		return

	migrated_profiles = _migrate_pos_profiles()
	migrated_units = _migrate_production_units()
	migrated_rooms = _migrate_rooms()

	total = migrated_profiles + migrated_units + migrated_rooms

	frappe.db.commit()

	if total:
		frappe.log_error(
			"kot_reprint_migration",
			f"KOT reprint migration complete: {migrated_profiles} POS Profile(s), "
			f"{migrated_units} URY Production Unit(s), {migrated_rooms} URY Room(s) updated. "
			"Review each document's Printer Settings tab to confirm correctness.",
		)


# ---------------------------------------------------------------------------
# Per-doctype migration helpers
# ---------------------------------------------------------------------------

def _migrate_pos_profiles() -> int:
	"""
	Enable reprint flags on existing POS Profile printer rows.

	Uses ``custom_reprint_kot_format`` from the profile itself as the format
	for every row.  No rows are created or deleted.
	"""
	profiles = frappe.get_all(
		"POS Profile",
		filters=[["custom_enable_kot_reprint", "=", 1]],
		fields=["name", "custom_reprint_kot_format"],
	)

	count = 0
	for meta in profiles:
		reprint_format = meta.get("custom_reprint_kot_format")
		if not reprint_format:
			continue  # nothing to migrate without a format

		profile = frappe.get_doc("POS Profile", meta["name"])
		rows = profile.get("printer_settings", [])

		if not rows:
			continue  # no existing rows to enable

		if _already_configured(rows):
			continue  # already done

		for row in rows:
			row.custom_kot_reprint = 1
			row.custom_kot_reprint_format = reprint_format

		profile.flags.ignore_permissions = True
		profile.flags.ignore_validate = True
		profile.save()
		count += 1

	return count


def _migrate_production_units() -> int:
	"""
	Enable reprint flags on existing URY Production Unit printer rows.

	The reprint format is sourced from the POS Profile of the same branch
	(first match).  Units whose rows are already configured are skipped.
	"""
	units = frappe.get_all("URY Production Unit", fields=["name", "branch"])
	if not units:
		return 0

	# Build a branch → reprint_format map from POS Profiles
	branch_format_map = _build_branch_format_map()

	count = 0
	for unit_meta in units:
		reprint_format = branch_format_map.get(unit_meta.get("branch"))
		if not reprint_format:
			continue

		unit = frappe.get_doc("URY Production Unit", unit_meta["name"])
		rows = unit.get("printer_settings", [])

		if not rows or _already_configured(rows):
			continue

		for row in rows:
			row.custom_kot_reprint = 1
			row.custom_kot_reprint_format = reprint_format

		unit.flags.ignore_permissions = True
		unit.flags.ignore_validate = True
		unit.save()
		count += 1

	return count


def _migrate_rooms() -> int:
	"""
	Enable reprint flags on existing URY Room printer rows.

	The reprint format is sourced from the POS Profile of the room's branch.
	"""
	rooms = frappe.get_all("URY Room", fields=["name", "branch"])
	if not rooms:
		return 0

	branch_format_map = _build_branch_format_map()

	count = 0
	for room_meta in rooms:
		reprint_format = branch_format_map.get(room_meta.get("branch"))
		if not reprint_format:
			continue

		room = frappe.get_doc("URY Room", room_meta["name"])
		rows = room.get("printer_settings", [])

		if not rows or _already_configured(rows):
			continue

		for row in rows:
			row.custom_kot_reprint = 1
			row.custom_kot_reprint_format = reprint_format

		room.flags.ignore_permissions = True
		room.flags.ignore_validate = True
		room.save()
		count += 1

	return count


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _custom_fields_exist() -> bool:
	"""Return True if the new custom fields are present on URY Printer Settings."""
	return bool(
		frappe.db.exists(
			"Custom Field",
			{"dt": "URY Printer Settings", "fieldname": "custom_kot_reprint"},
		)
	)


def _already_configured(rows) -> bool:
	"""Return True if at least one row already has ``custom_kot_reprint`` enabled."""
	return any(getattr(row, "custom_kot_reprint", 0) for row in rows)


def _build_branch_format_map() -> dict:
	"""
	Return a dict of ``{branch: custom_reprint_kot_format}`` from POS Profiles
	that have reprint enabled and a format set.

	When multiple profiles share a branch, the first non-empty format wins.
	"""
	profiles = frappe.get_all(
		"POS Profile",
		filters=[["custom_enable_kot_reprint", "=", 1]],
		fields=["branch", "custom_reprint_kot_format"],
	)
	mapping = {}
	for p in profiles:
		branch = p.get("branch")
		fmt = p.get("custom_reprint_kot_format")
		if branch and fmt and branch not in mapping:
			mapping[branch] = fmt
	return mapping
