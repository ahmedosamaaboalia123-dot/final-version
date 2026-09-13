# مراجعة التكامل الشاملة وتوحيد بيانات النظام

هذه الوثيقة تحكم الربط بين الموديولات وتثبت مصادر الحقيقة والحالات والـWorkflows النهائية.

## 1. الموديولات

الموردون، المواد الخام، التحذيرات، المشتريات، المرتجعات، المنتجات، الطلبات الأونلاين والتيك أواي، التحضير، المندوبون، العملاء، طلبات الطربيزات، خدمات الطربيزات، سجل الطلبات والفواتير، الدرج، الموظفون والأجهزة والحضور والصلاحيات، التقارير المالية، وسجل الأحداث.

## 2. قواعد موحدة

- كل ID داخلي ObjectId، وكل رقم بشري مثل orderNumber أو serviceRequestNumber فريد ويولد ذريًا.
- الهاتف normalizedPhone للمطابقة، ولا يستخدم بدل ObjectId.
- كل مرجع تاريخي مهم يحتفظ ID وSnapshot للاسم.
- المال Decimal128 ويرسل String، والعملة EGP.
- المخزون يحسب بالوحدة الصغيرة، والإدخال الكبير يحول بمعامل Snapshot.
- كل Timestamp UTC، والتاريخ التجاري بتوقيت Africa/Cairo.
- كل جدول وسجل Pagination من الخادم 10 افتراضيًا. Board الطربيزات يعرض 20 كارد ثابتة.
- كل Mutation حرجة تحمل Idempotency-Key وexpectedVersion.
- الواجهة ترسل أمرًا مثل confirm أو cancel أو resolve، ولا تكتب status حرًا.
- Success يعيد success/data/meta، والخطأ يعيد code/message/fieldErrors/requestId.
- لا تعاد Mongoose Documents مباشرة؛ Mapper يحجب الحقول الحساسة.

## 3. الحالات الموحدة

Order: PREPARING، READY، OUT_FOR_DELIVERY، COMPLETED، CANCELLED.

Order Item: PREPARING، READY، CANCELLED.

Payment: UNPAID، PENDING، PAID، COLLECTED_BY_DELEGATE، SETTLED، PARTIALLY_REFUNDED، REFUNDED.

Table Session: OPEN، CLOSING، CLOSED، CANCELLED. EMPTY/OCCUPIED مشتقة.

Table Service: OPEN، RESOLVED، CANCELLED.

Delivery: OUT_FOR_DELIVERY، DELIVERED، FAILED، RETURNED، REASSIGNED، CANCELLED.

Employee: ACTIVE، SUSPENDED، ARCHIVED. Device: PENDING، APPROVED، REJECTED، BLOCKED.

Drawer: OPEN، CLOSING، CLOSED. Reconciliation: MATCHED، SHORTAGE، SURPLUS.

Purchase: DRAFT، SPLIT، PARTIALLY_REGISTERED، REGISTERED. Return: DRAFT، RETURNED.

## 4. مصادر الحقيقة

- المورد: suppliers.
- الرصيد اليدوي للمورد: supplierAccountEntries وإسقاط supplierAccounts.
- تعريف المادة: rawMaterials.
- رصيد وقيمة الدفعة: rawMaterialBatches مدعومة بـinventoryMovements.
- التحذيرات: Read Model مشتق.
- الشراء: purchaseGroups/items والفواتير الفرعية.
- وصفة المنتج: productRecipes.
- تكلفة الطلب الفعلية: orderInventoryAllocations.
- حالة الطلب: orders مشتقة من items والتسليم.
- حالة الطربيزة: tableSessions النشطة.
- خدمة الطربيزة: tableServiceRequests.
- الفاتورة النهائية: invoiceSnapshots.
- العميل: customers.
- المندوب: deliveryAssignments.
- النقد: cashDrawerTransactions.
- الحضور: attendanceRecords.
- الصلاحيات: roles/permissions.
- التقارير: Aggregations.
- التدقيق: auditEvents.

## 5. خريطة الموديولات

