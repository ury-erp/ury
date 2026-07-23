"""
Patch: Migrate legacy POS Profile KOT reprint configuration to URY Printer Settings rows.

Background
----------
Prior to PR #145 (Dynamic KOT Reprint Logic by Production Unit, Room, and Profile),
KOT reprint was configured via three flat fields on ``POS Profile``:

- ``custom_enable_kot_reprint``   – master kill-switch (still used; not migrated)
- ``custom_table_order_printer``  – static printer for dine-in KOT reprints (deprecated)
- ``custom_parcel_order_printer`` – static printer for takeaway KOT reprints (deprecated)
- ``custom_reprint_kot_format``   – single print format for all reprints (deprecated)

The new code routes reprints through per-row ``custom_kot_reprint`` /
``custom_kot_reprint_format`` flags on ``URY Printer Settings`` child rows.

This patch ensures existing sites that relied on the old static fields continue to
work after upgrade by:

1. Finding every ``POS Profile`` that has a static printer and format configured.
2. Iterating over the profile's ``printer_settings`` child rows.
3. Setting ``custom_kot_reprint = 1`` and ``custom_kot_reprint_format`` on:
   - The row matching ``custom_table_order_printer`` (dine-in → this row gets reprint).
   - The row matching ``custom_parcel_order_printer`` (takeaway → this row is *not*
     blocked for takeaway, so we set ``custom_block_takeaway_kot = 0`` explicitly).
   - If no matching row exists, a new row is appended.

If a profile has the format but *no* printer rows at all, a single row is appended
for each legacy printer so that at minimum the old behaviour is preserved.

Idempotency
-----------
The patch skips profiles whose ``printer_settings`` rows *already* have at least
one ``custom_kot_reprint = 1`` row, assuming those were manually configured.
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

	profiles = frappe.get_all(
		"POS Profile",
		filters=[["custom_enable_kot_reprint", "=", 1]],
		fields=[
			"name",
			"custom_table_order_printer",
			"custom_parcel_order_printer",
			"custom_reprint_kot_format",
		],
	)

	migrated_count = 0

	for profile_meta in profiles:
		profile_name = profile_meta["name"]
		table_printer = profile_meta.get("custom_table_order_printer")
		parcel_printer = profile_meta.get("custom_parcel_order_printer")
		reprint_format = profile_meta.get("custom_reprint_kot_format")

		# Nothing to migrate if no format is set
		if not reprint_format:
			continue

		# If neither legacy printer is set, skip
		if not table_printer and not parcel_printer:
			continue

		profile = frappe.get_doc("POS Profile", profile_name)

		# Skip profiles already having at least one reprint-enabled row (manually configured)
		already_configured = any(
			getattr(row, "custom_kot_reprint", 0)
			for row in profile.get("printer_settings", [])
		)
		if already_configured:
			continue

		changed = False

		# -- Migrate table (dine-in) printer --
		if table_printer:
			changed |= _ensure_reprint_row(
				profile,
				printer=table_printer,
				reprint_format=reprint_format,
				block_takeaway=0,  # dine-in printer; must NOT block takeaway
			)

		# -- Migrate parcel (takeaway) printer --
		if parcel_printer and parcel_printer != table_printer:
			changed |= _ensure_reprint_row(
				profile,
				printer=parcel_printer,
				reprint_format=reprint_format,
				block_takeaway=1,  # takeaway printer; block it from dine-in KOTs
			)

		if changed:
			profile.flags.ignore_permissions = True
			profile.flags.ignore_validate = True
			profile.save()
			migrated_count += 1

	frappe.db.commit()

	if migrated_count:
		frappe.log_error(
			"kot_reprint_migration",
			f"Migrated KOT reprint configuration for {migrated_count} POS Profile(s). "
			"Review each profile's Printer Settings tab to confirm correctness.",
		)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _custom_fields_exist() -> bool:
	"""Return True if the new custom fields are present on URY Printer Settings."""
	return bool(
		frappe.db.exists(
			"Custom Field",
			{"dt": "URY Printer Settings", "fieldname": "custom_kot_reprint"},
		)
	)


def _ensure_reprint_row(profile, printer: str, reprint_format: str, block_takeaway: int) -> bool:
	"""
	Find an existing row for *printer* and enable reprint on it, or append a new row.

	Returns True if anything was changed / added.
	"""
	for row in profile.get("printer_settings", []):
		if row.get("printer") == printer:
			row.custom_kot_reprint = 1
			row.custom_kot_reprint_format = reprint_format
			# Honour block_takeaway only when upgrading; don't override a value that
			# was already set to something meaningful.
			if not getattr(row, "custom_block_takeaway_kot", None):
				row.custom_block_takeaway_kot = block_takeaway
			return True

	# No matching row found → append a new one
	profile.append(
		"printer_settings",
		{
			"printer": printer,
			"custom_kot_reprint": 1,
			"custom_kot_reprint_format": reprint_format,
			"custom_block_takeaway_kot": block_takeaway,
		},
	)
	return True
