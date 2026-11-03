"""Rename the Role 'URY Chairman' to 'URY Owner' (idempotent).

Placement: [post_model_sync]. Frappe's migrate order is pre_model_sync patches ->
sync_all (doctypes, workspaces) -> post_model_sync patches -> sync_fixtures, so this
runs BEFORE fixtures/role.json is imported: on a site still holding 'URY Chairman' the
rename happens first and the fixture then just updates the renamed 'URY Owner' record
instead of creating a duplicate. (pre_model_sync is not needed.)
"""

import json

import frappe

OLD = "URY Chairman"
NEW = "URY Owner"
MARKER_KEY = "ury_analytics_access_marker"


def execute():
	old_exists = frappe.db.exists("Role", OLD)
	new_exists = frappe.db.exists("Role", NEW)
	if old_exists and not new_exists:
		frappe.rename_doc("Role", OLD, NEW, force=True)
	elif old_exists and new_exists:
		frappe.rename_doc("Role", OLD, NEW, force=True, merge=True)
	_rewrite_marker()


def _rewrite_marker():
	try:
		raw = frappe.db.get_default(MARKER_KEY)
		if not raw or OLD not in raw:
			return
		data = json.loads(raw)

		def fix(v):
			if isinstance(v, str):
				return NEW if v == OLD else v
			if isinstance(v, list):
				out = []
				for x in (fix(i) for i in v):
					if x not in out or not isinstance(x, str):
						out.append(x)
				return out
			if isinstance(v, dict):
				return {fix(k): fix(x) for k, x in v.items()}
			return v

		frappe.db.set_default(MARKER_KEY, json.dumps(fix(data)))
	except Exception:
		frappe.log_error(title="rename_chairman_role_to_owner: marker rewrite failed")
