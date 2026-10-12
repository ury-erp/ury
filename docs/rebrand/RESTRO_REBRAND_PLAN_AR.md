# خطة تغيير URY إلى Smart Restro

> مبنية على [URY_INVENTORY_AR.md](URY_INVENTORY_AR.md) · تاريخ: 2026-10-03 · Frappe v15.98.1
> الهدف: ألّا يرى أي مستخدم (كاشير، كابتن، مطبخ، مدير، ضيف) كلمة URY في أي مكان، **بدون** المساس ببيانات العملاء أو كسر التحديثات.

---

## 1. قاموس الأسماء (يُعتمد قبل أي سطر كود)

| السياق | الاسم المعتمد | أمثلة |
|---|---|---|
| **اسم المنتج الكامل** | **Smart Restro** · سمارت ريسترو | عنوان المتصفح، شاشة الدخول، شاشة التطبيقات، التذييل، رسائل البريد |
| **البادئة القصيرة داخل النظام** | **Restro** | `Restro Order` · `Restro Manager` · المسار `/restro` |
| **الشركة** | Smart Choice | الناشر، حقوق النشر (موجود حالياً) |
| **العربية للكائنات** | اسم وظيفي **بدون علامة تجارية** | `URY Order` ← طلب المطعم · `URY Manager` ← مدير المطعم |
| **المعرّفات التقنية الجديدة** | `restro` | CSS: `restro-*` · npm: `@restro/*` · التخزين: `restro_*` |

**قاعدة ذهبية:** "Smart Restro" للهوية، و"Restro" للكائنات داخل النظام. لا تُستعمل "Smart Restro" بادئةً لكل DocType لأنها طويلة.

---

## 2. ما لن يتغيّر (قرار مقصود)

| البند | لماذا يبقى |
|---|---|
| `app_name = "ury"` واسم حزمة Python ومجلد التطبيق | اسم التطبيق في `apps.txt` لكل موقع. تغييره يعني إعادة تثبيت التطبيق عند كل عميل |
| `/assets/ury/...` | مشتق من `app_name` |
| مسارات API `ury.ury.*` | مشتقة من الحزمة. المستخدم لا يراها |
| **أسماء الـ DocTypes في قاعدة البيانات** (`tabURY Order` ...) | 56 جدولاً + 1,482 مرجعاً + روابط مخزنة في بيانات العملاء. **تُخفى بالترجمة** (المرحلة 2) |
| اسم الموديول الداخلي `URY` | سجل `Module Def`. **يُخفى بالـ label** |
| الحقول `custom_ury_*` | أعمدة في جداول الفواتير. **يتغير الـ label فقط** |
| روابط Desk `/app/ury-order` | مشتقة من اسم الـ DocType. تظهر في شريط العنوان فقط |
| إشعارات AGPL (Tridz / URY) | إلزام قانوني: `LICENSE`، `app_description`، `authors`، وترويسات الملفات |

> هذه العناصر **لا يراها المستخدم** بعد تنفيذ الخطة، إلا روابط `/app/ury-*` في شريط عنوان الديسك. إزالة هذه الروابط تحتاج إعادة تسمية الـ DocTypes نفسها، ولا أنصح بها.

---

## 3. المراحل

كل مرحلة = **فرع + PR مستقل**، ويُنشر وحده على staging قبل الإنتاج. الترتيب من الأقل خطورة إلى الأعلى.

| # | المرحلة | الخطورة | patch؟ | يراها المستخدم؟ |
|---|---|---|---|---|
| 0 | التحضير | — | — | — |
| 1 | النصوص الظاهرة | 🟢 منخفضة | لا | ✅ |
| 2 | طبقة الترجمة (`en.csv` + `ar.csv`) | 🟢 منخفضة | لا | ✅ |
| 3 | الصور والأيقونات | 🟢 منخفضة | لا | ✅ |
| 4 | الروابط `/restro` مع تحويلات | 🟡 متوسطة | لا | ✅ |
| 5 | المعرّفات الداخلية | 🟡 متوسطة | لا | ❌ |
| 6 | الأدوار، قوالب الطباعة، صفحة مركز التحكم | 🔴 عالية | **نعم** | ✅ |
| 7 | التوثيق و CI | 🟢 | لا | ❌ |

