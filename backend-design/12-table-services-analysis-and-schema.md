# موديول خدمات الطربيزات — التحليل والـWorkflow والـData Flow والـSchema

الإصدار 1.0. الموديول جزء من منظومة الطربيزات ويستخدم Table Session وTable Token وسجل الأحداث المشترك.

## 1. الهدف والنطاق

يتيح للعميل الجالس على طربيزة طلب واحدة من خمس خدمات:

1. CALL_WAITER — مناداة جرسون.
2. WATER_REQUEST — طلب مياه.
3. PARTY_SURPRISE — تجهيز مفاجأة/حفلة.
4. BILL_REQUEST — طلب الحساب.
5. REPORT_PROBLEM — الإبلاغ عن مشكلة.

الطلب يظهر فورًا في موديول خدمات الطربيزات للإدارة. بجواره زر «تم التعامل». عند ضغط الموظف ينتقل من الطلبات النشطة إلى الطلبات المنتهية، مع حفظ الموظف والوقت ومدة الاستجابة.

طلب الخدمة ليس Order Item ولا يخصم مخزونًا ولا يغير فاتورة أو درجًا تلقائيًا. إذا ترتب عليه منتج مدفوع، يضيف الموظف المنتج إلى طلب الطربيزة من مسار «إضافة منتجات أخرى».

## 2. شاشات العميل

داخل قسم الطربيزة توجد صفحة «خدمات الجرسون» تعرض خمس كروت. كل كارد يحتوي الاسم ووصفًا قصيرًا وزر الطلب.

- مناداة جرسون: لا يحتاج تفاصيل.
- طلب مياه: ملاحظة اختيارية، والكمية اختيارية للعرض فقط. إذا المياه منتج مدفوع فلا تخصم هنا.
- تجهيز مفاجأة حفلة: تفاصيل مطلوبة، مثل المناسبة والوقت المطلوب والملاحظات.
- طلب الحساب: لا يحتاج تفاصيل، ويعرض تنبيهًا أن الطلب أرسل.
- الإبلاغ عن مشكلة: وصف المشكلة مطلوب، مع تصنيف اختياري SERVICE/ORDER/CLEANLINESS/PAYMENT/OTHER.

بعد الإرسال يظهر رقم طلب الخدمة وحالته «جاري التعامل». يمنع ضغط الزر عدة مرات أثناء الطلب. يمكن للعميل مشاهدة طلباته النشطة والمنتهية للجلسة الحالية.

## 3. شاشة الإدارة

تبويبان:

- الطلبات النشطة: status=OPEN.
- الطلبات المنتهية: status=RESOLVED أو CANCELLED.

كل تبويب جدول/كروت Pagination 10. الطلب النشط يعرض رقم الخدمة، النوع، رقم الطربيزة، رقم الجلسة والطلب، التفاصيل، وقت الطلب، مدة الانتظار، أولوية، وزر «تم التعامل».

المنتهي يعرض نفس البيانات بالإضافة إلى النتيجة، handledAt، handledBy، مدة الاستجابة، وملاحظة الحل. لا زر تعديل أو حذف.

الفلاتر: النوع، الطربيزة، الحالة، الأولوية، الفترة، الموظف الذي تعامل، والبحث برقم الطلب أو الوصف. الترتيب الافتراضي للنشط بالأقدم أولًا، مع الأولوية الأعلى أولًا. المنتهي بالأحدث إنهاءً.

بطاقات الملخص: نشط الآن، متأخر، منتهي اليوم، متوسط زمن الاستجابة، وطلبات المشاكل المفتوحة.

## 4. الحالات والانتقالات

- OPEN: وصل ولم ينتهِ.
- RESOLVED: تم التعامل معه.
- CANCELLED: ألغاه العميل قبل التعامل، أو ألغاه الموظف بسبب تكرار/خطأ، أو أغلقته نهاية الجلسة.

الانتقالات:

- إنشاء ناجح إلى OPEN.
- OPEN إلى RESOLVED بزر «تم التعامل».
- OPEN إلى CANCELLED بسبب موثق.
- RESOLVED وCANCELLED نهائيتان؛ لا إعادة فتح أو حذف. احتياج جديد ينشئ طلبًا جديدًا.

لا توجد ACKNOWLEDGED في النسخة المطلوبة، لأن المستخدم يريد زرًا واحدًا. لو أضيف توزيع للجرسون مستقبلًا يمكن إضافة ASSIGNED دون تغيير السجل التاريخي.

