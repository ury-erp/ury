# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Chairman Brief: server chat wrapper over Huf (WP H1, security-critical).
#
# ======================================================================
# RUN-AS FINDING (who do agent tool calls execute as?)
# ----------------------------------------------------------------------
# Evidence (apps/huf/huf, apps/frappe/frappe on bench sa-v16-latest-demo):
#   * huf/ai/agent/integration.py:1755-1771 - unless Agent.run_immediately or
#     now=1, run_agent_sync() persists a Queued Agent Run and calls
#     frappe.enqueue("huf.ai.agent.integration._run_queued_agent", ...).
#   * frappe/utils/background_jobs.py:179 records "user": frappe.session.user
#     at enqueue time and execute_job() (:251-252) calls frappe.set_user(user).
#     So the FIRST drainer job runs as the requesting user.
#   * BUT _run_queued_agent (integration.py:3202) / _drain_run (:3256) never
#     set the user themselves: they drain EVERY queued run of the conversation
#     as whatever user the job happens to carry. Re-drains enqueued by
#     _enqueue_drain (:3093) and the scheduler sweepers (huf/hooks.py:383-395)
#     carry other identities; Huf itself documents at integration.py:1357-1358
#     that "a queued run drained by the stale-run sweeper has session user
#     Administrator".
# CONCLUSION: queued execution does NOT guarantee tools run as the chairman
# (they can run as Administrator). test_chairman_chat.py
# ::test_huf_queued_drainer_does_not_restore_owner proves this against the
# real Huf drainer by capturing frappe.session.user inside the drained run.
#
# DESIGN (fail closed):
#   1. Every run is started with run_agent_sync(..., now=1): Huf's direct path
#      (integration.py:1793+) executes inline in THIS web request, whose
#      session user is the authenticated chairman (role-checked first). No
#      enqueue, no worker, no sweeper identity.
#   2. If Huf ever answers queued anyway (e.g. a future change), the run is
#      marked Failed and the call raises - we never let it drain in the
#      background.
#   3. assert_chairman_tool_context() is exported for the chairman agent's
#      tools (WP H2): it raises unless the session user holds URY Owner,
#      is not Administrator/Guest, and owns the conversation. So even a run
#      that somehow drained as Administrator cannot read data.
#   No frappe.set_user impersonation is used anywhere.
# ======================================================================
#
# AGENT POLICY (review H1/H2): _require_agent() refuses, fail closed with
# PermissionError, unless the configured Huf Agent
#   * has only "Custom Function" tools whose function_path is
#     "ury.ury.api.chairman_tools.<name>" for a name in chairman_tools.TOOLS
#     (no Get/Create/Update/Delete Document, SQL/report, GET/POST HTTP, Run Agent,
#     Code Execution, memory, client-side tools ...);
#   * has no MCP servers, skills, SSH connections, and code execution, SSH,
#     remote desktop, local desktop MCP, lazy tools and memory tools are off;
#   * has max_turns between 1 and MAX_AGENT_TURNS (Huf reads Agent.max_turns as
#     its tool-iteration cap; run_agent_sync has no per-call cap, and 0 means
#     Huf's default of 20);
#   * is closed to non-chairmen on Huf's own endpoints: allow_guest and
#     allow_all_users off, allowed_users empty, allowed_roles non-empty and a
#     subset of ALLOWED_ROLES. Huf's check_agent_access (huf/ai/agent/access.py)
#     ALSO always admits the agent owner, System Manager and holders of the
#     agent.view_all / agent.edit capabilities; that cannot be closed from ury,
#     so those users can run the agent via Huf's native chat. They are trusted
#     admins and the tools themselves still require URY Owner (guarded).
#
# LIMITS (review M3): per-user cache counters: RATE_LIMIT_MESSAGES text
# messages/min (send, start-with-message) and RATE_LIMIT_AUDIO audio calls/min
# (send_audio, speak); messages capped at MAX_MESSAGE_CHARS and a conversation
# at MAX_CONVERSATION_MESSAGES Agent Messages.
# DEPLOYMENT: runs are inline in a gunicorn web worker (LLM loop + STT/TTS).
# Set gunicorn --timeout to at least 180 s (bench: http_timeout in
# common_site_config / `bench config http_timeout 180`, then `bench setup
# supervisor`) and size --workers so a few concurrent chairmen cannot starve
# the POS (e.g. workers >= 2 x expected concurrent chairmen + POS load).
#
# Huf is a SOFT dependency: it is imported lazily; without it (or without a
# configured agent) start() returns {"enabled": False}.

import asyncio
import base64
import binascii
import re
import time
import uuid

import frappe
from frappe import _

try:
	from ury.ury.api.chairman import ALLOWED_ROLES, _check_role
except ImportError:  # pure unit run from this directory
	from chairman import ALLOWED_ROLES, _check_role

