# التقارير المالية وسجل الأحداث الشامل — التحليل الكامل

الإصدار 1.0. امتداد ملزم للمرجع التنفيذي MERN. يحتوي موديولين: تقارير مالية بسيطة لاتخاذ القرار، وسجل أحداث شامل لكل العمليات المهمة في النظام.

## 1. قواعد مشتركة

- كل وقت يخزن UTC ويعرض بتوقيت Africa/Cairo.
- كل تاريخ تجاري يحسب حسب يوم القاهرة.
- المال Decimal128 وينقل في JSON كنص.
- كل جدول أو سجل Server-side Pagination، افتراضي 10 وحد أقصى 100.
- التقارير Read Models من مصادر الحقيقة؛ لا تعدل المال أو المخزون.
- سجل الأحداث Append-only؛ لا تعديل أو حذف من API.
- إخفاء الأزرار لا يكفي، وكل Endpoint يفحص الصلاحية.
- لا يسجل النظام كلمة مرور أو Token أو Authorization Header أو بيانات دفع حساسة، حتى مع التسجيل التفصيلي.
- Export والطباعة يسجلان كأحداث، ويطبقان نفس الفلاتر والصلاحيات.

# الجزء الأول: موديول التقارير المالية

## 2. الهدف والبساطة

الموديول يجيب عن أسئلة الإدارة اليومية:

1. بعنا بكام؟
2. تكلفة ما بيعناه كام؟
3. الربح الإجمالي كام؟
4. صرفنا وقبضنا نقدًا كام؟
5. قيمة المخزون الحالية كام؟
6. قيمة الهدر والسحب كام؟
7. علينا ديون ولنا مستحقات كام؟
8. أي المنتجات والأقسام والقنوات أفضل؟
9. هل الأداء أفضل من الفترة السابقة؟
10. أين توجد مشكلة تحتاج قرارًا؟

ليس نظام قيود محاسبية مزدوجة أو ميزانية قانونية. يقدم صورة تشغيلية دقيقة من البيانات الموجودة، ولا يخترع أرقامًا عند غياب المصدر.

## 3. الشاشة

أعلى الصفحة:

- من تاريخ وإلى تاريخ.
- اختيارات جاهزة: اليوم، أمس، آخر 7 أيام، الشهر الحالي، الشهر السابق، فترة مخصصة.
- مقارنة بالفترة السابقة Toggle.
- فلتر نوع الطلب: الكل، أونلاين، تيك أواي، طربيزات.
- فلتر طريقة الدفع.
- زر تطبيق، طباعة، وتصدير CSV.
- وقت آخر احتساب والمنطقة الزمنية.

بطاقات الملخص:

- صافي المبيعات.
- تكلفة المبيعات الفعلية.
- مجمل الربح.
- هامش الربح.
- عدد الفواتير المكتملة.
- متوسط قيمة الفاتورة.
- النقد الوارد.
- النقد الصادر.
- صافي حركة النقد.
- قيمة المخزون الحالية.
- قيمة المسحوب/الهدر في الفترة.
- ديون الموردين الحالية.
- مستحقات الموردين الحالية.
- مبالغ التوصيل المحصلة عند المندوب ولم تسو للدرج.
- عجز أو زيادة الأدراج.

التبويبات البسيطة:

1. ملخص.
2. المبيعات.
3. المنتجات والأقسام.
4. المخزون والمشتريات.
5. الدرج والمصروفات.
6. الموردون.
7. المندوبون.
8. الفواتير.

كل جدول Pagination 10، والمجاميع من كل النتائج المطابقة لا من الصفحة.

## 4. تعريف الأرقام

### 4.1 المبيعات

Gross Sales = مجموع إجماليات العناصر النشطة في الطلبات المكتملة قبل Refunds.

Cancelled Items لا تدخل. الطلب الملغي لا يدخل.

Refunds = الأموال المعادة المرتبطة بالطلبات في الفترة.

Net Sales = Gross Sales - Refunds - Discounts + Tax + Delivery Fees وفق طريقة عرض الإجمالي المعتمدة. إذا كان total في الطلب بعد الخصم والضريبة، المصدر الأبسط هو مجموع total المكتمل ناقص Refunds، مع Breakdown منفصل لمنع الجمع مرتين.

الطلب OUT_FOR_DELIVERY غير مكتمل لا يدخل Net Sales بعد، لكنه يظهر في Pending Delivery Value. طلب DELIVERY مكتمل وCOD محصل عند المندوب يدخل المبيعات، ويظهر النقد كعهدة مندوب حتى التسوية.

### 4.2 تكلفة المبيعات والربح

COGS = مجموع actualInventoryCost من العناصر المكتملة وغير الملغاة، بعد طرح تكلفة العناصر المعكوسة.

Gross Profit = Net Sales - COGS.

