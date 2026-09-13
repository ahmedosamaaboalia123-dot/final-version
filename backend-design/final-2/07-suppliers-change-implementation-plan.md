# خطة تنفيذ تعديلات موديول الموردين

## 1. الهدف النهائي الملزم

يصبح المورد كيانًا بلا نوع وبلا حالة تشغيل. لا يعرض النظام أو يستقبل أو يخزن `supplierType` أو `status` أو `statusChangeReason`، ولا توجد عمليات إيقاف أو إعادة تفعيل أو فلترة بالحالة. يدعم الموديول إضافة المورد وتعديله وحذفه، ويدعم إنشاء وتعديل وحذف كل حركات حسابه مع الحفاظ على صحة رصيد المورد والدرج والتقارير وسجل الأحداث.

الحقول النهائية للمورد هي: `name`, `normalizedName`, `contactPerson`, `phone`, `phoneNormalized`, `city`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `version`.

لا يُضاف `isActive` أو `archivedAt` أو `deletedAt` كبديل مخفي للحالة. المورد إما موجود أو محذوف نهائيًا وفق شروط الحذف الآمن.

## 2. قرارات سلامة البيانات

### 2.1 حذف المورد

يُسمح بالحذف النهائي فقط إذا كان المورد نظيفًا بالكامل:

- رصيد الدين يساوي صفرًا.
- رصيد المستحقات يساوي صفرًا.
- لا توجد أي قيود في `SupplierAccountEntry`، بما فيها القيود المعكوسة.
- لا توجد مواد خام مرتبطة به.
- لا توجد دفعات مخزون أو فواتير مشتريات أو بنود فواتير أو مرتجعات أو snapshots تاريخية تشير إليه.
- لا توجد حركة درج أو سجل مالي أو كيان آخر يحمل `supplierId` الخاص به.

يتم فحص المراجع داخل Transaction. عند وجود أي مرجع يرجع الخادم `409 SUPPLIER_DELETE_BLOCKED` ومعه `blockers` منظمة تحتوي عدد كل نوع من المراجع، حتى تعرض الواجهة السبب والإجراء المطلوب. لا ينفذ النظام cascade delete ولا يمسح تاريخًا ماليًا أو مخزنيًا.

إذا اجتاز المورد الفحص، يُحذف `SupplierAccount` ثم `Supplier` في نفس الـTransaction، ويُكتب Audit event باسم `SUPPLIER_DELETED` وOutbox event باسم `supplier.deleted` يحمل snapshot آمنًا للاسم والهاتف والمدينة. عند طلب الحذف مرتين، يرجع الطلب الثاني `404 SUPPLIER_NOT_FOUND`. يمنع `expectedVersion` حذف نسخة تغيرت بعد فتح الشاشة ويرجع `409 SUPPLIER_VERSION_CONFLICT`.

### 2.2 تعديل وحذف القيود المالية

`SupplierAccountEntry` دفتر أستاذ append-only؛ لذلك لا تتغير الوثيقة التاريخية ولا تُحذف فعليًا:

- زر **حذف** ينفذ reversal للقيد الأصلي، ويظل القيد والعكس ظاهرين في السجل.
- زر **تعديل** ينفذ reversal للقيد الأصلي ثم ينشئ قيدًا بديلًا بالقيمة والتاريخ والملاحظات الجديدة داخل Transaction واحدة.
- لا يمكن تعديل أو حذف قيد `REVERSAL`.
- لا يمكن تعديل أو حذف قيد سبق عكسه.
- لا يمكن تعديل قيد إلى نوع مالي مختلف. يسمح بتعديل المبلغ والتاريخ والملاحظات فقط؛ تغيير النوع يتطلب حذف القيد ثم إنشاء قيد جديد بوضوح.
- القيد البديل يحمل `replacesEntryId`، والقيد القديم يحمل `replacedByEntryId`. قيد العكس يحمل `reversesEntryId` كالموجود حاليًا.
- كل عملية تستخدم `expectedAccountVersion`، وتستخدم `Idempotency-Key`، وتعمل في Transaction واحدة مع Audit وOutbox بعد نجاح القيود والدرج.

