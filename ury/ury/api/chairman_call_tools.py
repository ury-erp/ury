# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
"""Server side of the chairman voice call: tool execution and transcript persistence.

Both functions run in the caller's own HTTP request, under frappe.session.user (the real
chairman). Nothing is enqueued and the Huf sidecar is not involved, so a tool can never run as
Administrator. The caller (chairman_call.call_tool / call_turns) owns call_id lookup, the kill
switch and rate limits; it passes the stored call_state:
    {"user", "conversation", "agent", "tools_used": int, ...}
and persists call_state["tools_used"] after run_tool returns.
"""

import json

import frappe
from frappe import _

MAX_TOOLS_PER_CALL = 20
MAX_TURNS_PER_CALL = 200
MAX_TURN_CHARS = 2000
TURN_SET_TTL = 6 * 3600
VOICE_EXCLUDED = frozenset({"show_card", "compose_card", "compose_dashboard"})
FORBIDDEN_USERS = frozenset({"Administrator", "Guest"})


def _tools():
	try:
		from ury.ury.api import chairman_tools
	except ImportError:
		import chairman_tools
	return chairman_tools


def _chat():
	try:
		from ury.ury.api import chairman_chat
	except ImportError:
		import chairman_chat
	return chairman_chat


VOICE_TOOLS = frozenset(n for n in _tools().TOOLS_BY_NAME if n not in VOICE_EXCLUDED)


def _check_state(call_state):
	if not isinstance(call_state, dict):
		raise frappe.PermissionError("Invalid call")
	user = call_state.get("user")
	forbidden = FORBIDDEN_USERS - ({"Administrator"} if frappe.conf.get("ury_brief_allow_administrator") else set())
	if (
		not user
		or user in forbidden
		or frappe.session.user in forbidden
		or frappe.session.user != user
	):
		frappe.throw(_("Owner tools must run as the owner"), frappe.PermissionError)


def _validate_args(spec, args):
	if args is None or args == "":
		args = {}
	if isinstance(args, str):
		try:
			args = json.loads(args)
		except ValueError:
			raise ValueError("args must be a JSON object") from None
	if not isinstance(args, dict):
		raise ValueError("args must be a JSON object")
	schema = spec.get("parameters") or {}
	props = schema.get("properties") or {}
	unknown = sorted(set(args) - set(props))
	if unknown:
		raise ValueError("Unknown argument: " + ", ".join(str(k) for k in unknown))
	missing = [k for k in schema.get("required") or [] if args.get(k) in (None, "")]
	if missing:
		raise ValueError("Missing argument: " + ", ".join(missing))
	return {k: v for k, v in args.items() if v is not None}


def run_tool(call_state, name, args):
	"""Run one allow-listed chairman tool for a call. Returns the tool dict without `cards`,
	or {"error": str} for input/validation errors. Raises ValueError for an unknown tool,
	PermissionError when not the chairman, and ValidationError when the per-call cap is hit."""
	if name not in VOICE_TOOLS:
		raise ValueError("Unknown tool")
	_check_state(call_state)
	if int(call_state.get("tools_used") or 0) >= MAX_TOOLS_PER_CALL:
		frappe.throw(_("Tool limit reached for this call."), frappe.ValidationError)

	flags = frappe.flags
	previous = flags.get("chairman_conversation_id") if hasattr(flags, "get") else None
	flags.chairman_conversation_id = call_state.get("conversation")
	try:
		_chat().assert_chairman_tool_context(call_state.get("conversation"))
		call_state["tools_used"] = int(call_state.get("tools_used") or 0) + 1
		spec = _tools().TOOLS_BY_NAME[name]
		try:
			kwargs = _validate_args(spec, args)
			out = spec["func"](**kwargs)
		except (ValueError, frappe.ValidationError) as e:
			return {"error": str(e)}
	finally:
		flags.chairman_conversation_id = previous

	if isinstance(out, dict):
		out = {k: v for k, v in out.items() if k != "cards"}
	return out


# ---------------------------------------------------------------- transcript turns


def _clean(text):
	return _tools().clean_text(text, MAX_TURN_CHARS)


def _turn_key(call_state):
	return frappe.cache.make_key("ury_call_turns:%s" % call_state["conversation"])


def save_turns(call_state, turns):
	"""Persist final transcript turns as Agent Messages (role user/agent, kind Message) in the
	call's conversation. Idempotent by seq. Returns the number of newly saved turns."""
	_check_state(call_state)
	conversation = call_state.get("conversation")
	if not isinstance(turns, (list, tuple)):
		raise ValueError("turns must be a list")
	if len(turns) > MAX_TURNS_PER_CALL:
		raise ValueError("Too many turns")

	row = (
		frappe.db.get_value("Agent Conversation", conversation, ["owner", "agent"], as_dict=True)
		if conversation
		else None
	)
	if not row or row.owner != call_state["user"] or row.owner != frappe.session.user:
		frappe.throw(_("You do not have access to this conversation."), frappe.PermissionError)
	agent = row.agent
	if call_state.get("agent") and call_state["agent"] != agent:
		frappe.throw(_("You do not have access to this conversation."), frappe.PermissionError)

	clean = []
	for t in sorted((t for t in turns if isinstance(t, dict)), key=lambda t: -1 if _seq(t) is None else _seq(t)):
		role = t.get("role")
		seq = _seq(t)
		text = _clean(t.get("text") or "")
		if role not in ("user", "agent") or seq is None or seq < 0 or not text:
			continue
		clean.append((seq, role, text))
	if not clean:
		return 0

	from huf.ai.conversation_manager import ConversationManager

	cache = frappe.cache
	key = _turn_key(call_state)
	conv_doc = frappe.get_doc("Agent Conversation", conversation)
	provider = frappe.db.get_value("Agent", agent, "provider")
	model = frappe.db.get_value("Agent", agent, "model")
	cm = ConversationManager(agent_name=agent, channel="Chat")
	saved = 0
	for seq, role, text in clean:
		if int(cache.scard(key) or 0) >= MAX_TURNS_PER_CALL:
			break
		if not cache.sadd(key, seq):  # already stored
			continue
		cache.expire(key, TURN_SET_TTL)
		try:
			cm.add_message(
				conversation=conv_doc, role=role, content=text, provider=provider, model=model,
				agent=agent, kind="Message",
			)
		except Exception:
			cache.srem(key, seq)  # let the client retry this seq
			raise
		saved += 1
	return saved


def _seq(turn):
	try:
		return int(turn.get("seq"))
	except (TypeError, ValueError):
		return None