Gross Margin = Gross Profit / Net Sales × 100. إذا Net Sales صفر، القيمة null وليست صفرًا مضللًا.

Actual Profit لكل طلب من Snapshots ولا يعاد حسابه بأسعار دفعات اليوم. تكلفة المنتج المتوقعة لا تستخدم في تقرير مبيعات تاريخية.

Operating Expenses = حركات الدرج المصنفة EXPENSE فقط، بعد العكس.

Waste Loss = قيمة حركات WITHDRAWAL النهائية في الفترة. تظهر منفصلة، وتدخل النتيجة التشغيلية المقترحة.

Operational Result = Gross Profit - Operating Expenses - Waste Loss. هذا مؤشر إدارة داخلي وليس صافي ربح محاسبي قانوني؛ لا يشمل الرواتب أو الإيجار إلا إذا سجلا كمصروفات.

### 4.3 حركة النقد

Cash In = حركات الدرج IN غير المعكوسة.
Cash Out = حركات الدرج OUT غير المعكوسة.
Net Cash Movement = Cash In - Cash Out.

Opening Balance لا يدخل Cash In أو Revenue. الفرق بين الافتتاحي والختامي يعرض في المصالحة ولا يعد إيرادًا.

Revenue Cash = حركات accountingClass=REVENUE.
Expense Cash = EXPENSE.
Refund Cash = REFUND.
Balance Settlement = دفعات ديون الموردين وتحصيل مستحقاتهم، تظهر كتسوية أرصدة وليست إيرادًا أو مصروفًا.
Transfer وCapital وCorrection تظهر مستقلة.

لا نستنتج الربح من صافي الدرج، ولا نستنتج الإيراد من كل IN.

### 4.4 المخزون والمشتريات

Current Inventory Value = مجموع remainingInventoryValue لكل الدفعات.

Purchases Registered Value = قيمة PURCHASE_RECEIPT في الفترة.
Purchase Returns Value = قيمة PURCHASE_RETURN في الفترة.
Net Inventory Received = Purchases Registered Value - Purchase Returns Value.

المشتريات لا تعتبر مصروفًا بمجرد الإدراج، ولا دين مورد، ولا حركة درج. تتحول تكلفة الدفعات إلى COGS عند بيعها، أو Waste Loss عند سحبها.

قيمة المخزون الحالية Snapshot لحظة التقرير، ولا تقيد بفترة from/to إلا إذا طلب المستخدم تقرير قيمة تاريخية. يعرض العنوان «القيمة الحالية حتى وقت الاحتساب».

### 4.5 الموردون

Current Supplier Debt = مجموع debtBalance الحالي.
Current Supplier Receivables = مجموع receivableBalance الحالي.

Created Debts in Period وCreated Receivables in Period من القيود اليدوية.
Debt Payments وReceivable Collections من القيود اليدوية.

الأرصدة الحالية لا تجمع مع الإيراد أو المصروف. المشتريات والمرتجعات لا تغيرها.

### 4.6 المندوبون

Delegate Outstanding Cash = مجموع COD الذي حالته COLLECTED_BY_DELEGATE ولم يصبح SETTLED.

يعرض لكل مندوب: الطلبات المسلمة، قيمة الطلبات، المحصل، المورد للدرج، العهدة القائمة، معدل تعذر التسليم، ومتوسط زمن التوصيل.

لا يدخل المحصل لدى المندوب Cash Drawer قبل التسوية.

## 5. تقارير المبيعات

### 5.1 اليومي والشهري

الجداول: الفترة، عدد الفواتير، عدد الوحدات، gross sales، refunds، net sales، COGS، gross profit، margin، average invoice.

اليومي يجمع حسب businessDate القاهرة. الشهري يجمع YYYY-MM. الأيام أو الشهور بلا بيانات يمكن إظهارها بصفر في الرسم فقط، لكن الجدول لا يحتاج صفوفًا مصطنعة إلا إذا اختير ذلك.

### 5.2 حسب القناة

PICKUP وDELIVERY وDINE_IN: عدد الطلبات، Net Sales، COGS، Profit، Margin، Average Order، Cancellation Rate.

المقارنة تساعد الإدارة تعرف هل التوصيل مربح بعد رسومه، وهل الطربيزات أعلى متوسطًا من التيك أواي.

### 5.3 حسب المنتج والقسم

لكل Product/Size Snapshot: الكمية المباعة، Net Sales الموزع، COGS، Profit، Margin، مرات الإلغاء، ومتوسط السعر.

التقرير التاريخي يعتمد Snapshots، لذلك تغيير اسم المنتج لا يضيع التجميع. يستخدم productId للتجميع وsnapshot للاسم، مع خيار عرض الأسماء القديمة.

المؤشرات:

- الأعلى مبيعًا.
- الأعلى ربحًا.
- الأقل هامشًا.
- منتج سعره الحالي أقل من تكلفته المتوقعة.
- منتج كثير الإلغاء.
- قسم يحقق أفضل ربح.

لا نقول إن الأعلى مبيعًا هو الأفضل ربحًا دون مقارنة التكلفة.

## 6. تقارير المخزون والمشتريات

جدول المواد: المادة، المورد الحالي، الموجود بالوحدة الصغيرة والكبيرة، قيمة المخزون، المستلم في الفترة، المرتجع، المباع كخامات، المسحوب، قيمة الهدر، أقرب صلاحية، الحالة.

تقارير القرار:

- أعلى مواد استهلاكًا.
- أعلى قيمة مخزون راكد: له رصيد ولا استهلاك خلال N يوم.
- أعلى هدر بالقيمة والنسبة.
- مواد قاربت النفاد.
- دفعات منتهية بقيمة متبقية.
- تغير آخر سعر شراء مقارنة بالسابق.
- أيام تغطية تقريبية = المخزون الحالي / متوسط الاستهلاك اليومي. عند غياب استهلاك كاف ترجع null.

قيمة الشراء تعرض حسب تاريخ إدراج الدفعة، لا تاريخ إنشاء Draft. المرتجع يخصم من صافي الاستلام.

## 7. تقارير الدرج والمصروفات

لكل وردية: رقم الدرج، الفاتح والمغلق، الافتتاحي، Revenue In، Other In، Expenses Out، Refunds، Settlements، Transfers، المتوقع، الفعلي، العجز/الزيادة، والحالة.

تقارير القرار:

- المصروفات حسب التصنيف.
- المصروفات حسب الموظف.
- العجز والزيادة حسب الوردية والموظف.
- متوسط النقد اليومي.
- الحركات اليدوية الكبيرة فوق Threshold إعداد.
- حركات التصحيح والعكس.

الرصيد الافتتاحي خارج الإيرادات والمصروفات. العجز والزيادة لا يدخلان الربح تلقائيًا.

## 8. تقرير الموردين

جدول Pagination: المورد، الدين الحالي، المستحق الحالي، ديون الفترة، مستحقات الفترة، المدفوع، المحصل، آخر حركة.

يعرض الموردون ذوو الأرصدة الأعلى والمتأخرة حسب occurredOn. لا يربط قيمة المشتريات برصيد المورد. يمكن عرض «قيمة خامات مشتراة من المورد» كعمود تشغيلي منفصل مع توضيح أنها ليست دينًا.

## 9. تقرير الفواتير

جدول: invoiceNumber، orderNumber، fulfillmentType، customer/table، delegate عند التوصيل، total، refund، net، actual cost، profit، margin، payment status، completedAt، طباعة.

CANCELLED يظهر في فلتر خاص ولا يدخل ملخص المبيعات. OUT_FOR_DELIVERY يظهر في Pending وليس الفواتير المكتملة. كل صفحة 10.

## 10. المقارنة والتحليل لاتخاذ القرار

عند تفعيل المقارنة، الفترة السابقة لها نفس عدد الأيام وتنتهي قبل from مباشرة. تعرض لكل KPI:

- current.
- previous.
- absoluteChange.
- percentageChange.
- direction UP/DOWN/FLAT.
- interpretationCode.

إذا previous صفر، percentageChange=null ويعرض «لا توجد قاعدة مقارنة»، لا Infinity.

قواعد Insight بسيطة وشفافة:

- SALES_DOWN إذا Net Sales انخفضت أكثر من Threshold.
- MARGIN_DOWN إذا الهامش انخفض.
- WASTE_HIGH إذا Waste / Inventory Consumption تجاوز حدًا.
- DRAWER_SHORTAGE إذا وجد عجز.
- EXPENSES_UP إذا المصروفات زادت أسرع من المبيعات.
- LOW_MARGIN_PRODUCT للمنتجات ضعيفة الهامش.
- STALE_INVENTORY للمخزون الراكد.
- DELEGATE_CASH_PENDING لعهد المندوب المتأخرة.
- SUPPLIER_DEBT_HIGH لرصيد يتجاوز حدًا إداريًا.

كل Insight يعرض الرقم والسبب والرابط للتفاصيل. لا يستخدم AI أو توقعات مبهمة في النسخة الأولى.

## 11. Workflow التقرير

1. المستخدم يحدد الفترة والفلاتر.
2. الخادم يتحقق من الصلاحية وصحة التواريخ.
3. يبني Range UTC الموافق لبداية ونهاية أيام القاهرة.
4. يشغل Aggregations مستقلة على orders/payments/inventory/drawer/suppliers.
5. يوحد العملة EGP ويتحقق من عدم خلط عملات.
6. يحسب KPI والمقارنة والـInsights.
7. يعيد generatedAt وsourceFreshness.
8. يسجل REPORT_VIEWED بفلاتر آمنة.
9. الجداول تحمل صفحاتها عند فتح التبويب.
10. Print/Export ينشئ حدثًا ويستخدم نفس الفلاتر.

