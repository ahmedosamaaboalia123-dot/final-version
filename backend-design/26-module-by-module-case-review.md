# المراجعة النهائية لكل موديول — Case Catalog

هذه الوثيقة تكمل المواصفات ولا تستبدل تفاصيلها. كل Case يطبق معه: صلاحية الخادم، `Idempotency-Key` للكتابة الحرجة، `expectedVersion` للتعديل المتزامن، وقت الخادم، Audit، وTransaction عند لمس أكثر من Collection. أكواد الأخطاء ثابتة ولا تعرض أسرارًا.

## 1. الموردون وحساباتهم

1. إنشاء مورد ببيانات صحيحة ينشئ Supplier وSupplierAccount صفريًا معًا؛ فشل الحساب يرجع الكل.
2. الاسم أو الهاتف المكرر مسموح مع تحذير تشابه، لأنهما ليسا هوية قانونية فريدة.
3. مورد INACTIVE لا يستخدم لمادة/شراء جديد، لكنه يعرض ويُسوى حسابه.
4. لا يحذف مورد له مادة أو قيد أو دفعة؛ يتحول INACTIVE.
5. DEBT/RECEIVABLE لا يحركان الدرج؛ الدفع/التحصيل فقط يحركانه.
6. دفعة أكبر من الرصيد أو رصيد صفر: `AMOUNT_EXCEEDS_BALANCE`.
7. دفع دين بلا درج أو بنقد غير كافٍ يفشل القيد والحركة معًا.
8. عمليتا دفع متزامنتان لا تصنعان رصيدًا سالبًا؛ version وtransaction تحسمان.
9. العكس مرة واحدة فقط، بسبب ومرجع للأصل، ولا تعديل لقيد تاريخي.
10. تاريخ العملية السابق مسموح، المستقبل مرفوض، ووقت التسجيل Server UTC دائمًا.
11. تغيير بيانات المورد لا يغير Snapshots في الدفعات والفواتير.
12. صفحة المورد تجمع المواد والقيود بأقسام Pagination مستقلة حتى لا تختلط cursors.

## 2. المواد الخام والدفعات والسحب

1. المورد ACTIVE والوحدتان والمعامل وحدود التنبيه مطلوبة عند الإنشاء.
2. نفس الوحدة الكبيرة والصغيرة أو conversionFactor ≤0 مرفوض.
3. supplierId يقفل عند أول Batch أو Recipe use؛ تعارض القفل مع التعديل تقرره Transaction واحدة.
4. لا كمية افتتاحية من تعريف المادة؛ كل كمية تدخل من Purchases فقط.
5. الكمية الصغيرة يحسبها الخادم؛ لا يثق في ناتج الفرونت.
6. تغيير الوحدات بعد الاستخدام مرفوض؛ الاسم والحدود يسمحان بالنسخة والصلاحية.
7. ترتيب السحب unique ومتصل منطقيًا؛ إعادة الترتيب ذرية وتزيد priorityVersion.
8. البيع والسحب والمرتجع المتزامنون يستخدمون conditional remaining quantity.
9. السحب النهائي لا يستعاد ولا يعدل؛ التصحيح بقيد مخزني مصرح مستقل إن تقرر لاحقًا.
10. سحب كامل يجعل quantity/value صفرًا مع معالجة باقي التقريب في آخر حركة.
11. الدفعة المنتهية قابلة للبيع لكنها تظهر تحذيرًا؛ الصفرية لا تدخل Allocation.
12. حذف تعريف غير مستخدم فقط؛ المستخدم يُوقف مع بقاء التاريخ.

## 3. التحذيرات

1. LOW_STOCK على المادة، EXPIRING/EXPIRED على الدفعة، OPEN_SHIFT_LONG على الوردية.
2. تحذيرات المخزون والصلاحية مشتقة ولا تحذف يدويًا؛ تختفي عند زوال الشرط.
3. expiryAlertDays=0 يعني تحذير يوم الانتهاء، وليس تعطيل التحذير.
4. expiryOn=null لا يولد صلاحية، لكنه لا يمنع المخزون.
5. الأيام تحسب بـAfrica/Cairo من تاريخ تجاري، لا فرق milliseconds خام.
6. تحديث الحدود يعيد التقييم ويصدر event عند تغير الحالة فقط.
7. Summary وRows من نفس evaluatedAt لتجنب أرقام لا تطابق الجدول.
8. Worker الوردية يمنع التكرار ويجمع thresholds الفائتة بعد downtime.
9. المورد المعروض لتحذير Batch هو Snapshot التاريخي، وللمادة هو المورد الحالي.
10. فشل القراءة يرجع خطأ، ولا يعرض أصفارًا كأنها صحيحة.