## 5. التحقق من الطربيزة والهوية

العميل لا يرسل tableNumber ويُصدّق وحده. الطلب يحتاج X-Table-Token صالحًا مرتبطًا بـtableId وtableSessionId:

1. الطربيزة موجودة وACTIVE.
2. لها جلسة OPEN.
3. Token لم ينتهِ ولم يلغ.
4. Token يخص نفس الطربيزة والجلسة.
5. الجلسة ليست CLOSING/CLOSED/CANCELLED.

لا يسمح لطربيزة فارغة بإنشاء خدمة. ينتهي Token عند إغلاق الجلسة. لا يحتوي QR على صلاحية إدارة.

الموظف يحتاج orders_table_services.read وresolve/cancel. كل قرار يسجل employeeId والجهاز والجلسة وIP.

## 6. Workflow إنشاء الخدمة

1. العميل يفتح صفحة خدمات الطربيزة.
2. الفرونت يقرأ Table Token من الجلسة.
3. يختار نوع الخدمة ويدخل التفاصيل المطلوبة.
4. يرسل Idempotency-Key.
5. الخادم يتحقق من Token والجلسة والنوع والحقول وRate Limit.
6. يتحقق من عدم وجود طلب OPEN من نفس النوع لنفس الجلسة وفق قاعدة منع التكرار.
7. يولد serviceRequestNumber.
8. ينشئ tableServiceRequest بحالة OPEN.
9. ينشئ status event وAudit آمن.
10. Commit.
11. Outbox/Socket.IO ينشر TABLE_SERVICE_CREATED.
12. يظهر فورًا في شاشة الإدارة وتظهر رسالة نجاح للعميل.

إذا فشل النشر بعد Commit، Outbox يعيد النشر؛ الطلب محفوظ ولا يعاد إنشاؤه. إعادة نفس Idempotency-Key تعيد الطلب نفسه.

## 7. منع التكرار والـRate Limit

يوجد طلب OPEN واحد من كل نوع لكل جلسة. محاولة نفس النوع تعيد الطلب الحالي مع alreadyOpen=true بدل صف جديد.

- يمكن وجود CALL_WAITER وWATER_REQUEST معًا.
- بعد RESOLVED يمكن إنشاء طلب جديد من نفس النوع.
- REPORT_PROBLEM جديد يسمح بعد إنهاء السابق؛ إذا المشكلة مختلفة قبل إنهاء السابقة، يستطيع العميل تحديث الوصف غير مسموح، والمقترح إنشاء نوع OTHER عبر الموظف فقط أو انتظار التعامل. النسخة البسيطة تمنع التكرار من نفس النوع.
- حد مقترح: 5 طلبات خلال 5 دقائق للجلسة، وطلب واحد كل 10 ثوانٍ.
- تجاوز الحد يرجع RATE_LIMITED ويسجل Security/Audit Event دون إنشاء خدمة.

## 8. زر «تم التعامل»

متاح لـOPEN فقط. عند الضغط تظهر نافذة صغيرة:

- نوع الطلب والطربيزة ووقت الانتظار.
- ملاحظة التعامل اختيارية عمومًا.
- ملاحظة الحل مطلوبة لـREPORT_PROBLEM.
- BILL_REQUEST يعرض رابط فتح طلب الطربيزة وتجهيز الفاتورة.
- PARTY_SURPRISE يعرض التفاصيل للتأكد قبل الإنهاء.

داخل Transaction:

1. فحص صلاحية الموظف وحالة OPEN وexpectedVersion.
2. تحديث status إلى RESOLVED.
3. حفظ handledAt من الخادم وhandledByEmployeeId.
4. حساب responseDurationSeconds.
5. حفظ resolutionNote/resultCode.
6. إنشاء TableServiceStatusEvent وAudit.
7. Commit ثم Socket.IO للعميل والإدارة.
8. ينتقل العنصر للمنتهي.

ضغط موظفين في الوقت نفسه: الأول ينجح، والثاني يعيد ALREADY_RESOLVED وبيانات من تعامل معه. نفس Idempotency-Key لا يكرر الحدث.

## 9. منطق كل نوع خدمة

### 9.1 مناداة جرسون

الغرض إشعار الجرسون بالحضور. لا أثر على الطلب أو الفاتورة. تم التعامل يعني أن الموظف استجاب، وليس أن طلبًا ماليًا تم.

### 9.2 طلب مياه