from أكبر من to مرفوض. الفترة الافتراضية اليوم. نطاق طويل جدًا، مثل أكثر من سنتين، يحتاج صلاحية أو Export Job حتى لا يضغط قاعدة البيانات.

## 12. Data Flow المالي

Completed Orders + Active Items + Allocations → Net Sales/COGS/Gross Profit.

Order Payments + Refunds → Payment Status/Collected/Refunded.

Cash Drawer Transactions by accountingClass → Cash Flow and Expenses.

Inventory Batches + Movements → Current Value/Purchases/Returns/Waste.

Supplier Account Entries → Current Balances and Manual Activity.

Delivery Assignments + Payments → Delegate Performance and Outstanding Cash.

كل Stream يظل منفصلًا ثم يعرض في Dashboard واحد؛ لا ينسخ إلى Collection تقرير يومية كمصدر حقيقة.

## 13. Schemas التقارير

### 13.1 لا Collection أساسية للأرقام

النسخة الأولى تحسب Aggregation من المصادر. يمكن استخدام Cache قصير وليس مصدر حقيقة.

financialReportCache اختياري:

_id، cacheKey unique، filtersHash، schemaVersion، payload، generatedAt، expiresAt TTL، sourceVersions، generatedBySystem. لا يعدل من الواجهة.

### 13.2 reportExports

_id، exportNo، reportType، filtersSafe، format CSV/PDF، status QUEUED/PROCESSING/READY/FAILED/EXPIRED، requestedAt/By، completedAt، fileReference، expiresAt TTL، rowCount، checksum، errorCode. لا يخزن رابطًا عامًا دائمًا.

### 13.3 reportInsights

لا يلزم Collection. DTO يحتوي code، severity INFO/WARNING/CRITICAL، title، message، metric، currentValue، threshold، link، generatedAt.

## 14. API التقارير

- GET /api/financial-reports/overview.
- GET /api/financial-reports/sales/daily.
- GET /api/financial-reports/sales/monthly.
- GET /api/financial-reports/sales/by-channel.
- GET /api/financial-reports/products.
- GET /api/financial-reports/inventory.
- GET /api/financial-reports/drawers.
- GET /api/financial-reports/suppliers.
- GET /api/financial-reports/delegates.
- GET /api/financial-reports/invoices.
- POST /api/financial-reports/exports.
- GET /api/financial-reports/exports/:id.

Overview يعيد summary وcomparison وinsights. الجداول تعيد data وpagination وsummary وgeneratedAt.

## 15. الصلاحيات المالية

- financial_reports.read.
- financial_reports.read_cost.
- financial_reports.read_profit.
- financial_reports.read_supplier_balances.
- financial_reports.read_drawer_reconciliation.
- financial_reports.read_delegate_cash.
- financial_reports.export.
- financial_reports.print.

من لا يملك read_cost لا تصله التكلفة والربح من API أصلًا. إخفاء العمود في React غير كاف.

## 16. حالات التقارير

1. يوم بلا مبيعات يعرض صفرًا موثوقًا بعد نجاح الاستعلام.
2. فشل المصدر يعرض unavailable ولا يحوله صفرًا.
3. الطلب الملغي لا يدخل المبيعات.
4. العنصر الملغي لا يدخل البيع أو COGS.
5. Refund يخفض Net Sales.
6. OUT_FOR_DELIVERY لا يدخل مكتمل المبيعات.
7. COD مكتمل يظهر مبيعًا وعهدة مندوب.
8. تسوية COD تدخل الدرج مرة واحدة.
9. Opening Balance لا يدخل الإيراد.
10. Debt Payment لا يدخل المصروف.
11. Receivable Collection لا يدخل الإيراد.
12. Purchase Receipt لا يدخل المصروف.
13. Purchase Return لا يدخل إيراد المبيعات.
14. Withdrawal يدخل Waste Loss.
15. Expired stock يبقى في قيمة المخزون ما دام موجودًا.
16. COGS من Actual Allocations لا آخر سعر.
17. تغيير سعر خام اليوم لا يغير ربح طلب قديم.
18. تغيير اسم منتج لا يضيع التاريخ.
19. فترة القاهرة تحول UTC بصورة صحيحة.
20. Previous صفر لا ينتج Infinity.
21. Pagination لا تغير Summary.
22. Export يستخدم نفس الفلاتر.
23. صلاحية التكلفة تمنع الحقل من الخادم.
24. عملتان مختلفتان لا تجمعان بلا تحويل.
25. عكس حركة درج يزيل أثر الأصل مرة واحدة.
26. إلغاء بعد دفع يظهر Refund.
27. العجز لا يدخل Expense تلقائيًا.
28. قيمة المخزون الحالية معنونة بوقت الاحتساب.
29. Cache قديم لا يعرض كحديث.
30. كل مشاهدة وطباعة وتصدير تسجل حدثًا.

