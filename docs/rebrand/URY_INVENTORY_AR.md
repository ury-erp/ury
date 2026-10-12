# جرد كل ما يخص URY في المشروع

> تاريخ الجرد: 2026-10-03 · على `develop` عند `17b9064`
> النطاق: الملفات المتتبَّعة في git فقط (1072 ملفاً). استُبعدت مخرجات البناء (`ury/public/{ury,pos,mosaic,urypos,order}`) و`node_modules`.

## الصورة الكاملة بالأرقام

| البند | العدد |
|---|---|
| ملفات فيها كلمة ury بأي شكل | **653 ملفاً** |
| إجمالي الظهور | **حوالي 4,500 مرة** |
| ظهور أسماء DocType بصيغة `URY ...` | 1,482 |
| مسارات Python النقطية (`ury.ury.*`، `ury.ury_pos.*` ...) | 1,171 |
| استيرادات `@ury/ui` و`@ury/core` | 440 |
| ظهور الأدوار (`URY Manager/Cashier/Captain/Admin/Waiter`) | 326 |
| روابط `/assets/ury/` | 115 |

**أين تتركّز:** `ury/ury` (2359) · `frontend/src` (424) · `pos/src` (308) · `ury/fixtures` (180) · `ury/ury_pos` (160) · `ury/setup` (141) · `ury/hooks.py` (102) · التوثيق (حوالي 270).

---

## التصنيف حسب الخطورة

الجرد مقسوم إلى أربع طبقات، من الأسهل والأكثر ظهوراً للمستخدم إلى الأخطر:

| الطبقة | ماذا تشمل | هل يراها المستخدم؟ | خطورة التغيير |
|---|---|---|---|
| **أ. العرض** | عناوين، نصوص، ترجمات، صور، أيقونات | نعم | منخفضة |
| **ب. الروابط (Routing)** | `/ury`، `/urypos`، `/ury-login` ... | في شريط العنوان | متوسطة، تحتاج تحويلات 301 |
| **ج. المعرّفات الداخلية** | مفاتيح التخزين، الكاش، CSS، حزم npm، أسماء الملفات | لا | متوسطة إلى عالية |
| **د. هوية التطبيق وقاعدة البيانات** | `app_name`، الـ DocTypes، الأدوار، الموديول، الحقول المخصصة | جزئياً، عبر أسماء الـ DocTypes | **عالية جداً** |

---

## أ. طبقة العرض (ما يراه المستخدم)

### أ-1. نصوص ظاهرة مكتوبة مباشرة

| الملف | النص الحالي |
|---|---|
| [urypos/index.html:26](../../urypos/index.html) | `<title>URY POS</title>` |
| [frontend/src/components/setup/WizardLayout.tsx:75](../../frontend/src/components/setup/WizardLayout.tsx) | `URY · {version}` في تذييل معالج الإعداد |
| [ury/config/desktop.py:8](../../ury/config/desktop.py) | `_("URY")`: اسم الموديول في الديسك |
| [ury/ury/workspace/smart_restro/smart_restro.json:25](../../ury/ury/workspace/smart_restro/smart_restro.json) | رابط بعنوان `URY POS` |
| [ury/fixtures/custom_html_block.json](../../ury/fixtures/custom_html_block.json) | بلوك `URY POS` + صورة `URY-POS.jpg` + كلاس `uryposlogo` |
| [ury/ury/page/ury_control_center/ury_control_center.json](../../ury/ury/page/ury_control_center/ury_control_center.json) | `"title": "URY Control Center"` |
| [ury/ury/print_format/ury_kitchen_ticket](../../ury/ury/print_format/ury_kitchen_ticket) | قالب الطباعة `URY Kitchen Ticket` |
| [ury/ury/print_format/ury_waiter_order_slip](../../ury/ury/print_format/ury_waiter_order_slip) | قالب الطباعة `URY Waiter Order Slip` |
| [ury/public/js/setup_wizard.js:1,22,25](../../ury/public/js/setup_wizard.js) | `console.log("URY setup_wizard.js loaded")` · `Generate URY Demo Data` · `...create URY demo data...` |

