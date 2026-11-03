# REVIEW-NEEDED: Arabic strings for native review

Machine-assisted translations; items below were flagged as uncertain. Whole file needs native review.

## Batch 1
- AC => مكيّف (could be "alternating current"/"air conditioning"; context unknown, likely dine-in AC room type)
- Captain Transfer => نقل الكابتن (glossary FLAG: Captain term)
- Actor => المنفِّذ (audit-log sense; alternative الفاعل)
- Burning Materials (Other Consumables) => مواد الاحتراق (مستهلكات أخرى) (cooking fuel? domain meaning unclear)
- Closer / Close Grace (Minutes) => المُقفِل / مهلة الإقفال (دقائق) (cash-up semantics)
- Counting Mistake => خطأ في العد (stock-count correction category)
- Depreciation Percent => نسبة الإهلاك (may mean something other than asset depreciation)
- Daily Fixed => ثابت يومي (cost basis label)
- Attribution Mode => نمط الإسناد (cost-variance attribution)
- Approval Snapshot (Hash) => لقطة الاعتماد / تجزئة (technical terms)
- Authorized Qty => الكمية المصرّح بها (Issue Authorization context)
- Issue Authorization => تفويض الصرف (invented term for stock issue authorization)
- Advisory marker MADE_TO_ORDER help text (#37) => long technical help; enum constants and code names kept
- "Controlled by Sales Plan" => بحسب خطة المبيعات (field label; referenced in "Allow Over-Plan Sale" help text, kept consistent)
- Allow Over-Plan Sale => السماح بالبيع فوق الخطة
- Closing Reconciliation => مطابقة الإقفال (Tier 1/Tier 2 gate help text #10)
- Block Takeaway KOT/Orders => حظر ... للسفري (Take Away = سفري)
- Cannot {0} {1} (#153) => لا يمكن {0} {1}: verb {0} is substituted in English, grammar may not fit Arabic
- A reason is required to {0} this Sales Plan (#15) => same placeholder-verb issue
- Cancelled Stock Correction Entry => قيد تصحيح المخزون الملغى
- Circle => دائرة (UI shape?); ArrayBuffer, AsyncFunction, Blob copied unchanged (code identifiers)
- Dependent Checklist => قائمة التحقق التابعة
- Course Icon => أيقونة القسم (course = قسم قائمة الطعام per glossary, shortened)
- Chef (#168) => الطاهي; Cart Items => أصناف السلة
- Check Details/Check Type/Checked By => تفاصيل الفحص/نوع الفحص/فحصه (yield check, fine)
- Active Info => معلومات نشطة (unclear context)
- Assistance => المساعدة (customer-assist request on POS? could be طلب مساعدة)
- Bill (#94) => الفاتورة per glossary
- Decided On => تاريخ القرار
- Credential Hash => تجزئة بيانات الاعتماد
- #12 HTML list item: only text inside <li> translated, tags kept

## Batch 2
- Disposition => التصرف : domain term (stock/fulfilment disposal outcome); could be "المآل"/"الوجهة"
- Dropped/Damaged => ساقط/تالف : "ساقط" for dropped is unusual; alternative "متساقط"
- Duplicate KOT ( CHECK WITH CAPTAIN ) => أمر مطبخ مكرر ( راجع الكابتن ) : Captain per glossary flag
- Enable Pay at Counter => تفعيل الدفع عند الكاونتر : "الكاونتر" vs "المنضدة/الصندوق"
- Enable Kiosk Ordering / Kiosk => الطلب عبر الكشك / كشك : loanword choice
- Frozen Payload => الحمولة المجمّدة : technical label
- Extended Hours => ساعات ممتدة
- Failure Class => فئة الإخفاق : technical
- FAILED => فشل : enum-like constant, translated for display; keep if it is a code value
- HARD => صارم : enum constant, glossary maps Hard=صارم
- Idempotency Key => مفتاح عدم التكرار : technical term; alternative "مفتاح التكرار الآمن"
- Lead Chef => كبير الطهاة : alternative "رئيس الطهاة"
- Lease Owner / Leased Until => مالك التأجير / مؤجَّر حتى : job-lease concept, internal
- Marginal => هامش ضعيف : context unclear (profitability class vs. "marginal")
- Mark as Wasted => تحديد كهدر
- Opportunity Cost => تكلفة الفرصة البديلة
- Indicate Course / Indicate In KDS => تحديد القسم / تحديد الظهور في شاشة المطبخ : unclear intent; "Course" kept per Menu Course glossary
- Execution State => حالة التنفيذ ; Expires At => تاريخ الانتهاء (could be a datetime)
- Enabled By => فعّله : short label, alternatives "مفعّل بواسطة"
- GSTIN label => رقم التسجيل الضريبي (GSTIN) : kept GSTIN acronym
- Long Lucide icon string: icon names kept in Latin on purpose
- Idempotency/revision long help text (G-07 gate, accepted_revision) => translated; internal developer text, code identifiers kept
- Item {0} ... PRE_PRODUCED/IN_HOUSE message => constants/code kept in Latin
- Item Added Total Qty= (3 strings) => تمت إضافة صنف، إجمالي الكمية = : trailing space kept; unclear where shown
- Keep Sales Invoice Unpaid => إبقاء فاتورة المبيعات غير مدفوعة
- Main Cashier => الكاشير الرئيسي (glossary Cashier = الكاشير; demo csv has أمين الصندوق for generic)
- Manufacture Trigger Time Configuration => إعداد وقت تشغيل التصنيع
- MTO => MTO : kept as acronym
- Ingenico, FileList, HTMLFormElement : copied unchanged (brand/code)
- Invalid Yield Check Cadence => دورية فحص المردود غير صالحة
- Insufficient Store stock => مخزون المتجر : "Store" assumed warehouse-type name
- Menu For Room / Menu for Room => both قائمة الطعام للقاعة (duplicate keys differing in case)

## Batch 3
- Minimum Seating => الحد الأدنى للمقاعد, "seating" could mean capacity vs. seating arrangement.
- Merged With => مدمجة مع, grammatical gender depends on referent (tables).
- Opener => فاتح الجلسة, unclear what is being opened (session/entry).
- Pax / PAX => عدد الأفراد, restaurant term for guest count; alternative "ضيوف".
- Captain (in "another Captain's order") => كابتن, per glossary FLAG.
- Posting intent (نية الترحيل) => internal ledger-posting concept, per glossary FLAG #6.
- Posted Cost / Posted At / Posted By => التكلفة المرحّلة / وقت الترحيل / رُحّل بواسطة, ledger "posting" sense assumed.
- Issue Wastage / Issue Authorization => هدر الصرف / تفويض الصرف, domain-specific, "Issue" read as stock issue.
- Yield Check / Yield standard => فحص المردود / معيار المردود, glossary FLAG.
- Opportunity Costs => تكاليف الفرصة البديلة, accounting term.
- Order Taker checklists => قائمة افتتاح/إقفال لآخذ الطلبات, "آخذ الطلبات" role name unusual.
- Prior Authorized/Returned/Wasted Qty => the "Prior" wording assumed cumulative earlier quantities.
- Product Block => كتلة المنتج, meaning unclear in context.
- Pre-Produced / Made to Order / Direct Retail => منتجة مسبقًا / مصنّعة عند الطلب / البيع المباشر, production policy names.
- External Receipt / In House => استلام خارجي / داخلي, enum-like labels.
- Plan Approval Hash => بصمة اعتماد الخطة, technical.
- Frozen demand => طلب مجمّد, planning term.
- Long technical strings (_mark_failed, recover_pending_posting_intents, V3-53, BUNDLE, retryable=0) kept as code identifiers.
- Phone In => طلب هاتفي, ordering channel.
- Portable Tablet / Portrait Kiosk => جهاز لوحي محمول / كشك عمودي, device-type labels.
- "Not permitted to {0}: requires one of {1}" => غير مصرح بـ {0}: ..., depends on how {0} (a verb) is substituted.
- Reservation group / scope => مجموعة الحجز / نطاق الحجز, domain wording.
- "Parcel" => الطلبات السفري (takeaway), matches glossary "سفري".
- Failing closed => "يتم الإيقاف بدل التخمين", idiomatic paraphrase.

## Batch 4
- Production posting => قيد الإنتاج: "posting" rendered as accounting entry; verify vs ERPNext usage (ترحيل).
- KOT => أمر المطبخ (glossary), used in error messages.
- Fulfil/fulfilment posting => ترحيل التنفيذ (glossary flag 6).
- Reservation => الحجز; may clash with table reservations (الحجوزات); here stock reservation.
- Reservation Control => التحكم في الحجوزات.
- Stock Authority Gates => بوابات صلاحية المخزون (technical).
- Native POS => نقاط البيع الأصلية.
- Idempotency/"Scoped per" => محدد النطاق لكل (technical developer text).
- Spoilage => التلف; Spot-Check => فحص عشوائي.
- Slab => شريحة (pricing tier meaning assumed).
- Routine => روتيني; Simulated => محاكى.
- Special Dish => طبق خاص.
- Split By Contribution => التقسيم حسب المساهمة.
- Retry / Lease => إعادة المحاولة / الإيجار ("lease" = job lock; unclear).
- Remaining Entitlement => الاستحقاق المتبقي (department stock entitlement).
- TT Cost => تكلفة TT (acronym kept; meaning unknown).
- RM Checklist => قائمة فحص مدير المطعم (RM assumed Restaurant Manager).
- Table Takeaway => طاولة سفري.
- Table Disposables => مستهلكات الطاولة (glossary).
- Reason for  => "سبب " trailing space kept (prefix string).
- Pure-code retained inside text: PRE_PRODUCED, MADE_TO_ORDER, sourcing_mode, external_receiving_warehouse, bom_revision, function names, "POS Stock Authority V2 Enabled"/"URY Feature Flags" (quoted field/doctype names left English).
- Show Item Image In URY Pos => نقاط البيع أُوري.
- "Reserved for future LLM narration ... HUF automation (PR-B)" => kept HUF and PR-B in Latin.

## Batch 5
- Captain Transfer role description => "يمنح هذا الدور صلاحيات نقل الكابتن..." : follows glossary Captain = الكابتن; wording of "Captain Transfer" is a role name.
- Terminal => الجهاز الطرفي : in this context a payment terminal (demo uses "جهاز دفع"); unsure whether the field means the payment device.
- Tier gate 1/2/3 => بوابة المستوى : technical feature-flag wording.
- Tiered / Tier Mode => متدرج / وضع المستويات : domain term for commission tiers vs production tiers.
- Track-Item N2 / N4 => البند N2 / N4 : internal tracking labels, kept literal.
- Posting Intent => نية الترحيل : glossary flag 6 (internal term).
- Execution Heartbeat => نبض التنفيذ : technical job-liveness term.
- Yield-related strings (المردود, كمية المردود, تتبّع المردود) : glossary flag 1.
- Theoretical Cost / Variance vs Theoretical => التكلفة النظرية / التباين مقابل النظري : costing term, unsure of preferred wording.
- Variance vs Counted => التباين مقابل المعدود : stock-count context.
- Wasted => المهدور : short column label.
- Department Warehouse => مستودع القسم : may mean production-department warehouse.
- Store Warehouse => مستودع المخزن : "Store" (central store) could be المخزن الرئيسي.
- Tier gate 3 "blocks on unposted production" => يمنع إقفال نقاط البيع ... : paraphrased for clarity.
- compiled component vector => متجه مكوناته المُجمَّع : very technical, rarely seen by users.
- sourcing_mode / IN_HOUSE / MADE_TO_ORDER / PRE_PRODUCED : enum constants kept in Latin.
- idempotency / kill switch descriptions (V3-72, V3-73) => developer-facing text, translated literally; file names kept.
- Verifone, URLSearchParams, Websocket Print : brand/code kept (URLSearchParams and Verifone copied as is).
- URY Manager / URY Admin / URY User ... => "... أُوري" : brand in prose vs glossary which drops the URY prefix on doctype names; chose to keep for roles.
- Threshold Minutes => حد الدقائق : unsure of wording.
- Waiter Print Format => نسق طباعة النادل : print format translation.
- Whether the branch is open after 12 AM => "بعد الساعة 12 صباحًا" : meaning is past midnight.
- Block (policy option) kept as English "(Block)" in parentheses.

Skipped (identifiers, not translated): see skipped-ids.txt