# الجزء الثاني: موديول سجل الأحداث الشامل

## 17. الهدف وحدود «كل حركة»

يسجل الموديول كل حركة ذات معنى تشغيلي أو أمني أو مالي أو مخزني:

- إنشاء وتعديل وإيقاف وأرشفة.
- انتقال حالة.
- تسجيل دخول ناجح وفاشل وخروج وتجديد جلسة.
- طلب جهاز وموافقة ورفض وحظر.
- حضور وانصراف.
- مشاهدة بيانات حساسة.
- فتح صفحة وتفاصيل كيان إذا فعلت سياسة PAGE_VIEW.
- بحث وفلترة وتصدير وطباعة عند الحاجة للمراجعة.
- كل حركة مورد ومخزون وشراء ومرتجع ومنتج وطلب وطربيزة ودرج ومندوب وعميل وتقييم.
- محاولات العمليات المرفوضة وفشلها.
- أحداث النظام المجدولة والتصحيحات.
- أحداث Realtime المهمة والنشر الفاشل عبر Outbox.

لا يسجل كل حركة ماوس أو كتابة حرف داخل input لأنها ضوضاء ولا تمثل تغييرًا. يسجل Submit والنتيجة والقيم الآمنة. يمكن تسجيل PAGE_VIEW وENTITY_VIEW لمتابعة الدخول للصفحات دون تسجيل Clicks الزخرفية.

## 18. أنواع الأحداث

### 18.1 Business Events

مثل SUPPLIER_CREATED، SUPPLIER_DEBT_RECORDED، PURCHASE_ITEM_REGISTERED، INVENTORY_WITHDRAWN، ORDER_CONFIRMED، ORDER_ITEM_READY، ORDER_CANCELLED، TABLE_SESSION_CLOSED، DELIVERY_CONFIRMED، CASH_DRAWER_CLOSED.

### 18.2 Security Events

LOGIN_SUCCEEDED، LOGIN_FAILED، DEVICE_PENDING، DEVICE_APPROVED، PERMISSION_CHANGED، PASSWORD_VIEWED، ACCESS_DENIED، SESSION_REVOKED، RATE_LIMITED.

### 18.3 Read and Document Events

PAGE_VIEWED، ENTITY_VIEWED، REPORT_VIEWED، SEARCH_PERFORMED اختياري، INVOICE_PRINTED، REPORT_EXPORTED، WHATSAPP_SHARE_OPENED.

### 18.4 System Events

JOB_STARTED/COMPLETED/FAILED، OUTBOX_PUBLISH_FAILED، CONSISTENCY_CHECK_FAILED، CACHE_REBUILT، BACKUP_RECORDED إن توفر مصدر موثوق.

## 19. مستويات النتيجة والخطورة

result: SUCCESS، FAILURE، DENIED، PARTIAL، NO_CHANGE.

severity: INFO، NOTICE، WARNING، CRITICAL.

أمثلة:

- عرض صفحة: INFO.
- كلمة مرور خاطئة: NOTICE.
- محاولة صلاحية ممنوعة: WARNING.
- فشل Transaction مالي: WARNING أو CRITICAL حسب الأثر.
- اختلاف مخزون أو درج: CRITICAL.
- إعادة Idempotent بلا تغيير: NO_CHANGE.

## 20. تفاصيل الحدث

كل حدث يحتفظ بـ:

- eventNo وeventType.
- category وmodule وpageKey.
- action.
- actorType EMPLOYEE/CUSTOMER/DELEGATE/SYSTEM/ANONYMOUS.
- actorId وactorSnapshot الآمن.
- subjectType/subjectId لمن وقع عليه الحدث.
- entityType/entityId وentitySnapshot مختصر.
- parentEntity وrelatedEntities.
- fromStatus وtoStatus.
- changes: field، before، after بعد التنقية.
- amount/currency/direction/accountingClass عند المال.
- quantity/unit/batchId عند المخزون.
- orderNumber/invoiceNumber/tableNumber عند الطلبات.
- reasonCode وreasonText.
- result وseverity.
- errorCode وerrorMessageSafe عند الفشل.
- requestId وcorrelationId وcausationId.
- idempotencyKeyHash.
- sessionId وdeviceId.
- IP وuserAgentSummary وappVersion.
- route وHTTP method وstatusCode وdurationMs.
- occurredAt من الخادم وbusinessDate القاهرة.
- source WEB/API/JOB/SOCKET/WEBHOOK.
- metadataSafe محدود ومتحقق منه.
- integrityHash وpreviousIntegrityHash اختياريان لكشف العبث.