### أ-2. رسائل الأخطاء والتنبيهات

**قابلة للترجمة (`_()` / `__()`):**
- [ury/setup/setup_wizard.py:78](../../ury/setup/setup_wizard.py): `No company found for URY demo data`
- [ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.js:47-48](../../ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.js): `Missing URY Report Settings` · `Please set up URY Report Settings...`
- [ury/ury/doctype/ury_waste_log/ury_waste_log.py:90](../../ury/ury/doctype/ury_waste_log/ury_waste_log.py): `URY waste: {0}`، وهذه **تُكتب في حقل remarks داخل قيود المخزون**.

**غير مترجمة (نص إنجليزي ثابت):**
- [ury/ury/api/ury_kot_display.py:337](../../ury/ury/api/ury_kot_display.py): `URY KOT {name} not found.`
- [ury/ury/doctype/ury_report_settings/ury_report_settings.py:10](../../ury/ury/doctype/ury_report_settings/ury_report_settings.py): `Value cannot be zero for URY Report Settings...`
- [ury/ury/hooks/ury_item.py:18,23](../../ury/ury/hooks/ury_item.py): `...is not in URY Menu`

### أ-3. ملفات الترجمة (i18n)

| الملف | المفتاح | القيمة |
|---|---|---|
| `frontend/src/i18n/locales/en.json:437` | `no_ury_restaurant_linked_to_this_branch` | `No URY Restaurant linked to this branch.` |
| `frontend/src/i18n/locales/en.json:740` | `no_ury_restaurant_configured_for_this_branch` | `No URY Restaurant configured...` |
| `frontend/src/i18n/locales/en.json:1584` | `need_manager_role` | `You need the URY Manager role...` |
| `frontend/src/i18n/locales/ar.json:1589` | `need_manager_role` | `تحتاج صلاحية مدير URY...` |
| `pos/src/i18n/locales/en.json:27` | `loading_ury_pos` | `Loading URY POS...` |
| `pos/src/i18n/locales/fr.json:27` | `loading_ury_pos` | `Chargement de URY POS...` |

> القيم هي ما يظهر للمستخدم. أسماء المفاتيح (`no_ury_...`) داخلية، وتغييرها اختياري (طبقة ج).

### أ-4. أسماء الـ DocTypes كما تظهر في الديسك

أسماء الـ DocTypes (`URY Order`، `URY KOT` ...) تظهر للمستخدم في القوائم والبحث والروابط. **الحل الآمن هو الترجمة وليس إعادة التسمية** (التفاصيل في الطبقة د).
- في [ury/translations/ar.csv](../../ury/translations/ar.csv) يوجد حالياً ترجمة لـ **5 فقط من 56** DocType يبدأ بـ `URY` (مثل `URY Website` ← موقع المطعم).
- **51 DocType بلا ترجمة عربية**، فتظهر للمستخدم العربي بكلمة URY.
- للمستخدم الإنجليزي: Frappe يدعم ملف `translations/en.csv` لتغيير العرض (مثلاً `URY Order` ← `Order`). **يجب تجربته على نسخة v15 الحالية قبل الاعتماد عليه.**

### أ-5. الصور والأيقونات

| الملف | مستخدم؟ | الإجراء المقترح |
|---|---|---|
| `ury/public/Images/URY-POS.jpg` | ✅ في `custom_html_block.json` | استبدال بصورة Smart Choice + تحديث المرجع |
| `ury/public/Images/ury-logo.jpg` | ❌ لا يوجد مرجع | حذف |
| `ury/public/Images/ury.png` | ❌ | حذف |
| `frontend/Public/URY-bg.png` | ❌ | حذف |
| `mosaic/public/URY.svg` | ❌ | حذف |
| `urypos/public/URY.svg` | ❌ | حذف |
| `urypos/src/assets/logos/URY_POS.jpg` | ❌ | حذف |
| `pos/public/ury_pos.png` | ❌ | حذف |
| `{mosaic,pos,urypos}/public/ury.ico` | المحتوى صار Smart Choice، لكن **الاسم بقي `ury.ico`** ولا يستخدمه أي `index.html` | حذف (الـ favicon الآن من `/assets/ury/Images/smart-choice-icon.png`) |
| `DEMO/URY *.png` (6 لقطات شاشة) | توثيق | إعادة تصوير بعد تغيير العرض |
| `smart_logo.png` (جذر المستودع) | للتحقق | — |