---

### المرحلة 0: التحضير

1. فرع `feat/rebrand-restro` من `develop`.
2. **خط أساس:** تسجيل نتيجة الأوامر التالية قبل أي تعديل:
   ```bash
   bench --site <staging> run-tests --app ury
   yarn test
   yarn build
   ```
3. نسخة احتياطية لموقع staging: `bench --site <staging> backup --with-files`.
4. اعتماد قاموس الأسماء (القسم 1) والجدولين في الملحق.

---

### المرحلة 1: النصوص الظاهرة 🟢

تعديل نصي مباشر، بدون أي أثر على البيانات.

| الملف | من | إلى |
|---|---|---|
| `urypos/index.html:26` | `URY POS` | `Smart Restro POS` |
| `frontend/src/components/setup/WizardLayout.tsx:75` | `URY · {version}` | `Smart Restro · {version}` |
| `ury/config/desktop.py:8` | `_("URY")` | `_("Smart Restro")` |
| `ury/ury/workspace/smart_restro/smart_restro.json` | label `URY POS` وكل label يبدأ بـ `URY ` | `Restro POS` / حذف البادئة. **`link_to` يبقى كما هو** |
| `ury/fixtures/custom_html_block.json` | `URY POS` | `Restro POS` |
| `ury/public/js/setup_wizard.js` | `URY Demo Data` · `URY demo data` · `console.log` | `Smart Restro demo data` · حذف الـ log |
| `ury/setup/setup_wizard.py:78` | `URY demo data` | `Smart Restro demo data` |
| `ury_daily_p_and_l.js:47-48` | `URY Report Settings` | `Restro Report Settings` |
| `ury_waste_log.py:90` | `URY waste: {0}` | `Waste: {0}` ⚠️ القيود القديمة تبقى كما هي، وهذا مقبول |
| `ury_kot_display.py:337` | `f"URY KOT {name} not found."` | `_("Kitchen ticket {0} not found.").format(name)` |
| `ury_report_settings.py:10` | `...URY Report Settings...` | `_()` + نص بدون URY |
| `ury/ury/hooks/ury_item.py:18,23` | `...not in URY Menu` | `_("...is not in the menu").format(...)` |
| `frontend/.../en.json` (3 قيم) + `ar.json` (1) | `URY Restaurant` · `URY Manager` | `restaurant profile` · `Restro Manager` / مدير المطعم |
| `pos/.../en.json` + `fr.json` | `Loading URY POS...` | `Loading Smart Restro POS...` |

**Labels الحقول (عرض فقط، الـ fieldname لا يتغير):**

| الحقل | label جديد |
|---|---|
| `POS Invoice.custom_ury_order_number` (fixture) | `Restaurant Order Number` |
| `POS Opening Entry.custom_ury_last_invoice` | `Last Restaurant Invoice` |
| `POS Opening Entry.custom_ury_last_aggregator_invoice` | `Last Aggregator Invoice` |
| `Show Item Image In URY Pos` | `Show Item Image in POS` |
| `URY pos restrictions ` | `POS Restrictions` |
| `URY KOT Naming Series` | `Kitchen Ticket Naming Series` |
| بقية الـ labels التي تساوي اسم DocType (`URY Table`، `URY Room` ...) | تُترك، فالمرحلة 2 تترجمها تلقائياً |

**التحقق:**
```bash
git grep -nE "\bURY\b" -- '*.html' '*.tsx' '*.vue' '*/locales/*.json' 'ury/public/js'
```
يجب ألّا يعيد إلا مراجع لأسماء DocTypes داخل نداءات API.

**ملاحظة:** مفاتيح i18n مثل `loading_ury_pos` تبقى في هذه المرحلة، وتُعاد تسميتها في المرحلة 5.

---

### المرحلة 2: طبقة الترجمة 🟢 (الأهم)

**تحقّقت من كود Frappe v15.98.1:** دالة `_()` في الخادم و`__messages` في الديسك (`boot.py` → `get_messages_for_boot`) تحمّلان `translations/<lang>.csv` من كل تطبيق **حتى للغة `en`**. لذلك:

1. **إنشاء `ury/translations/en.csv`** يحوّل كل اسم `URY X` إلى اسمه المعروض (الجدول A في الملحق).
2. **إكمال `ury/translations/ar.csv`** بالـ 51 DocType الناقصة + الأدوار + الموديول (الجدول A وB).
3. نصوص الجمل التي تحتوي اسم DocType داخلها (مثل `Please set up URY Report Settings for...`) تحتاج سطر ترجمة خاصاً بها، أو تُصلَح في المرحلة 1.

**ما تغطيه الترجمة:** عنوان القائمة والنموذج، الـ breadcrumbs، البحث (Awesome Bar)، labels حقول الـ Link، الـ Workspace، أسماء الأدوار في شاشة المستخدم.
**ما لا تغطيه:** رابط `/app/ury-order` في شريط العنوان، وأسماء ملفات التصدير (Data Export)، وهذا مقبول.

**تحذير التصادم:** إذا حذفنا URY بالكامل من الاسم الإنجليزي فستتطابق 3 أسماء مع DocTypes موجودة في Frappe/ERPNext: `Driver` و`User` و`Notification Recipient`. **لهذا اعتمدنا البادئة `Restro`** في الإنجليزية، ففيها اتساق ومنع تصادم وسهولة بحث.

**التحقق:**
- `bench --site <staging> clear-cache`، ثم الدخول بالعربية ثم بالإنجليزية وتصفح الـ Workspace والقوائم والبحث وصفحة المستخدم (الأدوار).
- اختبار آلي يتأكد أن كل DocType اسمه `URY *` له سطر في `en.csv` و`ar.csv`، حتى لا يُنسى أي DocType جديد مستقبلاً:
  ```python
  # ury/tests/test_rebrand_translations.py
  def test_every_ury_doctype_is_translated(): ...
  ```

---

### المرحلة 3: الصور والأيقونات 🟢

| الإجراء | الملفات |
|---|---|
| **حذف** (لا يوجد أي مرجع لها، تأكد بـ `git grep` قبل الحذف) | `ury/public/Images/ury-logo.jpg` · `ury/public/Images/ury.png` · `frontend/Public/URY-bg.png` · `mosaic/public/URY.svg` · `urypos/public/URY.svg` · `urypos/src/assets/logos/URY_POS.jpg` · `pos/public/ury_pos.png` · `{mosaic,pos,urypos}/public/ury.ico` |
| **استبدال** | `ury/public/Images/URY-POS.jpg` ← `restro-pos.jpg` (تصميم Smart Restro) + تحديث `custom_html_block.json` والكلاس `uryposlogo` ← `restro-pos-logo` |
| **إعادة تصوير** | `DEMO/URY *.png` (6 لقطات) بعد المرحلتين 1 و2، بأسماء `DEMO/restro-*.png` |

**التحقق:** `yarn build` لكل تطبيق، ثم فتح كل شاشة والتأكد من عدم وجود صورة مكسورة (Network → 404).

---

### المرحلة 4: الروابط 🟡

#### خريطة المسارات

| القديم | الجديد | النوع |
|---|---|---|
| `/ury` و`/ury/*` | **`/restro`** و`/restro/*` | لوحة المطعم |
| `/urypos/*` | **`/pos-mobile/*`** (مقترح، تطبيق نقطة البيع للهاتف) | تطبيق Vue القديم |
| `/ury-login` | `/login` | يُعرض داخلياً أصلاً عبر `/login` |
| `/ury-unavailable` | يبقى داخلياً | يُعرض داخلياً بدون تغيير الرابط |
| `/setup-wizard` ← `/ury/setup-wizard/0` | ← `/restro/setup-wizard/0` | تحويل |

> ⚠️ **قرار مطلوب منك:** اسم بديل `/urypos`. اقترحت `/pos-mobile` لأن نقطة البيع الجديدة تفتحه للهواتف (`ScreenSizeDialog.tsx`). البديل: `/restro-pos`.

#### الخطوات

