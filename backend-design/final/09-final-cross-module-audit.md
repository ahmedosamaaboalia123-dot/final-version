# التدقيق النهائي الشامل والقرارات العليا

هذه الوثيقة هي أعلى مرجع عند التعارض. تمت مقارنة المتطلبات والـERD والـSchemas والـAPI والهيكل وواجهات Admin/Table/Customer.

## 1. تعارض التسليم المحسوم

- يبقى طلب Online في `OUT_FOR_DELIVERY` من تسليمه للمندوب حتى إثبات استلام العميل.
- الحقل `customerReceiptStatus` يكون `LOCKED` ثم `AVAILABLE` بعد `HANDOVER_TO_DELEGATE`، ثم `CONFIRMED` بعد ضغط العميل «استلام».
- ضغط العميل ينقل الطلب إلى `COMPLETED`. لا توجد حالة Order باسم `CUSTOMER_RECEIPT_PENDING`.
- زر «تسليم» القديم في صفحة المندوب يصبح تجاوزًا إداريًا استثنائيًا باسم «تأكيد تسليم إداري»، يحتاج `delegates.confirm_delivery_override` وسببًا إلزاميًا، ويسجل `customerReceiptStatus=ADMIN_CONFIRMED`.
- تحصيل COD وتسويته في الدرج مستقلان عن إثبات الاستلام ولا يتكرران مع أي مسار إكمال.

## 2. أمان التتبع والباركود

- `trackingReadToken` للقراءة فقط، ويمكن تضمينه في Barcode قصير الصلاحية.
- `orderActionToken` لا يظهر في Barcode أو URL أو Logs؛ يلزم لإضافة عنصر أو طلب الإلغاء أو تأكيد الاستلام أو التقييم.
- يخزن الخادم Hash لكل Token. الهاتف ورقم الطلب وLocal Storage لا يمنحون صلاحية وحدهم.
- نفس المتصفح يعرض `knownOrders`. على جهاز جديد يثبت العميل طلبًا سابقًا بـorderNumber وAction Token، ثم يصدر `customerAccessSession` لنفس customerId. OTP Adapter تحسين بديل عند إضافة مزود.

## 3. القيم القانونية الموحدة

- UI «أونلاين» = `DELIVERY` في API/DB، تيك أواي = `TAKEAWAY`، طاولة = `DINE_IN`.
- Order: `CONFIRMED | PREPARING | READY | OUT_FOR_DELIVERY | COMPLETED | CANCELLED`.
- Order Item: `PREPARING | READY | CANCELLED`. حالة الطلب مشتقة بالخادم.
- Payment مستقل: `UNPAID | PENDING | PAID | COLLECTED_BY_DELEGATE | SETTLED | PARTIALLY_REFUNDED | REFUNDED`.
- كل API تحت `/api/v1`. كل قائمة تستخدم `page` و`limit`، والقيمة الافتراضية 10.
- الوردية تستخدم `shiftNo`, `totalCashIn`, `totalCashOut`.

## 4. حالات العميل والدفع الناقصة

- Customer آخر بياناته تتحدث فقط إذا كان `order.createdAt >= lastProfileOrderAt` حتى لا يكتب طلب قديم متأخر فوق الأحدث.
- تغيير هاتف طلب مؤكد يحتاج Admin correction ولا ينقل التاريخ تلقائيًا. دمج عميلين عملية مستقلة لا تغير الفواتير القديمة.
- بوابة Card/Transfer تعتمد Webhook idempotent، لا Redirect العميل.
- CASH Takeaway يدخل الدرج عند التسليم. COD يصبح عهدة مندوب عند إثبات الاستلام ويدخل الدرج عند التسوية.
- إضافة عنصر بعد دفع مسبق تنشئ `balanceDue` أو دفعة إضافية؛ لا يكتمل طلب له باقي إلا بصلاحية Credit Override.

## 5. الإلغاء الموحد

- `CONFIRMED/PREPARING`: يمكن طلب الإلغاء؛ التنفيذ يعيد نفس Allocations وقيمتها ذريًا. بدء التحضير قد يحتاج موافقة Admin.
- `READY`: العميل يرسل طلب إلغاء، والتنفيذ للأدمن بصلاحية وسبب.
- `OUT_FOR_DELIVERY`: يسجل `RETURNED_TO_STORE` أولًا ثم إلغاء مستقل. العودة وحدها لا تعيد المخزون.
- `COMPLETED`: لا إلغاء عادي؛ Refund/Return workflow مستقل.
- Refund المالي منفصل محاسبيًا عن عكس المخزون، ومربوطان بنفس Case. الفشل الجزئي يظهر `PENDING_REFUND` ولا يختفي.