try:
	from ury.ury.api.chairman_chat_list_pure import (
		clean_rename_title,
		coerce_list_limit,
		conversation_row,
		date_hint,
		strip_language_hint,
	)
except ImportError:  # pure unit run from this directory
	from chairman_chat_list_pure import (
		clean_rename_title,
		coerce_list_limit,
		conversation_row,
		date_hint,
		strip_language_hint,
	)

FAST_PATH_ENABLED = True  # kill switch for the pre-LLM router (no system setting by design)

SETTINGS_DOCTYPE = "URY Chairman Settings"
VOICE_PREFIX = "ury-brief-voice-"  # chairman_jobs purge matches this prefix
MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_SPEAK_CHARS = 4000
SUPPORTED_LANGUAGES = {"en": "English", "hi": "Hindi", "ar": "Arabic", "ml": "Malayalam"}

# mime (without parameters) -> stored extension
AUDIO_MIME_EXT = {
	"audio/webm": "webm",
	"video/webm": "webm",
	"audio/mp4": "m4a",
	"video/mp4": "mp4",
	"audio/x-m4a": "m4a",
	"audio/aac": "aac",
	"audio/mpeg": "mp3",
	"audio/mp3": "mp3",
	"audio/ogg": "ogg",
	"application/ogg": "ogg",
	"audio/wav": "wav",
	"audio/x-wav": "wav",
	"audio/flac": "flac",
}
FORBIDDEN_TOOL_USERS = {"Administrator", "Guest"}

MAX_MESSAGE_CHARS = 4000
MAX_CONVERSATION_MESSAGES = 200
MAX_AGENT_TURNS = 8
RATE_LIMIT_MESSAGES = 20  # per user per minute
RATE_LIMIT_AUDIO = 6  # per user per minute
RATE_WINDOW_SECONDS = 60
HISTORY_DEFAULT_LIMIT = 100
HISTORY_MAX_LIMIT = 100

TOOLS_MODULE = "ury.ury.api.chairman_tools"
ALLOWED_TOOL_TYPES = {"Custom Function"}
# Agent checkbox fields that grant capabilities beyond our read-only tools.
FORBIDDEN_AGENT_FLAGS = (
	"allow_code_execution",
	"allow_ssh",
	"allow_remote_desktop",
	"enable_lazy_tools",
	"enable_memory_search_tool",
	"enable_memory_write_tool",
)
FORBIDDEN_AGENT_TABLES = ("agent_mcp_server", "agent_skill", "ssh_connections", "allowed_users")


# ---------------------------------------------------------------- pure helpers


def normalize_mime(mime):
	return (mime or "").split(";", 1)[0].strip().lower()


def audio_ext_for_mime(mime):
	"""Extension for an allowed audio mime, else raise ValidationError."""
	ext = AUDIO_MIME_EXT.get(normalize_mime(mime))
	if not ext:
		frappe.throw(_("Unsupported audio type: {0}").format(mime or "unknown"), frappe.ValidationError)
	return ext


def decode_audio_b64(b64data):
	if not b64data:
		frappe.throw(_("Audio data is required"), frappe.ValidationError)
	if "," in b64data:
		b64data = b64data.split(",", 1)[1]
	# Cheap pre-check: base64 inflates 4/3, reject before decoding huge payloads.
	if len(b64data) > (MAX_AUDIO_BYTES * 4) // 3 + 8:
		frappe.throw(_("Audio exceeds 5 MB"), frappe.ValidationError)
	try:
		return base64.b64decode(b64data, validate=True)
	except (ValueError, binascii.Error):
		frappe.throw(_("Invalid base64 audio data"), frappe.ValidationError)


def validate_audio(content, mime):
	"""Return the extension; raise on empty, >5 MB or non-audio mime."""
	ext = audio_ext_for_mime(mime)
	if not content:
		frappe.throw(_("Audio recording was empty"), frappe.ValidationError)
	if len(content) > MAX_AUDIO_BYTES:
		frappe.throw(_("Audio exceeds 5 MB"), frappe.ValidationError)
	return ext


def voice_file_name(ext):
	return f"{VOICE_PREFIX}{uuid.uuid4().hex}.{ext}"


def normalize_language(language):
	"""ISO 639-1 hint or None (auto-detect). Never forces English."""
	code = (language or "").strip().lower().replace("_", "-").split("-", 1)[0]
	return code if code in SUPPORTED_LANGUAGES else None


def with_language_hint(message, language):
	"""Append the site date line always, and the language line when a language is given."""
	code = normalize_language(language)
	out = message
	if code:
		name = SUPPORTED_LANGUAGES[code]
		out += f"\n\n[Language: {name}. Reply in {name}.]"
	return out + ("\n" if code else "\n\n") + date_hint()


def coerce_history_limit(limit):
	"""Non-numeric/None -> default; clamp to 1..HISTORY_MAX_LIMIT. Never raises."""
	try:
		n = int(str(limit).strip())
	except (TypeError, ValueError):
		return HISTORY_DEFAULT_LIMIT
	return max(1, min(n, HISTORY_MAX_LIMIT))