1. **`hooks.py`: إضافة المسار الجديد بجانب القديم** (الصفحة الداخلية `ury` لا تتغير):
   ```python
   website_route_rules = [
       {"from_route": "/restro/<path:app_path>", "to_route": "ury"},
       {"from_route": "/pos-mobile/<path:app_path>", "to_route": "urypos"},
       # القديمة تبقى حتى نشر التحويلات
       ...
   ]
   ```
2. **التطبيقات:**
   - `frontend/src/main.tsx` → `basename="/restro"`
   - `urypos/src/router/index.js` → `createWebHistory('/pos-mobile/')`
   - `add_to_apps_screen.route` → `/restro`
3. **تحديث كل رابط مباشر** حتى لا يمر المستخدم بتحويل:
   - `/ury/dashboard`: `frontend/src/pages/Setup/{ConfigurePage,SetupPage}.tsx` · `mosaic/src/components/Header.vue` · `pos/src/components/Header.tsx` · `ury/ury/controllers/access.py` · `ury_control_center.js` · `smart_restro.json` · `www/ury-login.html`
   - `/ury/setup-wizard`: `frontend/src/App.tsx` · `hooks.py` · `ury/public/js/setup_redirect.js` · `ury/ury/controllers/setup_redirect.py`
   - `/ury/reports` و`/ury/invoices` وبقية المسارات (القائمة الكاملة في الجرد، القسم ب-1)
   - `pos/src/components/ScreenSizeDialog.tsx` → `/pos-mobile`
4. ⚠️ **`setup_redirect.py`: نقطة حرجة.** يجب إضافة `"restro"` و`"pos-mobile"` إلى `_SKIP_PREFIXES`:
   ```python
   _SKIP_PREFIXES = ("ury", "restro", "pos-mobile", "api", "assets", "files", "private", "login")
   ```
   *(تصحيح بعد التنفيذ: لا توجد حلقة تحويل، لأن التحويل للمعالج لا يحدث إلا للمسارات المذكورة في `_REDIRECT_PREFIXES`، و`restro` ليس منها. أُضيف السطر للوضوح فقط. وتبيّن أن `features.feature_for_page()` و`access.guard_page()` لا يعتمدان على `ury`.)*
5. **التحويلات** في `website_redirects`. تحقّقت من `path_resolver.py`: المصدر يُطابَق كـ regex مقيّد بالبداية والنهاية:
   ```python
   {"source": r"/ury", "target": "/restro", "redirect_http_status": 302},
   {"source": r"/ury/(.*)", "target": r"/restro/\1", "redirect_http_status": 302},
   {"source": r"/urypos", "target": "/pos-mobile", "redirect_http_status": 302},
   {"source": r"/urypos/(.*)", "target": r"/pos-mobile/\1", "redirect_http_status": 302},
   {"source": r"/ury-login", "target": "/login", "redirect_http_status": 302},
   ```
   - ابدأ بـ **302** على staging والإنتاج لأسبوع، ثم حوّلها إلى **301**. المتصفح يحفظ الـ 301 للأبد، فأي خطأ فيها لا يمكن التراجع عنه عند المستخدمين.
   - ⚠️ **تحويلات Frappe تُسقط الـ query string** (`?x=1`). المسارات الحالية لا تعتمد عليه، لكن راجع أي رابط مطبوع أو QR يحمل معاملات.
   - Frappe يخزّن التحويلات في Redis (`website_redirects`)، لذا شغّل `bench clear-cache` بعد النشر.
6. **مخرجات البناء (اختياري):** `outDir: ../ury/public/ury` يمكن أن يبقى، فالمستخدم لا يراه (`/assets/ury/ury/...`).

**التحقق:**
- `/ury/dashboard` ← 302 ← `/restro/dashboard` ويعمل.
- `/restro/setup-wizard/0` على موقع جديد بدون حلقة.
- مستخدم بدور كاشير يُوجَّه لشاشته الصحيحة.
- الهاتف يفتح `/pos-mobile`.
- `yarn test` + `run-tests --app ury` (خصوصاً `test_setup_redirect.py` و`test_access.py`، مع تحديث المسارات المتوقعة فيهما).

---

### المرحلة 5: المعرّفات الداخلية 🟡

