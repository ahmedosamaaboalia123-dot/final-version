# ERD الكامل والـMongoDB Schemas النهائية

الإصدار 1.0 — ملف مستقل داخل `final-2`. هذا الملف يطبق القرارات الأخيرة فقط ولا يعتمد على الملاحق عند التعارض.

## قواعد قانونية حاكمة

- MongoDB/Mongoose، وكل Reference من نوع ObjectId، والأموال والكميات Decimal128 وتخرج String في JSON.
- `timestamps:true`, `strict:true`, `versionKey:false`، وحقل `version:Number` صريح يبدأ من 1.
- الوقت UTC DateTime، والتاريخ التجاري `YYYY-MM-DD` محسوب بمنطقة `Africa/Cairo`.
- الحقول التاريخية تحمل ID وSnapshot. السجلات المالية والمخزنية والأحداث Immutable.
- Soft delete/status للكيان المستخدم، وHard delete للتعريف غير المستخدم فقط.
- الحقول الحساسة `select:false` ولا تدخل Log/Audit/Notification.
- الاسم القانوني للهاتف المطبع `phoneNormalized`، وللوردية `shiftNo`, `totalCashIn`, `totalCashOut`.
- Order status: `CONFIRMED|PREPARING|READY|OUT_FOR_DELIVERY|COMPLETED|CANCELLED`.
- Fulfillment: `TAKEAWAY|DELIVERY|DINE_IN`. Channel: `ADMIN|CUSTOMER_WEB|TABLE`.
- لا توجد حالة Order باسم CUSTOMER_RECEIPT_PENDING؛ يستخدم `customerReceiptStatus`.

---

# الجزء الأول: ERD الكامل
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

---

# الجزء الثاني: Schema Catalog الأساسي الموحد

# MongoDB / Mongoose Schema Catalog

هذا هو المرجع المختصر والواضح للـCollections. التفاصيل السلوكية في وثيقة المتطلبات.

## 1. قواعد Mongoose

كل Schema تستخدم timestamps عند الحاجة، strict=true، versionKey=false مع حقل version صريح للـOptimistic Concurrency. المبالغ والكميات Decimal128. كل Reference ObjectId. كل Model لها toJSON mapper يحول _id إلى id وDecimal128 إلى String ويحذف الحقول الداخلية.

حقول Audit المعتادة: createdAt/By، updatedAt/By. المستندات التاريخية تضيف nameSnapshot. الحقول الحساسة select:false.

الحذف الفعلي فقط لكيان لم يستخدم. الباقي status أو archivedAt.

## 2. الموردون

### suppliers

الحقول: name، contactPerson، phone، phoneNormalized، supplierType، city، status ACTIVE/INACTIVE، statusChangeReason، createdBy، updatedBy، version.

Indexes: status+createdAt، phoneNormalized، normalizedName. الاسم والهاتف ليسا unique حسب الاتفاق الأصلي.

### supplierAccounts

supplierId unique، currency، debtBalance، receivableBalance، version، timestamps.

Invariant: الرصيدان غير سالبين، ولا Update مباشر من API.

### supplierAccountEntries

supplierId، sequenceNo، kind DEBT/RECEIVABLE/DEBT_PAYMENT/RECEIVABLE_COLLECTION/REVERSAL، amount، occurredOn، recordedAt/By، notes، debtBalanceAfter، receivableBalanceAfter، reversesEntryId، origin، operationRequestId.

Indexes: unique supplierId+sequenceNo، unique partial reversesEntryId، supplierId+occurredOn.

## 3. المخزون

### measurementUnits

code unique، nameAr، kind MASS/VOLUME/COUNT/CONTAINER، physicalFactor، isActive.

### rawMaterials

name، supplierId، largeUnitId، smallUnitId، conversionFactor، smallQuantityStep، referenceLargeUnitPrice، currency، minStockSmall، expiryAlertDays، status، unitsLocked، priorityVersion، stockVersion، created/updated actors، version.