لا يحتفظ بـpasswordPlainText أو refresh/access tokens أو trackingToken أو card data أو Authorization/Cookie أو Request Body كامل. البصمة تخزن Hash/جزءًا مقنعًا في الحدث. العنوان والهاتف يظهران Masked إلا لصلاحية تدقيق خاصة.

## 21. Workflow كتابة الحدث

### 21.1 عملية ناجحة حرجة

1. يولد requestId/correlationId.
2. تتحقق الصلاحية والمدخلات.
3. تنفذ تغييرات العمل.
4. يبنى Audit Event من القيم الآمنة قبل/بعد.
5. يحفظ الحدث داخل نفس MongoDB Transaction للعملية المالية/المخزنية الحرجة.
6. Commit.
7. ينشر Realtime/Outbox.
8. يظهر الحدث في السجل.

إذا فشل حفظ Audit في عملية حرجة يرجع Transaction كلها. الأحداث التقنية بعد Commit تستخدم Outbox ولا تعيد العملية التجارية.

### 21.2 عملية مرفوضة أو فاشلة

لا توجد Transaction تجارية كي تحفظ الحدث معها. يسجل FAILURE/DENIED في قناة مستقلة Best Effort. إذا تعذر MongoDB يستخدم Logger تشغيلي محلي/خارجي ولا يخبر المستخدم أن العملية نجحت.

لا يسجل الخطأ Stack Trace في Audit المرئي. Stack الكامل يبقى في Technical Logs بصلاحية ومدة احتفاظ منفصلة.

### 21.3 Page View والقراءة

Middleware يسجل ENTITY_VIEWED فقط للكيانات الحساسة أو عند تفعيل السياسة. PAGE_VIEWED يمكن تجميعه لمنع تكرار refresh المتتابع: نفس الموظف والصفحة والجلسة خلال 30 ثانية يزيد count بدل أحداث كثيرة، إذا لم تكن الصفحة حساسة.

عرض كلمة المرور، التقرير المالي، تفاصيل الدرج، أو تصدير البيانات يسجل دائمًا بلا تجميع.

## 22. شاشة سجل الأحداث

بطاقات أعلى الصفحة: أحداث اليوم، نجاح، فشل، مرفوض، تحذيرات، أحداث حرجة.

جدول Pagination 10:

- رقم الحدث.
- التاريخ والوقت.
- الموظف/المصدر.
- الموديول والصفحة.
- الحدث والكيان.
- وصف مختصر.
- النتيجة والخطورة.
- IP والجهاز.
- زر التفاصيل.

الفلاتر:

- فترة.
- موظف أو actorType.
- الموديول.
- eventType/action.
- entityType/entityId.
- النتيجة والخطورة.
- IP/deviceId.
- requestId/correlationId.
- رقم طلب/فاتورة/طربيزة/دفعة.
- يحتوي وصف/سبب.

الترتيب الأحدث أولًا. التفاصيل تعرض Timeline مترابطًا بواسطة correlationId، والقيم قبل/بعد، والمراجع القابلة للفتح، والبيانات التقنية الآمنة. لا يوجد تعديل أو حذف.

## 23. سجل أحداث الشخص

صفحة الموظف تقرأ نفس auditEvents:

- «ما نفذه الموظف»: actorEmployeeId.
- «ما حدث على حساب الموظف»: subjectEmployeeId.
- محاولات الدخول والأجهزة.
- الحضور والانصراف.
- الصفحات الحساسة التي شاهدها.
- العمليات المالية والمخزنية والطلبات.

كل تبويب Pagination مستقل 10. لا Collection ثانية ولا نسخ للأحداث.

صفحات المورد والمادة والطلب والدرج والمندوب والعميل يمكن أن تعرض Timeline لنفس الكيان عبر entityType/entityId.

## 24. خريطة الأحداث المطلوبة

### الموردون

SUPPLIER_CREATED/UPDATED/STATUS_CHANGED، DEBT_RECORDED، RECEIVABLE_RECORDED، DEBT_PAYMENT_RECORDED، RECEIVABLE_COLLECTION_RECORDED، ACCOUNT_ENTRY_REVERSED، SUPPLIER_VIEWED.

### المواد والمشتريات والمرتجعات

MATERIAL_CREATED/UPDATED/DELETED_UNUSED، BATCH_PRIORITY_CHANGED، MATERIAL_WITHDRAWN، PURCHASE_DRAFT_CREATED/UPDATED/DELETED، PURCHASE_SPLIT، PURCHASE_ITEM_REGISTERED، PURCHASE_COMPLETED، PURCHASE_PRINTED، RETURN_CREATED/EXECUTED/PRINTED.

### المنتجات

CATEGORY_CREATED/UPDATED، PRODUCT_CREATED/UPDATED/VISIBILITY_CHANGED، TYPE_CHANGED، SIZE_CHANGED، RECIPE_CHANGED، COST_VIEWED عند صلاحية حساسة.

