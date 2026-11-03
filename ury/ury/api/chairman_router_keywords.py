# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
"""Keyword tables for the Chairman fast-path router (EN / HI / AR / ML + Hinglish / Manglish).

Pure data, no imports. chairman_router.normalize() is applied to every entry at load time, so
spelling here only has to be roughly right. Entry syntax (Latin entries):
  "word"    whole word or phrase
  "stem*"   word starting with stem
Non-Latin entries match as substrings of the normalised text. A leading "=" forces a
whole-token match (used for short words that are substrings of other words).
"""

# intent -> language -> keywords. Order of intents is irrelevant.
INTENT_KEYWORDS = {
	"sales_day": {
		"en": ["sales", "sails", "revenue", "revenu", "takings", "turnover", "income", "how did we do", "how much did we make", "how much we made", "sold"],
		"hi": ["बिक्री", "सेल", "सेल्स", "रेवेन्यू", "कमाई", "आमदनी", "bikri", "sale", "kamai", "kitna bika", "kitna becha"],
		"ar": ["مبيعات", "ايرادات", "الايراد", "دخل اليوم", "كم بعنا"],
		"ml": ["വിൽപന", "വിൽപ്പന", "വില്പന", "വരുമാനം", "സെയിൽസ്", "വിറ്റു", "vilpana", "varumanam", "sales"],
	},
	"mtd_vs_target": {
		"en": ["mtd", "month to date", "target", "targets"],
		"hi": ["एमटीडी", "इस महीने तक", "टारगेट", "लक्ष्य", "target"],
		"ar": ["منذ بداية الشهر", "هدف", "الهدف", "اهداف"],
		"ml": ["ലക്ഷ്യം", "ടാർഗറ്റ്", "ടാർഗെറ്റ്", "മാസാരംഭം മുതൽ"],
	},
	"top_dishes": {
		"en": ["top dishes", "top dish", "top items", "top item", "top selling", "best selling", "best seller*", "bestseller*", "popular dishes", "popular items", "worst dishes", "worst selling", "slowest selling", "slow movers", "which dishes sell", "top 5 dishes", "top 10 dishes"],
		"hi": ["टॉप डिश", "बेस्ट सेलिंग", "सबसे ज्यादा बिकने", "सबसे ज़्यादा बिकने", "सबसे कम बिकने", "लोकप्रिय डिश", "top dish*", "best selling"],
		"ar": ["الاطباق الاكثر", "اكثر الاطباق", "افضل الاطباق", "الاكثر مبيعا", "اقل الاطباق", "الاصناف الاكثر"],
		"ml": ["ഏറ്റവും കൂടുതൽ വിൽക്കുന്ന", "ഏറ്റവും കൂടുതൽ വിറ്റ", "ടോപ് ഡിഷ്", "ടോപ്പ് ഡിഷ്", "ജനപ്രിയ", "ഏറ്റവും കുറവ് വിൽക്കുന്ന"],
	},
	"cancellations": {
		"en": ["cancel*", "voided orders", "void orders"],
		"hi": ["कैंसल", "कैन्सल", "रद्द", "रद्", "cancel*"],
		"ar": ["الغاء", "الغيت", "ملغ"],
		"ml": ["റദ്ദ", "കാൻസൽ", "കാൻസല്", "cancel*"],
	},
	"kitchen_speed": {
		"en": ["kitchen", "prep time", "preparation time", "kot time", "ticket time", "how fast is the food", "serving time", "service speed"],
		"hi": ["किचन", "रसोई", "kitchen", "khana kitni der"],
		"ar": ["المطبخ", "مطبخ", "وقت التحضير"],
		"ml": ["അടുക്കള", "കിച്ചൻ", "കിച്ചന്", "kitchen"],
	},
	"payment_mix": {
		"en": ["payment*", "paying", "order type*", "order mix", "channel mix", "dine in vs", "cash and card split"],
		"hi": ["भुगतान", "पेमेंट", "पेमेन्ट", "payment*", "ऑर्डर टाइप"],
		"ar": ["الدفع", "المدفوعات", "طرق الدفع", "انواع الطلبات", "نوع الطلب"],
		"ml": ["പേയ്മെന്റ്", "പേയ്മെൻറ്", "പണമടയ്", "ഓർഡർ ടൈപ്പ്", "payment*"],
	},
	"branch_ranking": {
		"en": ["branch*", "outlet*", "store ranking", "which store", "ranking", "rankings", "league table"],
		"hi": ["ब्रांच", "ब्रान्च", "आउटलेट", "शाखा", "branch*", "outlet*"],
		"ar": ["الفروع", "فرع", "فروع"],
		"ml": ["ബ്രാഞ്ച്", "ശാഖ", "ഔട്ട്ലെറ്റ്", "branch*"],
	},
	"cashup": {
		"en": ["cash up", "cashup", "cash short*", "cash difference*", "till closing", "till close", "cash over short", "cash variance"],
		"hi": ["कैश अप", "कैशअप", "कैश कम", "cash up", "cashup"],
		"ar": ["اغلاق الصندوق", "تسوية الصندوق", "كاش اب", "عجز الصندوق", "نقص النقد"],
		"ml": ["ക്യാഷ് അപ്പ്", "കാഷ് അപ്പ്", "ക്യാഷ് അപ്", "cash up", "cashup"],
	},
	"leakage": {
		"en": ["leakage", "leaks", "leak", "discount*", "voids", "complimentary", "freebies", "giveaways"],
		"hi": ["लीकेज", "छूट", "डिस्काउंट", "डिस्काउन्ट", "leakage", "discount*"],
		"ar": ["تسرب", "الخصومات", "خصومات", "خصم"],
		"ml": ["ലീക്കേജ്", "ഡിസ്കൗണ്ട്", "ഡിസ്‌കൗണ്ട്", "കിഴിവ്", "leakage", "discount*"],
	},
}