## 6. المخزون والمشتريات

- الإلغاء يعيد نفس الدفعات والتكلفة، ولا يعيد التسعير.
- البيع يتنافس مع تغيير الأولوية عبر `priorityVersion` ويحفظ ترتيب الدفعات المستخدم.
- Add-on له تكلفة فعلية يحتاج Recipe؛ بدونه تعرض التقارير `costCompleteness=PARTIAL`.
- المورد يحدد عند إنشاء المادة ويقفل عند أول دفعة أو Recipe use.
- اختلاف Supplier بين المادة وPurchase Split قبل التسجيل يجعل Split قديمًا ويحتاج إعادة توليد. بعد أول سطر تقفل الفاتورة.
- المرتجع لا يتجاوز remaining batch ولا يحرك المورد أو الدرج تلقائيًا.

## 7. الطاولات والخدمات

- QR ينشئ Guest Session ولا يشغل الطاولة. اعتماد أول Proposal ينشئ Table Session ويخصم المخزون.
- الخدمة قبل الطلب تستخدم `requestOwnerKey=GUEST:id` وبعده `SESSION:id`. الاعتماد يربط السجلات من دون تكرار.
- إغلاق الجلسة يحل BILL_REQUEST ويلغي باقي الخدمات المفتوحة ويمنع Token QR قديم بعد تدوير `qrVersion`.

## 8. الوردية والـWorkers

- تحذير 12/24/36 ساعة يستخدم UTC وUnique `(shiftId,thresholdHours)` وOutbox.
- بعد Downtime طويل تُحفظ كل Thresholds المفقودة لمنع التكرار، ويرسل إشعار مجمع واحد يحمل `missedThresholds[]` لتجنب إغراق المستخدم.
- لا تحذير جديد للحالة `CLOSING/CLOSED`. الإغلاق والحركة والتحذير مشروطة بالحالة وversion.

## 9. الموظفون والسجل

- `passwordPlainText` لا يظهر إلا لصلاحية `employees.password.read`، ولا يدخل List/Audit/Notification/Log.
- حظر الجهاز يلغي Auth Sessions وRefresh Tokens. Fingerprint مؤشر جهاز وليس إثباتًا وحيدًا.
- تعطيل الموظف لا يمحو حضوره أو أحداثه، والدرج المفتوح يعالج إداريًا.
- Audit المالي الحرج يكتب في نفس Transaction؛ Socket بعد Commit عبر Outbox.

## 10. قواعد التزامن والتعافي

- إعادة Idempotency Key مع Body مختلف ترجع `409 IDEMPOTENCY_KEY_REUSED`.
- Unknown Commit يستعلم بالمفتاح نفسه ولا يعاد بمفتاح جديد.
- كل Pagination لها ترتيب ثابت و`_id` tie-breaker.
- Conditional stock update يشترط `remainingQuantitySmall >= requested` وversion.
- Decimal128 للمبالغ والكميات، وتخرج String في API.
- Soft delete للكيان المستخدم؛ Hard delete لتعريف غير مستخدم فقط.

## 11. اختبارات تكامل إلزامية

1. Online: إنشاء وخصم وتحضير ومندوب واستلام عميل وCOD وتسوية وتقييم.
2. Takeaway: إنشاء وتحضير وتسليم Admin ودفع وتقييم.
3. Table: QR وProposal وخدمة Realtime واعتماد وخصم وإغلاق وتقييم.
4. إلغاء كل قناة يعيد نفس الدفعات مرة واحدة.
5. إضافة عنصر إلى READY تعيده PREPARING في كل الواجهات.
6. طلبان لنفس الهاتف لا ينشئان Customer مكررًا أو مخزونًا سالبًا.
7. Barcode read token يفشل في add/receive/review.
8. Admin delivery override يحتاج صلاحية وسبب ولا يكرر COD.
9. وردية 25 ساعة تسجل 12 و24 مرة واحدة.
10. مورد المادة يقفل ذريًا مع أول دفعة.
11. Prompt injection لا يصل للوصفات لأن AI tool projection لا يحتويها.
12. Reconnect يستعيد REST Snapshot بآخر eventSequence.

## 12. نتيجة التدقيق

بعد تطبيق هذه القرارات لا توجد تعارضات معروفة غير محسومة داخل النطاق. التكاملات الخارجية التي تحتاج Adapter عند التنفيذ: بوابة الدفع، OTP إن اختير، WhatsApp Business الحقيقي، وDeepSeek credentials.