> تحقّقت من "غير مستخدم" بالبحث عن اسم الملف في كل المستودع. راجع المسارات المبنية ديناميكياً قبل الحذف.

---

## ب. الروابط (Routing)

### ب-1. مسارات الويب

| المسار | أين يُعرَّف | من يشير إليه |
|---|---|---|
| **`/ury/*`** (لوحة المطعم) | `hooks.py:80` route rule · `www/ury.html` + `www/ury.py` · `frontend/src/main.tsx:15` `basename="/ury"` · `frontend/vite.config.ts:24` `outDir: ../ury/public/ury` · `hooks.py:34` `add_to_apps_screen.route` | 18× `/ury/setup-wizard`، 12× `/ury/dashboard`، `/ury/reports`، `/ury/invoices`، `/ury/website`، `/ury/waitlist`، `/ury/feedback`، `/ury/delivery` |
| **`/urypos/*`** (نقطة البيع القديمة Vue) | `hooks.py:78` · `www/urypos.html` · `urypos/src/router/index.js:61` · `urypos/vite.config.js:19` | `pos/src/components/ScreenSizeDialog.tsx:15` · `custom_html_block.json` · `urypos/src/components/Header.vue` |
| **`/ury-login`** | `www/ury-login.html` + `www/ury_login.py` | `ury/ury/controllers/setup_redirect.py:82` |
| **`/ury-unavailable`** | `www/ury-unavailable.html` + `www/ury_unavailable.py` | `setup_redirect.py:87` |
| **`/app/ury-control-center`** | صفحة Desk `ury/ury/page/ury_control_center` | `frontend/src/components/layout/Sidebar.tsx` |
| **`/app/ury-order`، `/app/ury-kot` ...** | تُشتق تلقائياً من أسماء الـ DocTypes | كل رابط Desk، والروابط المحفوظة عند المستخدمين |
| `/setup-wizard` ← `/ury/setup-wizard/0` | `hooks.py:313` redirect | — |

**ملفات المسار `/ury/dashboard`:** `frontend/src/pages/Setup/{ConfigurePage,SetupPage}.tsx` · `mosaic/src/components/Header.vue` · `pos/src/components/Header.tsx` · `ury/ury/controllers/access.py` · `ury_control_center.js` · `smart_restro.json` · `www/ury-login.html`
**ملفات المسار `/ury/setup-wizard`:** `frontend/src/App.tsx` · `hooks.py` · `ury/public/js/setup_redirect.js` · `ury/ury/controllers/setup_redirect.py` (+ اختباره)

> **قاعدة التغيير:** أي مسار تغيّره يبقى القديم منه كتحويل 301 في `website_redirects`، لأن الأجهزة والطابعات والمتصفحات عند الموظفين والإشارات المرجعية تحفظ الروابط القديمة.

### ب-2. مسارات API

كل نداء من الواجهات يمر عبر `/api/method/ury.ury...` أو `ury.ury_pos...`:

| التطبيق | عدد النداءات |
|---|---|
| frontend | 72 |
| pos | 65 |
| urypos | 39 |
| mosaic | 18 |
| ury/public/js | 10 |
| packages | 4 |
| self-order | 1 |

هذه المسارات مشتقة من اسم حزمة Python (`ury`)، فلا تتغير إلا بتغيير الحزمة نفسها (طبقة د). **المستخدم لا يراها.**

---

## ج. المعرّفات الداخلية (لا يراها المستخدم)

### ج-1. مفاتيح localStorage / sessionStorage

**تغييرها يمسح تفضيلات كل مستخدم** (اللغة، الفرع، الطلبات غير المرسلة!) إلا إذا كتبت كود ترحيل يقرأ المفتاح القديم مرة واحدة.