لا يراها المستخدم، لكنها تكمل "النظافة" وتمنع ظهور URY في أدوات المطور والكود.

#### 5-أ. مفاتيح التخزين المحلي (أعلى نقطة خطر في هذه المرحلة)

⚠️ `ury_offline_order_queue` فيه **طلبات لم تُرسل**، و`ury_device_id`/`ury_device_credential` فيهما **ربط الأجهزة اللوحية**.

الحل: دالة ترحيل واحدة تعمل **قبل أي قراءة** عند تشغيل كل تطبيق:
```ts
// packages/core/src/storage/migrate-legacy-keys.ts
const LEGACY_PREFIX = 'ury_';
const PREFIX = 'restro_';
export function migrateLegacyKeys(storage: Storage = localStorage) {
  try {
    for (const key of Object.keys(storage)) {
      if (!key.startsWith(LEGACY_PREFIX)) continue;
      const next = PREFIX + key.slice(LEGACY_PREFIX.length);
      if (storage.getItem(next) === null) storage.setItem(next, storage.getItem(key)!);
      storage.removeItem(key);
    }
  } catch { /* وضع التصفح الخاص */ }
}
```
- تُستدعى في `main.tsx` لكل من frontend و pos و self-order، وفي `main.js` لـ mosaic و urypos (نسخة محلية، لأنهما خارج الـ workspace).
- السكربت المضمّن في كل `index.html` يقرأ `ury_language` قبل تحميل التطبيق، لذا يجب أن يقرأ `restro_language` ثم `ury_language` كاحتياط.
- **يبقى كود الترحيل إصدارين على الأقل** قبل حذفه.

#### 5-ب. بقية المعرّفات

| البند | من ← إلى | ملاحظة |
|---|---|---|
| حزم npm | `@ury/ui` و`@ury/core` ← `@restro/ui` و`@restro/core` | 440 استيراداً + `package.json` + aliases في `vite.config` و`tsconfig` + `yarn install`. **commit واحد لكل حزمة**، لأن التقسيم لملفات يكسر البناء |
| سكربتات npm | `ury-*-build` ← `restro-*-build` | تحديث CI معها في نفس الـ commit |
| CSS | `.ury-cc-*` ← `.restro-cc-*` · `ury-qr-*` · `ury-table/room/menu` · `@keyframes ury-float` | بحث واستبدال داخل كل ملف |
| حدث Realtime | `ury_configure_progress` ← `restro_configure_progress` | الخادم والواجهة **في نفس الـ commit** |
| مفاتيح الكاش | `ury_dashboard_*` ... ← `restro_*` | آمنة، يُعاد بناؤها |
| مفاتيح i18n | `loading_ury_pos` · `no_ury_restaurant_*` ← أسماء بدون ury | في كل ملفات اللغات + الاستدعاءات |
| مفاتيح ترجمة الإعداد | `ury.setup.*` ← `restro.setup.*` | |
| دوال Python | `is_ury_setup_complete` ← `is_restro_setup_complete` ... | ⚠️ **الدوال المسجلة في `hooks.py` أو المنادى عليها من الواجهات عبر API لا تُعاد تسميتها**، لأن اسمها جزء من المسار. تُعاد تسمية الداخلية فقط |
| ملفات `ury/ury/api/ury_*.py` | **تبقى** | أسماؤها جزء من مسارات API التي تناديها الواجهات والأجهزة المطبوعة |

**التحقق:** `yarn build` لكل التطبيقات + `yarn test` + اختبار يدوي: طلب أوفلاين قبل التحديث يجب أن يُرسل بعده، والجهاز اللوحي المربوط يبقى مربوطاً.

---

### المرحلة 6: الأدوار، قوالب الطباعة، مركز التحكم 🔴

> **اختيارية.** بعد المرحلة 2 تظهر الأدوار للمستخدم بأسمائها الجديدة أصلاً عبر الترجمة. نفّذ هذه المرحلة فقط إذا أردت أن يكون **الاسم المخزّن** نفسه بدون URY، مثلاً لتقارير الصلاحيات أو التكامل مع أنظمة أخرى.

#### 6-أ. الأدوار