Indexes: supplierId+status، status+name، text/normalizedName.

### rawMaterialBatches

materialId، batchNumber، purchaseReceiptItemId unique، supplierId وSnapshots، initialQuantitySmall، remainingQuantitySmall، purchaseLargeUnitPrice، initialInventoryValue، remainingInventoryValue، currency، receivedOn، expiryOn، salePriority، recordedAt/By، version.

Indexes: materialId+salePriority+_id، materialId+remainingQuantitySmall، expiryOn+remainingQuantitySmall، batchNumber unique.

Invariants: remaining بين صفر وinitial، والقيمة غير سالبة.

### inventoryMovements

batchId، materialId، sequenceNo، kind PURCHASE_RECEIPT/PURCHASE_RETURN/SALE_CONSUMPTION/SALE_CANCELLATION_RESTORE/WITHDRAWAL، quantitySmall، inventoryValue، quantityAfterSmall، inventoryValueAfter، occurredOn، recordedAt/By، reason، sourceType/id، reversesMovementId، operationRequestId، Snapshots.

Indexes: unique batchId+sequenceNo، unique partial sourceType+sourceId، unique partial reversesMovementId، materialId+recordedAt.

Immutable.

## 4. المشتريات والمرتجعات

### purchaseGroups

groupNo unique، invoiceDate، status DRAFT/SPLIT/PARTIALLY_REGISTERED/REGISTERED، currency، counts، subtotal، splitVersion، splitOutdated، created/updated/registered actors and dates، version، deletedAt/By للـDraft فقط.

### purchaseItems

groupId، supplierInvoiceId، materialId، material/supplier/unit Snapshots، lastBatchPriceSnapshot، quantityLarge/Small، largeUnitPrice، lineTotal، status PENDING/REGISTERED، batchId، movementId، receivedOn، expiryOn، registeredAt/By، version.

Indexes: groupId+materialId unique، supplierInvoiceId+status، batchId partial unique.

### supplierPurchaseInvoices

groupId، supplierId، Snapshots، invoiceNo unique، status، counts، subtotal، splitVersion، timestamps/actors.

Indexes: groupId+supplierId+splitVersion unique.

### purchaseReturns

returnNo unique، status DRAFT/RETURNED، returnDate، currency، counts، totalInventoryValue، notes، createdAt/By، returnedAt/By، operationRequestId unique، version.

### purchaseReturnItems

returnId، materialId، batchId، purchaseItemId، Snapshots، quantityLarge/Small، unitCostSnapshot، totalInventoryValue، reason، movementId، timestamps/actors.

Indexes: returnId+batchId unique، movementId partial unique.

## 5. المنتجات

### productCategories

name، normalizedName unique، description، isActive، sortOrder، actors/timestamps.

### products

name، normalizedName، description، image، categoryId، isVisibleInMenu، status ACTIVE/INACTIVE، actors/timestamps، version.

Indexes: categoryId+status+isVisibleInMenu، normalizedName.

### productTypes

productId، name، normalizedName، allowedMaterialIds، isActive، sortOrder، timestamps.

Index: productId+normalizedName unique.

### productSizes

productId، typeId، name، normalizedName، sellingPrice، currency، isActive، sortOrder، version، timestamps.

Index: typeId+normalizedName unique.

### productRecipes

productSizeId unique، version، ingredients array: materialId، quantitySmall، smallUnitId، materialNameSnapshot، unitNameSnapshot.

Invariant: المادة لا تتكرر والكمية موجبة.

### productAddons

productId، name، sellingPrice، notes، isActive، sortOrder. لا وصفة في النسخة الحالية.

## 6. الطلبات

### orders