| المفتاح | ملاحظة |
|---|---|
| `ury_language` | 6 تطبيقات + سكربت مضمّن في كل `index.html` |
| `ury_active_branch_id` | `frontend/src/context/BranchContext.tsx` |
| `ury_offline_order_queue` | ⚠️ **طلبات لم تُرسل بعد**: فقدانه = فقدان طلبات |
| `ury_order_draft` · `ury_order_session` · `ury_order_context` · `ury_order_qr_token` | self-order |
| `ury_device_id` · `ury_device_credential` | ⚠️ ربط الجهاز اللوحي: فقدانه يعني إعادة ربط كل جهاز |
| `ury_qz_station` | محطة الطباعة في POS |
| `ury_kds_sound` | صوت شاشة المطبخ |
| `ury_room_counts_${branch}` · `ury_rooms_${branch}` · `ury_waitlist_${branch}` · `ury_service_request_${branch}` · `ury_print_jobs_${branch}` · `ury_kitchen_message_${branch}` | كاش محلي، آمن |

### ج-2. مفاتيح الكاش في الخادم و Realtime

- `frappe.cache` بمفاتيح `ury_dashboard_*:{branch}` (7 مفاتيح) · `ury_setup_progress:{user}` · `ury_feature_state` · `ury_access_policy`. آمنة، فالكاش يُعاد بناؤه.
- حدث Realtime باسم `ury_configure_progress` (8 مرات): الخادم والواجهة يجب أن يتغيرا معاً.
- علَم داخلي `frappe.local.flags.ury_unavailable_feature` · `ury_setup_wizard_target`.

### ج-3. CSS

- `.ury-cc-*` (حوالي 30 كلاساً) في صفحة مركز التحكم `ury_control_center.js`
- `.ury-qr-copy/download/print` · `ury-qr-image` · `ury-table` · `ury-room` · `ury-menu` · `ury-order-*-tab`
- `@keyframes ury-float` في `packages/ui/src/styles/motion.css`
- `.uryposlogo` في `custom_html_block.json`

### ج-4. JavaScript / npm

- **حزم Workspace:** `@ury/ui` (248 استيراداً) و`@ury/core` (192)، تعريفها في `packages/*/package.json` وaliases في `vite.config` / `tsconfig`.
- **أسماء الحزم:** `urypos/package.json` → `"name": "urypos"`.
- **سكربتات npm** في `package.json` الجذر: `ury-pos-install` · `ury-pos-build` · `ury-mosaic-*` · `ury-posv2-*` · `ury-frontend-build` · `ury-self-order-build`. تُستدعى أيضاً من CI ومن `bench build`.
- **مفاتيح ترجمة Frappe:** `ury.setup.setup` · `ury.setup.pos` · `ury.setup.demo` · `ury.setup.arabic` · `ury.setup.configureState`.

### ج-5. Python (أسماء ملفات ودوال)

- **ملفات API:** `ury/ury/api/ury_{dashboard,kitchen_message,kot_display,kot_generate,kot_notification,kot_order_number,kot_reprint,kot_validation,menu_course_validation,print,service_line,waiter_print}.py` + 6 ملفات اختبار `test_ury_*.py`. ⚠️ اسم الملف جزء من مسار API الذي تناديه الواجهات.
- `ury/ury/hooks/ury_pos_invoice.py` · `ury_item.py`
- دوال: `is_ury_setup_complete` (23) · `setup_ury_demo` (19) · `allow_ury_demo` · `_wants_ury_demo` · `_should_redirect_to_ury_setup` ...
- مجلد `ury/ury_pos/`: الموديول الثاني (`ury.ury_pos.api`).

### ج-6. CI والمستودع

