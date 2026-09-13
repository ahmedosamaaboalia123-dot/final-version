# سياسة Race Conditions وزمن الاستجابة لكل النظام

الإصدار 1.0. هذه السياسة إلزامية لكل الموديولات والـWorkflows في المرجع النهائي.

## 1. هدف زمن الاستجابة

العمليات التفاعلية العادية:

- الهدف المعتاد: أقل من أو يساوي 500ms عند p95.
- الحد الأعلى التشغيلي: أقل من أو يساوي 1000ms عند p99.
- يبدأ القياس عند دخول الطلب إلى Express وينتهي عند اكتمال Response.
- يقاس زمن الخادم منفصلًا عن زمن شبكة المستخدم والرسم في React.
- كل Response يعيد requestId، ويمكن إضافة Server-Timing.

الأمثلة: قراءة صفحة paginated، إنشاء/تعديل بسيط، تأكيد طلب، إضافة أو إلغاء عنصر، تم التحضير، تم التعامل، فتح/إغلاق درج، وتسليم مندوب.

لا يمكن اعتبار ثانية ضمانًا مطلقًا عند تعطل قاعدة البيانات أو الشبكة، لذلك هي SLO قابلة للقياس والتنبيه. إذا تجاوز الطلب المهلة لا يعني أنه فشل؛ العميل يستخدم Idempotency-Key ثم يستعلم عن النتيجة قبل إعادة العملية.

## 2. العمليات الثقيلة

لا تنفذ داخل Request متزامن أطول من ثانية:

- Export كبير.
- PDF جماعي.
- تقرير على فترة ضخمة.
- إعادة بناء Projection.
- فحص اتساق شامل.
- إرسال خارجي بطيء.
- معالجة صور.

هذه ترجع خلال 500ms تقريبًا:

- HTTP 202 Accepted.
- jobId.
- status QUEUED.
- رابط GET للحالة.

Worker ينفذها، والواجهة تتابع بـSocket أو Polling متباعد. الطباعة الفردية تستخدم Print DTO سريعًا ولا تنتظر الطابعة.

## 3. ميزانية الثانية الواحدة

ميزانية إرشادية للعملية التفاعلية:

- Auth/Permission/Validation: 50–100ms.
- Mongo reads and indexed lookup: 100–200ms.
- Transaction business writes: 150–350ms.
- Mapping/serialization: أقل من 50ms.
- هامش retry/network الداخلي: 200ms.
- Socket/Outbox لا ينتظر داخل Response بعد Commit.

لا يوجد اتصال WhatsApp أو Email أو خدمة خارجية داخل Transaction.

## 4. معنى Race Condition

Race Condition تحدث عندما تصل عمليتان صحيحتان في الوقت نفسه وتعتمدان على نفس الحالة القديمة. الحل لا يعتمد على تعطيل الزر في الواجهة. الحماية الحقيقية في الباك بواسطة:

1. MongoDB Transaction.
2. expectedVersion وOptimistic Concurrency.
3. Conditional Update على الحالة والرصيد.
4. Unique وPartial Unique Indexes.
5. Idempotency-Key.
6. ترتيب ثابت لتحديث الدفعات.
7. Retry محدود لأخطاء TransientTransactionError.
8. Audit وcorrelationId.

## 5. Idempotency

كل أمر مالي أو مخزني أو انتقال نهائي يحتاج Idempotency-Key:

- confirm order.
- append items.
- cancel item/order.
- mark ready.
- complete pickup/table.
- assign/deliver delegate.
- create/resolve table service.
- supplier payment/collection.
- purchase registration/return/withdrawal.
- drawer open/movement/close.

operationRequests unique على actorId + scope + key. يحفظ requestHash. نفس المفتاح ونفس المحتوى يعيد نفس النتيجة. نفس المفتاح ومحتوى مختلف يرجع IDEMPOTENCY_CONFLICT.

الحالة PROCESSING تمنع تنفيذًا موازيًا. إذا مات الخادم، توجد lease قصيرة واستعلام recovery. لا تحفظ نتيجة نجاح قبل Commit.

## 6. Optimistic Concurrency

كل Aggregate حساس يحمل version:

- supplierAccount.
- rawMaterialBatch وrawMaterial stockVersion.
- purchaseGroup/item.
- order وorderItem.
- tableSession وtableServiceRequest.
- deliveryAssignment.
- drawerShift.
- employee/device.

الأمر يرسل expectedVersion. التحديث يشترط _id + version + الحالة الحالية، ثم يزيد version. modifiedCount=0 يعني إعادة قراءة وتحديد STATE_CONFLICT أو VERSION_CONFLICT.