~~~mermaid
flowchart LR
 E[الموظفون] --> S[الموردون]
 S --> M[المواد الخام]
 P[المشتريات] --> M
 M --> W[التحذيرات]
 M --> R[وصفات المنتجات]
 R --> O[الطلبات]
 O --> K[التحضير]
 O --> C[العملاء]
 O --> D[المندوبون]
 O --> T[جلسات الطربيزات]
 T --> V[خدمات الطربيزات]
 O --> X[الدرج]
 S --> X
 O --> F[التقارير]
 M --> F
 X --> F
 E --> A[سجل الأحداث]
 S --> A
 M --> A
 O --> A
 T --> A
 V --> A
 X --> A
 F --> A
~~~

## 6. Workflow الدخول

~~~mermaid
flowchart TD
 A[إنشاء موظف وصلاحيات] --> B[محاولة دخول]
 B --> C{الجهاز معتمد؟}
 C -- لا --> D[PENDING ثم موافقة الأدمن]
 D --> B
 C -- نعم --> E[جلسة مصادقة]
 E --> F[حضور تلقائي مرة واحدة]
 F --> G[تحميل الدور والصلاحيات والدرج]
~~~

كلمة المرور واضحة حسب القرار، لكنها لا تدخل Audit أو Responses العامة. الحضور لا يفتح درجًا.

## 7. Workflow التوريد

~~~mermaid
flowchart TD
 A[مورد] --> B[تعريف مادة ووحداتها]
 B --> C[فاتورة شراء مجمعة]
 C --> D[تقسيم حسب المورد]
 D --> E[تسجيل السطر]
 E --> F[دفعة PURCHASE_RECEIPT]
 F --> G[رصيد وقيمة]
 G --> H[تحذيرات]
 G --> I[تكلفة متوقعة للمنتجات]
~~~

المشتريات لا تنشئ دينًا ولا حركة درج. حساب المورد يدوي. المرتجع يخرج من دفعة ولا يحرك المورد أو الدرج.

## 8. Workflow الطلب المشترك

~~~mermaid
flowchart TD
 A[اختيار قناة] --> B{PICKUP DELIVERY DINE_IN}
 B --> C[بيانات العميل للقناتين فقط]
 B --> D[رقم الطربيزة دون عميل]
 C --> E[اختيار المنتجات]
 D --> E
 E --> F[تأكيد]
 F --> G[Snapshot السعر والوصفة]
 G --> H[تخصيص الدفعات]
 H --> I{كل الخام متاح؟}
 I -- لا --> J[Rollback]
 I -- نعم --> K[SALE_CONSUMPTION]
 K --> L[PREPARING]
 L --> M[التحضير]
 M --> N[READY]
~~~

DINE_IN ينشئ Table Session داخل نفس المعاملة. Online/Takeaway ينشئ أو يربط Customer.

## 9. الإضافة والإلغاء

~~~mermaid
flowchart TD
 A[طلب نشط] --> B{إضافة أم إلغاء}
 B -->|إضافة| C[Snapshot وتخصيص جديد]
 C --> D[عناصر PREPARING]
 D --> E[READY يعود PREPARING]
 B -->|إلغاء| F[Allocations الأصلية]
 F --> G[إرجاع نفس الدفعات والقيمة]
 G --> H[SALE_CANCELLATION_RESTORE]
 H --> I[إعادة الحالة والإجماليات]
~~~

لا يستخدم آخر سعر عند الإلغاء. الإلغاء المدفوع يحتاج Refund. COMPLETED لا يعدل بزر عادي.

## 10. انتهاء القنوات

- PICKUP: READY ثم دفع ثم COMPLETED وفاتورة وتقييم.
- DELIVERY: READY ثم مندوب ثم OUT_FOR_DELIVERY، وزر «تسليم» يضغطه الأدمن من صفحة المندوب، ثم COMPLETED وعهدة COD وتسوية وتقييم.
- DINE_IN: READY ثم إنهاء الطربيزة والدفع، فيغلق Order وSession، تصبح EMPTY، تحفظ الفاتورة وتفتح الطباعة.