orderNumber unique، trackingCode unique، channel ADMIN/CUSTOMER_WEB/TABLE، fulfillmentType TAKEAWAY/DELIVERY/DINE_IN، customerId وSnapshots، addressSnapshot، tableId، tableSessionId، tableNumberSnapshot، status، counts، subtotal/discount/tax/deliveryFee/total، actualInventoryCost/actualProfit، currency، paymentStatus، assignedDelegateId، currentDeliveryAssignmentId، invoiceRevision، created/confirmed/ready/handedOver/completed/cancelled timestamps and actors، cancellationReason، version، operationRequestId.

Indexes: status+fulfillmentType+createdAt، customerId+createdAt، assignedDelegateId+status، tableSessionId، orderNumber، trackingCode.

### orderItems

orderId، lineNo، productId، productSizeId، product/type/size/recipe Snapshots، quantity، unitSellingPrice، lineSubtotal، actualInventoryCost، actualProfit، notes، status PREPARING/READY/CANCELLED، added/ready/cancelled timestamps and actors، reason، version.

Index: orderId+lineNo unique، orderId+status.

### orderInventoryAllocations

orderId، orderItemId، materialId، batchId، consumptionMovementId unique، quantitySmall، inventoryValue، unitCostSnapshot، reversedQuantitySmall، reversalMovementId، status CONSUMED/REVERSED، allocatedAt، reversedAt/By، reason، operationRequestId.

Indexes: orderItemId+materialId+batchId unique، batchId+status، reversalMovementId partial unique.

### orderStatusEvents

orderId، fromStatus، toStatus، reasonCode، notes، actorType/id، deviceId، occurredAt، requestId، correlationId، metadataSafe.

### orderItemStatusEvents

نفس السابق مع orderItemId. كلاهما Immutable.

### orderPayments

orderId، paymentNo، method CASH فقط، collectionMode DIRECT/COD، status PENDING/COLLECTED/SETTLED/PARTIALLY_REFUNDED/REFUNDED، amount، collectedByType/id، collectedAt، settledAt/By، cashDrawerTransactionId، refundedAmount، refundTransactionIds، operationRequestId، version.

Index: orderId+paymentNo unique، cashDrawerTransactionId partial unique.

### invoiceSnapshots

invoiceNumber unique، orderId unique، tableSessionId، revision، status FINAL/CANCELLED، payloadSafe، totals، finalizedAt/By، checksum، printCount، lastPrintedAt/By.

## 7. العملاء والتقييمات

### customers

name، normalizedName، phone، phoneNormalized unique، addresses array، socialLinks array، status ACTIVE/ARCHIVED/BLOCKED، blockReason، orderCount، completedOrderCount، lifetimeValue، lastOrderAt، actors/timestamps، version.

### orderReviews

orderId unique، customerId، fulfillmentTypeSnapshot، rating integer 1..5، comment، tags، status VISIBLE/HIDDEN، submittedAt، updatedAt، hiddenAt/By، moderationReason، operationRequestId، version.

### reviewRevisions

reviewId، previous/new rating and comment، changedAt، changeSource، actorId، reason. Immutable.

## 8. المندوبون

### delegates

name، phone، phoneNormalized unique، whatsappNumber، whatsappNumberNormalized، status ACTIVE/INACTIVE/BLOCKED، maxActiveOrders، activeOrderCount، notes، lastDeliveryAt، actors/timestamps، reason، version.

### deliveryAssignments

assignmentNo unique، orderId، delegateId، Snapshots، status، assigned/accepted/handedOver/delivered/failed/returned timestamps and actors، failureReason، notes، cashExpected/Collected/Settled، settlementTransactionId، reassignedFromId، version.

Index: partial unique orderId للحالات النشطة، delegateId+status+assignedAt.

### deliveryEvents

assignmentId، orderId، delegateId، type، actorId، notes، location optional، occurredAt، requestId. Immutable.

### deliveryConfirmations

orderId unique، assignmentId unique، delegateId، source CUSTOMER/ADMIN_OVERRIDE، confirmedByEmployeeId nullable، confirmedAt، amountReportedCollected، paymentMethodSnapshot، notes، deviceId، IP، operationRequestId unique.

