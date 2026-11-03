"""Chairman Brief over WhatsApp: inbound handler + reply orchestration (WP4).

Flow (runs as a background job, see `on_incoming`):
  inbound -> dedup (Meta message id, redis 24h) -> 24h window check -> identity
  (chairman_wa_identity.resolve) -> STOP / LINK commands -> set the linked chairman for the
  duration of the turn (always restored in `finally`) -> same rate limits / policy as the PWA chat
  (chairman_chat) -> fast path or agent -> sanitize cards (aggregates only) -> PNG per card
  (chairman_card_png.render, max 3) -> send through an injectable sender -> audit row without content.

`process()` is pure orchestration over a runtime object and a sender, so it is unit-testable with
`python3 -m unittest` (no frappe). `FrappeRuntime` and `BridgeSender` are the real implementations.
"""

import hashlib
import json
import re
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta

CARD_PREFIX = "ury-brief-card-"  # chairman_jobs.purge_cards matches this prefix (+ .png)
AUDIT_DOCTYPE = "Chairman WhatsApp Audit"
LINK_DOCTYPE = "Chairman WhatsApp Link"
ACCOUNT_CONF_KEY = "ury_chairman_whatsapp_account"  # site_config: WhatsApp Account name(s); unset = channel off
FORBIDDEN_USERS = ("Administrator", "Guest")
DEDUP_TTL_SECONDS = 24 * 3600
WINDOW = timedelta(hours=24)
MAX_CARDS = 3
MAX_TEXT_CHARS = 600
CAPTION_MAX = 1000  # Meta image caption cap is 1024
UNKNOWN_RATE_LIMIT = 1  # neutral replies per number per minute
AUDIO_WAIT_TRIES = 10  # frappe_whatsapp attaches the media File after the message row is inserted
AUDIO_WAIT_SECONDS = 1.0

TEXT_KINDS = ("text", "button")
IGNORED_KINDS = ("reaction", "status", "unknown", "system", "ephemeral")

MESSAGES = {
	"neutral": "This number is not registered.",
	"stopped": "You are disconnected. Re-link from the Brief app to use this chat again.",
	"linked": "Linked. You can now ask for sales, dishes, payments and more.",
	"link_failed": "That code did not work. Check the code in the Brief app and try again.",
	"already_linked": "This number is already linked.",
	"rate_limited": "Too many requests. Please wait a minute and try again.",
	"not_permitted": "I can't help with that from this number.",
	"unsupported": "I can read text and voice notes.",
	"failed": "I could not prepare that. Please try again.",
	"empty": "No figures found.",
}

_BANNED = re.compile(r"(customer|employee|cashier|waiter|supplier|salary|payroll|staff member)", re.I)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(r"(?<![\w])\+?\d[\d\s().-]{6,}\d(?![\w])")
_URL = re.compile(r"(?:https?://|www\.)\S+", re.I)
_DOC_ID = re.compile(r"\b[A-Z]{2,8}-(?:[A-Z0-9]{2,6}-)*\d{3,}\b")
_SENTENCE = re.compile(r"(?<=[.!?؟।])\s+|\n+")
_STOP = re.compile(r"^\W*stop\W*$", re.I)
_LINK = re.compile(r"^\W*link\W*([\d\s-]{4,12})\W*$", re.I)


# ----------------------------------------------------------------- data shapes
@dataclass
class Inbound:
	message_id: str
	sender: str  # E.164 digits as sent by Meta
	kind: str  # text | audio | other | ignored
	text: str = ""
	ts: datetime = None  # doc form: WhatsApp Message.creation (site tz)
	epoch: int = None  # payload form: Meta unix timestamp (tz-free)
	account: str = None  # WhatsApp Account name
	phone_id: str = None
	media_id: str = None
	message_name: str = None  # WhatsApp Message docname (doc form)
	attach: str = None  # file_url of the downloaded media (doc form)


@dataclass
class Turn:
	reply: str = ""
	cards: list = field(default_factory=list)
	conversation: str = None
	intent: str = None
	fast_path: bool = False
	lang: str = "en"


class ChannelError(Exception):
	"""kind in rate_limited | not_permitted | invalid | failed (no detail is ever shown to the sender)."""

	def __init__(self, kind):
		super().__init__(kind)
		self.kind = kind