لا يعمل Last Write Wins في المال أو المخزون أو الحالات.

## 7. ترتيب الأقفال المنطقي

لمنع Deadlocks وتعارضات عشوائية، أي عملية تمس عدة مستندات تحدثها بترتيب ثابت:

1. Aggregate الرئيسي.
2. العناصر مرتبة ObjectId.
3. المواد مرتبة materialId.
4. الدفعات مرتبة salePriority ثم batchId.
5. الدفع/الدرج.
6. Status Events وAudit.
7. Outbox.

كل طلب يستخدم الترتيب نفسه. Transaction قصيرة ولا تحتوي قراءة UI أو API خارجي.

## 8. مصفوفة Race Conditions

### 8.1 مورد

حالتان تدفعان آخر 100 من الدين:

- كلاهما يقرأ 100.
- التحديث الشرطي يحتاج debtBalance >= amount وversion.
- أول عملية تخصم وتنشئ حركة درج.
- الثانية تفشل VERSION_CONFLICT أو INSUFFICIENT_BALANCE.
- لا قيد مورد بلا حركة درج لأنهما Transaction واحدة.

عكس قيد مرتين يمنعه unique partial على reversesEntryId.

### 8.2 آخر كمية مخزون

طلبان يحتاجان آخر 20 جرام:

- كل عملية ترتب الدفعات بنفس الطريقة.
- تخصيص داخل Transaction.
- Update يشترط remainingQuantitySmall >= take وversion.
- واحد ينجح.
- الآخر يعاد داخليًا مرة أو مرتين من Snapshot جديد؛ إذا لم تكف يرجع INSUFFICIENT_STOCK.
- لا يسمح بمخزون سالب.

### 8.3 تأكيد الطلب مرتين

Idempotency-Key يعيد نفس order. حتى بمفتاحين مختلفين، clientDraftId unique اختياري يمنع Double Submit من نفس المسودة. Counter قد يترك فجوة عند rollback لكنه لا يكرر رقمًا.

### 8.4 تجهيز وإلغاء نفس العنصر

mark ready يشترط status=PREPARING.
cancel يشترط status in PREPARING/READY وversion.

من يصل أولًا يغير version. الثاني يعيد قراءة:

- إذا READY ثم وصل cancel، يمكن الإلغاء حسب السياسة ويعكس المخزون مرة.
- إذا CANCELLED ثم وصل ready، يرفض STATE_CONFLICT.
- reversalMovementId unique يمنع إرجاعًا مزدوجًا.

### 8.5 إضافة عناصر وإنهاء طلب READY

append يشترط PREPARING/READY.
complete يشترط READY.

كلاهما يحدث order.version. إذا الإضافة نجحت أولًا يصبح PREPARING فيفشل الإنهاء. إذا الإنهاء نجح أولًا يصبح COMPLETED فتفشل الإضافة. لا فاتورة نهائية ناقصة العناصر.

### 8.6 إلغاء الطلب وإنهاؤه

كلاهما يشترط الحالة والنسخة. أول Commit يحسم. لا يحدث Refund وRevenue متعارضان دون تسلسل صريح. InvoiceSnapshot unique على orderId.

### 8.7 فتح نفس الطربيزة

Partial unique index يمنع أكثر من tableSession OPEN/CLOSING لنفس tableId. أول تأكيد ينشئ الجلسة والطلب. الثاني يرجع TABLE_ALREADY_OCCUPIED بلا خصم. إنشاء الجلسة وخصم المخزون في Transaction واحدة.

### 8.8 إنهاء الطربيزة وإضافة منتج

الإنهاء يغير session إلى CLOSING وorder version. append يشترط session OPEN. إذا CLOSING يفشل. إذا append سبق، order يعود PREPARING ويفشل شرط READY عند الإنهاء.

### 8.9 خدمتا طربيزة متكررتان

Partial unique على tableSessionId + type عندما status=OPEN. الطلب الثاني يعيد الموجود alreadyOpen. resolve يشترط OPEN/version. إنهاء الجلسة وresolve المتزامنان: Transaction الأولى تحسم؛ الثانية تعيد الحالة النهائية ولا تنشئ handledAt ثانيًا.

### 8.10 تجهيز آخر عنصر وإضافة منتج

تجهيز آخر عنصر قد يجعل order READY. إضافة متزامنة تزيد version وتضيف PREPARING. إعادة الاشتقاق داخل نفس Transaction تضمن أن الحالة النهائية PREPARING إذا الإضافة موجودة، ولا يبقى READY مع عنصر غير جاهز.