### 2.3 أثر الدرج

- `DEBT` و`RECEIVABLE` بلا حركة درج؛ تعديلهما أو حذفهـما يعيد حساب الرصيد فقط.
- `DEBT_PAYMENT` و`RECEIVABLE_COLLECTION` مرتبطان بحركة درج.
- حذف دفعة أو تحصيل يعكس حركة الدرج الأصلية طبقًا لقواعد الدرج الحالية.
- تعديل مبلغ دفعة أو تحصيل يعكس الحركة القديمة وينشئ حركة جديدة بالقيمة البديلة في نفس العملية.
- إذا كانت الوردية الأصلية مغلقة، لا تُعدل حركتها. ينشئ النظام حركة تصحيح في الوردية المفتوحة تشير للحركة الأصلية. إذا لم توجد وردية مفتوحة يرجع `409 OPEN_DRAWER_SHIFT_REQUIRED` بلا أي تغيير جزئي.
- إذا نتج عن التعديل أو الحذف رصيد دين أو مستحق أقل من صفر، تُرفض العملية بـ`409 SUPPLIER_BALANCE_WOULD_BE_NEGATIVE`.

## 3. عقد الـAPI النهائي

### 3.1 الموردون

- `GET /api/v1/suppliers-screen?page=1&limit=10&search=`: يحذف معامل `status`. يرجع `summary.totalSuppliers`, `summary.totalDebt`, `summary.totalReceivable`. لا يرجع active/inactive أو types.
- `POST /api/v1/suppliers`: يقبل `name`, `contactPerson`, `phone`, `city` فقط.
- `GET /api/v1/suppliers/:id`: لا يرجع النوع أو الحالة.
- `PATCH /api/v1/suppliers/:id`: يقبل الحقول الأربعة مع `expectedVersion`.
- `DELETE /api/v1/suppliers/:id`: يقبل body يحتوي `expectedVersion` و`reason` من 3 إلى 500 حرف. نجاحه `200` ببيانات `{ deleted: true, supplierId }`.
- يحذف نهائيًا المسار `POST /api/v1/suppliers/:id/status`.

### 3.2 قيود الحساب

- يبقى `POST /api/v1/suppliers/:id/account-entries` للإنشاء.
- يبقى `GET /api/v1/suppliers/:id/account-entries` مع pagination بحد أقصى 10.
- يضاف `PATCH /api/v1/supplier-account-entries/:id` لتعديل المبلغ والتاريخ والملاحظات، ويقبل `expectedAccountVersion`, `amount`, `occurredOn`, `notes`, `reason`.
- يضاف `DELETE /api/v1/supplier-account-entries/:id` للحذف المحاسبي، ويقبل `expectedAccountVersion`, `reason`.
- يزال المسار القديم `POST /supplier-account-entries/:id/reverse` بعد نقل الواجهة والاختبارات، أو يحتفظ به مؤقتًا كـdeprecated alias لدورة إصدار واحدة إذا كانت هناك واجهة منشورة خارج هذا المستودع. الواجهة الجديدة لا تستخدمه.

استجابة التعديل ترجع `originalEntry`, `reversalEntry`, `replacementEntry`, `account`, و`drawerTransactions`. استجابة الحذف ترجع `originalEntry`, `reversalEntry`, `account`, و`drawerTransaction`. كل الأموال strings عشرية.

## 4. تعديلات الباك إند حسب الملفات

### 4.1 `supplier.models.js`

- حذف حقول `supplierType`, `status`, `statusChangeReason`.
- حذف indexes الخاصة بالحالة والنوع.
- إضافة index للقائمة `{ createdAt: -1, _id: -1 }` والإبقاء على indexes الاسم والهاتف.
- إضافة `replacesEntryId` و`replacedByEntryId` إلى القيد مع unique partial index يمنع استبدال القيد أكثر من مرة.
- الإبقاء على منع update/delete المباشر لقيود الحساب.