def validate_message(message):
	"""Return the stripped message; raise ValidationError if empty or too long."""
	text = str(message or "").strip()
	if not text:
		frappe.throw(_("message is required"), frappe.ValidationError)
	if len(text) > MAX_MESSAGE_CHARS:
		frappe.throw(
			_("Message is too long (max {0} characters)").format(MAX_MESSAGE_CHARS), frappe.ValidationError
		)
	return text


def allowed_tool_paths():
	"""function_paths the chairman agent may carry (lazy import of chairman_tools)."""
	try:
		from ury.ury.api.chairman_tools import TOOLS
	except ImportError:  # pure unit run from this directory
		from chairman_tools import TOOLS
	return {f"{TOOLS_MODULE}.{t['name']}" for t in TOOLS}


def _get(obj, key, default=None):
	if isinstance(obj, dict):
		return obj.get(key, default)
	return getattr(obj, key, default)


def agent_policy_violations(agent_doc, tool_functions, allowed_paths, allowed_roles=ALLOWED_ROLES):
	"""Pure check. agent_doc: Agent (doc or dict); tool_functions: one dict per
	agent_tool row with keys name, types, function_path (None if the linked Agent
	Tool Function is missing). Returns a list of violation strings (empty = ok)."""
	v = []
	rows = _get(agent_doc, "agent_tool") or []
	if not rows:
		v.append("agent has no tools")
	if len(tool_functions) != len(rows):
		v.append("agent tool rows could not all be resolved")
	for tf in tool_functions:
		if not tf:
			v.append("agent tool links a missing Agent Tool Function")
			continue
		label = tf.get("name") or "?"
		if tf.get("types") not in ALLOWED_TOOL_TYPES:
			v.append(f"tool {label} has forbidden type {tf.get('types')!r}")
		if (tf.get("function_path") or "").strip() not in allowed_paths:
			v.append(f"tool {label} function_path {tf.get('function_path')!r} is not an owner tool")
	for f in FORBIDDEN_AGENT_FLAGS:
		if _get(agent_doc, f):
			v.append(f"agent has {f} enabled")
	if (_get(agent_doc, "desktop_access_local_mcp") or "off") != "off":
		v.append("agent has desktop_access_local_mcp enabled")
	for t in FORBIDDEN_AGENT_TABLES:
		if _get(agent_doc, t):
			v.append(f"agent has rows in {t}")
	turns = _get(agent_doc, "max_turns") or 0
	if not (1 <= int(turns) <= MAX_AGENT_TURNS):
		v.append(f"agent max_turns must be 1..{MAX_AGENT_TURNS} (is {turns})")
	if _get(agent_doc, "allow_guest"):
		v.append("agent allows Guest")
	if _get(agent_doc, "allow_all_users"):
		v.append("agent allows all users")
	roles = {_get(r, "role") for r in (_get(agent_doc, "allowed_roles") or [])}
	if not roles:
		v.append("agent allowed_roles must list URY Owner")
	elif not roles <= set(allowed_roles):
		v.append(f"agent allowed_roles include non-owner roles {sorted(roles - set(allowed_roles))}")
	return v


def _tool_functions(agent_doc):
	out = []
	for row in agent_doc.get("agent_tool") or []:
		tf = (
			frappe.db.get_value(
				"Agent Tool Function", row.tool, ["name", "types", "function_path"], as_dict=True
			)
			if row.tool
			else None
		)
		out.append(dict(tf) if tf else None)
	return out


def assert_agent_policy(agent_doc):
	violations = agent_policy_violations(agent_doc, _tool_functions(agent_doc), allowed_tool_paths())
	if violations:
		frappe.log_error(
			"\n".join(violations), f"URY chairman chat: agent {agent_doc.name} refused by policy"
		)
		frappe.throw(
			_("Owner chat agent is not safely configured; refused. Ask an administrator to check the error log."),
			frappe.PermissionError,
		)


