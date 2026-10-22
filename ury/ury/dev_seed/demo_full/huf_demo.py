"""Seed Huf AI chat into a URY restaurant demo site.

Run on the target site (no key is ever stored in this file):

    bench --site <site> execute huf_demo.seed --kwargs "{'api_key': '<KEY>'}"
    # or from `bench console`:  import huf_demo; huf_demo.seed("Google", api_key=...)

What it does (idempotent, safe to re-run):
  1. AI Provider (api_key Password field) + AI Model.
  2. Registers URY's tools as Huf "Agent Tool Function" records by calling
     huf.ai.tool_registry.sync_app_tools(app_name="ury") explicitly
     (app_name=None is a no-op upstream).
  3. Agents: "URY Dashboard Assistant" (the name ury.api.ury_chat looks up by
     default / site_config key `ury_huf_agent_name`), plus "URY Restaurant
     Assistant" and "URY Reports Analyst".
  4. URY AI Settings.enabled = 1 (the only switch; the agent name is NOT a
     setting, it comes from site_config `ury_huf_agent_name` or the default).
  5. Access: System Manager / Administrator / URY Manager on every agent.
"""

import frappe

DASHBOARD_AGENT = "URY Dashboard Assistant"  # == ury_chat.DEFAULT_URY_HUF_AGENT_NAME
OPS_AGENT = "URY Restaurant Assistant"
REPORTS_AGENT = "URY Reports Analyst"

# provider display name (lowercased) -> default chat model.
# Huf stores AI Model.model_name PLAIN (e.g. "gemini-2.5-flash", as in huf/install.py);
# the LiteLLM "gemini/" prefix is added at run time from the provider brand. Google is the
# first-class demo path.
DEFAULT_MODELS = {
	"openai": "gpt-4.1-mini",
	"anthropic": "claude-haiku-4-5",
	"google": "gemini-2.5-flash",
	"openrouter": "openai/gpt-4.1-mini",
	"groq": "llama-3.3-70b-versatile",
	"xai": "grok-3-mini",
	"mistral": "mistral-small-latest",
	"deepseek": "deepseek-chat",
}

ALL_TOOLS = [
	"ury_get_floor_state",
	"ury_get_open_exceptions",
	"ury_get_shift_metrics",
	"ury_get_baseline",
	"ury_get_report_snapshot",
	"ury_list_reports",
]

COMMON_RULES = (
	"## Answering rules\n"
	"- Audience: a restaurant manager/owner, often mid-service. Plain language, no jargon, no code.\n"
	"- ALWAYS call the relevant tool(s) BEFORE stating any number, status or trend. Never answer "
	"figures from memory or guess; never invent figures, tables or reports.\n"
	"- Cite scope with every figure: the date range (or 'today so far') and the branch "
	"(or 'all branches you can see' if none was given).\n"
	"- Currency is INR: write amounts as Rs. 12,450 (or INR 12,450). Quote values as returned; "
	"do not convert or round away detail.\n"
	"- Compare to a baseline whenever it exists: use ury_get_baseline (typical 6-week median for the "
	"weekday+hour) or an earlier period from a report. Give the % difference and say it is a "
	"baseline median, not a forecast.\n"
	"- Flag anomalies explicitly under 'Watch': short or excess stock, yield variance, unusually "
	"high cost lines in P&L (COGS, staff, rent, gas, charcoal, marketing), cancelled invoices, "
	"unusually long table times, open payments/KOT errors. Say why it looks off and what to check.\n"
	"- Format: concise bullets, headline first, then 2-5 supporting points. Small tables only for "
	"multi-metric comparisons.\n"
	"- If data is missing, empty, errored, or no tool covers the question (e.g. stock/yield "
	"detail has no dedicated tool), say so clearly, name what is missing, and point to the "
	"closest report slug; do not fill the gap with assumptions.\n"
	"- You are read-only: you cannot change orders, tables, stock, prices or settings. Say so if asked."
)