# ------------------------------------------------------------------ pure helpers
def normalize_number(raw):
	digits = re.sub(r"\D", "", str(raw or ""))
	if digits.startswith("00"):
		digits = digits[2:]
	return digits if 8 <= len(digits) <= 15 else None


def mask_number(num):
	n = normalize_number(num) or ""
	return ("*" * max(len(n) - 4, 0)) + n[-4:]


def parse_command(text):
	"""-> ("stop", None) | ("link", "123456") | (None, None). Whole-message match only."""
	t = (text or "").strip()
	if _STOP.match(t):
		return "stop", None
	m = _LINK.match(t)
	if m:
		code = re.sub(r"\D", "", m.group(1))
		if len(code) == 6:
			return "link", code
	return None, None


def _epoch(value):
	try:
		return int(value)
	except (TypeError, ValueError):
		return None


def parse_webhook(payload):
	"""Meta Cloud API webhook JSON -> [Inbound]. Status-only payloads give []. Never raises."""
	out = []
	if isinstance(payload, str):
		try:
			payload = json.loads(payload)
		except ValueError:
			return out
	entries = (payload or {}).get("entry") if isinstance(payload, dict) else None
	if isinstance(entries, dict):  # frappe_whatsapp tolerates a bare object
		entries = [entries]
	for entry in entries or []:
		changes = (entry or {}).get("changes")
		if isinstance(changes, dict):
			changes = [changes]
		for change in changes or []:
			value = (change or {}).get("value") or {}
			phone_id = (value.get("metadata") or {}).get("phone_number_id")
			for msg in value.get("messages") or []:
				mtype = msg.get("type")
				base = dict(
					message_id=str(msg.get("id") or ""),
					sender=str(msg.get("from") or ""),
					epoch=_epoch(msg.get("timestamp")),
					phone_id=phone_id,
				)
				if not base["message_id"] or not base["sender"]:
					continue
				if mtype == "text":
					out.append(Inbound(kind="text", text=(msg.get("text") or {}).get("body") or "", **base))
				elif mtype == "button":
					out.append(Inbound(kind="text", text=(msg.get("button") or {}).get("text") or "", **base))
				elif mtype == "audio":
					out.append(Inbound(kind="audio", media_id=(msg.get("audio") or {}).get("id"), **base))
				elif mtype in IGNORED_KINDS:
					out.append(Inbound(kind="ignored", **base))
				else:
					out.append(Inbound(kind="other", **base))
	return out


def inbound_from_doc(doc):
	"""WhatsApp Message (Incoming) doc/dict -> Inbound, or None when not ours to handle."""
	get = doc.get if hasattr(doc, "get") else (lambda k, d=None: getattr(doc, k, d))
	if get("type") != "Incoming":
		return None
	ctype = (get("content_type") or "text").lower()
	kind = "text" if ctype in TEXT_KINDS else "audio" if ctype == "audio" else "ignored" if ctype in IGNORED_KINDS else "other"
	return Inbound(
		message_id=str(get("message_id") or ""),
		sender=str(get("from") or ""),
		kind=kind,
		text=get("message") or "" if kind == "text" else "",
		ts=get("creation"),
		account=get("whatsapp_account"),
		message_name=get("name"),
		attach=get("attach"),
	)


def redact_text(text, limit=MAX_TEXT_CHARS):
	"""Free-text filter for WhatsApp replies: drop sentences that mention customers/employees/
	cashiers/waiters, then mask emails, phones, URLs and document ids."""
	kept = [s for s in _SENTENCE.split(str(text or "")) if s and not _BANNED.search(s)]
	t = " ".join(kept)
	t = _URL.sub("", _EMAIL.sub("", t))
	t = _DOC_ID.sub("", t)
	t = _PHONE.sub("", t)
	t = re.sub(r"[ \t]{2,}", " ", t).strip()
	return t[:limit].rstrip()


def _clean_str(v):
	return redact_text(v, 200) if isinstance(v, str) else v


def _sanitize_cells(card):
	cols = list(card.get("cols") or [])
	keep = [i for i, c in enumerate(cols) if not _BANNED.search(str(c))]
	if not keep:
		return None
	rows = []
	for r in card.get("rows") or []:
		rows.append([_clean_str(r[i]) for i in keep if i < len(r)])
	if not rows:
		return None
	card["cols"] = [cols[i] for i in keep]
	card["rows"] = rows
	return card