def rate_check(bucket, limit, user=None):
	"""Per-user fixed-window counter in redis; raise TooManyRequestsError over limit."""
	user = user or frappe.session.user
	window = int(time.time() // RATE_WINDOW_SECONDS)
	cache = frappe.cache
	key = cache.make_key(f"ury_chairman_rl:{bucket}:{user}:{window}")
	n = cache.incr(key)
	if n == 1:
		cache.expire(key, RATE_WINDOW_SECONDS + 5)
	if n > limit:
		frappe.throw(
			_("Too many requests. Please wait a minute and try again."),
			getattr(frappe, "TooManyRequestsError", frappe.ValidationError),
		)


def _assert_conversation_room(conversation):
	if frappe.db.count("Agent Message", {"conversation": conversation}) >= MAX_CONVERSATION_MESSAGES:
		frappe.throw(
			_("This conversation is full. Please start a new one."), frappe.ValidationError
		)


# ---------------------------------------------------------------- huf seams


def _huf_available():
	if "huf" not in frappe.get_installed_apps():
		return False
	try:
		import huf.ai.agent.integration  # noqa: F401
	except ImportError:
		return False
	return True


def _settings_value(field):
	try:
		return frappe.db.get_single_value(SETTINGS_DOCTYPE, field)
	except Exception:
		return None


def _chat_agent():
	"""Configured dedicated chairman agent name, or None."""
	name = (_settings_value("chat_agent") or "").strip()
	if not name or not frappe.db.exists("Agent", name):
		return None
	return name


def _enabled_agent():
	"""(agent) when huf is installed and an agent is configured, else None."""
	if not _huf_available():
		return None
	return _chat_agent()


def _require_agent():
	agent = _enabled_agent()
	if not agent:
		frappe.throw(_("Owner chat is not enabled"), frappe.ValidationError)
	from huf.ai.agent.access import assert_agent_access

	agent_doc = frappe.get_doc("Agent", agent)
	assert_agent_policy(agent_doc)
	assert_agent_access(agent_doc, user=frappe.session.user)
	return agent


def _own_conversation(conversation, agent):
	"""Raise PermissionError unless the session user owns this chairman conversation."""
	row = (
		frappe.db.get_value("Agent Conversation", conversation, ["owner", "agent"], as_dict=True)
		if conversation
		else None
	)
	if not row or row.owner != frappe.session.user or row.agent != agent:
		# Same message for missing and foreign conversations (no enumeration).
		frappe.throw(_("You do not have access to this conversation."), frappe.PermissionError)
	return conversation


def _new_conversation(agent):
	from huf.ai.conversation_manager import ConversationManager

	return ConversationManager(agent_name=agent, channel="Chat").create_new_conversation().name


def _fail_run(run_id, reason):
	try:
		frappe.db.set_value("Agent Run", run_id, {"status": "Failed", "error_message": reason})
		frappe.db.commit()  # nosemgrep: the throw below rolls back; the failure must persist
	except Exception:
		frappe.log_error(frappe.get_traceback(), "URY chairman chat: could not fail queued run")


def _run_inline(agent, conversation, prompt):
	"""Run the agent inline as the session user (see RUN-AS FINDING). Fail closed if queued."""
	from huf.ai.agent.integration import run_agent_sync

	# chairman_tools.guarded calls assert_chairman_tool_context(flags.chairman_conversation_id)
	frappe.flags.chairman_conversation_id = conversation
	try:
		result = run_agent_sync(
			agent_name=agent,
			prompt=prompt,
			provider=frappe.db.get_value("Agent", agent, "provider"),
			model=frappe.db.get_value("Agent", agent, "model"),
			channel_id="Chat",
			conversation_id=conversation,
			now=1,
		)
	finally:
		frappe.flags.chairman_conversation_id = None
	if isinstance(result, dict) and (result.get("queued") or result.get("status") == "Queued"):
		if result.get("agent_run_id"):
			_fail_run(result["agent_run_id"], "URY chairman chat refuses queued execution")
		frappe.throw(
			_("Owner chat cannot guarantee the run executes as you; refused."),
			frappe.ValidationError,
		)
	return result


CARDS_FIELD = "chairman_cards"


def _cards_mod():
	try:
		from ury.ury.api import chairman_cards
	except ImportError:
		import chairman_cards
	return chairman_cards


def _cards_field_exists():
	try:
		return bool(frappe.get_meta("Agent Message").has_field(CARDS_FIELD))
	except Exception:
		return False


def run_with_cards(agent, conversation, prompt):
	"""_run_inline plus the cards the guarded tools produced during the run (max 3, validated).
	Tools run in this process (now=1), so they publish cards on frappe.flags.chairman_cards;
	Huf's run result carries no tool outputs. Returns (run_result, cards)."""
	frappe.flags.chairman_cards = []
	frappe.flags.chairman_composed_cards = 0
	frappe.flags.chairman_card_registry = None
	try:
		run = _run_inline(agent, conversation, prompt)
		cards = select_cards(frappe.flags.chairman_cards)
	finally:
		frappe.flags.chairman_cards = None
		frappe.flags.chairman_composed_cards = 0
		frappe.flags.chairman_card_registry = None
	if cards:
		_persist_cards(conversation, cards)
	return run, cards


def _persist_cards(conversation, cards):
	"""Store cards JSON on the newest assistant message of the run so history() can re-attach
	them. Best effort: skipped (response still carries cards) when the custom field is absent."""
	try:
		if not _cards_field_exists():
			return
		name = frappe.db.get_value(
			"Agent Message",
			{"conversation": conversation, "role": "agent", "kind": "Message"},
			"name",
			order_by="conversation_index desc, creation desc",
		)
		if name:
			frappe.db.set_value("Agent Message", name, CARDS_FIELD, frappe.as_json(cards), update_modified=False)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "URY chairman chat: could not persist cards")