## 9. الطربيزات

### tables

tableNumber integer unique 1..20، displayName، status ACTIVE/OUT_OF_SERVICE، sortOrder، actors/timestamps، version.

EMPTY/OCCUPIED مشتقة وليست مخزنة.

### tableSessions

sessionNumber unique، tableId، tableNumberSnapshot، activeOrderId unique، status OPEN/CLOSING/CLOSED/CANCELLED، opened/closing/closed actors and dates، cancellationReason، totals/payment Snapshots، invoiceSnapshotId، version.

Index: partial unique tableId للحالات OPEN/CLOSING.

### tableSessionEvents

tableSessionId، tableId، orderId، type، actorId، from/to status، notes، requestId، occurredAt. Immutable.

### tableServiceRequests

serviceRequestNumber unique، tableId، tableNumberSnapshot، tableSessionId، orderId، type CALL_WAITER/WATER_REQUEST/PARTY_SURPRISE/BILL_REQUEST/REPORT_PROBLEM، details، problemCategory، requestedQuantity، priority، status OPEN/RESOLVED/CANCELLED، source، requestedAt، handledAt/By، handledBy Snapshot، responseDurationSeconds، resolutionNote، resultCode، cancellation fields، operationRequestId، version، timestamps.

Indexes: partial unique requestOwnerKey+type للحالة OPEN، status+priority+requestedAt، handledBy+handledAt، operationRequestId unique.

### tableServiceStatusEvents

serviceRequestId، tableSessionId، orderId، from/to status، action، resultCode، notes، actorType/id، deviceId، requestId، correlationId، occurredAt. Immutable.

## 10. الدرج

### cashDrawerShifts

shiftNo unique، drawerKey، locationId، status OPEN/CLOSING/CLOSED، openingBalance، totalCashIn، totalCashOut، expectedClosingBalance، actualClosingBalance، closingVsOpeningDifference، reconciliationDifference، reconciliationStatus، opened/closing/closed timestamps and actors، notes/reasons، version.

Index: partial unique drawerKey للحالات OPEN/CLOSING.

### cashDrawerTransactions

shiftId، sequenceNo، direction IN/OUT، amount، currency، balanceAfter، sourceType، sourceId، accountingClass، description، recordedAt/By، reversesTransactionId، operationRequestId، Snapshots.

Indexes: shiftId+sequenceNo unique، sourceType+sourceId partial unique، reversesTransactionId partial unique.

Immutable.

## 11. الموظفون والمصادقة

### employees

name، normalizedName unique، passwordPlainText select:false، position، roleId، status، workStart/workEnd، crossesMidnight، timezone، graceMinutes، permissionsVersion، lastLoginAt، actors/status fields، version.

### roles / permissions

roles: name unique، level، description، isSystem.
permissions: key unique، pageKey، action، label.
rolePermissions: roleId+permissionId unique.
employeePermissions: employeeId+permissionId unique، effect ALLOW/DENY، grantedAt/By، reason.
employeePageAccess: employeeId+pageKey unique، visible، updatedAt/By.

### employeeDevices

employeeId، fingerprint select:false، fingerprintHash، name/browser/os/userAgentSummary، status، first/last seen، lastLoginAt، attemptCount، decision timestamps/actors/reason، version.

Index: employeeId+fingerprintHash unique.

### authSessions

employeeId، deviceId، refreshTokenHash select:false، issued/lastUsed/expiresAt، revoked fields، IP، userAgent. TTL expiresAt.

### loginAttempts

employeeId nullable، normalizedLoginName، deviceId، fingerprintHash، result، IP، occurredAt، requestId. TTL حسب السياسة.

### attendanceRecords

employeeId، attendanceDate، schedule/timezone/grace Snapshots، checkInAt/device/session، checkOutAt/By/method، lateMinutes، workedMinutes، status، notes، version.