الخدمة نفسها لا تخصم مخزونًا. إذا المياه مجانية يسجل الموظف التعامل فقط. إذا مدفوعة، يفتح طلب الطربيزة ويضيف منتج المياه؛ الإضافة هي التي تخصم الوصفة وتزيد الفاتورة. لا يجوز أن يخصم النظام المياه مرتين من طلب الخدمة ومن Order Item.

### 9.3 تجهيز مفاجأة حفلة

details مطلوبة. الأولوية HIGH افتراضيًا. الخدمة لا تضيف رسومًا أو منتجات تلقائيًا. أي كيك/مشروب/خدمة مدفوعة تضاف كمنتج أو Fee بعقد واضح. تم التعامل يحفظ ملاحظة ما تم الاتفاق عليه.

### 9.4 طلب الحساب

يظهر بأولوية HIGH ورابط مباشر لصفحة الطربيزة. لا يحول الطلب READY، ولا يلغي العناصر الجارية، ولا ينهي الطلب، ولا يفتح الدرج، ولا يطبع وحده.

إذا الطلب PREPARING، يرى الموظف أنه ما زال جاريًا ويتفق مع العميل. زر إنهاء طلب الطربيزة يظل محكومًا بقواعد READY والدفع. عند إكمال طلب الطربيزة بنجاح، أي BILL_REQUEST مفتوح لنفس الجلسة يتحول RESOLVED آليًا بـresultCode=TABLE_ORDER_COMPLETED.

### 9.5 الإبلاغ عن مشكلة

الوصف مطلوب بطول محدود، ويمنع HTML/Script. الأولوية HIGH، ويمكن للإدارة رفعها URGENT. ملاحظة الحل مطلوبة عند «تم التعامل». لا ينشئ Refund أو إلغاء طلب تلقائيًا. إذا الحل يحتاج إلغاء/Refund ينفذ من موديول الطلب ويسجل correlationId نفسه.

## 10. الإلغاء ونهاية جلسة الطربيزة

العميل يستطيع إلغاء طلب OPEN من الجلسة نفسها قبل التعامل، باستخدام Token وسبب اختياري. الموظف يستطيع إلغاء OPEN بسبب DUPLICATE/INVALID/CUSTOMER_WITHDREW/SESSION_CLOSED مع ملاحظة.

عند إكمال Table Session:

- BILL_REQUEST المفتوح يتحول RESOLVED تلقائيًا لأن الحساب أنهي.
- باقي الطلبات OPEN تتحول CANCELLED بـSESSION_CLOSED حتى لا تبقى خدمات يتيمة.
- التغييرات تحفظ في Transaction إغلاق الطربيزة نفسها.
- ينشر تحديث للخدمات بعد Commit.

عند إلغاء جلسة الطربيزة، كل الخدمات OPEN تصبح CANCELLED. الخدمة RESOLVED لا تتغير. لا يمكن إنشاء خدمة أثناء CLOSING.

## 11. Realtime والتنبيهات

Rooms:

- table-services-admin لكل الموظفين المصرح لهم.
- table-session:{id} للعميل.
- table:{number} لتحديث السياق.
- employee:{id} عند التعيين مستقبلًا.

الأحداث: TABLE_SERVICE_CREATED، RESOLVED، CANCELLED، AUTO_CLOSED. تحمل requestId وentityVersion والملخص الآمن.

يمكن تشغيل صوت/Badge لطلب جديد. الصوت سلوك واجهة ولا يمثل حدث عمل. Reconnect يعمل GET للنشط بدل الاعتماد على أحداث فاتت. Event قديم لا يرجع الحالة للخلف.

## 12. Schema

### 12.1 tableServiceRequests

- _id ObjectId.
- serviceRequestNumber String unique.
- tableId ObjectId.
- tableNumberSnapshot Integer.
- tableSessionId ObjectId.
- orderId ObjectId.
- type Enum الخمسة.
- titleSnapshot String.
- details String nullable.
- problemCategory Enum nullable.
- requestedQuantity Decimal128 nullable للعرض.
- priority NORMAL/HIGH/URGENT.
- status OPEN/RESOLVED/CANCELLED.
- source TABLE_CUSTOMER/EMPLOYEE/SYSTEM.
- requestedAt Date.
- customerSessionFingerprintHash nullable.
- handledAt Date nullable.
- handledByEmployeeId ObjectId nullable.
- handledByNameSnapshot String nullable.
- responseDurationSeconds Integer nullable.
- resolutionNote String nullable.
- resultCode HANDLED/TABLE_ORDER_COMPLETED/DUPLICATE/INVALID/CUSTOMER_WITHDREW/SESSION_CLOSED nullable.
- cancelledAt/By/Reason.
- idempotencyOperationId ObjectId.
- version Integer.
- createdAt/updatedAt.