def attach_cards(conversation, msgs):
	"""Add `cards` (re-validated) to history rows whose Agent Message stored some."""
	if not isinstance(msgs, list) or not _cards_field_exists():
		return msgs
	ids = [m["id"] for m in msgs if isinstance(m, dict) and m.get("id")]
	if not ids:
		return msgs
	stored = dict(
		frappe.get_all(
			"Agent Message",
			filters={"name": ["in", ids], CARDS_FIELD: ["is", "set"]},
			fields=["name", CARDS_FIELD],
			as_list=True,
		)
	)
	for m in msgs:
		raw = stored.get(m.get("id")) if isinstance(m, dict) else None
		if not raw:
			continue
		try:
			cards = _cards_mod().limit_cards(frappe.parse_json(raw))
		except Exception:
			cards = []
		if cards:
			m["cards"] = cards
	return msgs


# ---------------------------------------------------------------- reply cleaning / card choice

_ARTIFACT_BLOCK = re.compile(r"<artifact\b[^>]*>.*?</artifact\s*>", re.I | re.S)
_ARTIFACT_OPEN_TAIL = re.compile(r"<artifact\b.*\Z", re.I | re.S)  # unterminated: drop to end
_ARTIFACT_STRAY = re.compile(r"</?artifact\b[^>]*>?", re.I)
_SCRIPT_STYLE = re.compile(r"<(script|style)\b[^>]*>.*?</\1\s*>", re.I | re.S)
_SCRIPT_STYLE_TAIL = re.compile(r"<(?:script|style)\b.*\Z", re.I | re.S)
_FENCE = re.compile(r"```[ \t]*([A-Za-z0-9_+-]*)[^\n]*\n(.*?)(?:```|\Z)", re.S)
_JSX_LANGS = {"jsx", "tsx", "react", "javascriptreact"}
_JSX_BODY = re.compile(r"import\s+React|from\s+['\"]react['\"]|<[A-Z][A-Za-z0-9]*[\s/>]|return\s*\(\s*<", re.S)


def _drop_jsx_fence(m):
	lang, body = m.group(1).lower(), m.group(2)
	return "" if lang in _JSX_LANGS or _JSX_BODY.search(body) else m.group(0)


MAX_ROUNDS_PREFIX = "Agent stopped after max rounds"
MAX_ROUNDS_REPLY = "That question needs more digging than I could finish. Please ask about one period or one topic at a time, for example yesterday's sales or last week's top dishes."


def strip_rich_markup(text):
	"""Remove model-emitted rich blocks the chairman UI cannot render: <artifact ...> blocks
	(also unterminated), script/style tags and code fences holding jsx; collapse whitespace.
	Pure. Non-strings pass through unchanged."""
	if not isinstance(text, str):
		return text
	t = _ARTIFACT_BLOCK.sub(" ", text)
	t = _ARTIFACT_OPEN_TAIL.sub(" ", t)
	t = _ARTIFACT_STRAY.sub(" ", t)
	t = _SCRIPT_STYLE.sub(" ", t)
	t = _SCRIPT_STYLE_TAIL.sub(" ", t)
	t = _FENCE.sub(_drop_jsx_fence, t)
	t = re.sub(r"[ \t\r\f\v]+", " ", t)
	t = re.sub(r" ?\n ?", "\n", t)
	t = re.sub(r"\n{3,}", "\n\n", t)
	return t.strip()


def clean_run(run):
	"""Return `run` with response text stripped; (run, changed_text_or_None)."""
	if isinstance(run, dict) and isinstance(run.get("response"), str):
		cleaned = strip_rich_markup(run["response"])
		if cleaned.startswith(MAX_ROUNDS_PREFIX):
			cleaned = MAX_ROUNDS_REPLY
		if cleaned != run["response"]:
			return {**run, "response": cleaned}, cleaned
	return run, None


def select_cards(raw, limit=None):
	"""Validated cards for a run. Tools append to the flag list in call order; with more than
	MAX_CARDS the question's own (latest) tool calls win over incidental earlier ones, so the
	list is reversed (newest first) before dedupe/limit. <= MAX_CARDS keeps call order."""
	mod = _cards_mod()
	limit = limit or mod.MAX_CARDS
	raw = list(raw or [])
	dashboards = [c for c in raw if isinstance(c, dict) and c.get("type") == "dashboard"]
	if dashboards:
		# A composed dashboard is the answer; loose single cards beside it only duplicate its panels.
		return mod.limit_cards(dashboards[:1], limit)
	if len(raw) > limit:
		raw.reverse()
	return mod.limit_cards(raw, limit)