| القديم | الجديد |
|---|---|
| URY Manager | Restro Manager |
| URY Cashier | Restro Cashier |
| URY Captain | Restro Captain |
| URY Admin | Restro Admin |
| URY Waiter | Restro Waiter |

1. **patch** في قسم `[pre_model_sync]` من `patches.txt` (يجب أن يعمل قبل مزامنة صلاحيات الـ DocTypes):
   ```python
   # ury/patches/v3_0/rename_ury_roles.py
   ROLES = {"URY Manager": "Restro Manager", ...}
   def execute():
       for old, new in ROLES.items():
           if frappe.db.exists("Role", old) and not frappe.db.exists("Role", new):
               frappe.rename_doc("Role", old, new, force=True)
   ```
   `rename_doc` يحدّث كل حقول الـ Link (Has Role، DocPerm، Custom DocPerm ...).
2. **في نفس الـ PR**: تحديث 326 مرجعاً نصياً (صلاحيات كل DocType JSON، `fixtures/role.json`، `role_permissions.py`، `has_role` في Python و TS، `frontend/src/data/schemas/user.json`).
3. ⚠️ أي patch قديم في `patches/` يذكر `URY Admin` **لا يُعدَّل**، لأنه تاريخ ويعمل على مواقع قديمة.

#### 6-ب. قوالب الطباعة
`URY Kitchen Ticket` ← `Restro Kitchen Ticket` · `URY Waiter Order Slip` ← `Restro Waiter Order Slip`
- patch بـ `frappe.rename_doc("Print Format", ...)`. **تحقّق** أن `custom_kot_print_format` و`custom_waiter_print_format` في `URY Printer Settings` من نوع Link، وإلا فأضف `frappe.db.set_value` يدوياً.
- تحديث المراجع النصية في `ury_waiter_print.py` وغيره.
- إعادة تسمية المجلدات `print_format/ury_*` ← `restro_*`.

#### 6-ج. صفحة مركز التحكم
`/app/ury-control-center` ← `/app/restro-control-center`
- إعادة تسمية المجلد والـ JSON (`name`، `page_name`، `title: "Restro Control Center"`).
- patch يحذف سجل Page القديم.
- سطر في `app_include_js` يحوّل الرابط القديم: إذا كان `frappe.get_route()[0] === 'ury-control-center'` فنفّذ `frappe.set_route('restro-control-center')`.
- تحديث `frontend/src/components/layout/Sidebar.tsx`.

**التحقق:** على **نسخة من قاعدة إنتاج حقيقية** (وليس موقعاً فارغاً):
```bash
bench --site <copy> migrate
```
ثم دخول كاشير وكابتن ومدير والتأكد من الصلاحيات، وطباعة تذكرة مطبخ ووصل نادل.

---

### المرحلة 7: التوثيق و CI 🟢

- `README.md` و`SETUP.md` و`INSTALLATION.md` و`FEATURES.md` و`docs/` و`AGENTS.MD`: استبدال الاسم **مع إبقاء فقرة الإسناد** ("Smart Restro is based on URY by Tridz Technologies, AGPL-3.0").
- `pyproject.toml` و`setup.py`: **إضافة** Smart Choice إلى `authors` (بدون حذف Tridz)، وتغيير `description`.
- `hooks.py`: `app_email` ← بريد Smart Choice.
- CI: `deploy-ury.yml` ← `deploy-restro.yml`، `name: Deploy Smart Restro`. الأسرار `URY_DEPLOY_*` ← `RESTRO_DEPLOY_*`، ويجب **إنشاء الأسرار الجديدة في GitHub قبل** دمج التعديل وحذف القديمة بعده.
- Git remote: `git remote rename URYorigin restro-origin` (محلي فقط).

---

## 4. النشر والتراجع