def sanitize_card(card):
	"""Aggregates only. Returns a cleaned deep copy, or None when nothing safe remains.
	Drops: table columns / kpi items / series points whose label names a customer, employee,
	cashier, waiter or supplier; any card whose own title/subtitle does; document links."""
	if not isinstance(card, dict):
		return None
	c = json.loads(json.dumps(card))
	c.pop("link", None)
	if _BANNED.search(str(c.get("title") or "")) or _BANNED.search(str(c.get("subtitle") or "")):
		return None
	for key in ("title", "subtitle", "subtext", "footnote"):
		if key in c:
			c[key] = _clean_str(c[key])
	ctype = c.get("type")
	if ctype == "dashboard":
		panels = []
		for p in c.get("panels") or []:
			inner = sanitize_card(p.get("card"))
			if inner is None:
				continue
			p = dict(p, card=inner)
			for key in ("title", "subtitle", "caption"):
				if key in p:
					if _BANNED.search(str(p[key])):
						p.pop(key)
					else:
						p[key] = _clean_str(p[key])
			panels.append(p)
		if not panels:
			return None
		if len(panels) == 1:
			return panels[0]["card"]
		c["panels"] = panels
		return c
	if ctype == "kpi":
		c["kpis"] = [k for k in c.get("kpis") or [] if not _BANNED.search(str(k.get("label")))]
		return c if c["kpis"] else None
	if ctype in ("bar", "line"):
		c["series"] = [p for p in c.get("series") or [] if not _BANNED.search(str(p.get("label")))]
		return c if len(c["series"]) >= (2 if ctype == "line" else 1) else None
	if ctype == "table":
		return _sanitize_cells(c)
	return None


def card_hash(card):
	return hashlib.sha256(json.dumps(card, sort_keys=True, default=str).encode()).hexdigest()[:16]


@contextmanager
def impersonate(user, set_user, get_user):
	"""Run as `user`; ALWAYS restore the original session user (also when the body raises)."""
	if not user or user in FORBIDDEN_USERS:
		raise PermissionError("refusing to impersonate %r" % (user,))
	original = get_user()
	set_user(user)
	try:
		yield user
	finally:
		set_user(original)


# ------------------------------------------------------------------ orchestration
def process(inb, rt, sender):
	"""Handle one inbound message. Returns an outcome string (also written to the audit row)."""
	if not inb.message_id or inb.kind == "ignored":
		return "ignored"
	if not rt.claim(inb.message_id):
		return "duplicate"
	number = normalize_number(inb.sender)
	audit = {"message_id": inb.message_id, "wa_number": mask_number(inb.sender), "kind": inb.kind}
	outcome = "error"
	try:
		if not number:
			outcome = "ignored"
			return outcome
		now = rt.now()
		age = rt.age_seconds(inb)
		if age is not None and age > WINDOW.total_seconds():
			rt.log("whatsapp reply skipped: outside 24h window (%s)" % audit["wa_number"])
			outcome = "window_closed"
			return outcome

		def send_text(text):
			sender.send_text(to=number, text=text, reply_to=inb.message_id, account=inb.account)

		cmd, arg = parse_command(inb.text) if inb.kind == "text" else (None, None)
		user = rt.resolve(number)
		if not user:
			outcome = _unlinked(inb, number, cmd, arg, rt, send_text)
			return outcome
		audit["user"] = user
		rt.touch_inbound(number, now)
		if cmd == "stop":
			rt.revoke(number)
			send_text(MESSAGES["stopped"])
			outcome = "revoked"
			return outcome
		if cmd == "link":
			send_text(MESSAGES["already_linked"])
			outcome = "already_linked"
			return outcome
		if inb.kind == "other":
			send_text(MESSAGES["unsupported"])
			outcome = "unsupported"
			return outcome
		outcome = _answer(inb, number, user, rt, sender, audit)
		return outcome
	except Exception as exc:  # never leak details to the sender; the audit row carries only a code
		outcome = "send_failed" if isinstance(exc, SendError) else "error"
		rt.log("whatsapp handler failed: %s" % type(exc).__name__)
		if outcome == "error":
			try:  # best effort: tell the sender something went wrong (no detail)
				sender.send_text(to=number or inb.sender, text=MESSAGES["failed"], reply_to=inb.message_id, account=inb.account)
			except Exception:
				pass
		return outcome
	finally:
		audit["outcome"] = outcome
		rt.audit(audit)