Indexes: employeeId+attendanceDate، partial unique employeeId للحالة OPEN.

### attendanceAdjustments

attendanceId، old/new safe values، kind، reason، createdAt/By. Immutable.

## 12. التدقيق والأداء المشترك

### auditEvents

eventNo unique، eventType، category، module، pageKey، action، actor/subject/entity contexts، statuses، changesSafe، financialContext، inventoryContext، reason، result/severity/error، requestId/correlationId/causationId، idempotencyKeyHash، session/device/IP/userAgent، route/method/status/duration، source، businessDate، occurredAt، metadataSafe، integrity hashes، schemaVersion.

Indexes: occurredAt، actor+time، subject+time، module/eventType+time، entity+time، correlationId، result/severity.

Immutable ولا TTL للأحداث الأساسية.

### auditEventCatalog

eventType unique، category، module، requiredFields، allowedMetadataKeys، defaultSeverity، retentionClass، isSensitive، schemaVersion، active.

### eventOutbox

aggregateType/id، eventType، auditEventId، payloadSafe، status، attempts، nextAttemptAt، timestamps، lastErrorSafe.

### operationRequests

actorId، scope، key، requestHash، status PROCESSING/COMPLETED/FAILED، responseStatus/payload، leaseUntil، timestamps.

Index: actorId+scope+key unique.

### counters

scope unique، nextValue، updatedAt. الجداول المنطقية المختلفة تستخدم Scopes منفصلة.

### reportExports

exportNo، reportType، filtersSafe، format، status، requestedAt/By، completedAt، fileReference، expiresAt، rowCount، checksum، errorCode.

### financialReportCache

cacheKey unique، filtersHash، schemaVersion، payload، generatedAt، expiresAt TTL، sourceVersions.

## 13. Validation المشتركة

- Strings trim وطول أقصى.
- Enums من Constants مركزية داخل الموديول.
- Money موجب أو signed حسب الحقل.
- الكمية موجبة في الأوامر، والرصيد غير سالب.
- fromDate <= toDate.
- الهاتف Normalize بدون تحويله Number.
- URLs للسوشيال والصور تقبل schemes مسموحة.
- ObjectId صالح لا يعني أن الكيان موجود؛ Service يتحقق.
- Password لا تدخل DTO افتراضيًا.
- metadataSafe وchangesSafe Allowlist.

---

# الجزء الثالث: Collections المكملة والتعديلات القانونية

## tableGuestSessions

الحقول: `_id:ObjectId`, `guestSessionNumber:String unique`, `tableId:ObjectId required`, `tokenHash:String select:false unique`, `qrVersion:Number`, `fingerprintHash:String nullable`, `status:ACTIVE|CLOSED|EXPIRED|REVOKED`, `activeTableSessionId:ObjectId nullable`, `activeOrderId:ObjectId nullable`, `startedAt:Date`, `lastSeenAt:Date`, `expiresAt:Date`, `closedAt:Date nullable`, `closeReason:String nullable`, `version:Number`, timestamps.

الفهارس: unique guestSessionNumber/tokenHash، `{tableId,status,lastSeenAt}`، TTL على expiresAt للتنظيف فقط. التحقق من الانتهاء يتم في Middleware ولا يعتمد على TTL.

## tableOrderProposals

الحقول: `_id`, `proposalNumber unique`, `guestSessionId`, `tableId`, `targetTableSessionId nullable`, `targetOrderId nullable`, `status:WAITING_WAITER|UNDER_REVIEW|NEEDS_CHANGES|CONFIRMED|REJECTED|CANCELLED|EXPIRED`, `items[]` وتحتوي product/type/size IDs وname snapshots وquantity وunitPriceSnapshot وlineTotalSnapshot وnotes، `subtotal`, `discountTotal`, `taxTotal`, `serviceTotal`, `grandTotal`, `currency`, `catalogVersion`, `serviceRequestId`, `operationRequestId`, timestamps وactors لكل مراجعة/تأكيد/رفض/إلغاء، reasons، `expiresAt`, `version`.

