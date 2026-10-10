"""The page a driver keeps open on their phone while they are out.

Server-rendered from a signed link, so a driver needs no account and no app.
The page itself holds nothing: every list and every button asks the server,
which checks the link again each time.
"""

import json

import frappe
from frappe.sessions import get_csrf_token

from ury.ury.api.driver_app import driver_from_token

no_cache = 1

LABELS = {
	"title": ("طلباتي", "My deliveries"),
	"tracking_on": ("موقعك يُشارَك مع المطعم الآن", "Your location is being shared with the restaurant"),
	"tracking_off": ("لا يُشارَك موقعك — لا يوجد طلب مفتوح", "Your location is not shared — no open order"),
	"tracking_denied": ("لم يُسمح بالوصول إلى الموقع. الطلبات تعمل، والخريطة لن تعرض موقعك.",
						"Location access was refused. Orders still work; the map will not show you."),
	"consent": ("يُشارَك موقعك أثناء الطلبات المفتوحة فقط، ويتوقف تلقائياً بعد التسليم.",
				"Your location is shared only while an order is open, and stops on delivery."),
	"none": ("لا توجد طلبات لديك الآن.", "You have no orders right now."),
	"depart": ("خرجت", "Departed"),
	"delivered": ("سُلّم", "Delivered"),
	"failed": ("لم يُسلّم", "Not delivered"),
	"reason": ("السبب", "Reason"),
	"send": ("إرسال", "Send"),
	"cancel": ("إلغاء", "Cancel"),
	"call": ("اتصال", "Call"),
	"navigate": ("الاتجاهات", "Directions"),
	"cash": ("تحصيل نقدي", "Collect cash"),
	"minutes": ("دقيقة", "min"),
	"error": ("تعذّر الاتصال بالمطعم. حاول مجدداً.", "Could not reach the restaurant. Try again."),
	"stop": ("إيقاف المشاركة", "Stop sharing"),
	"resume": ("استئناف المشاركة", "Resume sharing"),
	"javascript": ("يرجى تفعيل JavaScript.", "Enable JavaScript."),
}


def get_context(context):
	token = frappe.form_dict.get("t")
	driver = driver_from_token(token)

	restaurant = frappe.db.get_value("URY Restaurant", {"branch": driver.branch}, "name")
	lang = frappe.db.get_value("URY Website", {"restaurant": restaurant}, "language") if restaurant else None
	lang = lang if lang in ("ar", "en") else "ar"
	labels = {key: values[0 if lang == "ar" else 1] for key, values in LABELS.items()}

	csrf_token = get_csrf_token()
	frappe.db.commit()  # Persist the guest CSRF session, as in www/feedback.py.

	boot = {"token": token, "csrfToken": csrf_token, "labels": labels, "driver": driver.driver_name}

	context.update({
		"lang": lang,
		"text": labels,
		"driver_name": driver.driver_name,
		"boot_json": json.dumps(boot, ensure_ascii=True)
			.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026"),
	})
	return context