تعطل الطباعة لا يعكس البيع. إعادة الطباعة من السجل.

## 11. Workflow خدمات الطربيزات

~~~mermaid
flowchart TD
 A[عميل بجلسة نشطة] --> B[خدمة من الخمس]
 B --> C[Token وفحص ومنع تكرار]
 C --> D[OPEN]
 D --> E[Realtime للإدارة]
 E --> F[تم التعامل]
 F --> G[RESOLVED مع الموظف والمدة]
 D --> H{الجلسة تغلق}
 H -->|طلب حساب| I[AUTO RESOLVED]
 H -->|الباقي| J[AUTO CANCELLED]
~~~

طلب المياه/الحفلة لا يخصم خامًا. المدفوع يضاف Order Item. طلب الحساب لا ينهي الطلب أو يحرك الدرج.

## 12. المورد والدرج

DEBT أو RECEIVABLE يغير حساب المورد فقط. DEBT_PAYMENT يخرج من الدرج كتسوية. RECEIVABLE_COLLECTION يدخل كتسوية. المبلغ الأكبر من الرصيد مرفوض.

Opening Balance لا يعد إيرادًا. Expected يساوي Opening + IN - OUT. الإغلاق يحفظ Actual والفرق والعجز/الزيادة دون تصنيف تلقائي كإيراد أو مصروف.

## 13. التقارير والأحداث

Completed Orders وAllocations ينتجان Net Sales وCOGS وربحًا. Drawer ينتج Cash Flow. Inventory ينتج القيمة والمشتريات والهدر. Supplier Entries تنتج الأرصدة. Delivery Payments تنتج عهد المندوب.

Audit الحرج يحفظ داخل Transaction. القراءة الحساسة والطباعة والتصدير تسجل. correlationId يربط كل آثار العملية.

## 14. حدود المعاملات

- إنشاء مورد: supplier + account + audit.
- دفعة مورد: entry + balance + drawer + audit.
- تسجيل شراء: batch + movement + purchase item/status + audit.
- مرتجع/سحب: batch + movement + document + audit.
- تأكيد طلب: customer أو table session + order/items + allocations + batches/movements + events/audit.
- إضافة: items + allocations + stock + totals/status + audit.
- إلغاء: restores + reversal movements + order/items + refund/session عند اللزوم + audit.
- إنهاء طربيزة: payment/drawer + order + session + invoice + معالجة الخدمات المفتوحة + audit.
- تسليم: assignment + confirmation + order + COD + audit.
- تم التعامل: service + status event + audit.

## 15. Collections الموحدة

suppliers، supplierAccounts، supplierAccountEntries، measurementUnits، rawMaterials، rawMaterialBatches، inventoryMovements، purchaseGroups، purchaseItems، supplierPurchaseInvoices، purchaseReturns، purchaseReturnItems، productCategories، products، productTypes، productSizes، productRecipes، productAddons، orders، orderItems، orderInventoryAllocations، orderStatusEvents، orderItemStatusEvents، customers، orderReviews، reviewRevisions، delegates، deliveryAssignments، deliveryEvents، deliveryConfirmations، tables، tableSessions، tableSessionEvents، tableServiceRequests، tableServiceStatusEvents، orderPayments، invoiceSnapshots، cashDrawerShifts، cashDrawerTransactions، employees، roles، permissions، rolePermissions، employeePermissions، employeePageAccess، employeeDevices، authSessions، loginAttempts، attendanceRecords، attendanceAdjustments، auditEvents، auditEventCatalog، eventOutbox، operationRequests، Counters، reportExports.

## 16. Enums الحركات

Inventory: PURCHASE_RECEIPT، PURCHASE_RETURN، SALE_CONSUMPTION، SALE_CANCELLATION_RESTORE، WITHDRAWAL.

Cash Source: CASH_SALE، ORDER_REFUND، SUPPLIER_DEBT_PAYMENT، SUPPLIER_RECEIVABLE_COLLECTION، DELEGATE_CASH_SETTLEMENT، MANUAL_IN، MANUAL_OUT، REVERSAL.