def _unlinked(inb, number, cmd, code, rt, send_text):
	if cmd == "link":
		pending = rt.pending_link(number)
		if pending:
			res = rt.verify_otp(pending, code)
			send_text(MESSAGES["linked"] if res.get("ok") else MESSAGES["link_failed"])
			return "linked" if res.get("ok") else "link_failed"
	if not rt.unknown_rate_ok(number):
		return "unknown_rate_limited"
	send_text(MESSAGES["neutral"])
	return "unknown_number"


def _answer(inb, number, user, rt, sender, audit):
	pngs, turn = [], None
	try:
		with rt.as_user(user):
			turn = rt.run_turn(user, inb)
			audit.update(intent=turn.intent, fast_path=int(bool(turn.fast_path)))
			cards = [c for c in (sanitize_card(c) for c in turn.cards) if c][:MAX_CARDS]
			for card in cards:
				try:
					png = rt.render(card, turn.lang)
				except Exception:
					rt.log("card render failed")
					continue
				rt.store_card(turn.conversation, png)
				pngs.append((png, card_hash(card)))
	except ChannelError as err:
		key = err.kind if err.kind in MESSAGES else "failed"
		sender.send_text(to=number, text=MESSAGES[key], reply_to=inb.message_id, account=inb.account)
		return "refused_" + err.kind
	text = redact_text(turn.reply) or (MESSAGES["empty"] if not pngs else "")
	audit.update(card_count=len(pngs), card_hash=",".join(h for _, h in pngs))
	if pngs:
		for i, (png, _h) in enumerate(pngs):
			caption = text[:CAPTION_MAX] if i == 0 else ""
			sender.send_image(
				to=number, png=png, caption=caption, filename="brief-%d.png" % (i + 1),
				reply_to=inb.message_id if i == 0 else None, account=inb.account,
			)
	else:
		sender.send_text(to=number, text=text, reply_to=inb.message_id, account=inb.account)
	return "answered"


# ------------------------------------------------------------------ real sender
class SendError(Exception):
	pass


class BridgeSender:
	"""Default sender: Huf's whatsapp_bridge (media is UPLOADED to Meta, so no image URL is exposed).
	Called after the impersonation ends, from the job's own user, with trusted=True (gateway reply path)."""

	def _bridge(self):
		from huf.ai.gateway_adapters import whatsapp_bridge

		return whatsapp_bridge

	def _account(self, account):
		if account:
			return account
		import frappe

		conf = frappe.conf.get(ACCOUNT_CONF_KEY)
		return conf[0] if isinstance(conf, (list, tuple)) else conf

	def send_text(self, to, text, reply_to=None, account=None):
		try:
			return self._bridge().send_text(self._account(account), to, text, reply_to=reply_to, trusted=True)
		except Exception as exc:
			raise SendError(type(exc).__name__) from exc

	def send_image(self, to, png, caption="", filename="brief.png", reply_to=None, account=None):
		b = self._bridge()
		acct = self._account(account)
		try:
			up = b.upload_media(acct, png, "image/png", filename, kind="image", trusted=True)
			return b.send_media(
				acct, to, "image", media_id=up["media_id"], caption=caption or None,
				reply_to=reply_to, trusted=True,
			)
		except Exception as exc:
			raise SendError(type(exc).__name__) from exc


# ------------------------------------------------------------------ real runtime
def _mod(dotted, short):
	import importlib

	try:
		return importlib.import_module("ury.ury.api." + dotted)
	except ImportError:
		return importlib.import_module(short)