## 4. المشتريات

1. رقم المجموعة والتاريخ والمنشئ Server generated؛ لا مورد في الرأس.
2. المادة تسحب موردها من تعريفها، ولا يقبل السطر supplier override.
3. الكمية والسعر موجبان Decimal؛ line/total يعيد الخادم حسابهما.
4. المادة المكررة في Draft تدمج أو ترفض بسياسة واحدة؛ القرار المعتمد: ترفض ويعدل السطر القائم.
5. Split ينتج فاتورة مورد لكل Supplier وله splitVersion.
6. تعديل Draft بعد Split وقبل التسجيل يبطل Split ويعيد توليده؛ بعد أول تسجيل تقفل السطور.
7. تسجيل السطر مرة واحدة ينشئ Batch وMovement ويربط Purchase Item ذريًا.
8. expiry قديم مقبول ويولد EXPIRED warning، وreceivedOn بعد expiry يحتاج تنبيه لا منع.
9. Partial registration تبقى في غير المدرجة؛ آخر سطر يحول المجموعة REGISTERED.
10. حذف Draft فقط قبل التسجيل؛ المسجل لا يعدل ولا يحذف.
11. الشراء لا ينشئ دين مورد أو حركة درج وفق قرار الفصل اليدوي.
12. Print group وsupplier invoice يستخدمان Snapshot ثابتًا، ولا تغير الطباعة الحالة.

## 5. مرتجعات المشتريات

1. اختيار مادة ثم Batch محددة؛ default يمكن أن يقترح الأخيرة ولا ينفذ دون اختيار.
2. الكمية > remaining أو ≤0 مرفوضة.
3. تكلفة المرتجع من نفس Batch value، لا آخر سعر.
4. التنفيذ ذري: Return + Item + Movement + Batch balance.
5. ضغط مكرر يعيد نفس الفاتورة، ولا يخصم مرتين.
6. التزامن مع البيع/السحب يحسمه الرصيد والنسخة.
7. لا دين/مستحق/درج تلقائي.
8. فاتورة المرتجع نهائية immutable؛ التصحيح يحتاج reversal مخزني بصلاحية إن أضيف.
9. Batch صفرية لا تقبل مرتجعًا جديدًا.
10. السجل والطباعة Pagination/Print DTO كاملان مع supplier snapshot والتواريخ.

## 6. المنتجات والأقسام والأنواع والأحجام والوصفات

1. اسم القسم مطلوب؛ المستخدم تاريخيًا يوقف ولا يحذف.
2. المنتج يحتاج قسمًا فعالًا وصورة اختيارية آمنة النوع والحجم.
3. النوع فريد منطقيًا داخل المنتج، والحجم فريد داخل النوع.
4. sellingPrice >0؛ السعر تحت التكلفة تحذير لا منع.
5. Recipe على الحجم، المادة لا تتكرر وكميتها بالوحدة الصغيرة >0.
6. مادة متوقفة تبقى بوصفة تاريخية لكن تمنع تفعيل حجم جديد حتى التصحيح.
7. تعديل الوصفة يؤثر على الطلب القادم فقط؛ Order Item يحفظ Snapshot.
8. expectedCost محاكاة من الدفعات حسب الأولوية دون خصم.
9. actualCost من Allocations الفعلية ويثبت على الطلب.
10. نقص خام واحد يجعل الحجم unavailable عند التأكيد ولا يخصم بقية الخامات.
11. `showInMenu=false` يمنع الطلب الجديد ولا يخفيه من التاريخ.
12. Add-on بلا Recipe يجعل cost completeness جزئية؛ ذو Recipe يخصم كالحجم.

## 7. الطلبات العامة والمخزون