Indexes:

- serviceRequestNumber unique.
- tableSessionId/status/requestedAt.
- status/priority/requestedAt.
- type/status/requestedAt.
- handledByEmployeeId/handledAt.
- unique جزئي على tableSessionId مع type عندما status=OPEN.
- unique على idempotencyOperationId عند وجوده.

### 12.2 tableServiceStatusEvents

_id، serviceRequestId، tableSessionId، orderId، fromStatus، toStatus، action CREATED/RESOLVED/CANCELLED/AUTO_CLOSED، resultCode، notes، actorType CUSTOMER/EMPLOYEE/SYSTEM، actorId nullable، deviceId nullable، requestId، correlationId، occurredAt. Immutable.

### 12.3 إعداد الأنواع

tableServiceTypes Collection غير لازمة للنسخة الأولى؛ الخمسة Enum ثابتة في الكود مع Catalog مشترك للباك والفرونت. إذا احتاج صاحب المشروع إضافة خدمات من الشاشة لاحقًا، تنقل إلى Collection تحتوي code/title/description/iconKey/defaultPriority/requiresDetails/isActive/sortOrder، ولا تحفظ Component أو HTML.

## 13. API

### واجهة العميل

- GET /api/table-sessions/:tableNumber/service-options.
- POST /api/table-sessions/:tableNumber/service-requests.
- GET /api/table-sessions/:tableNumber/service-requests?page=1&pageSize=10.
- POST /api/table-sessions/:tableNumber/service-requests/:id/cancel.

كلها تحتاج X-Table-Token.

### الإدارة

- GET /api/table-service-requests?status=OPEN&page=1&pageSize=10.
- GET /api/table-service-requests?scope=finished&page=1&pageSize=10.
- GET /api/table-service-requests/:id.
- POST /api/table-service-requests/:id/resolve.
- POST /api/table-service-requests/:id/cancel.
- GET /api/table-service-requests/summary.

لا DELETE ولا PATCH عام للحالة.

## 14. Pagination

النشط والمنتهي وسجل العميل وكل فلتر يعيد:

data، pagination page/pageSize/totalItems/totalPages/hasNext/hasPrevious، وsummary.

pageSize افتراضي 10. Summary يحسب من كامل الفلتر. ترتيب النشط priority ثم requestedAt ثم _id. الصفحة بعد النهاية فارغة ولا تعيد آخر صفحة.

## 15. الصلاحيات

- orders_table_services.visible للـSidebar.
- table_services.read.
- table_services.read_details.
- table_services.resolve.
- table_services.cancel.
- table_services.change_priority.
- table_services.read_metrics.
- table_services.export.
- table_services.read_history.

العميل مقيد بالـTable Token وليس Employee Permission. لا يرى طلبات طربيزة أخرى.

## 16. سجل الأحداث

الأحداث المطلوبة:

- TABLE_SERVICE_REQUESTED.
- TABLE_SERVICE_DUPLICATE_ATTEMPT.
- TABLE_SERVICE_RATE_LIMITED.
- TABLE_SERVICE_RESOLVED.
- TABLE_SERVICE_CANCELLED_BY_CUSTOMER.
- TABLE_SERVICE_CANCELLED_BY_EMPLOYEE.
- TABLE_SERVICE_AUTO_RESOLVED.
- TABLE_SERVICE_AUTO_CANCELLED.
- TABLE_SERVICE_VIEWED.
- TABLE_SERVICE_EXPORTED.

Audit يحتفظ بالنوع والطربيزة والجلسة والطلب والحالة والموظف والأوقات والسبب ومدة الاستجابة وIP مقنع. لا يحفظ Token أو وصف مشكلة غير منقح في metadata عامة؛ التفاصيل الكاملة تظهر بصلاحية read_details.

## 17. Data Flow

Customer Table UI → Table Token → Validate Active Session → Validate Type/Details/Rate Limit → tableServiceRequest OPEN → Status Event + Audit → Outbox → Admin Services Screen.

Admin → Resolve Button → Permission + OPEN/version → RESOLVED + handledBy/At/duration → Status Event + Audit → Socket → Finished List + Customer UI.