# Any hit here means the question is not a plain data lookup: hand it to the LLM.
FALLTHROUGH_KEYWORDS = {
	"why": {
		"en": ["why", "how come", "what caused", "what is causing", "cause", "causes", "reason for", "reasons for", "explain", "because"],
		"hi": ["क्यों", "क्यूं", "क्यो", "कारण", "kyun", "kyu", "kyon", "karan", "samjhao"],
		"ar": ["لماذا", "ليش", "ليه", "سبب", "اسباب", "اشرح", "فسر"],
		"ml": ["എന്തുകൊണ്ട്", "എന്തു കൊണ്ട്", "കാരണം", "enthukondu", "enthinu", "karanam"],
	},
	"compare": {
		"en": ["compare", "compared", "comparison", "versus", "vs", "against", "than", "difference between", "better", "worse", "trend", "growth", "growing", "change from"],
		"hi": ["तुलना", "बनाम", "मुकाबल", "बेहतर", "ज्यादा या", "tulna", "banaam", "muqabla"],
		"ar": ["قارن", "مقارنة", "مقابل", "بالمقارنة", "مقارنه", "افضل من", "اسوأ", "اسوا"],
		"ml": ["താരതമ്യ", "എതിരെ", "കൂടുതലാണോ", "tulana", "thaarathamyam"],
	},
	"advice": {
		"en": ["should", "advice", "advise", "suggest*", "idea", "ideas", "recommend*", "improve*", "what can we do", "what can i do", "how can", "how to", "what if", "forecast", "predict*", "plan", "strategy", "tips", "optimi*", "increase", "reduce", "fix"],
		"hi": ["सलाह", "सुझाव", "आइडिया", "सुधार", "चाहिए", "कैसे बढ़ा", "कैसे घटा", "योजना", "salah", "sujhav", "idea", "chahiye", "kaise"],
		"ar": ["نصيحة", "نصائح", "اقتراح", "اقترح", "افكار", "فكرة", "ينبغي", "يجب", "كيف نحسن", "كيف", "تحسين", "خطة", "توقع"],
		"ml": ["ഉപദേശം", "നിർദ്ദേശ", "ആശയ", "മെച്ചപ്പെടുത്ത", "ചെയ്യണം", "എങ്ങനെ", "പദ്ധതി", "upadesham", "engane", "ideas"],
	},
	"followup": {
		"en": ["and", "also", "then", "plus", "what about", "how about", "same for", "same as", "that", "those", "them", "it", "week before", "day before", "month before", "one before", "previous one", "instead"],
		"hi": ["और", "उसके", "उसका", "वो", "वह", "उनका", "aur", "uska", "uske", "phir"],
		"ar": ["وماذا عن", "ماذا عن", "وكذلك", "ايضا", "وايضا", "ذلك", "تلك", "ثم"],
		"ml": ["അപ്പോൾ", "പിന്നെ", "അതിന്റെ", "അതിൻ്റെ", "അത്", "അതും", "appol", "pinne", "athinte"],
	},
}