### الطلبات والتحضير

ORDER_CONFIRMED، ITEMS_ADDED، ITEM_READY، ITEM_CANCELLED، ORDER_READY، ORDER_CANCELLED، ORDER_COMPLETED، INVOICE_PRINTED، TRACKING_VIEWED محدود، REVIEW_SUBMITTED/UPDATED/HIDDEN.

### الطربيزات

TABLE_SESSION_OPENED/CLOSING/CLOSED/CANCELLED، TABLE_STATUS_CHANGED، TABLE_ORDER_VIEWED، TABLE_INVOICE_REPRINTED.

### المندوبون والعملاء

DELEGATE_CREATED/UPDATED/STATUS_CHANGED، ORDER_ASSIGNED/REASSIGNED/DELIVERED/FAILED/RETURNED، DELEGATE_CASH_COLLECTED/SETTLED، WHATSAPP_SHARE_OPENED، CUSTOMER_CREATED/UPDATED/STATUS_CHANGED/MERGED، CUSTOMER_INVOICE_VIEWED.

### الدرج والتقارير

DRAWER_OPENED، CASH_IN، CASH_OUT، DRAWER_TRANSACTION_REVERSED، DRAWER_CLOSING_STARTED/CLOSED، SHORTAGE_DETECTED، SURPLUS_DETECTED، DRAWER_PRINTED، REPORT_VIEWED/PRINTED/EXPORTED.

### الموظفون والأمان

EMPLOYEE_CREATED/UPDATED/STATUS_CHANGED، PASSWORD_CHANGED/VIEWED، PERMISSIONS_CHANGED، DEVICE_PENDING/APPROVED/REJECTED/BLOCKED، LOGIN_SUCCESS/FAILURE، LOGOUT، SESSION_REVOKED، ATTENDANCE_CHECKED_IN/OUT/ADJUSTED، ACCESS_DENIED.

## 25. Data Flow سجل الأحداث

HTTP/Socket/Job → Request Context → Auth/Device → Permission → Domain Service → Before/After Safe Snapshot → Audit Writer → auditEvents → Event Outbox → Realtime/Monitoring.

قراءة السجل: Filters + Permissions → Indexed Query → Redaction حسب صلاحية المشاهد → Pagination → Detail/Timeline.

كل موديول يرسل Domain Event موحدًا، ولا يكتب وصفًا عشوائيًا مباشرة. Event Catalog يحدد الاسم والحقول الإلزامية ومستوى الحساسية.

## 26. Schemas سجل الأحداث

### 26.1 auditEvents

_id، eventNo، eventType، category BUSINESS/SECURITY/READ/SYSTEM، module، pageKey، action، actorType، actorId، actorNameSnapshot، actorPositionSnapshot، subjectType، subjectId، entityType، entityId، entityLabelSnapshot، parentEntity، relatedEntities array محدودة، fromStatus، toStatus، changesSafe array، financialContext، inventoryContext، reasonCode، reasonText، result، severity، errorCode، errorMessageSafe، requestId، correlationId، causationId، idempotencyKeyHash، sessionId، deviceId، ipAddress، userAgentSummary، appVersion، route، httpMethod، httpStatus، durationMs، source، businessDate، occurredAt، metadataSafe، integrityHash، previousIntegrityHash، schemaVersion.

Indexes:

- eventNo unique.
- occurredAt descending مع _id.
- actorId مع occurredAt.
- subjectId مع occurredAt.
- module/eventType/occurredAt.
- entityType/entityId/occurredAt.
- correlationId/occurredAt.
- result/severity/occurredAt.
- businessDate/module.
- TTL غير مفعل على أحداث BUSINESS/SECURITY الأساسية.

### 26.2 auditEventCatalog

eventType unique، category، module، requiredFields، allowedMetadataKeys، severityDefault، retentionClass، isSensitive، description، schemaVersion، active.

يمنع إرسال Metadata مفتوحة أو كلمات سر بالخطأ.

### 26.3 eventOutbox

_id، aggregateType، aggregateId، eventType، auditEventId، payloadSafe، status PENDING/PUBLISHED/FAILED/DEAD، attempts، nextAttemptAt، createdAt، publishedAt، lastErrorSafe. فهرس status/nextAttemptAt.

### 26.4 pageViewAggregates الاختياري

employeeId، sessionId، pageKey، entityType/id nullable، windowStartedAt، lastViewedAt، count، deviceId. TTL قصير. عند إغلاق النافذة ينتج Audit ملخص. الصفحات الحساسة لا تستخدم التجميع.

### 26.5 technicalRequestLogs

مجموعة منفصلة اختيارية للأداء والأخطاء: requestId، routeTemplate، method، status، durationMs، service، errorCode، occurredAt، traceId. TTL من 7 إلى 30 يومًا. لا body أو secrets. ليست بديلًا عن Audit.