Table Order Completion → Table Session Transaction → Open BILL becomes RESOLVED + other OPEN become CANCELLED → Events/Audit → Table EMPTY + Services refreshed.

Paid Water/Party Need → Open Table Order → Add Order Item → Recipe Allocation → Inventory Deduction → Order PREPARING. Service Request itself never touches stock.

Problem Needs Cancel/Refund → Service Event correlationId → Order Cancel/Refund Workflow → Inventory/Drawer Effects in their modules → Resolution Note → Service RESOLVED.

## 18. الحالات ومعايير القبول

1. الخمس خدمات فقط تظهر للعميل.
2. طربيزة فارغة لا تطلب خدمة.
3. Token خطأ أو منتهي مرفوض.
4. Token طربيزة لا يطلب لطربيزة أخرى.
5. CLOSING/CLOSED لا يقبل جديدًا.
6. CALL_WAITER لا يحتاج تفاصيل.
7. PARTY_SURPRISE يحتاج تفاصيل.
8. REPORT_PROBLEM يحتاج وصفًا.
9. الوصف ينقح ويحدد طوله.
10. الإنشاء يظهر لحظيًا للإدارة.
11. فشل Socket لا يفقد الطلب.
12. إعادة نفس Idempotency-Key لا تكرر.
13. نوع OPEN مكرر يعيد الموجود.
14. نوعان مختلفان مسموحان.
15. Rate Limit يمنع السبام.
16. النشط مرتب بالأولوية والأقدم.
17. زر تم التعامل يعمل على OPEN فقط.
18. موظف بلا صلاحية مرفوض.
19. ضغط موظفين يحسمه version.
20. الضغط المكرر لا ينشئ إنهاءين.
21. RESOLVED ينتقل للمنتهي.
22. CANCELLED يظهر في المنتهي بسببه.
23. المنتهي لا يعدل أو يحذف.
24. مشكلة بلا resolutionNote لا تغلق.
25. طلب الحساب لا ينهي Order تلقائيًا.
26. طلب الحساب لا يطبع أو يحرك الدرج.
27. إنهاء الطربيزة يحل BILL المفتوح.
28. إنهاء الطربيزة يلغي باقي الخدمات المفتوحة.
29. إلغاء الجلسة يلغي المفتوح.
30. المياه لا تخصم مخزونًا كخدمة.
31. مياه مدفوعة تضاف Order Item مرة واحدة.
32. مفاجأة الحفلة لا تضيف تكلفة تلقائية.
33. المشكلة لا تلغي أو ترد مالًا تلقائيًا.
34. عملية مرتبطة تستخدم correlationId.
35. إغلاق الخدمة لا يغير طلب الطربيزة.
36. إغلاق الطلب يعالج الخدمات المفتوحة ذريًا.
37. العميل لا يرى جلسات أخرى.
38. Pagination النشط مستقلة عن المنتهي.
39. Summary لا يعتمد طول الصفحة.
40. أوقات القاهرة تعرض صحيحة.
41. responseDuration من وقت الخادم.
42. تغيير رقم الطربيزة لا يغير Snapshot.
43. إيقاف الموظف لا يمحو handledBy.
44. Audit لا يسجل Token.
45. إعادة الاتصال تعيد Snapshot.
46. Event أقدم لا يرجع الحالة.
47. الخدمة لها رقم فريد.
48. البحث والفلاتر قبل Pagination.
49. فشل Audit الحرج يرجع Resolve.
50. كل انتقال نهائي محفوظ في Timeline.

## 19. مراجعة الفرونت

الموجود حاليًا يعرض WAITER وBILL وUTENSILS وWATER وCLEANING، وحالات OPEN/ACKNOWLEDGED/RESOLVED/CANCELLED بزرين «استلام» ثم «تم».

المطلوب عند التنفيذ:

- الخدمات تصبح CALL_WAITER وWATER_REQUEST وPARTY_SURPRISE وBILL_REQUEST وREPORT_PROBLEM.
- استبدال UTENSILS وCLEANING بالمفاجأة والمشكلة.
- تبسيط الإدارة إلى زر واحد «تم التعامل».
- تحويل القائمتين إلى Pagination 10.
- إضافة التفاصيل والأولوية ومدة الانتظار وملاحظة الحل.
- ربط الطلب بـtableSessionId وTable Token بدل الاعتماد على الرقم فقط.
- استخدام Realtime + refetch عند reconnect.
