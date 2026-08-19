"""Registers `ury.ury.ai_tools.ury_tools`'s functions as HUF Agent Tools.

HUF discovers tools from every installed app via the `huf_tools` hook
(`ury/hooks.py`), synced into `Agent Tool`/`Agent Tool Function` doctype
records by `huf.ai.tool_registry.sync_app_tools`, which runs on every
`bench migrate` (see `after_migrate` in HUF's own `hooks.py`). This mirrors
the entry shape HUF's own `ai/tools/_registry.py` uses — see
`tracks/sa-ai-reports-dashboard/HUF_API_NOTES.md` for how this was confirmed.

Every entry here is read-only (see `ury_tools.py`'s own docstring and the
`ury/ury/ai_tools/test_ury_tools.py` allowlist/no-mutating-call tests, which
this list's function set must stay in sync with).
"""


def _p(name, type="string", required=False, description=""):
	return {
		"label": name.replace("_", " ").title(),
		"fieldname": name,
		"type": type,
		"required": int(required),
		"description": description,
	}


ALL_URY_TOOLS = [
	{
		"tool_name": "ury_get_floor_state",
		"description": (
			"Get the current per-table floor/service status for a URY restaurant branch "
			"(open, seated, order fired, food served, or over-time, with minutes-since-stage). "
			"Use this to answer questions about which tables need attention right now."
		),
		"function_path": "ury.ury.ai_tools.ury_tools.get_floor_state",
		"category": "URY Restaurant Tools",
		"parameters": [
			_p("branch", description="Branch name to scope to. Omit for all branches the caller can see."),
		],
	},
	{
		"tool_name": "ury_get_open_exceptions",
		"description": (
			"List currently-open operational exceptions for a URY branch: pending payments, "
			"long-held tables, KOT/kitchen errors, unclosed POS sessions. Use this to answer "
			"'what needs attention right now' or to ground a shift-brief narration in real data."
		),
		"function_path": "ury.ury.ai_tools.ury_tools.get_open_exceptions",
		"category": "URY Restaurant Tools",
		"parameters": [
			_p("branch", description="Branch name to scope to. Omit for all branches the caller can see."),
		],
	},
	{
		"tool_name": "ury_get_shift_metrics",
		"description": (
			"Get today's sales, covers, and average-bill metrics for a URY branch's current "
			"business day so far. Only the 'today' window is supported."
		),
		"function_path": "ury.ury.ai_tools.ury_tools.get_shift_metrics",
		"category": "URY Restaurant Tools",
		"parameters": [
			_p("window", description="Must be 'today' (only supported value)."),
			_p("branch", description="Branch name to scope to. Omit for all branches the caller can see."),
		],
	},
	{
		"tool_name": "ury_get_baseline",
		"description": (
			"Get a 6-week rolling median sales/covers baseline for a URY branch at a given "
			"weekday+hour, e.g. 'a normal Tuesday at 7pm'. Use this to compare tonight's actuals "
			"against a typical night, not to report tonight's actuals themselves."
		),
		"function_path": "ury.ury.ai_tools.ury_tools.get_baseline",
		"category": "URY Restaurant Tools",
		"parameters": [
			_p("weekday", type="int", description="0=Monday .. 6=Sunday. Omit to use the current weekday."),
			_p("hour", type="int", description="Hour of day, 0-23. Omit to use the current hour."),
			_p("branch", description="Branch name to scope to."),
			_p("weeks", type="int", description="How many weeks of history to average over. Default 6."),
		],
	},
	{
		"tool_name": "ury_get_report_snapshot",
		"description": (
			"Run one of URY's 16 built-in reports (see ury_list_reports for the exact slugs) and "
			"return its data as JSON. Use ury_list_reports first if you are not certain of the "
			"exact report_slug the user is asking about."
		),
		"function_path": "ury.ury.ai_tools.ury_tools.get_report_snapshot",
		"category": "URY Restaurant Tools",
		"parameters": [
			_p("report_slug", required=True, description="One of the slugs returned by ury_list_reports, e.g. 'today-sales', 'daily-pnl'."),
			_p("filters", type="json", description="Optional dict of report-specific filters, e.g. {\"branch\": \"...\", \"start_date\": \"...\", \"end_date\": \"...\"}."),
		],
	},
	{
		"tool_name": "ury_list_reports",
		"description": (
			"List all reports available in URY's Reports section, with a slug and a short "
			"description of what each one shows. Use this to answer 'do you have a report on X?' "
			"and to find the correct report_slug for ury_get_report_snapshot or for navigating "
			"the user to a report page."
		),
		"function_path": "ury.ury.ai_tools.ury_tools.list_reports",
		"category": "URY Restaurant Tools",
		"parameters": [],
	},
]