## 27. النزاهة والاحتفاظ

- لا DELETE أو PATCH لـauditEvents.
- MongoDB role للتطبيق يسمح insert/read فقط على السجل حيث أمكن.
- integrityHash مع previousIntegrityHash لكل partition يومي أو module يكشف تعديلًا.
- Backup دوري وسياسة وصول.
- BUSINESS وFINANCIAL وSECURITY تحتفظ مدة طويلة يحددها صاحب المشروع، والمقترح 5 سنوات.
- PAGE_VIEW وTechnical Logs مدة أقصر، مثل 90 و30 يومًا.
- إخفاء بيانات شخصية بطلب قانوني يتم Redaction Event أو Crypto-shredding وفق السياسة، ولا حذف صامت يكسر السلسلة.
- ساعة الخادم موحدة، ولا يثق في occurredAt المرسل من العميل.

## 28. API سجل الأحداث

- GET /api/audit-events.
- GET /api/audit-events/:id.
- GET /api/audit-events/timeline/:correlationId.
- GET /api/entities/:entityType/:entityId/audit-events.
- GET /api/employees/:id/audit-events.
- GET /api/audit-events/summary.
- POST /api/audit-events/exports.
- GET /api/audit-events/exports/:id.
- GET /api/audit-event-catalog للإدارة التقنية.

لا POST عام يسمح للفرونت بإنشاء Business Event مزيف. Page View endpoint يقبل قائمة محدودة وموقعة بسياق الجلسة، أو يسجله Middleware عند طلب الصفحة/البيانات.

## 29. الصلاحيات

- audit_log.read.
- audit_log.read_security.
- audit_log.read_financial.
- audit_log.read_sensitive_context.
- audit_log.export.
- audit_log.verify_integrity.
- audit_log.read_technical.

Redaction يحدث في الخادم. من لا يملك Financial يرى «حركة مالية» دون المبلغ. من لا يملك Sensitive يرى هاتفًا وIP مقنعين. حتى SUPER_ADMIN لا يرى كلمة مرور أو Token لأنهما غير مسجلين أصلًا.

## 30. حالات سجل الأحداث

1. كل Mutation ناجح ينشئ حدثًا واحدًا رئيسيًا على الأقل.
2. العمليات متعددة الآثار تشترك correlationId.
3. فشل Transaction لا يترك Business Success Event.
4. العملية المرفوضة تسجل DENIED.
5. كلمة خاطئة لا تسجل الكلمة.
6. عرض كلمة المرور يسجل المشاهدة دون القيمة.
7. تغيير صلاحية يسجل before/after.
8. خصم مخزون يسجل المادة والدفعة والكمية والقيمة الآمنة.
9. عكس الخصم يرتبط بالأصل.
10. أمر Idempotent مكرر لا ينشئ أثرًا ماليًا ثانيًا.
11. طباعة فاتورة تسجل invoice/order والموظف.
12. WhatsApp يسجل فتح المشاركة لا يدعي الإرسال.
13. PAGE_VIEW المتكرر يمكن تجميعه.
14. صفحة حساسة تسجل كل مشاهدة.
15. سجل الشخص يقرأ نفس المصدر.
16. تغيير اسم الموظف لا يغير Snapshot القديم.
17. حدث SYSTEM بلا موظف صالح.
18. Socket failure بعد Commit يسجل عبر Outbox.
19. Export نفسه حدث مدقق.
20. الفلاتر لا تكشف حقولًا بلا صلاحية.
21. Pagination ثابتة عند تساوي الوقت باستخدام _id.
22. فشل تحميل السجل لا يظهر «لا أحداث».
23. integrity verification يكشف تعديلًا.
24. TTL لا يحذف Business Events.
25. Technical Logs تنتهي حسب المدة.
26. metadata غير مصرح به يرفض أو ينقح.
27. Request body لا يحفظ كاملًا.
28. كل حدث له وقت خادم وbusinessDate.
29. Correlation Timeline يرتب السببية.
30. لا Endpoint يحذف أو يعدل حدثًا.

## 31. مراجعة الفرونت والتغييرات المطلوبة

الفرونت الحالي للتقارير يحتوي Overview، مبيعات يومية وشهرية، مخزون، ورديات وفواتير. يبقى الشكل بسيطًا مع تصحيح المصادر وإضافة المقارنة والـInsights والجداول paginated.

يلزم إضافة صفحة لسجل الأحداث العام، بينما صفحة الموظف الحالية تعرض Audit Logs ويمكن توصيلها بنفس endpoint مع employee filter. Sidebar يحتاج page keys financial_reports وaudit_log، وصلاحيات منفصلة للتكلفة والربح والمصالحة والبيانات الحساسة.