### 4.2 `supplier.validation.js`

- حذف `status` من query وحذف `supplierStatusBody`.
- حذف `supplierType` من create/update.
- إضافة `deleteSupplierBody`, `updateEntryBody`, `deleteEntryBody`.
- فرض money كـdecimal string موجب، والتاريخ بصيغة ISO date، والسبب إلزامي، و`expectedVersion`/`expectedAccountVersion` أعداد صحيحة غير سالبة.

### 4.3 `supplier.service.js`

- إزالة `setSupplierStatus` و`assertActiveSupplier` وكل شروط المورد غير النشط.
- تعديل `createSupplier` و`updateSupplier` وpayloads بحيث لا تتضمن النوع أو الحالة.
- إضافة `assertSupplierExists` التي تتحقق من الوجود فقط.
- تعديل `getSupplierSnapshot` ليعيد `id`, `name`, `phone`, `city`.
- إضافة `inspectSupplierDeleteBlockers` باستعلامات `exists/countDocuments` متوازية على كل الموديولات المرتبطة.
- إضافة `deleteSupplier` لتنفيذ الفحص والحذف وAudit/Outbox داخل Transaction.
- إضافة `updateSupplierEntry` لتنفيذ العكس والاستبدال وإعادة حساب الرصيد وأثر الدرج ذريًا.
- إضافة `deleteSupplierEntry` كعملية reversal صريحة للواجهة.
- استخراج حساب آثار القيد إلى policy واحدة لمنع اختلاف منطق الإنشاء والتعديل والحذف.

### 4.4 `supplier.queries.js`, `supplier.mapper.js`, `supplier.public-service.js`

- حذف filters وsummary الخاصة بالحالة والنوع.
- تغيير `listActiveSupplierSummaries` إلى `listSupplierSummaries` بلا شرط حالة.
- تغيير `assertActiveSupplier` العام إلى `assertSupplierExists`.
- حذف النوع والحالة من كل DTO وsnapshot.
- الحفاظ على pagination عشرة عناصر وعلى `_id` كـtie-breaker.

### 4.5 Routes وController

- حذف controller/route الحالة.
- إضافة DELETE للمورد وPATCH/DELETE للقيد.
- إضافة صلاحية `suppliers.delete` للمورد، واستخدام `suppliers.account.write` للتعديل و`suppliers.account.reverse` للحذف المحاسبي.
- إرسال نفس envelope القياسي وإرجاع أخطاء 404/409/422 بالعقود الموحدة للمشروع.

### 4.6 الموديولات المتكاملة

- `inventory/material.service.js`: استبدال port `assertActiveSupplier` بـ`assertSupplierExists`؛ تحديد المورد عند إضافة المادة يظل إلزاميًا.
- `purchases/purchase.service.js`: حذف شرط `status: ACTIVE` من تحميل الموردين وحذف خطأ `PURCHASE_SUPPLIER_NOT_ACTIVE`.
- `routes/v1.routes.js`: تحديث أسماء dependencies المحقونة إلى `listSupplierSummaries` و`assertSupplierExists`.
- `warnings`, `reports`, `purchase-returns`: التأكد أن snapshots التاريخية لا تعتمد على النوع أو الحالة، وأن الأسماء القديمة تظل مأخوذة من snapshot عند الحاجة.
- لا تتغير حالة المادة الخام؛ حذف حالة **المورد** لا يعني حذف حالات المواد أو المنتجات أو الموظفين.

## 5. ترحيل MongoDB

ينفذ migration مستقل قابل لإعادة التشغيل:

1. يسجل عدد وثائق الموردين قبل التنفيذ.
2. ينفذ `$unset` للحقول `supplierType`, `status`, `statusChangeReason` لكل الموردين.
3. يسقط indexes القديمة التي تبدأ بـ`status` أو `supplierType` بعد التحقق من أسمائها الفعلية.
4. ينشئ index القائمة الجديد وindexes الاستبدال الجديدة.
5. يتحقق أن لكل مورد حسابًا واحدًا، وأنه لا توجد حسابات يتيمة.
6. يطبع تقريرًا فقط بالأخطاء ولا يحذف أي سجل مرتبط.