Accounting Class: REVENUE، EXPENSE، REFUND، BALANCE_SETTLEMENT، TRANSFER، CAPITAL، CORRECTION، NON_ACCOUNTING.

## 17. تعديلات الربط التي ثبتتها المراجعة

1. إغلاق Table Session يعالج خدماتها المفتوحة في نفس Transaction.
2. صلاحيات الموظف تشمل table_services وfinancial_reports وaudit_log.
3. Sidebar يحتفظ orders_table_services للتوافق، وPermission prefix هو table_services.
4. Audit Catalog يضم أحداث خدمات الطربيزات.
5. BILL_REQUEST لا يغير Order أو Payment.
6. WATER_REQUEST لا يغير Inventory.
7. Table Token مرتبط بالجلسة ويلغى عند إغلاقها.
8. invoiceSnapshots للطباعة في كل القنوات.
9. orderInventoryAllocations هو مصدر عكس الإلغاء.
10. cashDrawerTransactions يحمل accountingClass.
11. DINE_IN بلا Customer وفق القرار.
12. Reviews لـPICKUP وDELIVERY حاليًا.
13. Delegate لـDELIVERY فقط.
14. التحذيرات مشتقة.
15. التقارير تجمع Completed وتفصل COD غير المسوى.
16. auditEvents يحل محل auditLogs المحلية.
17. Snapshots موحدة تاريخيًا.
18. pageSize يصبح 10 بدل طلبات 100 في الفرونت.
19. status الحر يستبدل Commands.
20. Table Service metrics تشغيلية، ولا تدخل التقارير المالية كإيراد.

## 18. page_key الموحد

suppliers، inventory، warnings، purchases، returns، products، orders_online، orders_tables، orders_table_services، orders_history، orders_preparation، customers، delegates، drawer، employees، financial_reports، audit_log.

كل صفحة لها visible، وكل فعل Permission منفصلة.

## 19. حالات التكامل الشاملة

### المورد والمخزون

1. المورد لا يضيف مخزونًا.
2. المادة تبدأ صفرًا.
3. Purchase Receipt يضيف دفعة.
4. Draft لا يغير الأرصدة.
5. الشراء لا ينشئ دينًا.
6. المرتجع لا يحرك المورد/الدرج.
7. السحب نهائي.
8. المنتهي يباع.
9. التحذير لا يمنع.
10. الأولوية تؤثر على التالي فقط.

### الطلب

11. نقص خامة يمنع الكل.
12. التأكيد المكرر لا يخصم مرتين.
13. التكلفة من الدفعات الفعلية.
14. الإلغاء يعيد نفس الدفعات.
15. الإلغاء المكرر لا يزيد مرتين.
16. إضافة READY تعيده PREPARING.
17. READY من كل العناصر النشطة.
18. إلغاء آخر عنصر يلغي الطلب.
19. COMPLETED نهائي.
20. المدفوع يحتاج Refund.

### الطربيزات والخدمات

21. فتح الصفحة لا يشغل الطربيزة.
22. أول تأكيد يفتح Session واحدة.
23. Token جلسة أخرى مرفوض.
24. الخدمة تظهر فورًا.
25. المكرر OPEN لا ينشئ صفًا.
26. تم التعامل ينقل للمنتهي.
27. إغلاق الجلسة يحل BILL ويلغي الباقي.
28. المياه المدفوعة Order Item.
29. المشكلة لا تلغي تلقائيًا.
30. الحساب لا يفتح الدرج.
31. الفارغة لا تطلب خدمة.
32. CLOSING يمنع جديدًا.
33. إلغاء الطلب يغلق الجلسة والخدمات.
34. Socket failure لا يفقد الطلب.
35. العميل لا يرى خدمات طربيزة أخرى.

### الدفع

36. PICKUP Cash يدخل عند الإنهاء.
37. DINE_IN Cash يدخل عند الإنهاء.
38. Delivery لا يدخل عند التعيين.
39. COD يدخل عند التسوية.
40. Opening ليس Revenue.
41. Debt Payment ليس Expense.
42. Collection ليس Revenue.
43. Refund يخفض صافي البيع.
44. Card لا يدخل درج النقد.
45. Idempotency يمنع حركة مكررة.

