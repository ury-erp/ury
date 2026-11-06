"""Validate and normalise URY KOT Items quantity columns before they become Float.

`quantity` and `cancelled_qty` change from Data (varchar) to Float, which Frappe
stores as `decimal(21,9) NOT NULL DEFAULT 0`. The ALTER fails on NULL, and on
text that is not a number, with an error that names neither rows nor counts.

Runs in [pre_model_sync], while the columns are still varchar.

Policy:
- NULL and blank (empty or spaces only) values become 0. cancelled_qty is NULL
  on every row that was never cancelled, so 0 is the faithful meaning.
- Any other non-numeric value (for example "abc", "1,5", "2 pcs", "1e3") aborts
  the migration with the offending counts and sample rows. Nothing is
  converted silently and nothing is changed before validation has passed.
- All columns are validated first. The UPDATE statements then run in a single
  transaction that is rolled back if any of them fails.
- Idempotent. A missing table (fresh install) or a column that is already
  numeric is skipped.

The Float precision is not set here: the doctype keeps Frappe's default and the
site "float_precision" setting governs rounding and display.
"""

import re
from decimal import Decimal

import frappe

TABLE = "tabURY KOT Items"
DOCTYPE = "URY KOT Items"
COLUMNS = ("quantity", "cancelled_qty")
NUMERIC_DATA_TYPES = {
	"decimal",
	"float",
	"double",
	"int",
	"bigint",
	"mediumint",
	"smallint",
	"tinyint",
}

# Plain decimal notation only. Exponents, thousands separators and unit
# suffixes are rejected rather than guessed at.
NUMERIC_RE = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)$")
# decimal(21,9) leaves 12 integer digits.
MAX_ABS_VALUE = 10**12
SAMPLE_SIZE = 10

NULL = "null"
BLANK = "blank"
VALID = "valid"
INVALID = "invalid"


class InvalidKotQuantityError(Exception):
	"""Raised when legacy KOT quantity values cannot be converted to Float."""


def classify_value(value):
	"""Return NULL, BLANK, VALID or INVALID for one legacy column value."""
	if value is None:
		return NULL
	if isinstance(value, (int, float)) and not isinstance(value, bool):
		return VALID if abs(value) < MAX_ABS_VALUE else INVALID
	text = str(value)
	# SQL TRIM() only strips spaces, so only spaces count as blank here.
	stripped = text.strip(" ")
	if stripped == "":
		return BLANK
	if not NUMERIC_RE.fullmatch(stripped):
		return INVALID
	if abs(Decimal(stripped)) >= MAX_ABS_VALUE:
		return INVALID
	return VALID


def collect_issues(rows):
	"""Classify rows of (name, parent, column, value).

	Returns a dict keyed by column with counts for NULL, blank and invalid
	values and the invalid rows themselves.
	"""
	issues = {}
	for name, parent, column, value in rows:
		entry = issues.setdefault(column, {NULL: 0, BLANK: 0, INVALID: 0, "invalid_rows": []})
		kind = classify_value(value)
		if kind == VALID:
			continue
		entry[kind] += 1
		if kind == INVALID:
			entry["invalid_rows"].append((name, parent, value))
	return issues


def has_invalid_values(issues):
	return any(entry[INVALID] for entry in issues.values())


def format_error(issues, sample_size=SAMPLE_SIZE):
	"""Build the actionable abort message for invalid values."""
	lines = [
		"Cannot convert URY KOT Items quantity columns to Float: "
		"non-numeric values found. No data was changed.",
	]
	for column in sorted(issues):
		entry = issues[column]
		if not entry[INVALID]:
			continue
		lines.append(f"Column {column}: {entry[INVALID]} non-numeric value(s). Sample rows:")
		for name, parent, value in entry["invalid_rows"][:sample_size]:
			lines.append(f"  row={name} parent={parent} value={value!r}")
	lines.append(
		f"Correct these values in `{TABLE}` (set a valid number, or 0), "
		"then run bench migrate again. NULL and blank values are converted to 0 automatically."
	)
	return "\n".join(lines)


def validate_or_raise(rows):
	"""Return the issues dict, or raise InvalidKotQuantityError if any value is invalid."""
	issues = collect_issues(rows)
	if has_invalid_values(issues):
		raise InvalidKotQuantityError(format_error(issues))
	return issues


def get_column_types():
	"""Map each COLUMNS entry present in the table to its lower-case DATA_TYPE."""
	result = frappe.db.sql(
		"""
		SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %(table)s
		AND COLUMN_NAME IN %(columns)s
		""",
		{"table": TABLE, "columns": COLUMNS},
		as_dict=True,
	)
	return {row.COLUMN_NAME: row.DATA_TYPE.lower() for row in result}


def columns_to_convert(column_types):
	"""Columns that exist and are not numeric yet, in COLUMNS order."""
	return [
		column
		for column in COLUMNS
		if column in column_types and column_types[column] not in NUMERIC_DATA_TYPES
	]


def execute():
	if not frappe.db.table_exists(DOCTYPE):
		return

	columns = columns_to_convert(get_column_types())
	if not columns:
		return

	rows = []
	for column in columns:
		for name, parent, value in frappe.db.sql(
			f"SELECT name, parent, `{column}` FROM `{TABLE}`"
		):
			rows.append((name, parent, column, value))

	# Validation first: nothing is modified when any value is invalid.
	issues = validate_or_raise(rows)

	try:
		for column in columns:
			counts = issues.get(column, {})
			if not (counts.get(NULL) or counts.get(BLANK)):
				continue
			frappe.db.sql(
				f"UPDATE `{TABLE}` SET `{column}` = '0' WHERE `{column}` IS NULL OR TRIM(`{column}`) = ''"
			)
	except Exception:
		frappe.db.rollback()
		raise