### 8.11 تعيين مندوب مرتين

Partial unique على orderId لتكليف نشط. assign يشترط order READY وcurrentDeliveryAssignmentId null. الأول ينجح، الثاني ALREADY_ASSIGNED.

### 8.12 تسليم ونقل المندوب

deliver يشترط assignment نشطًا وهو currentDeliveryAssignmentId في order. reassign يغير المرجع والنسخة. التكليف القديم لا يستطيع الإكمال بعد النقل.

### 8.13 تسوية COD مرتين

orderPayment/assignment يحمل settledAmount وversion. Cash transaction له sourceType/sourceId unique. إعادة التسوية لا تضاعف الدرج.

### 8.14 فتح درج مرتين

Partial unique يمنع أكثر من cashDrawerShift OPEN/CLOSING للنطاق. الأول ينجح والثاني DRAWER_ALREADY_OPEN.

### 8.15 حركة درج وإغلاقه

الإغلاق يحول OPEN إلى CLOSING أولًا. إنشاء حركة يشترط OPEN. إذا الحركة Commit أولًا تدخل الإجماليات ثم الإغلاق يقرأها. إذا CLOSING سبق، الحركة ترفض. لا حركة تختفي من المصالحة.

### 8.16 تم التعامل مرتين

tableServiceRequest update يشترط OPEN/version. الأول RESOLVED. الثاني ALREADY_RESOLVED ويعرض handledBy/At الحاليين.

### 8.17 موافقة وحظر جهاز

كلاهما يشترط version وحالات مسموحة. الأول يحسم. الحظر يلغي جلسات الجهاز في نفس العملية. Token refresh يفحص device.status وsession revocation دائمًا.

### 8.18 تعديل صلاحية وطلب جار

كل Access Token يحمل permissionsVersion. Middleware يقارنه بالموظف. تغيير الصلاحيات يزيد النسخة. الطلب الذي بدأ قبل التغيير يكمل فقط إذا تجاوز permission check؛ العمليات الحساسة تعيد الفحص داخل الخدمة قبل Commit.

## 9. MongoDB Transaction Retry

يراد تلقائيًا فقط عند TransientTransactionError أو UnknownTransactionCommitResult، بحد أقصى محاولتين داخل ميزانية الوقت. لا Retry عشوائي لـValidation أو Conflict.

إذا قرب الزمن من 900ms، لا تبدأ Retry طويلًا؛ تعيد RETRYABLE_CONFLICT مع requestId وIdempotency-Key محفوظ، والواجهة تعيد المحاولة بأمان.

Unknown commit لا يعيد الأمر بمفتاح جديد. يستعلم عن operationRequests بنفس المفتاح.

## 10. Timeouts

- Express interactive timeout الداخلي: 1000ms هدف تشغيلي، مع Infrastructure timeout أكبر قليلًا لمنع قطع Response الصحيح.
- Mongo serverSelectionTimeout مضبوط للبيئة، وmaxTimeMS للقراءات.
- Aggregation interactive maxTimeMS أقل من ثانية.
- HTTP خارجي غير موجود داخل المسار الحرج.
- Socket emit بعد Commit وغير blocking.
- Client يظهر Loading ويمنع Double Click، لكنه لا يمثل حماية.
- Abort من العميل لا يلغي Commit تلقائيًا؛ Idempotency يحسم النتيجة.

## 11. الأداء والفهارس

كل Query صفحة يحتاج Index يطابق filter + sort. يمنع:

- Collection scan لقائمة يومية.
- populate متداخل وغير محدود.
- جلب كل الصفوف ثم Pagination في Node.
- count لكل كارد داخل Loop.
- N+1 لوصفات أو دفعات.
- حساب التقرير الكامل مع كل Request دون Cache.

تستخدم Aggregation واحدة/Batch queries، Projection للحقول المطلوبة، lean reads، وحدود arrays.

Board الطربيزات Query مجمعة واحدة للعشرين. التحضير Query حسب status/fulfillmentType. خدمات الطربيزات index على status/priority/requestedAt. Audit على module/actor/entity/occurredAt.

## 12. Cache

يجوز Cache لـ:

- Catalog المنتجات والأقسام.
- Permission read model قصير مع permissionsVersion.
- Financial overview قصير.
- Warning summary قصير بإصدار مخزون.