class FrappeRuntime:
	def __init__(self):
		import frappe

		self.f = frappe

	# modules (lazy)
	def _chat(self):
		return _mod("chairman_chat", "chairman_chat")

	def _identity(self):
		return _mod("chairman_wa_identity", "chairman_wa_identity")

	def now(self):
		return self.f.utils.now_datetime()

	def age_seconds(self, inb):
		import time

		if inb.epoch:
			return time.time() - inb.epoch
		if inb.ts:
			return (self.now() - inb.ts).total_seconds()
		return None

	def log(self, msg):
		self.f.logger("ury.chairman_whatsapp").info(msg)

	def claim(self, message_id):
		cache = self.f.cache
		key = cache.make_key("ury_chairman_wa_msg:" + message_id)
		return bool(cache.set(key, "1", nx=True, ex=DEDUP_TTL_SECONDS))

	def resolve(self, number):
		return self._identity().resolve(number)

	def pending_link(self, number):
		return self.f.db.get_value(LINK_DOCTYPE, {"wa_number": number, "status": "Pending"}, "name")

	def verify_otp(self, link, code):
		return self._identity().verify_otp(link, code)

	def revoke(self, number):
		return self._identity().revoke_for_number(number, "STOP")

	def touch_inbound(self, number, now):
		self.f.db.set_value(LINK_DOCTYPE, {"wa_number": number, "status": "Active"}, "last_inbound", now, update_modified=False)

	def unknown_rate_ok(self, number):
		try:
			self._chat().rate_check("wa_unknown", UNKNOWN_RATE_LIMIT, user=number)
			return True
		except Exception:
			return False

	def as_user(self, user):
		return impersonate(user, self.f.set_user, lambda: self.f.session.user)

	def render(self, card, lang):
		return _mod("chairman_card_png", "chairman_card_png").render(card, lang, "light")

	def store_card(self, conversation, png):
		if not conversation:
			return None
		doc = self.f.get_doc(
			{
				"doctype": "File",
				"file_name": "%s%s.png" % (CARD_PREFIX, uuid.uuid4().hex),
				"is_private": 1,
				"content": png,
				"attached_to_doctype": "Agent Conversation",
				"attached_to_name": conversation,
			}
		).insert(ignore_permissions=True)
		return doc.name

	def audit(self, row):
		try:
			doc = {k: row.get(k) for k in ("message_id", "wa_number", "user", "kind", "intent", "fast_path", "card_count", "card_hash", "outcome")}
			self.f.get_doc({"doctype": AUDIT_DOCTYPE, **{k: v for k, v in doc.items() if v is not None}}).insert(ignore_permissions=True)
		except Exception:
			self.f.log_error(self.f.get_traceback(), "URY chairman whatsapp: audit failed")

	# --- the turn (runs inside impersonate(): session user is the chairman)
	def _conversation(self, agent):
		chat, f = self._chat(), self.f
		since = f.utils.add_to_date(self.now(), hours=-24)
		name = f.db.get_value(
			"Agent Conversation",
			{"owner": f.session.user, "agent": agent, "modified": [">", since]},
			"name",
			order_by="modified desc",
		)
		if name:
			try:
				chat._own_conversation(name, agent)
				chat._assert_conversation_room(name)
				return name
			except Exception:
				pass
		return chat._new_conversation(agent)

	def _audio_bytes(self, inb):
		"""(content, mime). Payload form: own authenticated download via the bridge (no public File).
		Doc form: the File frappe_whatsapp attached (it lands after the row insert, so wait briefly)."""
		import mimetypes
		import time

		f, chat = self.f, self._chat()
		if inb.media_id:
			from huf.ai.gateway_adapters import whatsapp_bridge as b

			res = b.download_media(inb.account, inb.media_id, max_bytes=chat.MAX_AUDIO_BYTES, allowed_mime_prefixes=("audio/",), kind="audio")
			return res["content"], res["mime_type"]
		attach = inb.attach
		for _ in range(AUDIO_WAIT_TRIES):
			if attach:
				break
			f.db.rollback()  # refresh the REPEATABLE READ snapshot
			attach = f.db.get_value("WhatsApp Message", inb.message_name, "attach")
			if not attach:
				time.sleep(AUDIO_WAIT_SECONDS)
		if not attach:
			raise ChannelError("invalid")
		name = f.db.get_value("File", {"file_url": attach}, "name")
		fdoc = f.get_doc("File", name)
		content = fdoc.get_content()
		mime = mimetypes.guess_type(fdoc.file_name or "")[0] or "audio/" + (fdoc.file_name or "").rsplit(".", 1)[-1]
		if isinstance(content, str):
			content = content.encode()
		# frappe_whatsapp stores it as a PUBLIC file; we hold our own private copy, so drop the public one.
		try:
			f.delete_doc("File", name, ignore_permissions=True, force=True)
		except Exception:
			self.log("could not delete public inbound audio file")
		return content, mime

	def _transcribe(self, inb, agent, conversation, lang):
		chat, f = self._chat(), self.f
		chat.rate_check("audio", chat.RATE_LIMIT_AUDIO, user=f.session.user)
		content, mime = self._audio_bytes(inb)
		ext = chat.validate_audio(content, mime)
		fdoc = f.get_doc(
			{
				"doctype": "File",
				"file_name": chat.voice_file_name(ext),
				"is_private": 1,
				"content": content,
				"attached_to_doctype": "Agent Conversation",
				"attached_to_name": conversation,
			}
		).insert(ignore_permissions=True)
		from huf.ai.audio_service import transcribe_audio_file

		res = transcribe_audio_file(file_id=fdoc.name, agent_name=agent, language=chat.normalize_language(lang))
		text = ((res or {}).get("text") or (res or {}).get("transcript") or "").strip()
		if not (res or {}).get("success") or not text or text == "[Silence]":
			raise ChannelError("invalid")
		return text

	def run_turn(self, user, inb):
		f, chat = self.f, self._chat()
		chairman = _mod("chairman", "chairman")
		router = chat._router_mod()
		try:
			chairman._check_role()
			agent = chat._require_agent()
			conversation = self._conversation(agent)
			if inb.kind == "audio":
				text = self._transcribe(inb, agent, conversation, None)
			else:
				text = chat.validate_message(inb.text)
			chat.rate_check("msg", chat.RATE_LIMIT_MESSAGES, user=user)
			lang = router.detect_language(text)
			run, cards, fast = chat.run_turn(agent, conversation, text, lang)
		except ChannelError:
			raise
		except f.PermissionError:
			raise ChannelError("not_permitted")
		except getattr(f, "TooManyRequestsError", ()):  # before ValidationError: it may subclass it
			raise ChannelError("rate_limited")
		except f.ValidationError:
			raise ChannelError("invalid")
		reply = (run or {}).get("response") if isinstance(run, dict) else ""
		return Turn(
			reply=reply or "", cards=cards or [], conversation=conversation,
			intent=(run or {}).get("intent") if isinstance(run, dict) else None,
			fast_path=bool(fast), lang=lang,
		)