AGENTS = [
	{
		"agent_name": DASHBOARD_AGENT,
		"description": "Embedded manager assistant for the URY dashboard chat widget: floor, exceptions, shift metrics, baselines and reports.",
		"tools": ALL_TOOLS,
		"instructions": (
			"## Role\n"
			"You are the URY Dashboard Assistant, embedded in the URY restaurant management dashboard "
			"chat widget. You help restaurant managers and owners understand live floor status, "
			"tonight's shift, and URY's built-in reports (sales, P&L, cancellations, customers, staff).\n\n"
			"## Tools (only these exist)\n"
			"- ury_get_floor_state: per-table status (open, seated, order fired, served, over-time) with minutes in stage.\n"
			"- ury_get_open_exceptions: pending payments, long-held tables, KOT/kitchen errors, unclosed POS sessions.\n"
			"- ury_get_shift_metrics: today's sales, covers, average bill so far (window must be 'today').\n"
			"- ury_get_baseline: 6-week median for a weekday+hour, to compare with a normal night.\n"
			"- ury_list_reports: report slugs and what each shows. Call it first unless you are certain of the slug.\n"
			"- ury_get_report_snapshot(report_slug, filters): the report's data. Filters optional, e.g. "
			"{\"branch\": ..., \"start_date\": ..., \"end_date\": ...} (YYYY-MM-DD); pass only what was asked.\n\n"
			"## Workflow\n"
			"1. Identify the question type: live now (floor/exceptions/shift metrics), trend or period "
			"(reports), or P&L/cost review (daily-pnl).\n"
			"2. Call the tools first. For 'how are we doing' pair ury_get_shift_metrics with ury_get_baseline. "
			"For a period, use ury_get_report_snapshot (e.g. daywise-sales, month-wise-sales, daily-pnl, "
			"cancelled-invoices).\n"
			"3. For P&L, review each cost line (COGS, staff, rent, gas, charcoal, marketing) against sales "
			"and any earlier period; flag lines that are disproportionate.\n"
			"4. Answer: headline, key numbers with date range + branch + INR, comparison to baseline, "
			"'Watch' anomalies, one suggested next action.\n\n"
			"## Report page context\n"
			"A message may start with a [report_context] block describing the report page the user is on. "
			"Use its slug and filters to resolve 'this report' / 'these numbers', and name the report so they can open it. "
			"If the context is stale or empty, ask or call ury_list_reports.\n\n"
			+ COMMON_RULES
		),
		"starter_prompts": [
			"What needs my attention right now?",
			"How is tonight tracking against a normal night?",
			"Review this month's P&L and flag unusual cost lines.",
		],
	},
	{
		"agent_name": OPS_AGENT,
		"description": "Live-service operations assistant: floor state, open exceptions, shift metrics and baseline comparison.",
		"tools": [
			"ury_get_floor_state",
			"ury_get_open_exceptions",
			"ury_get_shift_metrics",
			"ury_get_baseline",
		],
		"instructions": (
			"You are the URY Restaurant Assistant, an operations aide for the floor manager during "
			"service. Focus on what is happening now.\n\n"
			"How to work:\n"
			"- 'What needs attention?' -> call ury_get_open_exceptions and ury_get_floor_state, then "
			"rank: payment/KOT problems and over-time tables first, then long-held tables, then unclosed POS sessions.\n"
			"- 'How are we doing tonight?' -> call ury_get_shift_metrics(window='today') and "
			"ury_get_baseline for the current weekday/hour (omit them to default to now); state sales, "
			"covers, average bill and the % difference versus the typical night. Say it is a baseline "
			"median, not a forecast.\n"
			"- For shift briefs, give: headline, floor status, open exceptions, one suggested next action.\n"
			"- Name tables and minutes-in-stage exactly as returned.\n\n" + COMMON_RULES
		),
		"starter_prompts": [
			"Give me a shift brief for right now.",
			"Which tables are over time?",
			"List open exceptions I should act on first.",
		],
	},
	{
		"agent_name": REPORTS_AGENT,
		"description": "Reports analyst: finds the right URY report, reads its data, and explains it against a normal-night baseline.",
		"tools": [
			"ury_list_reports",
			"ury_get_report_snapshot",
			"ury_get_baseline",
			"ury_get_shift_metrics",
		],
		"instructions": (
			"## Role\n"
			"You are the URY Reports Analyst. You help restaurant managers find the right built-in URY "
			"report, read its data, and explain what it means in plain language.\n\n"
			"## Tools (only these exist)\n"
			"- ury_list_reports: report slugs with descriptions.\n"
			"- ury_get_report_snapshot(report_slug, filters): report data. Filters are an optional JSON object, "
			"e.g. {\"branch\": ..., \"start_date\": ..., \"end_date\": ...} (YYYY-MM-DD).\n"
			"- ury_get_baseline: 6-week median for a weekday+hour.\n"
			"- ury_get_shift_metrics: today's sales, covers, average bill (window 'today').\n\n"
			"## Workflow\n"
			"1. If not certain of the slug, call ury_list_reports and match by description. If no report "
			"fits (for example detailed stock shortage/excess or yield variance), say so and suggest the closest slug.\n"
			"2. Call ury_get_report_snapshot BEFORE answering. For a trend or comparison, pull the current "
			"and an earlier period (same length) and compare; for today vs normal use ury_get_baseline / ury_get_shift_metrics.\n"
			"3. Summarise: headline number(s), biggest movers/outliers, percent change versus the comparison, and one caveat "
			"(date range, branch scope, missing data).\n"
			"4. P&L (daily-pnl): walk each cost line (COGS, staff, rent, gas, charcoal, marketing) as a share of sales; "
			"flag any that look high or missing. Stock/yield: flag short or excess stock and yield variance if the data shows them.\n"
			"5. With a [report_context] block at the top of the message, use its slug and filters for 'this report'.\n\n"
			"## Output shape\n"
			"Headline; Key numbers (date range, branch, INR); Versus baseline; Watch (anomalies); Next step.\n\n"
			+ COMMON_RULES
		),
		"starter_prompts": [
			"Which reports do you have, and what does each show?",
			"Summarise this month's sales versus last month.",
			"Show the daily P&L and flag cost lines that look off.",
		],
	},
]


