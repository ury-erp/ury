"""Generate local design fixtures; never creates website or reservation records.

Run with the bench Python, optionally --site demo.smarterp.com from sites/.
With --site, only the existing public menu and table inventory are read.
"""
import argparse
import json
from pathlib import Path
from unittest.mock import patch

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parents[1]


def main():
	parser = argparse.ArgumentParser()
	parser.add_argument("--output", default="/tmp/ury-restaurant-preview")
	parser.add_argument("--site")
	args = parser.parse_args()
	from ury.www.restaurant import DAY_AR, LABELS
	data = dict(slug="smart-choice", restaurant_name="Smart Choice", theme="Olive",
		eyebrow="أهلاً بكم على مائدتنا", hero_title="لحظات تُذاق، وذكريات تبقى.",
		hero_description="مساحة تجمعنا حول الطعام، وتترك لكل لقاء نكهته الخاصة. اكتشف قائمتنا وخطط لزيارتك القادمة.",
		show_story=1, story_title="لكل مائدة حكاية", story="من أول لقاء إلى آخر فنجان، نحب التفاصيل التي تجعل وقتكم معاً أجمل.\nاختر طبقك المفضل، واجعل للمائدة حكاية جديدة.",
		show_menu=1, menu_note="قائمة توضيحية للمعاينة المحلية.", address="", phone="", phone_link="",
		enable_reservations=1, duration_minutes=90, lead_minutes=30, advance_days=30, max_guests=12,
		booking_note="طلب الحجز بانتظار تأكيد المطعم. يرجى التواصل معنا للتعديل أو الإلغاء.",
		privacy_note="نستخدم الاسم ورقم الهاتف للتواصل بشأن حجزك فقط.", seo_title="", seo_description="",
		logo="", hero_image="", story_image="", map_url="", instagram_url="", gallery=[],
		timezone="Asia/Baghdad", today="2026-09-21", last_day="2026-10-21", currency="IQD",
		hours=[dict(day=day, opens="12:00", closes="23:00") for day in DAY_AR],
		menu_items=[dict(name=name, course=course, rate=rate, special=index==0, image="") for index, (name,course,rate) in enumerate([
			("ستيك مشوي", "الأطباق الرئيسية", 24000), ("باستا بالصلصة", "الأطباق الرئيسية", 14000),
			("سلطة موسمية", "المقبلات", 8000), ("بيتزا كلاسيكية", "الأطباق الرئيسية", 16000),
			("كيكة الشوكولاتة", "الحلويات", 7000), ("قهوة مختصة", "المشروبات", 5000)])])
	tables = [{"id": f"T{index:02}", "room": "القاعة الرئيسية" if index < 5 else "التراس", "seats": 4,
		"shape": "Circle" if index % 2 else "Square", "status": "reserved" if index == 2 else "unavailable" if index == 3 else "available"} for index in range(1,9)]
	if args.site:
		import frappe
		from ury.ury.api import restaurant_website as api
		frappe.init(site=args.site)
		frappe.connect()
		try:
			restaurant = frappe.db.get_value("URY Restaurant", {}, "name")
			profile = frappe._dict({**data, "restaurant": restaurant, "language": "ar", "menu": None,
				"hours": [frappe._dict(row) for row in data["hours"]]})
			with patch.object(api, "website", return_value=profile):
				data = api.page_content("smart-choice")
			data["menu_note"] = "معاينة محلية — بيانات المنيو الحالية، ومواعيد العمل توضيحية فقط."
		finally:
			frappe.destroy()
	output = Path(args.output)
	output.mkdir(parents=True, exist_ok=True)
	env = Environment(loader=FileSystemLoader(str(ROOT / "ury" / "www")), autoescape=select_autoescape())
	env.globals["frappe"] = {"format_value": lambda value, options: f"{value:,.2f}"}
	for lang in ("ar", "en"):
		page = {**data, "language": lang}
		page["hours"] = [{**row, "label": DAY_AR[row["day"]] if lang == "ar" else row["day"]} for row in data["hours"]]
		if lang == "en":
			page.update(eyebrow="WELCOME TO OUR TABLE", hero_title="Good food. Beautiful moments.",
				hero_description="A place to gather, share a meal, and make a little time for one another.",
				story_title="Every table has a story", story="From the first hello to the last cup of coffee, it is the little details that make a visit memorable.",
				booking_note="Requests require restaurant confirmation. Contact us to change or cancel.",
				privacy_note="We use your name and phone number only to contact you about your booking.")
		labels = {key: values[0 if lang == "ar" else 1] for key,values in LABELS.items()}
		boot = json.dumps(dict(slug=page["slug"], csrfToken="local-preview", labels=labels, preview=False)).replace("<", "\\u003c")
		context = dict(page=page,text=labels,preview=False,canonical="http://localhost/restaurant?slug=smart-choice",boot_json=boot)
		(output / f"{lang}.html").write_text(env.get_template("restaurant.html").render(**context))
		(output / f"{lang}-context.json").write_text(json.dumps(context, default=str))
	(output / "tables.json").write_text(json.dumps(dict(tables=tables, until="2026-09-21 20:30:00")))
	print(f"Local fixtures: {output}/ar.html and en.html. No database changes.")


if __name__ == "__main__":
	main()