def _persist_clean_reply(conversation, cleaned):
	"""Best effort: store the stripped text on the newest assistant message so history()
	shows what the live reply showed."""
	try:
		name = frappe.db.get_value(
			"Agent Message",
			{"conversation": conversation, "role": "agent", "kind": "Message"},
			"name",
			order_by="conversation_index desc, creation desc",
		)
		if name:
			frappe.db.set_value("Agent Message", name, "content", cleaned, update_modified=False)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "URY chairman chat: could not persist cleaned reply")


def run_clean(agent, conversation, prompt):
	"""run_with_cards + strip_rich_markup on the reply (and the stored message)."""
	run, cards = run_with_cards(agent, conversation, prompt)
	run, changed = clean_run(run)
	if changed is not None:
		_persist_clean_reply(conversation, changed)
	return run, cards


# ---------------------------------------------------------------- fast path (WP7)


def _router_mod():
	try:
		from ury.ury.api import chairman_router
	except ImportError:
		import chairman_router
	return chairman_router


def _store_fast_turn(agent, conversation, user_text, reply, cards):
	"""Persist user + agent Agent Messages exactly as Huf's ConversationManager.add_message does
	(role "user"/"agent", kind "Message", next conversation_index)."""
	from huf.ai.conversation_manager import ConversationManager

	conv_doc = frappe.get_doc("Agent Conversation", conversation)
	cm = ConversationManager(agent_name=agent, channel="Chat")
	provider = frappe.db.get_value("Agent", agent, "provider")
	model = frappe.db.get_value("Agent", agent, "model")
	cm.add_message(conversation=conv_doc, role="user", content=user_text, provider=provider, model=model, agent=agent)
	cm.add_message(conversation=conv_doc, role="agent", content=reply, provider=provider, model=model, agent=agent)
	if cards:
		_persist_cards(conversation, cards)


def try_fast_path(agent, conversation, message, language=None):
	"""Deterministic answer for simple data questions, or None (caller runs the LLM).
	The tool runs through the guarded chairman tool in this process, so role, chairman-context
	and conversation-ownership checks still apply. Never raises."""
	if not FAST_PATH_ENABLED:
		return None
	try:
		router = _router_mod()
		try:
			from ury.ury.api.chairman import _today
		except ImportError:
			from chairman import _today
		intent = router.match(message, _today())
		if not intent:
			return None
		lang = normalize_language(language) or router.detect_language(message)
		frappe.flags.chairman_conversation_id = conversation
		frappe.flags.chairman_cards = []
		frappe.flags.chairman_composed_cards = 0
		frappe.flags.chairman_card_registry = None
		try:
			res = router.answer(intent, lang)
			armed = list(frappe.flags.chairman_cards or [])
		finally:
			frappe.flags.chairman_conversation_id = None
			frappe.flags.chairman_cards = None
			frappe.flags.chairman_composed_cards = 0
			frappe.flags.chairman_card_registry = None
		if not res or not res.get("reply"):
			return None
		cards = select_cards(armed)
		if not cards:
			cards = _cards_mod().cards_for(res.get("tool"), res.get("data"))
		reply = strip_rich_markup(res["reply"])
		_store_fast_turn(agent, conversation, message, reply, cards)
		run = {"success": True, "response": reply, "status": "Success", "conversation_id": conversation,
			"fast_path": True, "intent": res.get("intent"), "tool": res.get("tool")}
		return run, cards
	except Exception:
		frappe.log_error(frappe.get_traceback(), "URY chairman chat: fast path failed, using LLM")
		return None


def run_turn(agent, conversation, message, language=None):
	"""Fast path first, else the LLM. Returns (run, cards, fast_path)."""
	fast = try_fast_path(agent, conversation, message, language)
	if fast:
		return fast[0], fast[1], True
	run, cards = run_clean(agent, conversation, with_language_hint(message, language))
	return run, cards, False


# ---------------------------------------------------------------- tool guard (for WP H2)


def assert_chairman_tool_context(conversation_id=None):
	"""Call at the top of every chairman agent tool. Fails closed unless the tool
	executes as an URY Owner who owns the conversation (never Administrator)."""
	user = frappe.session.user
	from ury.ury.api.chairman import administrator_allowed

	if user == "Administrator" and administrator_allowed():
		pass
	elif user in FORBIDDEN_TOOL_USERS or not (set(frappe.get_roles(user)) & set(ALLOWED_ROLES)):
		frappe.throw(_("Owner tools must run as the owner"), frappe.PermissionError)
	if conversation_id:
		owner = frappe.db.get_value("Agent Conversation", conversation_id, "owner")
		if owner != user:
			frappe.throw(_("Owner tools must run as the conversation owner"), frappe.PermissionError)
	return user


# ---------------------------------------------------------------- endpoints


CALL_LANGUAGES = ["en", "hi", "ar", "ml"]