الأسعار Server snapshots. الفهارس: proposalNumber unique، operationRequestId unique، `{tableId,status,submittedAt}`, `{guestSessionId,createdAt}`. اعتماد Proposal وOrder وInventory في Transaction واحدة.

## customerOrderCredentials

الحقول: `_id`, `orderId unique`, `customerId`, `trackingReadTokenHash select:false unique`, `orderActionTokenHash select:false unique`, `readExpiresAt`, `actionExpiresAt`, `status:ACTIVE|REVOKED|EXPIRED`, `lastReadAt`, `lastActionAt`, `revokedAt/By`, `revokeReason`, `version`, timestamps.

Read Token للتتبع والفاتورة فقط. Action Token للإضافة والإلغاء والاستلام والتقييم ولا يدخل Barcode أو URL.

## customerAccessSessions

الحقول: `_id`, `customerId`, `sessionTokenHash select:false unique`, `proofType:ORDER_ACTION_TOKEN|OTP`, `proofOrderId nullable`, `deviceHash`, `issuedAt`, `lastUsedAt`, `expiresAt`, `revokedAt`, `status:ACTIVE|REVOKED|EXPIRED`, `version`.

الفهارس: token unique، `{customerId,status}`, TTL expiresAt. يمنح قراءة تاريخ نفس Customer بعد إثبات الملكية.

## drawerShiftAlerts

الحقول: `_id`, `shiftId`, `shiftNoSnapshot`, `thresholdHours:Number`, `openedAtSnapshot`, `generatedAt`, `openDurationSeconds`, `expectedBalanceSnapshot`, `currency`, `openedBy`, `recipientIds[]`, `notificationStatus:PENDING|PUBLISHED|PARTIAL|FAILED`, `outboxEventId`, `missedThresholdGroupId nullable`, timestamps.

الفهارس: `{shiftId,thresholdHours}` unique، `{generatedAt:-1}`, `{notificationStatus,generatedAt}`. كل 12 ساعة، مع Outbox ومنع التكرار.

## notifications

الحقول: `_id`, `recipientEmployeeId`, `type`, `severity:INFO|NOTICE|WARNING|CRITICAL`, `title`, `message`, `entityType`, `entityId`, `link`, `deduplicationKey`, `createdAt`, `readAt nullable`, `archivedAt nullable`, `metadataSafe`.

الفهارس: `{recipientEmployeeId,deduplicationKey}` unique، `{recipientEmployeeId,readAt,createdAt:-1}`.

## drawerCounters

الحقول: `_id:String scope`, `nextValue:Number`, `updatedAt`. `$inc` ذري، والفجوات مقبولة والتكرار ممنوع.

## reportInsights

الحقول: `_id`, `insightCode`, `severity`, `title`, `message`, `metric`, `currentValue`, `threshold`, `filtersHash`, `businessPeriod`, `generatedAt`, `expiresAt`, `link`, `dataQuality`, `sourceVersions`.

الفهرس: `{insightCode,filtersHash,businessPeriod}` unique وTTL expiresAt عند كونها Cache.

## الحقول القانونية المعدلة داخل Collections الأساسية

### rawMaterials additions

`supplierId required`, `supplierLockedAt nullable`, `supplierLockReason:FIRST_BATCH|RECIPE_USE nullable`. المورد ACTIVE عند الإنشاء، وبعد القفل لا يتغير.

### customers additions

الاسم القانوني `phoneNormalized unique`. يضاف `lastName`, `lastAddress`, `lastProfileOrderAt`, `orderCount`, `completedOrderCount`, `lifetimeValue`. تحديث آخر Profile مشروط بتاريخ الطلب الأحدث.

### orders additions

