# مراجعة الاتساق والقرارات الملزمة

هذه الوثيقة تسجل المشكلات المحتملة التي ظهرت في المراجعة، وتحدد القرار الملزم عند وجود تسمية أو قاعدة قديمة مختلفة. تُطبق القرارات على جميع الموديولات والـAPI والـSchemas.

## 1. المورد عند إنشاء المادة الخام

- `supplierId` حقل إلزامي في طلب إنشاء المادة الخام، ويُختار في نفس نموذج الإضافة من الموردين `ACTIVE` فقط.
- الخادم يتحقق من وجود المورد وحالته داخل عملية الإنشاء؛ لا يقبل اسم مورد نصيًا ولا يستنتجه من أول فاتورة شراء.
- بعد الحفظ تظهر المادة فورًا في صفحة المورد، وتعيد واجهات المادة `supplier` كـsnapshot للعرض بجانب `supplierId`.
- البحث عن المادة في المشتريات يعيد المورد المحفوظ على المادة. لا يستطيع المستخدم تغيير المورد داخل سطر الفاتورة.
- قبل تسجيل أول دفعة يمكن تعديل مورد المادة بصلاحية و`expectedVersion` مع Audit كامل.
- بعد وجود أول دفعة أو استخدام المادة في وصفة تُقفل علاقة المورد. تغيير المورد بعدها يتطلب إيقاف تعريف المادة وإنشاء مادة جديدة للمورد الجديد، حتى لا تختلط الدفعات والتقارير التاريخية.
- `rawMaterialBatches.supplierId` واسم المورد Snapshot تاريخي يؤخذان لحظة تسجيل الدفعة ولا يتغيران بتعديل بيانات المورد.
- حذف/إيقاف المورد لا يمحو المواد أو الدفعات. المورد الموقوف لا يصلح لمادة جديدة أو فاتورة جديدة، وتظل السجلات التاريخية قابلة للعرض.

## 2. تحذير الوردية المفتوحة كل 12 ساعة

- تبدأ الساعة من `cashDrawerShifts.openedAt` بتوقيت UTC، والعرض يستخدم Africa/Cairo.
- إذا ظلت الوردية `OPEN` عند مرور 12 ساعة، ينشأ تحذير. يتكرر عند 24، 36، 48 ساعة وهكذا حتى الإغلاق.
- لا ينتظر النظام 12 ساعة داخل Request. Worker دوري يفحص الورديات المستحقة كل دقيقة، باستخدام `nextOpenShiftWarningAt <= now`.
- كل تحذير يُحفظ في `drawerShiftAlerts` ثم ينشر عبر Outbox إلى إشعار دائم وSocket.IO. تعطل Socket أو التطبيق لا يفقد التحذير.
- المستلمون: فاتح الوردية إذا كان نشطًا، وكل موظف يملك `drawer.close_any` أو `drawer.read_reconciliation` وفق سياسة الإشعارات.
- محتوى التحذير: رقم الوردية، وقت الفتح، الموظف، مدة الفتح بالساعات، الرصيد المتوقع الحالي، رابط الوردية، ورقم التكرار.
- Unique Index على `{shiftId, thresholdHours}` يمنع إرسال تحذير 12 ساعة مرتين عند تشغيل أكثر من Worker أو إعادة المحاولة.
- بعد إنشاء تحذير 12 ساعة تصبح `nextOpenShiftWarningAt = openedAt + 24h`. التحديث وإنشاء Alert وOutbox في Transaction واحدة.
- إذا أغلقت الوردية قبل تنفيذ Worker فلا ينشأ تحذير. لو تنافس الإغلاق مع العامل، يشترط العامل `status=OPEN`; العملية التي تثبت أولًا تحسم، ولا يصدر تحذير بعد `closedAt`.
- `CLOSING` لا يولد تكرارًا جديدًا، لكن التحذيرات السابقة تظل في السجل.
- الإقرار بقراءة التحذير لا يغلق الوردية ولا يؤخر التنبيه التالي.

### Schema

إضافات `cashDrawerShifts`: `nextOpenShiftWarningAt`, `lastOpenShiftWarningAt`, `openShiftWarningCount` default 0.

`drawerShiftAlerts`: `_id`, `shiftId`, `shiftNoSnapshot`, `thresholdHours`, `openedAtSnapshot`, `generatedAt`, `openDurationSeconds`, `expectedBalanceSnapshot`, `openedBy`, `recipientIds[]`, `notificationStatus PENDING/PUBLISHED/PARTIAL/FAILED`, `outboxEventId`, timestamps. Unique `{shiftId,thresholdHours}`، وفهرس `{generatedAt:-1}`.