@frappe.whitelist(methods=["GET", "POST"])
def call_capabilities():
	_check_role()
	try:
		from ury.ury.api import chairman_call
	except ImportError:
		chairman_call = None
	if chairman_call is not None:
		return chairman_call.call_capabilities()
	return {
		"available": False,
		"voice_call_enabled": bool(_settings_value("voice_call_enabled")),
		"engines": [],
	}


@frappe.whitelist(methods=["POST"])
def start(message=None, language=None):
	_check_role()
	if not _enabled_agent():
		return {"enabled": False}
	agent = _require_agent()
	conversation = _new_conversation(agent)
	out = {"enabled": True, "conversation_id": conversation, "run": None, "cards": []}
	if message and str(message).strip():
		message = validate_message(message)
		rate_check("msg", RATE_LIMIT_MESSAGES)
		out["run"], out["cards"], fast = run_turn(agent, conversation, message, language)
		if fast:
			out["fast_path"] = True
	return out


@frappe.whitelist(methods=["POST"])
def send(conversation, message, language=None):
	_check_role()
	message = validate_message(message)
	rate_check("msg", RATE_LIMIT_MESSAGES)
	agent = _require_agent()
	_own_conversation(conversation, agent)
	_assert_conversation_room(conversation)
	run, cards, fast = run_turn(agent, conversation, message, language)
	out = {"conversation_id": conversation, "run": run, "cards": cards}
	if fast:
		out["fast_path"] = True
	return out


@frappe.whitelist(methods=["GET", "POST"])
def history(conversation, limit=HISTORY_DEFAULT_LIMIT):
	_check_role()
	agent = _require_agent()
	_own_conversation(conversation, agent)
	from huf.ai.agent.chat import get_history

	frappe.local.response_headers["Cache-Control"] = "no-store"
	msgs = get_history(conversation_id=conversation, limit=coerce_history_limit(limit))
	return attach_cards(conversation, attach_message_ids(conversation, msgs))


@frappe.whitelist(methods=["GET", "POST"])
def conversations(limit=40):
	"""The signed-in owner's recent chats, newest first, from ONE grouped query:
	id, title, preview (last message), last_role, pending (last message is the owner's,
	i.e. unanswered), started_by_voice, last_at, created_at."""
	_check_role()
	agent = _require_agent()
	frappe.local.response_headers["Cache-Control"] = "no-store"
	n = coerce_list_limit(limit)
	rows = frappe.db.sql(
		"""
		SELECT c.name, c.title, c.modified, c.creation,
			MIN(CASE WHEN m.role = 'user' THEN m.creation END) AS first_user_at,
			SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN m.role = 'user' THEN m.content END
				ORDER BY m.creation ASC SEPARATOR X'1F'), X'1F', 1) AS first_user,
			SUBSTRING_INDEX(GROUP_CONCAT(m.role ORDER BY m.creation DESC SEPARATOR X'1F'), X'1F', 1) AS last_role,
			SUBSTRING_INDEX(GROUP_CONCAT(m.content ORDER BY m.creation DESC SEPARATOR X'1F'), X'1F', 1) AS last_content,
			EXISTS (SELECT 1 FROM `tabFile` f
				WHERE f.attached_to_doctype = 'Agent Conversation' AND f.attached_to_name = c.name
				AND f.file_name LIKE %(voice)s) AS started_by_voice
		FROM `tabAgent Conversation` c
		JOIN `tabAgent Message` m ON m.conversation = c.name AND m.kind = 'Message'
			AND m.role IN ('user', 'agent')
		WHERE c.agent = %(agent)s AND c.owner = %(owner)s
		GROUP BY c.name
		HAVING first_user_at IS NOT NULL
		ORDER BY c.modified DESC
		LIMIT %(n)s
		""",
		{"agent": agent, "owner": frappe.session.user, "voice": VOICE_PREFIX + "%", "n": n},
		as_dict=True,
	)
	return [conversation_row(r) for r in rows]


@frappe.whitelist(methods=["POST"])
def rename_conversation(conversation, title):
	_check_role()
	agent = _require_agent()
	_own_conversation(conversation, agent)
	title = clean_rename_title(title)
	if not title:
		frappe.throw(_("title is required"), frappe.ValidationError)
	frappe.db.set_value("Agent Conversation", conversation, "title", title, update_modified=False)
	return {"id": conversation, "title": title}


@frappe.whitelist(methods=["POST"])
def delete_conversation(conversation):
	_check_role()
	agent = _require_agent()
	_own_conversation(conversation, agent)
	frappe.db.delete("Agent Message", {"conversation": conversation})
	frappe.delete_doc("Agent Conversation", conversation, ignore_permissions=True, force=True)
	return {"id": conversation, "deleted": True}