يُختبر migration أولًا على نسخة من قاعدة البيانات. التطبيق الجديد يجب أن يعمل أثناء وجود الحقول القديمة ولا يرسلها، ثم ينفذ migration، لتقليل زمن التعطل.

## 6. تعديلات الفرونت إند

### 6.1 Forms وSchemas وAdapters

- حذف `supplierType` من `supplier.schema.js`, `AddSupplierForm.jsx`, `SupplierEditor.jsx` وبيانات reset.
- حذف `supplierStatusSchema`.
- حذف mapping الافتراضي للحالة والنوع من `supplier.adapter.js`.
- إضافة schemas لنموذج حذف المورد وتعديل/حذف القيد.

### 6.2 شاشة الموردين

- حذف عمودي النوع والحالة.
- حذف فلتر الحالة وكروت النشط والمتوقف.
- إضافة كارت `إجمالي الموردين` مع إجمالي الديون والمستحقات.
- إضافة أزرار عرض وتعديل وحذف لكل صف وفق الصلاحيات، بأهداف لمس لا تقل عن 44px على الموبايل.
- التعديل يفتح نموذجًا واضحًا؛ الحذف يفتح تأكيدًا يطلب السبب ويعرض blockers القادمة من الخادم إن رُفض.
- بعد النجاح تُحدّث القائمة والملخصات، وإذا حُذف آخر عنصر في الصفحة الحالية ترجع الواجهة للصفحة السابقة الصالحة.

### 6.3 صفحة المورد

- حذف عرض النوع والحالة وأي زر تشغيل.
- إضافة زر حذف المورد أعلى الصفحة.
- إضافة تعديل وحذف لكل قيد أصلي غير معكوس.
- قيد `REVERSAL` أو القيد المعكوس يعرض للقراءة فقط مع روابط مرجعية للقيد الأصلي/البديل.
- نموذج تعديل القيد يملأ المبلغ والتاريخ والملاحظات الحالية، ويطلب سبب التعديل.
- بعد العملية تُحدّث تفاصيل المورد والحساب والقيود والدرج والتقارير ذات الصلة.
- عند `409` يعرض Conflict dialog ويعيد تحميل الرصيد والنسخة قبل السماح بإعادة المحاولة.

### 6.4 API وHooks

- حذف endpoint/hook تغيير الحالة.
- إضافة `deleteSupplier`, `updateEntry`, `deleteEntry` مع Idempotency-Key.
- تحديث `getSupplierOptions` لإرسال query بلا status.
- invalidation يشمل supplier list/detail/entries، drawer screen، warnings المرتبطة إن وجدت، وfinancial reports.
- تعطيل الزر أثناء الطلب ومنع النقر المزدوج.

## 7. التعامل مع جميع الحالات

- اسم أو هاتف مكرر: يطبق العقد الحالي إن كان مسموحًا؛ وإذا كان المطلوب منع التكرار يضاف unique business rule منفصل، ولا يُخلط بالحذف.
- مورد غير موجود: `404` في القراءة والتعديل والحذف وإنشاء القيد.
- نسخة قديمة: `409` مع إعادة تحميل.
- حذف مورد نظيف: نجاح ذري وحذف الحساب معه.
- حذف مورد له أي مرجع: رفض كامل مع blockers، بلا حذف جزئي.
- قيد أكبر من رصيد الدين/المستحق: رفض كما هو حاليًا.
- تعديل ينتج رصيدًا سالبًا: رفض وإبقاء القديم كما هو.
- حذف دفعة بعد وجود حركات لاحقة: يحسب النظام الأثر على الرصيد الحالي؛ إذا أصبح سالبًا يرفض.
- قيد معكوس أو مستبدل: يمنع تكرار الحذف/التعديل.
- طلب مكرر بنفس idempotency key: يعيد نفس النتيجة ولا يكرر حركة الدرج.
- طلبان متزامنان: يفوز صاحب `expectedVersion` الصحيح ويأخذ الثاني 409.
- فشل Audit أو Outbox أو الدرج: rollback للعملية كلها.
- انقطاع الاستجابة بعد commit: تعيد idempotency النتيجة نفسها عند إعادة المحاولة.
- حذف آخر مورد في صفحة: تصحيح رقم الصفحة في الواجهة.
- بيانات قديمة تحمل status/type: لا تظهر في DTO، ثم يحذفها migration.