# ------------------------------------------------------------------ entry points
def _configured_accounts():
	import frappe

	conf = frappe.conf.get(ACCOUNT_CONF_KEY)
	if not conf:
		return ()
	return tuple(conf) if isinstance(conf, (list, tuple)) else (conf,)


def on_incoming(doc, method=None):
	"""doc_events hook: WhatsApp Message after_insert. Off unless site_config sets
	`ury_chairman_whatsapp_account` and the message arrived on that WhatsApp Account."""
	import frappe

	if doc.get("type") != "Incoming" or doc.get("whatsapp_account") not in _configured_accounts():
		return
	if (doc.get("content_type") or "text").lower() in IGNORED_KINDS:
		return
	frappe.enqueue(
		"ury.ury.api.chairman_whatsapp.handle_incoming",
		queue="short",
		timeout=300,
		enqueue_after_commit=True,
		job_id="ury_wa_in_" + str(doc.get("message_id") or doc.name),
		deduplicate=True,
		message_name=doc.name,
	)


def handle_incoming(message_name=None, payload=None, account=None, sender=None, runtime=None):
	"""Background job. Give either `message_name` (WhatsApp Message docname) or a raw Meta `payload`.
	`sender`/`runtime` are injectable for tests. Returns [outcome, ...]."""
	rt = runtime or FrappeRuntime()
	sender = sender or BridgeSender()
	inbounds = []
	if message_name:
		import frappe

		inb = inbound_from_doc(frappe.get_doc("WhatsApp Message", message_name))
		inbounds = [inb] if inb else []
	elif payload:
		inbounds = parse_webhook(payload)
		for inb in inbounds:
			inb.account = account or (rt.account_for_phone_id(inb.phone_id) if hasattr(rt, "account_for_phone_id") else None)
	outcomes = []
	for inb in inbounds:
		if account and not inb.account:
			inb.account = account
		outcomes.append(process(inb, rt, sender))
	if not runtime:
		rt.f.db.commit()  # nosemgrep: background job, persist audit/File rows
	return outcomes


def _account_for_phone_id(self, phone_id):
	if not phone_id:
		return None
	try:
		from frappe_whatsapp.utils import get_whatsapp_account

		acct = get_whatsapp_account(phone_id)
		return acct.name if acct else None
	except Exception:
		return None


FrappeRuntime.account_for_phone_id = _account_for_phone_id