### الموظف والأمان

46. جهاز جديد PENDING.
47. PENDING بلا حضور.
48. APPROVED يسجل حضورًا واحدًا.
49. الإيقاف يلغي الجلسات.
50. كلمة المرور لا تدخل Audit.
51. عرضها يسجل دون القيمة.
52. الانصراف لا يغلق الدرج آليًا.
53. صلاحية API هي الحاكمة.
54. DENIED يسجل.
55. الموظف المؤرشف يبقى تاريخيًا.

### التقارير والتدقيق

56. CANCELLED خارج Net Sales.
57. COGS من Allocations.
58. Purchase ليس Expense.
59. Withdrawal يدخل Waste.
60. Summary لا يعتمد الصفحة.
61. فشل المصدر ليس صفرًا.
62. كل حرج له Audit.
63. correlationId يجمع الآثار.
64. الأسرار لا تسجل.
65. Event immutable.
66. Print/Export مسجل.
67. Sensitive View مسجل.
68. Outbox يعيد النشر.
69. Integrity Hash يكشف العبث.
70. Report لا يعدل المصدر.

### التزامن والفشل

71. تأكيدان لطربيزة ينتجان طلبًا واحدًا.
72. تجهيز مزدوج انتقال واحد.
73. Resolve مزدوج حل واحد.
74. إغلاق درج مزدوج واحد.
75. آخر مخزون يفوز به طلب واحد.
76. فشل Audit الحرج يرجع Transaction.
77. عطل الطابعة لا يرجع البيع.
78. فشل Socket لا يرجع Commit.
79. Timeout يعالج بـIdempotency.
80. Version قديم Conflict.
81. المستخدم لا يحذف مرجعًا مستخدمًا.
82. Snapshot لا يتغير.
83. صفحة بعد النهاية فارغة.
84. منتصف الليل القاهرة صحيح.
85. Decimal لا يفقد قرشًا.
86. Projection قابلة للبناء.
87. الاتساق يبلغ ولا يصحح بصمت.
88. Counter قد يترك فجوة ولا يكرر.
89. Error يعيد requestId.
90. Backup يحافظ على Unique Counters.

## 20. دورة العمل اليومية

1. الموظف يدخل من جهاز معتمد ويسجل حضورًا.
2. المسؤول يفتح الدرج.
3. الشراء المسجل يدخل دفعات.
4. التحذيرات والتكلفة المتوقعة تتحدث.
5. الطلب يتأكد ويخصم مخزونًا.
6. التحضير يجهز العناصر.
7. التوصيل يذهب للمندوب، والتيك أواي والطربيزة ينتهيان مباشرة.
8. النقد يدخل في توقيته.
9. خدمات الطربيزة تدار بالتوازي.
10. الإلغاء يعكس المخزون والدفع حسب الحالة.
11. العملاء والمندوبون والسجلات تتحدث.
12. التقارير تقرأ الصورة.
13. كل خطوة تكتب Audit.
14. الدرج يغلق ويصالح.
15. الأدمن يسجل الانصراف بعد معالجة المسؤوليات.

## 21. حدود مستقبلية

الرواتب، الضرائب القانونية، تعدد الفروع، العملات، حجوزات الطاولات، مخزون الفروع، والمحاسبة المزدوجة تحتاج تحليلاً مستقلًا ولا تدخل أرقام النسخة الحالية.


## 22. سياسة Race Conditions والأداء

كل Workflow في هذه الوثيقة يخضع لسياسة التزامن والأداء التالية:

- الهدف p95 أقل من أو يساوي 500ms، والحد التشغيلي p99 أقل من أو يساوي 1000ms للطلبات التفاعلية.
- العمليات الثقيلة Async وتعيد 202 خلال ثانية.
- Transaction + Version + Conditional Update + Unique Index + Idempotency هي قواعد إلزامية.
- التفاصيل ومصفوفة السباقات: [سياسة Race Conditions وزمن الاستجابة](./15-race-conditions-and-performance-slo.md).

