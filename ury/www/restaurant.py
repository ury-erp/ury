import json

import frappe
from frappe.sessions import get_csrf_token
from frappe.utils import get_url

from ury.ury.api.restaurant_website import page_content

no_cache = 1

LABELS = {
	"skip": ("انتقل إلى المحتوى", "Skip to content"),
	"menu": ("قائمة الطعام", "Our menu"), "story": ("حكايتنا", "Our story"),
	"visit": ("زورونا", "Visit us"), "reserve": ("احجز طاولتك", "Reserve a table"),
	"explore": ("اكتشف القائمة", "Explore the menu"),
	"menu_title": ("من مطبخنا، بكل حب", "From our kitchen, with love"),
	"menu_intro": ("اختر ما يشبه ذائقتك، واترك لنا متعة تقديمه.", "Find your favourites. Let us take care of the rest."),
	"all": ("الكل", "All"), "search": ("ابحث عن طبق…", "Find a dish…"),
	"special": ("اختيار الشيف", "Chef’s choice"),
	"no_dishes": ("لا توجد أطباق مطابقة لبحثك.", "No dishes match your search."),
	"gallery": ("تفاصيل تصنع التجربة", "A little glimpse inside"),
	"booking_title": ("مكانك على مائدتنا", "A place at our table"),
	"booking_intro": ("خطط لزيارتك، واستعرض الطاولات المناسبة لموعدك.", "Plan your visit and find a table for your occasion."),
	"date": ("تاريخ الزيارة", "Visit date"), "time": ("الوقت", "Time"),
	"guests": ("عدد الأشخاص", "Guests"), "check": ("استعرض الطاولات", "Find a table"),
	"available": ("متاحة", "Available"), "reserved": ("محجوزة", "Reserved"),
	"unavailable": ("غير متاحة", "Unavailable"), "selected": ("مختارة", "Selected"),
	"choose": ("اختر موعدك أولاً لعرض الطاولات.", "Choose your visit details to see tables."),
	"pick": ("اختر طاولة متاحة لإكمال طلب الحجز.", "Select an available table to continue."),
	"none": ("لا توجد طاولة متاحة لهذا الموعد. جرّب وقتاً آخر أو تواصل معنا.", "No tables are available. Try another time or contact us."),
	"seats": ("أشخاص", "seats"), "table": ("الطاولة", "Table"),
	"details": ("تفاصيل الحجز", "Your reservation"),
	"name": ("الاسم الكامل", "Full name"), "phone": ("رقم الهاتف", "Phone number"),
	"notes": ("ملاحظات إضافية (اختياري)", "Special requests (optional)"),
	"consent": ("أوافق على استخدام بياناتي للتواصل بشأن الحجز.", "I agree to use of my details to contact me about this reservation."),
	"submit": ("إرسال طلب الحجز", "Request reservation"),
	"pending": ("طلبك بانتظار تأكيد المطعم", "Your request is awaiting confirmation"),
	"received": ("تم استلام طلبك", "Request received"),
	"success": ("احتفظ برقم الطلب. الحجز غير مؤكد حتى يتواصل معك المطعم.", "Keep your reference. Your booking is not confirmed until the restaurant contacts you."),
	"reference": ("رقم الطلب", "Reference"), "again": ("حجز آخر", "Another reservation"),
	"loading": ("جارٍ التحقق من التوفر…", "Checking availability…"),
	"sending": ("جارٍ إرسال الطلب…", "Sending your request…"),
	"error": ("تعذر إكمال الطلب. تحقق من الاتصال وحاول مجدداً.", "We couldn’t complete your request. Check your connection and retry."),
	"uncertain": ("لم يصل رد نهائي. اضغط إرسال مجدداً للتحقق من الطلب نفسه بأمان؛ لن يُسجّل مرتين. أو اتصل بالمطعم للتحقق.", "No final response received. Submit again to safely check the same request without duplicating it, or call the restaurant."),
	"invalid_window": ("يرجى اختيار موعد ضمن ساعات العمل وفترة الحجز المسموحة، بحيث تتسع الجلسة قبل الإغلاق.", "Choose a time within opening hours and the booking window, allowing a full sitting before closing."),
	"booking_error": ("تعذر تسجيل الحجز. تحقق من بياناتك وحدّث الطاولات قبل المحاولة مجدداً.", "We couldn’t record your booking. Check your details and refresh the tables before trying again."),
	"limited": ("طلبات كثيرة خلال وقت قصير. يرجى المحاولة لاحقاً أو الاتصال بالمطعم.", "Too many requests. Please try later or call the restaurant."),
	"stale": ("تغير توفر الطاولة المختارة؛ يرجى اختيار طاولة أخرى.", "Your table’s availability changed. Please choose another."),
	"updated": ("يُحدّث التوفر تلقائياً كل 30 ثانية.", "Availability refreshes every 30 seconds."),
	"timezone": ("جميع الأوقات حسب توقيت المطعم", "All times are in the restaurant’s time zone"),
	"duration": ("مدة الجلسة", "Sitting duration"), "minutes": ("دقيقة", "minutes"),
	"advance": ("الحجز المسبق بالدقائق", "Advance notice in minutes"),
	"contact": ("نتطلع لاستقبالكم", "We look forward to welcoming you"),
	"hours": ("أوقات العمل", "Opening hours"), "directions": ("الاتجاهات على الخريطة", "Get directions"),
	"call": ("اتصل بنا", "Call us"), "top": ("العودة للأعلى", "Back to top"),
	"preview": ("معاينة خاصة — احفظ التعديلات وانشر الصفحة لاستقبال الزوار. الحجز معطّل في المعاينة.", "Private preview — save and publish to welcome guests. Booking is disabled in preview."),
	"javascript": ("يرجى تفعيل JavaScript لاستخدام الحجز الإلكتروني، أو الاتصال بالمطعم.", "Enable JavaScript for online reservations, or call the restaurant."),
}
DAY_AR = dict(zip(("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"),
				 ("الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد")))


def get_context(context):
	preview = frappe.form_dict.get("preview") == "1"
	page = page_content(frappe.form_dict.get("slug"), preview=preview)
	if preview:
		# Let managers inspect the reservation design before configuring hours.
		page["enable_reservations"] = 1
	lang = page["language"]
	labels = {key: values[0 if lang == "ar" else 1] for key, values in LABELS.items()}
	for hours in page["hours"]:
		hours["label"] = DAY_AR[hours["day"]] if lang == "ar" else hours["day"]
	csrf_token = get_csrf_token()
	frappe.db.commit()  # Persist the guest CSRF session, as in www/order.py.
	boot = {"slug": page["slug"], "csrfToken": csrf_token, "labels": labels, "preview": preview}
	context.update({"page": page, "text": labels, "preview": preview,
		"canonical": get_url("/restaurant?slug=" + page["slug"]),
		"boot_json": json.dumps(boot, ensure_ascii=True).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")})
	return context