1. التأكيد يعيد التسعير والوصفات والإتاحة ثم ينشئ الطلب والخصم ذريًا.
2. سلة فارغة أو quantity غير صحيحة أو منتج مخفي مرفوض.
3. Idempotency يمنع Order مزدوجًا؛ نفس المفتاح مع Body مختلف 409.
4. حالة Order مشتقة من العناصر؛ CANCELLED items لا تدخل progress denominator.
5. إلغاء عنصر يعيد Allocations غير المعكوسة مرة واحدة ويعيد الإجماليات.
6. إلغاء كامل يعكس كل العناصر والدفع حسب القواعد ولا يترك نصف Refund.
7. إضافة عنصر إلى READY تعيده PREPARING؛ القديمة الجاهزة تظل READY.
8. لا إضافة بعد OUT_FOR_DELIVERY/CLOSING/COMPLETED/CANCELLED.
9. تغير سعر/Recipe لاحق لا يغير Order snapshots أو Invoice النهائية.
10. expectedVersion يحسم add/cancel/prepare/complete المتزامنة.
11. eventSequence يرتفع داخل Transaction ويضبط Realtime ordering.
12. Invoice final unique per order/revision ولا تتغير بعد الإكمال.

## 8. التحضير

1. لوحتان للطاولات وOnline/Takeaway، وكل منهما current/ready.
2. فتح الطلب يعرض Recipe Snapshot لا الوصفة الحالية.
3. «تم التحضير» على PREPARING فقط؛ التكرار idempotent.
4. إلغاء العنصر بالتزامن مع التجهيز: version يقبل واحدًا ويعيد الحالة النهائية.
5. آخر عنصر نشط READY يحول Order READY داخل العملية نفسها.
6. إضافة عنصر بعد READY تعيد الطلب Current لحظيًا.
7. Order CANCELLED/COMPLETED لا يظهر في اللوحات.
8. نقص Socket يعالج REST snapshot/reconnect.
9. صلاحية التحضير لا تمنح السعر أو التكلفة أو إلغاء الطلب.
10. زمن كل عنصر/الطلب يسجل للتحليل دون السماح بتعديل timestamps يدويًا.

## 9. المندوبون والتوصيل

1. الهاتف/واتساب يطبعان؛ حالة ACTIVE مطلوبة للتعيين.
2. طلب READY DELIVERY له تكليف نشط واحد فقط.
3. Handover يحول الطلب OUT_FOR_DELIVERY وreceipt AVAILABLE.
4. النقل يغلق التكليف القديم وينشئ جديدًا بسبب؛ القديم لا يكمل الطلب.
5. تعذر التسليم يسجل السبب والمحاولة ولا يعيد المخزون.
6. RETURNED_TO_STORE يسبق الإلغاء أو إعادة المحاولة.
7. العميل يؤكد الاستلام طبيعيًا؛ Admin override استثنائي بصلاحية وسبب.
8. ضغطا الاستلام لا يكرران delivery/COD events.
9. WhatsApp open لا يدعي SENT دون Webhook موثوق.
10. تعطيل المندوب لا يلغي تكليفًا جاريًا صامتًا؛ يحتاج نقل/إغلاق موثق.
11. COD outstanding يبقى على المندوب حتى Settlement فريد في درج مفتوح.
12. صفحة المندوب تفصل delivered، failed، active وcash ledger مع Pagination.

## 10. العملاء والتقييمات

1. phoneNormalized unique وUpsert ذري؛ طلبان متزامنان ينشئان Customer واحدة.
2. كل Order يحفظ Customer Snapshot.
3. آخر Profile يحدث بحسب أحدث order.createdAt لا آخر Commit.
4. هاتف جديد يعني Customer جديد؛ الدمج Admin workflow مستقل.
5. تاريخ الطلبات لا يُكشف بالهاتف فقط؛ يحتاج Access Session مثبتة.
6. Rating بعد COMPLETED فقط وواحد لكل orderId.
7. تعديل التقييم خلال المدة ينشئ Revision؛ الإخفاء الإداري لا يغير النجوم الأصلية.
8. حذف Customer ذي تاريخ ممنوع؛ status/anonymous request بسياسة قانونية لاحقة.
9. Timeline يجمع الطلبات والتقييمات والتصحيحات دون أسرار.
10. Pagination مستقلة لكل جدول في صفحة العميل.

## 11. Customer Web وLocal Storage والباريستا

