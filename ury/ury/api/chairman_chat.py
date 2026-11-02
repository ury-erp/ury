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
#      tools (WP H2): it raises unless the session user holds URY Chairman,
#      is not Administrator/Guest, and owns the conversation. So even a run
#      that somehow drained as Administrator cannot read data.
#   No frappe.set_user impersonation is used anywhere.
# ======================================================================
#
# Huf is a SOFT dependency: it is imported lazily; without it (or without a
# configured agent) start() returns {"enabled": False}.

import asyncio
import base64
import binascii
import uuid

import frappe
from frappe import _

try:
	from ury.ury.api.chairman import ALLOWED_ROLES, _check_role
except ImportError:  # pure unit run from this directory
	from chairman import ALLOWED_ROLES, _check_role

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
	code = normalize_language(language)
	if not code:
		return message
	name = SUPPORTED_LANGUAGES[code]
	return f"{message}\n\n[Language: {name}. Reply in {name}.]"


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
		frappe.throw(_("Chairman chat is not enabled"), frappe.ValidationError)
	from huf.ai.agent.access import assert_agent_access

	assert_agent_access(frappe.get_doc("Agent", agent), user=frappe.session.user)
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

	result = run_agent_sync(
		agent_name=agent,
		prompt=prompt,
		provider=frappe.db.get_value("Agent", agent, "provider"),
		model=frappe.db.get_value("Agent", agent, "model"),
		channel_id="Chat",
		conversation_id=conversation,
		now=1,
	)
	if isinstance(result, dict) and (result.get("queued") or result.get("status") == "Queued"):
		if result.get("agent_run_id"):
			_fail_run(result["agent_run_id"], "URY chairman chat refuses queued execution")
		frappe.throw(
			_("Chairman chat cannot guarantee the run executes as you; refused."),
			frappe.ValidationError,
		)
	return result


# ---------------------------------------------------------------- tool guard (for WP H2)


def assert_chairman_tool_context(conversation_id=None):
	"""Call at the top of every chairman agent tool. Fails closed unless the tool
	executes as an URY Chairman who owns the conversation (never Administrator)."""
	user = frappe.session.user
	if user in FORBIDDEN_TOOL_USERS or not (set(frappe.get_roles(user)) & set(ALLOWED_ROLES)):
		frappe.throw(_("Chairman tools must run as the chairman"), frappe.PermissionError)
	if conversation_id:
		owner = frappe.db.get_value("Agent Conversation", conversation_id, "owner")
		if owner != user:
			frappe.throw(_("Chairman tools must run as the conversation owner"), frappe.PermissionError)
	return user


# ---------------------------------------------------------------- endpoints


@frappe.whitelist(methods=["GET", "POST"])
def call_capabilities():
	_check_role()
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
	out = {"enabled": True, "conversation_id": conversation, "run": None}
	if message and str(message).strip():
		out["run"] = _run_inline(agent, conversation, with_language_hint(message, language))
	return out


@frappe.whitelist(methods=["POST"])
def send(conversation, message, language=None):
	_check_role()
	agent = _require_agent()
	_own_conversation(conversation, agent)
	if not message or not str(message).strip():
		frappe.throw(_("message is required"), frappe.ValidationError)
	return {
		"conversation_id": conversation,
		"run": _run_inline(agent, conversation, with_language_hint(message, language)),
	}


@frappe.whitelist(methods=["GET", "POST"])
def history(conversation, limit=200):
	_check_role()
	agent = _require_agent()
	_own_conversation(conversation, agent)
	from huf.ai.agent.chat import get_history

	frappe.local.response_headers["Cache-Control"] = "no-store"
	return get_history(conversation_id=conversation, limit=min(int(limit or 200), 500))


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
	agent = _require_agent()
	if conversation:
		_own_conversation(conversation, agent)

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

	return {
		"success": True,
		"conversation_id": conversation,
		"transcript": transcript,
		"language": lang or res.get("language"),
		"run": _run_inline(agent, conversation, with_language_hint(transcript, lang)),
	}


@frappe.whitelist(methods=["POST"])
def speak(message_id):
	_check_role()
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
	if not res or not res.get("success"):
		return {"success": False, "error": (res or {}).get("error") or "Speech generation failed"}
	audio = res.get("audio") or {}
	fmt = (audio.get("format") or "mp3").lower()
	huf_file = frappe.get_doc("File", audio["file_id"])
	content = huf_file.get_content()
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
	frappe.delete_doc("File", huf_file.name, ignore_permissions=True, force=True)
	return {
		"success": True,
		"audio_url": ours.file_url,
		"mime": f"audio/{'mpeg' if fmt == 'mp3' else fmt}",
	}