def attach_message_ids(conversation, msgs):
	"""Huf's history rows carry no Agent Message name; the app needs it for speak(). Match by
	role and creation timestamp (newest-aligned) and add `id`; leave rows unmatched if unsure."""
	if not isinstance(msgs, list):
		return msgs
	rows = frappe.get_all(
		"Agent Message",
		filters={"conversation": conversation},
		fields=["name", "role", "creation"],
		order_by="creation asc",
	)
	by_key = {}
	for r in rows:
		by_key.setdefault((str(r.creation)[:19], r.role), []).append(r.name)
	for m in msgs:
		if not isinstance(m, dict) or m.get("id") or m.get("name"):
			continue
		role = "agent" if m.get("role") in ("agent", "assistant") else m.get("role")
		hit = by_key.get((str(m.get("creation"))[:19], role)) or by_key.get((str(m.get("creation"))[:19], m.get("role")))
		if hit:
			m["id"] = hit.pop(0)
	return msgs


def _uploaded_audio():
	req = getattr(frappe, "request", None)
	files = getattr(req, "files", None) if req else None
	upload = files.get("file") if files else None
	if not upload:
		return None, None
	content = upload.stream.read(MAX_AUDIO_BYTES + 1)
	return content, upload.mimetype


@frappe.whitelist(methods=["POST"])
def send_audio(conversation=None, b64data=None, mime=None, language=None):
	_check_role()
	rate_check("audio", RATE_LIMIT_AUDIO)
	agent = _require_agent()
	if conversation:
		_own_conversation(conversation, agent)
		_assert_conversation_room(conversation)

	content, upload_mime = _uploaded_audio()
	if content is None:
		content = decode_audio_b64(b64data)
	mime = mime or upload_mime
	ext = validate_audio(content, mime)

	if not conversation:
		conversation = _new_conversation(agent)

	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": voice_file_name(ext),
			"is_private": 1,
			"content": content,
			"attached_to_doctype": "Agent Conversation",
			"attached_to_name": conversation,
		}
	).insert(ignore_permissions=True)

	from huf.ai.audio_service import transcribe_audio_file

	lang = normalize_language(language)
	res = transcribe_audio_file(file_id=file_doc.name, agent_name=agent, language=lang)
	if not res or not res.get("success"):
		return {
			"success": False,
			"conversation_id": conversation,
			"error": (res or {}).get("error") or "Transcription failed",
		}
	transcript = (res.get("text") or res.get("transcript") or "").strip()
	if not transcript or transcript == "[Silence]":
		return {"success": False, "conversation_id": conversation, "error": "No speech detected"}

	run, cards, fast = run_turn(agent, conversation, transcript, lang)
	out = {
		"success": True,
		"conversation_id": conversation,
		"transcript": transcript,
		"language": lang or res.get("language"),
		"run": run,
		"cards": cards,
	}
	if fast:
		out["fast_path"] = True
	return out


@frappe.whitelist(methods=["POST"])
def speak(message_id):
	_check_role()
	rate_check("audio", RATE_LIMIT_AUDIO)
	agent = _require_agent()
	frappe.local.response_headers["Cache-Control"] = "no-store"
	msg = frappe.db.get_value(
		"Agent Message", message_id, ["conversation", "content", "role"], as_dict=True
	) if message_id else None
	if not msg:
		frappe.throw(_("You do not have access to this conversation."), frappe.PermissionError)
	_own_conversation(msg.conversation, agent)
	text = (msg.content or "").strip()[:MAX_SPEAK_CHARS]
	if not text:
		frappe.throw(_("Nothing to speak"), frappe.ValidationError)

	from huf.ai.handlers.media import handle_generate_audio

	# conversation_id=None: Huf then stores a bare private File (no extra Agent
	# Message). We re-store it under our purge prefix and delete Huf's copy so
	# retention applies (Huf names it generated_audio_*, which our purge ignores).
	res = asyncio.run(handle_generate_audio(input=text, agent_name=agent, conversation_id=None))
	huf_file_id = ((res or {}).get("audio") or {}).get("file_id") if isinstance(res, dict) else None
	try:
		if not res or not res.get("success"):
			return {"success": False, "error": (res or {}).get("error") or "Speech generation failed"}
		audio = res.get("audio") or {}
		fmt = (audio.get("format") or "mp3").lower()
		content = frappe.get_doc("File", audio["file_id"]).get_content()
		ours = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": voice_file_name(fmt),
				"is_private": 1,
				"content": content,
				"attached_to_doctype": "Agent Conversation",
				"attached_to_name": msg.conversation,
			}
		).insert(ignore_permissions=True)
		return {
			"success": True,
			"audio_url": ours.file_url,
			"mime": f"audio/{'mpeg' if fmt == 'mp3' else fmt}",
		}
	finally:
		_delete_huf_file(huf_file_id)


def _delete_huf_file(file_id):
	"""Always remove Huf's generated_audio_* copy (review M2); never mask the real error."""
	if not file_id:
		return
	try:
		if frappe.db.exists("File", file_id):
			frappe.delete_doc("File", file_id, ignore_permissions=True, force=True)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "URY chairman chat: could not delete Huf TTS file")