| الخطوة | التفاصيل |
|---|---|
| **ترتيب النشر** | 1 + 2 + 3 معاً (إصدار واحد) ← 4 ← 5 ← 6. أسبوع على الأقل بين كل إصدار |
| **بعد كل نشر** | `bench build --app ury && bench --site all migrate && bench --site all clear-cache` |
| **التواصل** | قبل المرحلة 4: إبلاغ العملاء أن الروابط ستتغير، والقديمة ستتحول تلقائياً |
| **التراجع (1–3، 5)** | `git revert` للـ PR ثم إعادة النشر. لا أثر على البيانات |
| **التراجع (4)** | revert. التحويلات 302 لا يحفظها المتصفح، **ولهذا نبدأ بـ 302 وليس 301** |
| **التراجع (6)** | ⚠️ يحتاج patch عكسي يعيد الأسماء القديمة. لذلك يُجرَّب على نسخة إنتاج أولاً، ويُنشر بعد نسخة احتياطية |

## 5. أسلوب الـ commits

نفس الأسلوب المعتمد في المستودع (Conventional Commits + Gitmoji):

```
🌐 feat(i18n): add English display names for Restro doctypes
💄 feat(pos): show Smart Restro in the POS title
🔥 chore(assets): remove the unused URY logos
🔀 feat(routing): serve the restaurant app at /restro
🚚 refactor(ui): rename @ury/ui to @restro/ui
🗃️ feat(roles): rename URY roles to Restro with a migration patch
📝 docs: describe Smart Restro and keep the URY attribution
👷 ci: rename the deploy workflow to Smart Restro
```
- commit لكل ملف حيث يكون ذلك آمناً (المراحل 1، 2، 3، 7).
- commit لكل **وحدة منطقية** حيث يكسر التقسيمُ البناءَ (إعادة تسمية الحزم، الروابط، الأدوار + الـ patch).

## 6. معيار الإنجاز النهائي

```bash
# لا شيء ظاهر للمستخدم يحتوي URY
git grep -nE "\bURY\b" -- '*.html' '*.vue' '*.tsx' '*/locales/*.json' 'ury/public/js' 'ury/www'
# كل DocType مترجم
bench --site <staging> run-tests --app ury --module ury.tests.test_rebrand_translations
```
+ جولة يدوية بالعربية والإنجليزية: الدخول، معالج الإعداد، اللوحة، نقطة البيع (حاسوب وهاتف)، المطبخ، الطلب الذاتي، الديسك (Workspace، القوائم، البحث، المستخدمين والأدوار)، الطباعة.

---

## الملحق A: أسماء الـ DocTypes المعروضة

> الاسم في قاعدة البيانات **لا يتغير**. هذا ما يُكتب في `en.csv` و`ar.csv`.

