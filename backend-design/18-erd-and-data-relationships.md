# ERD وعلاقات البيانات

هذه الرسومات تصف MongoDB Collections منطقيًا. العلاقات بالمراجع ObjectId، والـSnapshots داخل المستندات التاريخية غير مرسومة كجداول مستقلة.

## 1. خريطة النطاقات

~~~mermaid
flowchart LR
 SUP[Suppliers] --> INV[Inventory]
 PUR[Purchases] --> INV
 INV --> PROD[Products]
 PROD --> ORD[Orders]
 ORD --> PREP[Preparation]
 ORD --> CUS[Customers]
 ORD --> DEL[Delegates]
 ORD --> TAB[Tables]
 TAB --> SVC[Table Services]
 ORD --> PAY[Payments and Drawer]
 SUP --> PAY
 PAY --> REP[Financial Reports]
 INV --> REP
 ORD --> REP
 EMP[Employees and Auth] --> AUD[Global Audit]
 SUP --> AUD
 INV --> AUD
 ORD --> AUD
 TAB --> AUD
 SVC --> AUD
 PAY --> AUD
~~~

## 2. الموردون والمخزون والمشتريات

~~~mermaid
erDiagram
 SUPPLIERS ||--|| SUPPLIER_ACCOUNTS : owns
 SUPPLIERS ||--o{ SUPPLIER_ACCOUNT_ENTRIES : has
 SUPPLIERS ||--o{ RAW_MATERIALS : supplies
 SUPPLIERS ||--o{ RAW_MATERIAL_BATCHES : historical_supplier
 MEASUREMENT_UNITS ||--o{ RAW_MATERIALS : large_unit
 MEASUREMENT_UNITS ||--o{ RAW_MATERIALS : small_unit
 RAW_MATERIALS ||--o{ RAW_MATERIAL_BATCHES : batches
 RAW_MATERIAL_BATCHES ||--o{ INVENTORY_MOVEMENTS : movements
 PURCHASE_GROUPS ||--o{ PURCHASE_ITEMS : contains
 PURCHASE_GROUPS ||--o{ SUPPLIER_PURCHASE_INVOICES : splits
 SUPPLIERS ||--o{ SUPPLIER_PURCHASE_INVOICES : receives
 SUPPLIER_PURCHASE_INVOICES ||--o{ PURCHASE_ITEMS : groups
 PURCHASE_ITEMS ||--o| RAW_MATERIAL_BATCHES : creates
 PURCHASE_RETURNS ||--o{ PURCHASE_RETURN_ITEMS : contains
 PURCHASE_RETURN_ITEMS }o--|| RAW_MATERIAL_BATCHES : removes_from
 PURCHASE_RETURN_ITEMS ||--|| INVENTORY_MOVEMENTS : creates
~~~

قواعد العلاقة:

- Supplier Account واحد لكل Supplier.
- المادة لها مورد حالي، والدفعة تحفظ المورد التاريخي.
- Purchase Item المسجل ينشئ Batch واحدة.
- كل Batch لها حركات كثيرة وتسلسل لا يتكرر.
- Supplier Purchase Invoice ناتجة من Group ولا تحرك حساب المورد.

## 3. المنتجات والوصفات والطلبات

~~~mermaid
erDiagram
 PRODUCT_CATEGORIES ||--o{ PRODUCTS : contains
 PRODUCTS ||--o{ PRODUCT_TYPES : has
 PRODUCT_TYPES ||--o{ PRODUCT_SIZES : has
 PRODUCT_SIZES ||--|| PRODUCT_RECIPES : recipe
 RAW_MATERIALS }o--o{ PRODUCT_RECIPES : ingredients
 ORDERS ||--o{ ORDER_ITEMS : contains
 PRODUCT_SIZES ||--o{ ORDER_ITEMS : snapshot_from
 ORDER_ITEMS ||--o{ ORDER_INVENTORY_ALLOCATIONS : consumes
 RAW_MATERIALS ||--o{ ORDER_INVENTORY_ALLOCATIONS : material
 RAW_MATERIAL_BATCHES ||--o{ ORDER_INVENTORY_ALLOCATIONS : batch
 ORDER_INVENTORY_ALLOCATIONS ||--|| INVENTORY_MOVEMENTS : consumption
 ORDERS ||--o{ ORDER_STATUS_EVENTS : timeline
 ORDER_ITEMS ||--o{ ORDER_ITEM_STATUS_EVENTS : timeline
 ORDERS ||--o{ ORDER_PAYMENTS : payments
 ORDERS ||--o| INVOICE_SNAPSHOTS : final_invoice
~~~

الوصفة ملك Product Size. الطلب يحفظ Snapshot للوصفة والسعر. Allocation يربط عنصر الطلب بالدفعة التي خرج منها فعلًا، وهو مصدر التكلفة والاسترجاع.

## 4. العملاء والتقييمات والمندوبون

~~~mermaid
erDiagram
 CUSTOMERS ||--o{ ORDERS : places
 CUSTOMERS ||--o{ ORDER_REVIEWS : writes
 ORDERS ||--o| ORDER_REVIEWS : receives
 ORDER_REVIEWS ||--o{ REVIEW_REVISIONS : revisions
 DELEGATES ||--o{ DELIVERY_ASSIGNMENTS : assigned
 ORDERS ||--o{ DELIVERY_ASSIGNMENTS : delivery_history
 DELIVERY_ASSIGNMENTS ||--o{ DELIVERY_EVENTS : timeline
 DELIVERY_ASSIGNMENTS ||--o| DELIVERY_CONFIRMATIONS : confirmed
 ORDERS ||--o| DELIVERY_CONFIRMATIONS : completed_by
 DELEGATES ||--o{ ORDER_PAYMENTS : collects
~~~

طلبات DINE_IN بلا Customer. الطلب DELIVERY له تكليف نشط واحد كحد أقصى مع تاريخ تكليفات سابقة. كل Order مكتمل من PICKUP/DELIVERY له Review واحدة كحد أقصى.

## 5. الطربيزات والخدمات

~~~mermaid
erDiagram
 TABLES ||--o{ TABLE_SESSIONS : sessions
 TABLE_SESSIONS ||--|| ORDERS : active_order
 TABLE_SESSIONS ||--o{ TABLE_SESSION_EVENTS : timeline
 TABLE_SESSIONS ||--o{ TABLE_SERVICE_REQUESTS : requests
 ORDERS ||--o{ TABLE_SERVICE_REQUESTS : context
 TABLE_SERVICE_REQUESTS ||--o{ TABLE_SERVICE_STATUS_EVENTS : timeline
 TABLE_SESSIONS ||--o| INVOICE_SNAPSHOTS : closes_with
 EMPLOYEES ||--o{ TABLE_SERVICE_REQUESTS : handles
~~~

Partial Unique يمنع أكثر من Session OPEN/CLOSING للطربيزة. طلب الخدمة يحتاج Session نشطة وTable Token. عند إغلاق الجلسة تحل خدمة BILL وتلغى باقي الخدمات المفتوحة.

## 6. الدرج والمورد والدفع

~~~mermaid
erDiagram
 CASH_DRAWER_SHIFTS ||--o{ CASH_DRAWER_TRANSACTIONS : contains
 EMPLOYEES ||--o{ CASH_DRAWER_SHIFTS : opens_closes
 ORDERS ||--o{ ORDER_PAYMENTS : has
 ORDER_PAYMENTS ||--o| CASH_DRAWER_TRANSACTIONS : settles
 SUPPLIER_ACCOUNT_ENTRIES ||--o| CASH_DRAWER_TRANSACTIONS : cash_effect
 DELIVERY_ASSIGNMENTS ||--o| CASH_DRAWER_TRANSACTIONS : cod_settlement
 CASH_DRAWER_TRANSACTIONS ||--o| CASH_DRAWER_TRANSACTIONS : reverses
~~~

Opening Balance حقل في Shift وليس Transaction Revenue. Purchase لا يرتبط بالدرج. Supplier debt payment وreceivable collection يرتبطان بحركة درج كتسوية أرصدة.

## 7. الموظفون والمصادقة والصلاحيات

~~~mermaid
erDiagram
 ROLES ||--o{ ROLE_PERMISSIONS : grants
 PERMISSIONS ||--o{ ROLE_PERMISSIONS : belongs
 EMPLOYEES }o--|| ROLES : role
 EMPLOYEES ||--o{ EMPLOYEE_PERMISSIONS : overrides
 PERMISSIONS ||--o{ EMPLOYEE_PERMISSIONS : references
 EMPLOYEES ||--o{ EMPLOYEE_PAGE_ACCESS : sidebar
 EMPLOYEES ||--o{ EMPLOYEE_DEVICES : devices
 EMPLOYEE_DEVICES ||--o{ AUTH_SESSIONS : sessions
 EMPLOYEES ||--o{ LOGIN_ATTEMPTS : attempts
 EMPLOYEES ||--o{ ATTENDANCE_RECORDS : attendance
 ATTENDANCE_RECORDS ||--o{ ATTENDANCE_ADJUSTMENTS : corrected_by
 EMPLOYEES ||--o{ AUDIT_EVENTS : acts
~~~

كلمة المرور select:false داخل Employee حسب القرار. لا تظهر في Audit. Device APPROVED شرط للجلسة. أول دخول ناجح ينشئ حضورًا واحدًا.

## 8. التدقيق والعمليات المشتركة

~~~mermaid
erDiagram
 EMPLOYEES ||--o{ AUDIT_EVENTS : actor
 AUDIT_EVENT_CATALOG ||--o{ AUDIT_EVENTS : validates
 AUDIT_EVENTS ||--o| EVENT_OUTBOX : publishes
 OPERATION_REQUESTS ||--o| AUDIT_EVENTS : audited
 EMPLOYEES ||--o{ OPERATION_REQUESTS : executes
 REPORT_EXPORTS }o--|| EMPLOYEES : requested_by
~~~

كل Aggregate يمكن الإشارة إليه من Audit بواسطة entityType/entityId دون علاقة Mongoose populate إجبارية. correlationId يربط أحداث العملية.

## 9. ملكية البيانات

- suppliers module يملك Supplier Collections.
- inventory يملك Material/Batch/Movement.
- purchases يملك Purchase وReturn Documents، ويستدعي Inventory Service.
- products يملك Catalog/Recipe.
- orders يملك Order/Item/Allocation/Status.
- tables يملك Table/Session.
- table-services يملك Service Request/Events.
- delegates يملك Delegate/Assignment/Events.
- customers يملك Customer/Review.
- drawer يملك Shift/Transaction.
- employees/auth يملك المستخدم والجهاز والجلسة والحضور والصلاحيات.
- audit يملك Audit/Outbox.
- reports لا يملك الأرقام؛ يقرأ فقط.

لا يكتب موديول مباشرة في Collection موديول آخر؛ يستخدم Service Contract داخل Modular Monolith.
# ملحق ERD: واجهة عميل الطاولة

واجهة الطاولة تستخدم جلسة ضيف مستقلة عن جلسة التشغيل. `TABLE_GUEST_SESSIONS` تبدأ عند مسح QR، بينما `TABLE_SESSIONS` تبدأ عند اعتماد الموظف لأول طلب فقط.

~~~mermaid
erDiagram
  TABLES ||--o{ TABLE_GUEST_SESSIONS : "يفتح QR"
  TABLE_GUEST_SESSIONS ||--o{ TABLE_ORDER_PROPOSALS : "يرسل سلالًا"
  TABLE_ORDER_PROPOSALS ||--|| TABLE_SERVICE_REQUESTS : "ينشئ طلب جرسون"
  TABLES ||--o{ TABLE_SERVICE_REQUESTS : "يطلب خدمة"
  TABLE_GUEST_SESSIONS o|--o| TABLE_SESSIONS : "يرتبط بعد الاعتماد"
  TABLE_SESSIONS ||--o{ ORDERS : "يحتوي"
  TABLE_GUEST_SESSIONS ||--o{ ORDERS : "يتابع"
  ORDERS ||--o| ORDER_REVIEWS : "له تقييم واحد"
  TABLE_GUEST_SESSIONS ||--o{ ORDER_REVIEWS : "يكتب"
  EMPLOYEES ||--o{ TABLE_ORDER_PROPOSALS : "يراجع ويعتمد"
~~~

قواعد العلاقات:

- كل Proposal تخص طاولة وجلسة ضيف واحدة، ولها Service Request واحدة بغرض `ORDER_REVIEW`.
- اعتماد Proposal ينشئ أو يحدّث Order واحدة داخل Transaction تشمل تخصيص الدفعات وخصم المخزون.
- لا يمكن لجلسة ضيف الوصول لبيانات طاولة أخرى، حتى لو عرفت رقمها أو ObjectId الخاص بها.
- تقييم الطاولة يرتبط بطلب `DINE_IN` مكتمل وبجلسة الضيف التي أنشأته، مع Unique Index يمنع تكراره.
- إغلاق جلسة التشغيل يفصلها عن جلسة الضيف ويمنع إنشاء Proposals جديدة حتى إصدار جلسة QR صالحة.

## ملحق مراجعة الاتساق

~~~mermaid
erDiagram
  SUPPLIERS ||--o{ RAW_MATERIALS : "يحدد عند الإنشاء"
  RAW_MATERIALS ||--o{ RAW_MATERIAL_BATCHES : "له دفعات"
  SUPPLIERS ||--o{ RAW_MATERIAL_BATCHES : "snapshot تاريخي"
  CASH_DRAWER_SHIFTS ||--o{ DRAWER_SHIFT_ALERTS : "كل 12 ساعة"
  DRAWER_SHIFT_ALERTS ||--o{ NOTIFICATIONS : "يرسل إلى"
  EMPLOYEES ||--o{ NOTIFICATIONS : "يستقبل"
~~~

المورد مطلوب عند إنشاء المادة ويقفل بعد أول دفعة أو استخدام في وصفة. `drawerShiftAlerts` تمنع التكرار بمفتاح `shiftId + thresholdHours`، والإشعارات تحفظ قبل البث اللحظي.

## ملحق ERD: Customer Web

~~~mermaid
erDiagram
  CUSTOMERS ||--o{ ORDERS : places
  ORDERS ||--|| CUSTOMER_ORDER_CREDENTIALS : secured_by
  ORDERS ||--o{ ORDER_ITEMS : contains
  ORDERS ||--o{ ORDER_STATUS_EVENTS : tracks
  ORDERS ||--o| DELIVERY_ASSIGNMENTS : delivered_by
  ORDERS ||--o| ORDER_REVIEWS : receives
~~~

الهاتف المطبع يحدد Customer، وكل Order تحتفظ ببيانات العميل Snapshot. صلاحية التتبع تخص Order واحدة ولا تمنح الوصول التلقائي لكل تاريخ العميل.