لا Cache كمصدر حقيقة للرصيد أو حالة الطلب. بعد Commit ينشر invalidation. لو Cache فشل، المصدر MongoDB.

## 13. Realtime

Response لا ينتظر Socket. Domain writes + Outbox في Transaction، ثم Worker ينشر. كل event يحمل eventId وentityVersion. الواجهة تتجاهل القديم. Reconnect يعيد GET snapshot.

لا يعتمد نجاح الطلب على وجود مستخدم متصل.

## 14. قياس الأداء

لكل Route نسجل:

- requestId.
- routeTemplate.
- status.
- durationMs.
- dbDurationMs.
- transactionRetries.
- queryCount.
- resultSize.
- timedOut.
- errorCode.

Dashboard تقني يعرض p50/p95/p99 وError Rate. تنبيه إذا:

- p95 تجاوز 500ms لخمس دقائق.
- p99 تجاوز 1000ms.
- Conflict Rate ارتفع بصورة غير طبيعية.
- Mongo slow query أو scan.
- Transaction retry rate مرتفع.

Technical Logs لا تحتوي بيانات حساسة.

## 15. API Pagination والـPayload

pageSize=10 يقلل الزمن والحجم. تفاصيل ضخمة مثل Audit changes أو Recipe snapshots لا تدخل القائمة؛ تأتي في GET details.

Response تفاعلي مستهدف أقل من 100KB. الصور URLs فقط. الفاتورة Print DTO محدودة بطلب واحد. Export الكبير Async.

## 16. Workflow الواجهة عند Timeout

1. ترسل Mutation بمفتاح ثابت.
2. إذا لم يصل رد خلال المهلة، لا تفترض الفشل.
3. تعرض «جاري التحقق من نتيجة العملية».
4. تستعلم GET operation-status أو تعيد نفس Mutation بنفس المفتاح.
5. Success يعرض الكيان.
6. PROCESSING تنتظر Realtime أو Poll.
7. FAILED يسمح بمحاولة جديدة وفق نفس/مفتاح جديد حسب نوع الخطأ.

لا تولد الواجهة Idempotency-Key جديدًا لمجرد Timeout.

## 17. حالات القبول

1. p95 للقراءات المفهرسة <=500ms في حمل الاختبار المعتمد.
2. p99 التفاعلي <=1000ms.
3. Export يرجع 202 خلال ثانية.
4. Double Click لا يكرر أثرًا.
5. Timeout ثم Retry لا يكرر.
6. نفس المفتاح بمحتوى مختلف Conflict.
7. آخر مخزون لا يصبح سالبًا.
8. دفعة مورد لا تتجاوز الرصيد.
9. جلسة واحدة للطربيزة.
10. تكليف مندوب نشط واحد.
11. درج نشط واحد.
12. Resolve خدمة مرة واحدة.
13. Invoice نهائية واحدة.
14. Refund source فريد.
15. Socket لا يبطئ Response.
16. External call خارج Transaction.
17. Query القائمة يستخدم Index.
18. Summary لا يجلب كل البيانات إلى Node.
19. permission change يطبق فورًا بالإصدار.
20. Abort العميل لا يسبب إعادة تنفيذ.
21. Unknown Commit يحسمه operationRequests.
22. Retry محدود ولا يتجاوز الميزانية بلا داع.
23. Event version يمنع رجوع UI.
24. CLOSING يقفل الحركات الجديدة.
25. Audit الحرج ذري مع العملية.
26. Technical metrics لا تسرب أسرارًا.
27. تقرير طويل يتحول Job.
28. صفحة 10 صفوف لا تجلب 100.
29. Error يحمل requestId.
30. اختبار Load يغطي التزامن قبل الإطلاق.

## 18. اختبارات Race المطلوبة

- 20 طلبًا متزامنًا على آخر مخزون.
- 10 تأكيدات لنفس Idempotency-Key.
- تأكيدان لطربيزة واحدة.
- Ready وCancel لنفس العنصر.
- Append وComplete لنفس الطلب.
- Cancel وComplete لنفس الطلب.
- Assign مندوبين لطلب واحد.
- Deliver وReassign في الوقت نفسه.
- حركتا تسوية COD.
- Open Drawer مرتين.
- Cash Movement وClose Drawer.
- Resolve Service مع Close Table Session.
- Approve وBlock Device.
- Supplier payments تتجاوز آخر رصيد.
- Timeout مصطنع بعد Commit ثم Retry.

نجاح الاختبار يعني سلامة الرصيد والحالات وعدد الحركات والأحداث، وليس مجرد HTTP status.