| الاسم الحالي (DB) | English (`en.csv`) | العربية (`ar.csv`) |
|---|---|---|
| URY Audit Log | Restro Audit Log | سجل التدقيق |
| URY Checklist Item | Restro Checklist Item | بند قائمة التحقق |
| URY Checklist Log Item | Restro Checklist Log Item | بند سجل التحقق |
| URY Consumption Log | Restro Consumption Log | سجل الاستهلاك |
| URY Consumption Log Item | Restro Consumption Log Item | بند سجل الاستهلاك |
| URY Cost Of Goods | Restro Cost of Goods | كلفة البضاعة |
| URY Daily P and L | Restro Daily P&L | الأرباح والخسائر اليومية |
| URY Delivery | Restro Delivery | طلب توصيل |
| URY Delivery Zone | Restro Delivery Zone | منطقة التوصيل |
| URY Driver | Restro Driver | سائق التوصيل |
| URY Feature Flag | Restro Feature Flag | مفتاح ميزة |
| URY Feature Settings | Restro Feature Settings | إعدادات الميزات |
| URY Fixed Expenses | Restro Fixed Expenses | المصاريف الثابتة |
| URY Guest Feedback | Restro Guest Feedback | تقييم الضيف |
| URY KOT | Restro KOT | تذكرة المطبخ |
| URY KOT Error Log | Restro KOT Error Log | سجل أخطاء تذاكر المطبخ |
| URY KOT Items | Restro KOT Item | بند تذكرة المطبخ |
| URY Kitchen Message | Restro Kitchen Message | رسالة المطبخ |
| URY Kitchen Message Ack | Restro Kitchen Message Ack | تأكيد استلام رسالة المطبخ |
| URY Materials | Restro Materials | المواد |
| URY Menu | Restro Menu | قائمة الطعام |
| URY Menu Course | Restro Menu Course | مرحلة التقديم |
| URY Menu Item | Restro Menu Item | صنف القائمة |
| URY Merged POS Invoice Detail | Restro Merged POS Invoice Detail | تفاصيل فاتورة نقطة البيع المدمجة |
| URY Notification Recipient | Restro Notification Recipient | مستلم الإشعار |
| URY Order | Restro Order | طلب المطعم |
| URY Order Item | Restro Order Item | بند الطلب |
| URY Ordering Device | Restro Ordering Device | جهاز الطلب الذاتي |
| URY Ordering Session | Restro Ordering Session | جلسة الطلب الذاتي |
| URY P and L Breakup | Restro P&L Breakup | تفصيل الأرباح والخسائر |
| URY P and L Materials | Restro P&L Materials | مواد الأرباح والخسائر |
| URY POS Checklist Log | Restro POS Checklist Log | سجل قائمة تحقق نقطة البيع |
| URY Payment Terminal | Restro Payment Terminal | جهاز الدفع |
| URY Payment Terminal Transaction | Restro Payment Terminal Transaction | عملية جهاز الدفع |
| URY Print Job | Restro Print Job | مهمة طباعة *(موجودة)* |
| URY Printer Settings | Restro Printer Settings | إعدادات الطابعة |
| URY Production Item Groups | Restro Station Item Groups | مجموعات أصناف القسم |
| URY Production Unit | Restro Kitchen Station | قسم المطبخ |
| URY Report Settings | Restro Report Settings | إعدادات التقارير |
| URY Restaurant | Restaurant | المطعم |
| URY Role Access | Restro Role Access | صلاحيات الدور |
| URY Room | Restro Dining Area | صالة الطعام |
| URY Self Ordering Profile | Restro Self-Ordering Profile | ملف الطلب الذاتي |
| URY Service Request | Restro Service Request | طلب خدمة |
| URY Sync Request | Restro Sync Request | طلب مزامنة |
| URY Table | Restro Table | الطاولة |
| URY Table Reservation | Restro Table Reservation | حجز طاولة |
| URY User | Restro User | مستخدم المطعم |
| URY Variable Expenses | Restro Variable Expenses | المصاريف المتغيرة |
| URY Waitlist Entry | Restro Waitlist Entry | قائمة الانتظار |
| URY Waste Log | Restro Waste Log | سجل الهدر |
| URY Waste Log Item | Restro Waste Log Item | بند سجل الهدر |
| URY Website | Restro Website | موقع المطعم *(موجودة)* |
| URY Website Hours | Restro Website Hours | أوقات عمل موقع المطعم *(موجودة)* |
| URY Website Image | Restro Website Image | صور موقع المطعم *(موجودة)* |

> استثناء واحد من البادئة: `URY Restaurant` ← `Restaurant`، لأن "Restro Restaurant" تكرار، ولا يوجد DocType بهذا الاسم في Frappe/ERPNext v15 (تحققت).
>
> المصطلحات العربية تتبع ما هو معتمد في واجهات mosaic و pos (مثلاً "قسم" للـ Production Unit). راجعها مع فريق التشغيل قبل الاعتماد.

## الملحق B: الأسماء الأخرى المعروضة

| الحالي | English | العربية |
|---|---|---|
| URY (الموديول) | Smart Restro | سمارت ريسترو |
| URY Manager | Restro Manager | مدير المطعم |
| URY Cashier | Restro Cashier | كاشير |
| URY Captain | Restro Captain | كابتن الصالة |
| URY Admin | Restro Admin | مسؤول النظام |
| URY Waiter | Restro Waiter | نادل |
| URY POS | Restro POS | نقطة البيع |
| URY Control Center | Restro Control Center | مركز التحكم بالمطعم *(موجودة)* |
| URY Kitchen Ticket (قالب) | Restro Kitchen Ticket | قالب تذكرة المطبخ |
| URY Waiter Order Slip (قالب) | Restro Waiter Order Slip | قالب وصل النادل |
| URY login page | Smart Restro sign-in page | صفحة دخول المطعم *(موجودة)* |