# period name -> language -> phrases. "last_n" is handled by regexes in the router.
PERIOD_KEYWORDS = {
	"yesterday": {
		"en": ["yesterday", "yesterdays", "yday", "last night"],
		"hi": ["बीते कल", "बीता कल", "=कल", "kal ki", "kal ka", "kal ke", "=kal", "कल की", "कल का"],
		"ar": ["=امس", "البارح", "امس"],
		"ml": ["ഇന്നലെ", "ഇന്നലത്തെ", "innale", "ennale"],
	},
	"today": {
		"en": ["today", "todays", "so far today", "right now", "tonight"],
		"hi": ["=आज", "aaj", "आज की", "आज का"],
		"ar": ["اليوم"],
		"ml": ["ഇന്ന്", "ഇന്നത്തെ", "innu", "innathe"],
	},
	"this_week": {
		"en": ["this week", "week so far", "week to date"],
		"hi": ["इस हफ्ते", "इस हफ़्ते", "इस सप्ताह", "is hafte", "is hafta"],
		"ar": ["هذا الاسبوع", "هذه الاسبوع", "الاسبوع الحالي"],
		"ml": ["ഈ ആഴ്ച", "ഈ ആഴ്ചയിലെ", "ee aazhcha"],
	},
	"last_week": {
		"en": ["last week", "past week", "previous week"],
		"hi": ["पिछले हफ्ते", "पिछले हफ़्ते", "पिछले सप्ताह", "पिछला हफ्ता", "pichhle hafte", "pichle hafte"],
		"ar": ["الاسبوع الماضي", "الاسبوع الفائت", "الاسبوع السابق"],
		"ml": ["കഴിഞ്ഞ ആഴ്ച", "കഴിഞ്ഞ ആഴ്ചയിലെ", "kazhinja aazhcha"],
	},
	"month_to_date": {
		"en": ["this month", "month to date", "mtd", "so far this month"],
		"hi": ["इस महीने", "इस माह", "एमटीडी", "is mahine"],
		"ar": ["هذا الشهر", "منذ بداية الشهر", "الشهر الحالي"],
		"ml": ["ഈ മാസം", "ഈ മാസത്തെ", "ee maasam"],
	},
	"last_month": {
		"en": ["last month", "previous month", "past month"],
		"hi": ["पिछले महीने", "पिछले माह", "pichhle mahine", "pichle mahine"],
		"ar": ["الشهر الماضي", "الشهر الفائت", "الشهر السابق"],
		"ml": ["കഴിഞ്ഞ മാസം", "കഴിഞ്ഞ മാസത്തെ"],
	},
}

# "last N days" patterns (applied to normalised text, digits already ASCII).
LAST_N_DAYS_PATTERNS = [
	r"(?:last|past|previous) (\d{1,2}) days?",
	r"(?:last|past) (seven) days",
	r"पिछले (\d{1,2}) दिन",
	r"(?:اخر|الاخيرة) (\d{1,2}) (?:يوم|ايام)",
	r"കഴിഞ്ഞ (\d{1,2}) ദിവസ",
	r"pichhle (\d{1,2}) din",
]