## 8. الاختبارات ومعايير القبول

### 8.1 Backend

- Contract tests تؤكد رفض `supplierType` و`status` بسبب `.strict()`.
- اختبارات create/read/update/delete للمورد وحالات blockers كلها.
- اختبارات عدم وجود route الحالة.
- اختبارات إزالة شرط حالة المورد من المادة والمشتريات.
- اختبارات تعديل وحذف الأنواع الأربعة للقيود، مع وردية مفتوحة ومغلقة ومن دون وردية.
- اختبارات الرصيد السالب، القيد المعكوس، version conflict، idempotency، rollback وrace بين طلبين.
- اختبار أن كل عملية ناجحة تكتب Audit وOutbox مرة واحدة.
- اختبار pagination بحد 10 وترتيب ثابت.

### 8.2 Frontend

- لا يظهر نص أو حقل أو فلتر للنوع أو الحالة.
- نموذج الإضافة والتعديل يرسل الحقول الأربعة فقط.
- أزرار العرض والتعديل والحذف تظهر حسب الصلاحيات.
- رسائل blockers وconflict وأخطاء الدرج تظهر بالعربية.
- تعديل/حذف القيد يحدث الرصيد والجدول والدرج بلا refresh يدوي.
- اختبارات responsive للموبايل والتابلت والديسكتوب وRTL، من دون Chromium dependency داخل المشروع؛ تستخدم اختبارات DOM الحالية والتحقق اليدوي في المتصفح.

### 8.3 فحوص التكامل

- إنشاء مادة خام بمورد موجود.
- إنشاء وتقسيم وتسجيل فاتورة متعددة الموردين بعد إزالة status.
- إنشاء دين/مستحق بلا درج، ودفع/تحصيل مع الدرج.
- ظهور الأثر الصحيح في التقارير وسجل الأحداث.
- عدم حذف مورد مستخدم في أي مسار تاريخي.

## 9. ترتيب التنفيذ الآمن

1. تثبيت اختبارات العقد الجديدة والفاشلة أولًا.
2. تعديل schema/validation/mapper/query وإزالة الحالة والنوع.
3. تحديث public service وتكامل inventory/purchases/routes.
4. تنفيذ حذف المورد مع dependency inspector.
5. تنفيذ تعديل وحذف القيود وأثر الدرج.
6. تحديث Routes/Controller/API documentation.
7. تحديث frontend schemas/adapters/API/hooks.
8. تحديث النماذج والجداول وصفحة التفاصيل والحالات التفاعلية.
9. تشغيل backend unit/integration tests ثم frontend tests/build/lint.
10. تجربة workflow كاملة على قاعدة اختبار.
11. أخذ backup ثم تشغيل migration والتحقق من تقريره.
12. تشغيل smoke test نهائي لصفحة الموردين والمخزون والمشتريات والدرج والتقارير.

## 10. تعريف الاكتمال

لا تعتبر المهمة مكتملة إلا إذا كان البحث في `src` والاختبارات لا يعيد أي استخدام لحالة المورد أو نوعه أو endpoint الإيقاف، باستثناء migration الذي يزيل الحقول القديمة. يجب أن تنجح الاختبارات والبناء، وتظل جميع الأرصدة والحركات التاريخية قابلة للتتبع، وتعمل إضافة المادة والمشتريات بحساب المورد الموجود فقط، وتعمل كل أزرار التعديل والحذف وفق الصلاحيات والتزامن وقواعد الدرج السابقة.