- `.github/workflows/deploy-ury.yml` (`name: Deploy URY V3`) · `v3-deploy.yml` · `tests.yml` (`bench get-app ury` · `install-app ury` · `run-tests --app ury`)
- أسرار GitHub: `URY_DEPLOY_SSH_KEY` · `URY_DEPLOY_HOST` · `URY_DEPLOY_PORT` · `URY_DEPLOY_USER`، وتغييرها يتطلب تحديث الأسرار في إعدادات GitHub نفسها.
- Git remotes: `URYorigin` (اسم شكلي) · `upstream → github.com/ury-erp/ury`
- `.gitignore` و`MANIFEST.in` (12 سطراً تشير لمسارات ury).

---

## د. هوية التطبيق وقاعدة البيانات ⚠️

هذه هي الطبقة التي **لا يُنصح بلمسها**. التوصية أن تُخفى عن المستخدم بالترجمة والعرض بدل إعادة التسمية.

### د-1. هوية تطبيق Frappe

| البند | المكان | لماذا خطير |
|---|---|---|
| `app_name = "ury"` | `hooks.py:6` | مذكور صراحة في التعليق أنه لا يُغيَّر. هو اسم التطبيق في `apps.txt` لكل موقع، واسم المجلد، ومسار `/assets/ury/` |
| حزمة Python `ury` | `setup.py:10` · `pyproject.toml` | 1,171 مساراً نقطياً + كل نداءات API + كل الـ hooks + `patches.txt` |
| `/assets/ury/...` | 115 مرجعاً | كل الصور والخطوط والسكربتات المبنية |
| الموديول `URY` | `modules.txt` · `"module": "URY"` في كل DocType وReport وPrint Format وWorkspace | سجل `Module Def` في قاعدة البيانات |

### د-2. الـ DocTypes: 56 باسم `URY ...` (من أصل 66)

كل واحد منها **جدول في قاعدة البيانات** (`tabURY Order` ...) ومجلد (`doctype/ury_order/`) وكلاس Python ومسار Desk (`/app/ury-order`)، ويُشار إليه بالاسم في الـ Links وCustom Fields وProperty Setters والتقارير والصلاحيات وسجلات Version/Comment/Communication.

<details>
<summary>القائمة الكاملة (56)</summary>

**رئيسية:** URY Audit Log · URY Consumption Log · URY Daily P and L · URY Delivery · URY Delivery Zone · URY Driver · URY Feature Settings (single) · URY Guest Feedback · URY KOT · URY KOT Error Log · URY Kitchen Message · URY Menu · URY Menu Course · URY Order (single) · URY Ordering Device · URY Ordering Session · URY POS Checklist Log · URY Payment Terminal · URY Payment Terminal Transaction · URY Print Job · URY Production Unit · URY Report Settings · URY Restaurant · URY Room · URY Self Ordering Profile · URY Service Request · URY Sync Request · URY Table · URY Table Reservation · URY Waitlist Entry · URY Waste Log · URY Website

**جداول فرعية (child):** URY Checklist Item · URY Checklist Log Item · URY Consumption Log Item · URY Cost Of Goods · URY Feature Flag · URY Fixed Expenses · URY KOT Items · URY Kitchen Message Ack · URY Materials · URY Menu Item · URY Merged POS Invoice Detail · URY Notification Recipient · URY Order Item · URY P and L Breakup · URY P and L Materials · URY Printer Settings · URY Production Item Groups · URY Role Access · URY User · URY Variable Expenses · URY Waste Log Item · URY Website Hours · URY Website Image

</details>

### د-3. الأدوار (Roles)

| الدور | عدد المراجع | المكان |
|---|---|---|
| `URY Manager` | 109 | `fixtures/role.json` |
| `URY Cashier` | 87 | `fixtures/role.json` |
| `URY Captain` | 62 | `fixtures/role.json` |
| `URY Admin` | 52 | `role_permissions.py` · `patches/v2_0/admin_permissions.py` |
| `URY Waiter` | 10 | `frontend/src/data/schemas/user.json` |

الأدوار **مُسندة لمستخدمين حقيقيين** ومذكورة في صلاحيات كل DocType (`permissions` في كل JSON) وفي `has_role` داخل الكود. تغيير الاسم بدون patch يسحب الصلاحيات من الجميع.
> بديل آمن: ترجمة اسم الدور في `ar.csv` و`en.csv` (مثلاً `URY Manager` ← مدير المطعم).