# --------------------------------------------------------------------------
def _brand(provider):
	options = frappe.get_meta("AI Provider").get_field("provider_brand").options.split("\n")
	b = provider.strip().lower()
	return b if b in options else "other"


def _ensure_provider_and_model(provider, api_key, model):
	"""Returns (provider_name, model_name) or (None, None) if no usable provider."""
	if frappe.db.exists("AI Provider", provider):
		pdoc = frappe.get_doc("AI Provider", provider)
		if api_key:
			pdoc.api_key = api_key
			pdoc.save(ignore_permissions=True)
			print(f"[provider] updated key on AI Provider '{provider}'")
		else:
			print(f"[provider] AI Provider '{provider}' exists (key unchanged)")
	else:
		if not api_key:
			print(f"[provider] WARNING: no api_key given and AI Provider '{provider}' missing; skipping provider/agent model wiring")
			return None, None
		frappe.get_doc(
			{
				"doctype": "AI Provider",
				"provider_name": provider,
				"provider_brand": _brand(provider),
				"api_key": api_key,
			}
		).insert(ignore_permissions=True)
		print(f"[provider] created AI Provider '{provider}'")

	model = model or DEFAULT_MODELS.get(provider.strip().lower())
	if not model:
		models = frappe.get_all("AI Model", filters={"provider": provider}, pluck="name", limit=1)
		if not models:
			frappe.throw(f"No default model known for provider {provider!r}; pass model=...")
		model = models[0]

	if frappe.db.exists("AI Model", model):
		owner = frappe.db.get_value("AI Model", model, "provider")
		if owner != provider:
			frappe.throw(f"AI Model {model!r} already exists under provider {owner!r}; AI Model is named by model_name")
		print(f"[model] AI Model '{model}' already present")
	else:
		frappe.get_doc(
			{"doctype": "AI Model", "provider": provider, "model_name": model, "modalities": "Text"}
		).insert(ignore_permissions=True)
		print(f"[model] created AI Model '{model}'")
	return provider, model


def _sync_ury_tools():
	from huf.ai import tool_registry

	tool_registry.sync_app_tools(app_name="ury")  # app_name=None would silently no-op
	missing = [t for t in ALL_TOOLS if not frappe.db.exists("Agent Tool Function", t)]
	if missing:
		# sync_app_tools swallows errors; retry bypassing the scan cache to surface them.
		result = tool_registry.sync_discovered_tools(apps_to_scan=["ury"], use_cache=False)
		print(f"[tools] retry sync result: {result}")
		missing = [t for t in ALL_TOOLS if not frappe.db.exists("Agent Tool Function", t)]
	if missing:
		print(f"[tools] WARNING: still missing Agent Tool Functions: {missing}")
	else:
		print(f"[tools] {len(ALL_TOOLS)} URY tools registered as Agent Tool Functions")
	return [t for t in ALL_TOOLS if t not in missing]


