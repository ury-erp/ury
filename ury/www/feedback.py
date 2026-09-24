"""The page a guest lands on from a receipt or a table card.

Rendered server-side from a signed token so the page itself needs no session
and no account. It deliberately shows nothing about the bill — the link can
be forwarded or left on the table, and what someone ate is not the reward for
finding it.
"""

import json

import frappe
from frappe.sessions import get_csrf_token

from ury.ury.api.feedback import read_token, _context_for

no_cache = 1

LABELS = {
	"title": ("كيف كانت زيارتك؟", "How was your visit?"),
	"intro": ("رأيك يصل مباشرة إلى إدارة المطعم.", "Your answer goes straight to the restaurant's management."),
	"overall": ("تقييمك العام", "Overall"),
	"food": ("الطعام", "Food"),
	"service": ("الخدمة", "Service"),
	"cleanliness": ("النظافة", "Cleanliness"),
	"recommend": ("هل توصي بنا صديقاً؟", "Would you recommend us to a friend?"),
	"not_likely": ("لا أنصح", "Not likely"),
	"very_likely": ("أنصح بشدة", "Very likely"),
	"comment": ("أخبرنا المزيد (اختياري)", "Tell us more (optional)"),
	"contact": ("رقم للتواصل، إن أحببت أن نرد عليك", "A number, if you would like us to reply"),
	"submit": ("إرسال", "Send"),
	"sending": ("جارٍ الإرسال…", "Sending…"),
	"thanks": ("شكراً لك", "Thank you"),
	"thanks_note": ("وصل تقييمك. نقرأ كل ملاحظة.", "Your rating reached us. We read every one."),
	"already": ("تم استلام تقييم لهذه الزيارة مسبقاً. شكراً لك.", "A rating for this visit was already received. Thank you."),
	"sorry": ("نأسف أن الزيارة لم تكن كما ينبغي. سنتواصل معك إن تركت رقمك.",
			  "We are sorry this visit fell short. We will be in touch if you left a number."),
	"error": ("تعذّر الإرسال. تحقق من الاتصال وحاول مجدداً.", "We could not send that. Check your connection and try again."),
	"required": ("اختر تقييمك العام أولاً.", "Choose an overall rating first."),
	"stars": ("نجوم", "stars"),
	"javascript": ("يرجى تفعيل JavaScript لإرسال التقييم.", "Enable JavaScript to send your rating."),
}


def get_context(context):
	token = frappe.form_dict.get("t")
	scope, reference = read_token(token)
	page = _context_for(scope, reference)

	# Follow the restaurant's own public page when it has one, so a guest who
	# read the menu in English is not handed an Arabic form.
	restaurant = frappe.db.get_value("URY Restaurant", {"branch": page["branch"]}, "name")
	lang = frappe.db.get_value("URY Website", {"restaurant": restaurant}, "language") if restaurant else None
	lang = lang if lang in ("ar", "en") else "ar"
	labels = {key: values[0 if lang == "ar" else 1] for key, values in LABELS.items()}

	restaurant_name = frappe.db.get_value("Branch", page["branch"], "branch") or ""
	csrf_token = get_csrf_token()
	frappe.db.commit()  # Persist the guest CSRF session, as in www/restaurant.py.

	boot = {
		"token": token,
		"csrfToken": csrf_token,
		"labels": labels,
		"alreadySubmitted": bool(page["already_submitted"]),
	}

	context.update({
		"lang": lang,
		"text": labels,
		"restaurant_name": restaurant_name,
		"already_submitted": page["already_submitted"],
		"boot_json": json.dumps(boot, ensure_ascii=True)
			.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026"),
	})
	return context