### د-4. حقول مخصصة على DocTypes تابعة لـ ERPNext (أعمدة في قاعدة البيانات)

| DocType | Fieldname |
|---|---|
| POS Invoice | `custom_ury_order_number` |
| POS Opening Entry | `custom_ury_last_invoice` |
| POS Opening Entry | `custom_ury_last_aggregator_invoice` |

إعادة تسميتها = `ALTER TABLE` على جداول فواتير حقيقية + تحديث كل مرجع. **قيمتها للمستخدم صفر** (اسم الحقل لا يظهر، فقط الـ label).

### د-5. قوالب الطباعة

`URY Kitchen Ticket` و`URY Waiter Order Slip`: أسماؤها مخزّنة كقيم في `URY Printer Settings` عند كل عميل (`custom_kot_print_format` · `custom_waiter_print_format`). إذا غُيّرت الأسماء فيجب أن يرافقها patch يحدّث هذه الإعدادات.

---

## ⚖️ ما يجب أن يبقى قانونياً

المشروع مرخّص بـ **AGPL-3.0**، وهو نسخة معدّلة من URY (Tridz Technologies). البند 5 من الرخصة يُلزم بإبقاء إشعارات حقوق النشر وبيان أن النسخة معدّلة. **لا تحذف:**
- ملف `LICENSE`
- `app_description` في `hooks.py` ("Based on URY ... by Tridz Technologies ... AGPL-3.0")
- `authors` في `pyproject.toml` و`setup.py` (يمكن **إضافة** Smart Choice بجانبهم)
- أسطر الإسناد في `README.md` وترويسات ملفات `ury/ury/api/*.py` التي تذكر Tridz/AGPL

يمكن تغييره: `app_email = "info@tridz.com"`. هذا بريد الدعم، والأنسب أن يكون بريدكم.

---

## التوثيق (لا يؤثر على التشغيل)

`README.md` (22) · `SETUP.md` (63) · `INSTALLATION.md` (8) · `FEATURES.md` (11) · `TERMS.md` (3) · `AGENTS.MD` (66) · `pos/AGENTS.MD` (20) · `mosaic/AGENTS.MD` (14) · `docs/` (74) · `plans/` (9) · `urypos/README.md`

---

## خطة التنفيذ المقترحة

| المرحلة | العمل | الخطورة | يحتاج patch؟ |
|---|---|---|---|
| **1** | الطبقة أ: النصوص، i18n، رسائل الأخطاء، `<title>`، `desktop.py`، Workspace، `setup_wizard.js` | منخفضة | لا |
| **2** | ترجمة الـ 51 DocType الناقصة + الأدوار في `ar.csv`، وتجربة `en.csv` للإنجليزية | منخفضة | لا |
| **3** | حذف الصور غير المستخدمة، واستبدال `URY-POS.jpg` | منخفضة | لا (إلا تحديث fixture) |
| **4** | مسارات جديدة (مثلاً `/restro` بدل `/ury`، و`/login` بدل `/ury-login`) **مع إبقاء القديمة 301** | متوسطة | لا |
| **5** | الطبقة ج: CSS، سكربتات npm، `@ury/*` → `@smart/*`، مفاتيح التخزين **مع كود ترحيل** | متوسطة | لا |
| **6** | إعادة تسمية Print Formats والأدوار | عالية | **نعم** |
| ✋ | الطبقة د: `app_name`، الحزمة، الموديول، الـ DocTypes، الحقول المخصصة | عالية جداً | نعم + ترحيل بيانات كل العملاء |

**التوصية:** المراحل 1 إلى 4 تخفي URY عن المستخدم النهائي بالكامل تقريباً بدون أي مخاطرة على البيانات. المرحلة 5 تنظيف داخلي اختياري. والطبقة د لا تستحق المخاطرة: المستخدم لا يراها إذا اكتملت الترجمات، وتغييرها يكسر الترقيات من upstream ويحتاج ترحيل كل قاعدة بيانات عند العملاء.