1. Takeaway يتطلب اسمًا وهاتفًا؛ Delivery يضيف عنوانًا كاملًا.
2. Local Storage يحدث بعد نجاح الطلب فقط ويحتفظ بحد أقصى 50 knownOrders.
3. إضافة عنصر لا تغير Profile أو lastOrder.
4. Read Token لا ينفذ Mutation؛ Action Token لا يظهر في Barcode.
5. فقد Local Storage لا يفقد الطلب؛ استعادة الملكية تحتاج إثباتًا.
6. زر استلام Delivery يتفعل بعد handover، ولا يوجد في Takeaway.
7. Realtime قد يتكرر أو يفقد؛ sequence وREST يعالجان ذلك.
8. AI يرى public product projection فقط، ولا Recipe/Cost/Batch/Customer.
9. اقتراح AI Draft فقط؛ Catalog يعيد التحقق قبل Cart/Order.
10. DeepSeek timeout/rate limit لا يغير السلة أو ينشئ طلبًا.
11. Prompt injection لا يوسع Tool schema.
12. حذف العروض وخدمات الجرسون من Customer ثابت.

## 12. الطاولات وGuest Proposals

1. QR token يربط tableId ولا يقبل اختيارًا من العميل.
2. Guest Session لا تشغل الطاولة؛ أول Confirm للموظف يفعل ذلك.
3. السلة ترسل Proposal وCALL_WAITER ولا تخصم.
4. العميل لا يؤكد Proposal؛ الموظف يراجع/يعدل بموافقته الشفهية.
5. Proposal مكرر بالمفتاح يعيد نفسه.
6. تأكيدان متزامنان ينشئان Order/Table Session واحدة.
7. نقص المخزون يبقي Proposal قابلة للتعديل بلا خصم جزئي.
8. Proposal لـREADY order تضيف العناصر وتعيده PREPARING.
9. Token منتهي/QR version قديم لا يقرأ أو ينشئ.
10. إغلاق الطاولة يغلق/يفصل Guest Sessions حسب الارتباط.
11. لا عروض أو AI أو Smart Waiter في Table.
12. Dine-in review بعد COMPLETED ومرتبط Guest Session وOrder.

## 13. خدمات الطاولة

1. الأنواع الخمسة فقط؛ unknown type مرفوض.
2. duplicate OPEN لنفس owner/type يعيد الموجود ولا ينشئ كارتًا ثانيًا.
3. طلب المشكلة يحتاج تفاصيل، والمياه quantity موجبة ضمن حد.
4. المصدر Guest أو Admin محفوظ.
5. «تم التعامل» من OPEN إلى RESOLVED مرة واحدة مع actor/time.
6. العميل يلغي فقط قبل بدء التعامل وفق السياسة.
7. BILL لا يطبع أو ينهي أو يحرك الدرج وحده.
8. خدمة مدفوعة تضاف Order Item، والخدمة نفسها لا تخصم.
9. إغلاق الجلسة يحل BILL ويلغي غيره بأسباب System واضحة.
10. Realtime event بعد Commit وOutbox عند الفشل.

## 14. الدرج والوردية

1. وردية نشطة واحدة للنطاق؛ فتحان متزامنان ينجح أحدهما.
2. openingBalance لا Revenue ولا Cash In.
3. كل IN/OUT له accountingClass ومصدر وbalanceAfter.
4. CASH operation بلا OPEN shift تفشل كلها.
5. OUT أكبر من المتوقع مرفوض.
6. حركة آلية unique بالمصدر؛ اليدوية تحتاج سببًا وتصنيفًا.
7. العكس مرة واحدة وفي وردية حالية مع مرجع للقديمة.
8. الإغلاق يحول CLOSING أولًا؛ لا حركات بعدها.
9. expected = opening + cashIn - cashOut؛ actual والفرق يحفظان دون تصنيف تلقائي.
10. 12/24/36h alerts محفوظة وفريدة؛ downtime ينتج إشعارًا مجمعًا.
11. Print المفتوح Snapshot مؤقت، والمغلق نهائي؛ الطباعة لا تغير الحالة.
12. mismatch بين ledger وprojection يمنع الإغلاق ولا يصلح صامتًا.

## 15. الموظفون والأجهزة والحضور والصلاحيات

1. إنشاء الموظف يحتاج اسمًا ومنصبًا وكلمة مرور وسياسة status.
2. plaintext password يظهر فقط `employees.password.read` ولا يدخل List/Logs/Audit.
3. login من جهاز جديد ينتج PENDING_DEVICE ولا Session كاملة.
4. approve/block متزامنان يحسمهما version؛ Block يلغي الجلسات.
5. Fingerprint ليس Authentication منفردًا؛ server device credential مطلوب.
6. موظف INACTIVE لا يدخل أو يجدد Token.
7. check-in واحد مفتوح؛ محاولة ثانية تعيد الحالي.
8. checkout Admin فقط وفق القرار، ويحسب overnight/timezone بشكل صحيح.
9. لا انصراف لمسؤول درج مفتوح قبل نقله/إغلاقه.
10. Permission deny في Backend حتى لو الزر ظاهر خطأ.
11. تغيير permissions يزيد permissionsVersion ويلغي أثر Tokens القديمة.
12. صفحة الموظف تجمع أجهزته وحضوره وأحداثه بجداول Pagination مستقلة.