`notifications`: `_id`, `recipientEmployeeId`, `type`, `severity`, `title`, `message`, `entityType`, `entityId`, `link`, `deduplicationKey`, `createdAt`, `readAt`. Unique `{recipientEmployeeId,deduplicationKey}`.

### API وRealtime

- `GET /api/v1/cash-drawer-shifts/:id/alerts?page=1&limit=10`.
- `GET /api/v1/notifications?page=1&limit=10&unread=`.
- `POST /api/v1/notifications/:id/read` مع `Idempotency-Key`.
- Socket event: `drawer.shift.open-too-long`، يحمل Alert DTO فقط ولا يحتوي بيانات حساسة.

## 3. قرارات توحيد البيانات

1. النسخة القانونية لمسارات HTTP تبدأ دائمًا بـ`/api/v1`. أي مثال قديم يبدأ بـ`/api` يُقرأ كاختصار فقط ويُنفذ تحت v1.
2. الاسم القانوني لرقم الوردية `shiftNo`، وليس `drawerNumber`. الاسم القانوني للمجاميع `totalCashIn` و`totalCashOut`.
3. النسخة الأولى لديها نطاق واحد `scopeType=POS` و`scopeId=MAIN`. Partial Unique Index يمنع أكثر من وردية `OPEN` أو `CLOSING` لهذا النطاق.
4. منع تكرار خدمة الطاولة يستخدم `requestOwnerKey`: إما `SESSION:{tableSessionId}` بعد بدء التشغيل أو `GUEST:{guestSessionId}` قبله، مع Partial Unique على `{requestOwnerKey,type}` عندما `status=OPEN`.
5. يوجد تقييم واحد فقط لكل `orderId` عبر Unique Index عام. حقول المالك تختلف حسب القناة، ولا تسمح بإنشاء تقييم ثان بمالك آخر.
6. أسعار وإجماليات Proposal لا تُقبل من العميل كمصدر حقيقة؛ الخادم يعيد قراءة المنتج والحجم والسعر والتوافر ويحسبها. الـsnapshots تحفظ نتيجة الخادم.
7. جميع المبالغ والكميات تخرج من API كنصوص Decimal، وكل التواريخ DateTime بصيغة UTC ISO-8601.
8. حالة الطلب مشتقة من العناصر داخل Transaction؛ لا يرسل العميل حالة الطلب أو حالة التجهيز.
9. أي ربط تاريخي يحتفظ بالـID وبـSnapshot الاسم/الرقم حتى لا تغير التعديلات اللاحقة الفواتير والتقارير القديمة.
10. الأحداث اللحظية وسيلة تحديث سريعة؛ REST هو مصدر الاستعادة بعد reconnect، وOutbox يمنع فقد الأحداث المهمة.

## 4. حالات فشل تمت تغطيتها

- مورد حُذف أو أوقف بين فتح النموذج والحفظ: `409 SUPPLIER_NOT_ACTIVE`.
- محاولتان لتعديل مورد المادة: يفوز `expectedVersion` الصحيح، والثانية `409 VERSION_CONFLICT`.
- تغيير المورد بالتزامن مع تسجيل أول دفعة: Transaction/قفل النسخة يسمح بإحدى العمليتين فقط؛ إذا سُجلت الدفعة يصبح المورد مقفولًا.
- Workerان يرسلان تحذير 12 ساعة: Unique Index ينتج Alert واحدة.
- تعطل النشر بعد حفظ التحذير: Outbox يعيد النشر من دون Alert أو Notification مكررة.
- إغلاق الوردية عند لحظة 12 ساعة: لا تحذير بتاريخ بعد الإغلاق، وتظل نتيجة الإغلاق صحيحة.
- ساعة الخادم أو DST: الحساب UTC من `openedAt`، ولا يعتمد على ساعة المتصفح.
- وردية مفتوحة أيامًا: تحذير واحد لكل مضاعف 12 ساعة، مع Pagination وعدم تحميل السجل كاملًا.
- خدمة جرسون قبل أول Order: تستخدم Guest owner ولا تتصادم كل الطاولات على `tableSessionId=null`.
- محاولة تقييم الطلب من Customer وGuest معًا: Unique `orderId` يقبل الأول فقط ويرجع التقييم الحالي للثاني.

## 5. أولوية المرجع

هذه القرارات ملزمة عند التعارض مع صياغة أقدم. بعد تطبيقها تصبح الأولوية: هذه المراجعة، ثم وثيقة المتطلبات، ثم Schema Catalog، ثم API Documentation، ثم هيكل المشروع.