`publicOrderNumber unique`, `barcodeValue unique`, `tableGuestSessionId nullable`, `eventSequence:Number`, `customerReceiptStatus:NOT_APPLICABLE|LOCKED|AVAILABLE|CONFIRMED|ADMIN_CONFIRMED`, `customerReceivedAt nullable`, `customerReceivedBy:CUSTOMER|ADMIN_OVERRIDE nullable`, `balanceDue`, `costCompleteness:COMPLETE|PARTIAL`, `operationRequestId unique`.

لا Token خام/Hash داخل Order؛ الملكية في customerOrderCredentials.

### orderReviews canonical ownership

الحقول `customerId nullable`, `tableGuestSessionId nullable`. بالـvalidator يوجد مالك واحد فقط حسب fulfillment. Unique index عام على `orderId` يمنع تقييمين بأي مالكين.

### deliveryConfirmations canonical source

`source:CUSTOMER|ADMIN_OVERRIDE`; `confirmedByEmployeeId` مطلوب فقط للـoverride، `customerCredentialId` مطلوب لمسار العميل، و`overrideReason` إلزامي للإدارة. `orderId` و`assignmentId` unique.

### tableServiceRequests canonical owner

يضاف `guestSessionId nullable`, `proposalId nullable`, `purpose:GENERAL|ORDER_REVIEW`, `requestOwnerKey required` بقيمة `GUEST:id` أو `SESSION:id`. `tableSessionId` nullable قبل اعتماد أول طلب. Partial unique `{requestOwnerKey,type}` للحالة OPEN.

### cashDrawerShifts canonical fields

`shiftNo unique`, `drawerKey`, `locationId`, `scopeType:POS|EMPLOYEE`, `scopeId`, `status:OPEN|CLOSING|CLOSED`, `currency`, `openingBalance`, `totalCashIn`, `totalCashOut`, `netCashMovement`, `expectedClosingBalance`, `actualClosingBalance nullable`, `closingVsOpeningDifference`, `reconciliationDifference`, `reconciliationStatus:PENDING|MATCHED|SHORTAGE|SURPLUS`, `shortageAmount`, `surplusAmount`, notes/reasons، opened/closing/closed actors and times، `nextOpenShiftWarningAt`, `lastOpenShiftWarningAt`, `openShiftWarningCount`, `version`.

Partial unique `{scopeType,scopeId}` للحالات OPEN/CLOSING.

## خريطة ملكية Collections

- suppliers: المورد والحساب اليدوي.
- inventory: units/materials/batches/movements.
- purchases: groups/items/supplier invoices/returns.
- products: categories/products/types/sizes/recipes/addons.
- orders: orders/items/allocations/status events/payments/invoices.
- customer-experience: credentials/access sessions؛ customers/reviews في customers.
- delivery: delegates/assignments/events/confirmations.
- tables: tables/sessions/guest sessions/proposals/services/events.
- drawer: shifts/transactions/alerts/counters.
- employees/auth: employees/roles/permissions/devices/sessions/login/attendance.
- platform: audit catalog/events/outbox/operations/counters/notifications/reports.

## فحوص اكتمال إلزامية

1. كل Reference له سياسة وجود وحالة وSnapshot عند التاريخ.
2. كل Enum مصدره Constants واحدة، وليس String موزعًا.
3. كل Mutation مالية/مخزنية لها operationRequest وAudit وTransaction boundary.
4. كل قائمة لها index وترتيب ثابت `_id` tie-breaker وlimit=10.
5. كل علاقة one-active لها Partial Unique index.
6. كل Secret select:false ومزال من serializers.
7. كل قيمة مشتقة لها مصدر حقيقة واضح ولا تقبل Update مباشرًا.
8. كل Restore/Reverse يشير للأصل ويمنع التنفيذ مرتين.
9. كل Job له lease/deduplication/outbox ولا يعتمد على ذاكرة Process.
10. migrations/index sync تتم عبر scripts مضبوطة ولا تستخدم autoIndex في Production.