## 16. سجل الطلبات والفواتير

1. Online/Takeaway منفصلان عن Dine-in بفلاتر وقناة قانونية.
2. الترتيب createdAt desc ثم _id، Pagination 10.
3. البحث بالرقم exact أولًا ثم الفلاتر؛ لا regex غير مفهرس على مجموعة كاملة.
4. Invoice DTO واحد لكل العميل والمندوب والسجل والطباعة.
5. Invoice قبل الإكمال Preview؛ بعده Final immutable/checksum.
6. cancelled يظهر بإجماليات الإلغاء ولا يدخل المبيعات.
7. إعادة الطباعة Audit فقط ولا تنشئ Invoice جديدة.
8. timezone/عملة/ضريبة/rounding snapshots تمنع اختلاف التاريخ.

## 17. التقارير المالية

1. Net Sales من Completed بعد refunds، لا من Drawer net.
2. COGS من allocations الفعلية، وWaste من withdrawals.
3. Card/Transfer Sales تظهر ماليًا ولا تدخل Cash Drawer.
4. COD completed غير المسوى يظهر Sales وعهدة مندوب.
5. Purchases تزيد Inventory Asset ولا تعتبر Expense لحظة الإدراج.
6. Supplier manual balances تعرض منفصلة عن Purchases.
7. Opening/shortage/surplus لا Revenue/Expense تلقائيًا.
8. الفلاتر تستخدم حدود UTC مشتقة من Cairo وتثبت في Response.
9. Summary وdetails من نفس snapshot/read concern.
10. Export ثقيل Async 202 وله status/file expiry وصلاحية.
11. costCompleteness يظهر عند Add-ons بلا Recipe.
12. لا تعرض أرقامًا صفرية موثوقة عند partial source failure؛ تعرض dataQuality flags.

## 18. سجل الأحداث الشامل والإشعارات

1. كل Mutation حرجة تسجل actor/action/entity/before/after/requestId/time/result.
2. رفض الصلاحية ومحاولة الدخول والفشل المالي تسجل دون أسرار.
3. لا Password/Token/DeepSeek key/full sensitive body.
4. Audit المالي داخل Transaction؛ Outbox يضمن النشر بعد Commit.
5. إعادة المحاولة لا تكرر Business Event بoperationRequestId.
6. actor system/job واضح، ولا ينسب لموظف وهمي.
7. before/after محدود للحقول المهمة وحجمه مضبوط.
8. retention/archive policy لا يحذف داخل واجهة المستخدم.
9. قراءة كلمة المرور والتقرير والدرج والتصدير تسجل كSensitive Read.
10. Notifications لها deduplicationKey وreadAt؛ القراءة لا تغير Business state.
11. فشل نشر Socket يعاد دون إعادة العملية الأصلية.
12. البحث والتصدير Audit pagination ثابت وصلاحيات دقيقة.

## 19. أخطاء API الموحدة

`VALIDATION_ERROR(400)`, `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`, `NOT_FOUND(404)`, `STATE_CONFLICT(409)`, `VERSION_CONFLICT(409)`, `IDEMPOTENCY_KEY_REUSED(409)`, `INSUFFICIENT_STOCK(409)`, `RATE_LIMITED(429)`, `DEPENDENCY_TIMEOUT(504)`, `INTERNAL_ERROR(500)`.

الـError DTO: `code`, `messageAr`, `fieldErrors[]`, `requestId`, و`retryable`. لا Stack أو Mongo details في Production.

## 20. بوابة الجاهزية للتنفيذ

لا يبدأ تنفيذ موديول قبل وجود: State transition table، Validation schema، indexes، permissions، idempotency scope، transaction boundary، audit events، error mapping، pagination query، realtime/outbox events، واختبارات الحالات المذكورة أعلاه. بهذا أصبحت الحالات الأساسية والاستثنائية والمتزامنة مغطاة لكل موديول معروف في النطاق.