def _access_roles():
	return [r for r in ("System Manager", "Administrator", "URY Manager") if frappe.db.exists("Role", r)]


def _upsert_agent(spec, provider, model, available_tools):
	name = spec["agent_name"]
	doc = frappe.get_doc("Agent", name) if frappe.db.exists("Agent", name) else frappe.new_doc("Agent")
	created = doc.is_new()

	doc.agent_name = name
	doc.description = spec["description"]
	doc.instructions = spec["instructions"]
	doc.prompt_mode = "Local"
	doc.agent_modality = "Text"
	doc.allow_chat = 1
	doc.persist_conversation = 1  # Agent.validate rejects allow_chat without it
	doc.temperature = 0.3
	doc.top_p = 1
	doc.enable_prompt_caching = 0  # avoid model-capability validation failures on arbitrary models
	if provider and model:
		doc.provider = provider
		doc.model = model
	doc.disabled = 0 if (doc.provider and doc.model) else 1
	if created:
		doc.source_app = "ury"

	# starter prompts (max 3 enforced by Agent.validate)
	doc.set("starter_prompts", [])
	for text in spec["starter_prompts"][:3]:
		doc.append("starter_prompts", {"prompt_text": text})

	# tools: add missing, keep any extra the operator attached
	have = {r.tool for r in doc.get("agent_tool", [])}
	for t in spec["tools"]:
		if t in available_tools and t not in have:
			doc.append("agent_tool", {"tool": t})

	# access: System Manager is always allowed by huf; list roles explicitly anyway
	have_roles = {r.role for r in doc.get("allowed_roles", [])}
	for role in _access_roles():
		if role not in have_roles:
			doc.append("allowed_roles", {"role": role})

	if created:
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)
	attached = [r.tool for r in doc.agent_tool]
	print(f"[agent] {'created' if created else 'updated'} '{name}' disabled={doc.disabled} tools={attached}")
	return name, attached


def _grant_huf_role_to_ury_managers():
	"""Give URY Manager users the 'Huf User' role (if it exists) so chat doctype access works."""
	if not (frappe.db.exists("Role", "Huf User") and frappe.db.exists("Role", "URY Manager")):
		return
	users = frappe.get_all("Has Role", filters={"role": "URY Manager", "parenttype": "User"}, pluck="parent")
	for u in set(users):
		if u in ("Administrator", "Guest") or not frappe.db.get_value("User", u, "enabled"):
			continue
		udoc = frappe.get_doc("User", u)
		if "Huf User" not in {r.role for r in udoc.roles}:
			udoc.append("roles", {"role": "Huf User"})
			udoc.save(ignore_permissions=True)
			print(f"[access] granted Huf User to {u}")


def seed(provider="Google", api_key=None, model=None):
	if "huf" not in frappe.get_installed_apps():
		frappe.throw("huf app is not installed on this site")
	if "ury" not in frappe.get_installed_apps():
		frappe.throw("ury app is not installed on this site")
	frappe.set_user("Administrator")

	prov, mdl = _ensure_provider_and_model(provider, api_key, model)
	available = _sync_ury_tools()

	results = [_upsert_agent(spec, prov, mdl, available) for spec in AGENTS]

	settings = frappe.get_single("URY AI Settings")
	settings.enabled = 1
	settings.save(ignore_permissions=True)
	print("[settings] URY AI Settings.enabled = 1")

	_grant_huf_role_to_ury_managers()
	frappe.db.commit()
	frappe.clear_cache()

	print("\n=== Huf demo seed summary ===")
	print(f"provider={prov} model={mdl} key={'set' if prov and api_key else 'unchanged/none'}")
	for name, tools in results:
		print(f"agent '{name}': {len(tools)} tools -> {', '.join(tools)}")
	chat_agent = frappe.conf.get("ury_huf_agent_name") or DASHBOARD_AGENT
	print(f"URY chat talks to agent: '{chat_agent}'")
	if chat_agent not in {n for n, _ in results}:
		print("  WARNING: site_config ury_huf_agent_name points at an agent this seed did not create")
	print(f"allowed roles: {_access_roles()}")
	return {"provider": prov, "model": mdl, "agents": [n for n, _ in results]}
