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

orderNumber unique، trackingCode unique، trackingTokenHash select:false، channel ADMIN/PUBLIC/TABLE، fulfillmentType PICKUP/DELIVERY/DINE_IN، customerId وSnapshots، addressSnapshot، tableId، tableSessionId، tableNumberSnapshot، status، counts، subtotal/discount/tax/deliveryFee/total، actualInventoryCost/actualProfit، currency، paymentStatus، assignedDelegateId، currentDeliveryAssignmentId، invoiceRevision، created/confirmed/ready/handedOver/completed/cancelled timestamps and actors، cancellationReason، version، operationRequestId.

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

orderId، paymentNo، method CASH/CARD/TRANSFER/COD، status، amount، collectedByType/id، collectedAt، settledAt/By، cashDrawerTransactionId، refundedAmount، refundTransactionIds، operationRequestId، version.

Index: orderId+paymentNo unique، cashDrawerTransactionId partial unique.

### invoiceSnapshots

invoiceNumber unique، orderId unique، tableSessionId، revision، status FINAL/CANCELLED، payloadSafe، totals، finalizedAt/By، checksum، printCount، lastPrintedAt/By.

## 7. العملاء والتقييمات

### customers

name، normalizedName، phone، normalizedPhone unique، addresses array، socialLinks array، status ACTIVE/ARCHIVED/BLOCKED، blockReason، orderCount، completedOrderCount، lifetimeValue، lastOrderAt، actors/timestamps، version.

### orderReviews

orderId unique، customerId، fulfillmentTypeSnapshot، rating integer 1..5، comment، tags، status VISIBLE/HIDDEN، submittedAt، updatedAt، hiddenAt/By، moderationReason، operationRequestId، version.

### reviewRevisions

reviewId، previous/new rating and comment، changedAt، changeSource، actorId، reason. Immutable.

## 8. المندوبون

### delegates

name، phone، normalizedPhone unique، whatsappNumber، normalizedWhatsappNumber، status ACTIVE/INACTIVE/BLOCKED، maxActiveOrders، activeOrderCount، notes، lastDeliveryAt، actors/timestamps، reason، version.

### deliveryAssignments

assignmentNo unique، orderId، delegateId، Snapshots، status، assigned/accepted/handedOver/delivered/failed/returned timestamps and actors، failureReason، notes، cashExpected/Collected/Settled، settlementTransactionId، reassignedFromId، version.

Index: partial unique orderId للحالات النشطة، delegateId+status+assignedAt.

### deliveryEvents

assignmentId، orderId، delegateId، type، actorId، notes، location optional، occurredAt، requestId. Immutable.

### deliveryConfirmations

orderId unique، assignmentId unique، delegateId، source ADMIN، confirmedByEmployeeId، confirmedAt، amountReportedCollected، paymentMethodSnapshot، notes، deviceId، IP، operationRequestId unique.

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

Indexes: partial unique tableSessionId+type للحالة OPEN، status+priority+requestedAt، handledBy+handledAt، operationRequestId unique.

### tableServiceStatusEvents

serviceRequestId، tableSessionId، orderId، from/to status، action، resultCode، notes، actorType/id، deviceId، requestId، correlationId، occurredAt. Immutable.

## 10. الدرج

### cashDrawerShifts

drawerNumber unique، drawerKey، locationId، status OPEN/CLOSING/CLOSED، openingBalance، totalIn، totalOut، expectedClosingBalance، actualClosingBalance، closingVsOpeningDifference، reconciliationDifference، reconciliationStatus، opened/closing/closed timestamps and actors، notes/reasons، version.

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
# ملحق Schemas: واجهة عميل الطاولة

## tableGuestSessions

- `_id`, `guestSessionNumber` unique، `tableId`.
- `tokenHash` مخفي بـ`select:false`، `qrVersion`، `fingerprintHash` اختياري.
- `status`: `ACTIVE | CLOSED | EXPIRED | REVOKED`.
- `activeTableSessionId`, `activeOrderId` nullable.
- `startedAt`, `lastSeenAt`, `expiresAt`, `closedAt`, `closeReason`.
- `version`, timestamps.
- Indexes: `{guestSessionNumber:1}` unique، `{tokenHash:1}` unique، `{tableId:1,status:1}`، وTTL مساعد على `expiresAt` مع عدم الاعتماد عليه وحده للتحقق.

## tableOrderProposals

- `_id`, `proposalNumber` unique، `guestSessionId`, `tableId`.
- `targetTableSessionId`, `targetOrderId` nullable.
- `status`: `WAITING_WAITER | UNDER_REVIEW | NEEDS_CHANGES | CONFIRMED | REJECTED | CANCELLED | EXPIRED`.
- `items[]`: `productId`, `variantId`, `sizeId`, name snapshots، `quantity`, `unitPriceSnapshot`, `lineTotalSnapshot`, `notes`.
- `subtotal`, `discountTotal`, `taxTotal`, `serviceTotal`, `grandTotal`, `catalogVersion`.
- `serviceRequestId`, `operationRequestId`, `submittedAt`.
- `reviewedBy/At`, `confirmedBy/At`, `rejectedBy/At`, `rejectionReason`, `cancelledAt`, `expiresAt`.
- `version`, timestamps.
- Unique Index على `operationRequestId`; Partial Unique يمنع أكثر من Proposal نشطة بنفس مفتاح الإرسال؛ Index على `{tableId:1,status:1,submittedAt:1}`.

## تعديلات Collections القائمة

- `tableServiceRequests`: إضافة `guestSessionId`; يصبح `tableSessionId` nullable قبل اعتماد أول طلب؛ إضافة `proposalId` nullable و`purpose: GENERAL | ORDER_REVIEW`. أنواع الخدمة المعتمدة: `CALL_WAITER | WATER_REQUEST | PARTY_SURPRISE | BILL_REQUEST | REPORT_PROBLEM`.
- `orders`: إضافة `tableGuestSessionId` لطلبات `DINE_IN`، مع الاحتفاظ بـ`tableSessionId` التشغيلي.
- `orderReviews`: `customerId` nullable و`tableGuestSessionId` nullable. Online/Takeaway يستخدم Customer، وDine-in يستخدم Guest Session. Partial Unique Index لكل نوع مالك على `orderId`.

كل تأكيد أو رفض يستخدم `expectedVersion`. اعتماد Proposal، إنشاء/تحديث الطلب، تخصيص الدفعات، وخصم المخزون يتم داخل MongoDB Transaction واحدة.

## ملحق مراجعة الاتساق

- `rawMaterials.supplierId` required ويشير إلى Supplier ACTIVE لحظة الإنشاء. يضاف `supplierLockedAt` و`supplierLockReason FIRST_BATCH|RECIPE_USE`. بعد القفل لا يتغير المورد.
- `cashDrawerShifts` يستخدم الأسماء القانونية `shiftNo`, `totalCashIn`, `totalCashOut` ويضيف `nextOpenShiftWarningAt`, `lastOpenShiftWarningAt`, `openShiftWarningCount`.
- `drawerShiftAlerts`: `shiftId`, snapshots، `thresholdHours`, `generatedAt`, `openDurationSeconds`, `expectedBalanceSnapshot`, recipients، `notificationStatus`, `outboxEventId`. Unique `shiftId+thresholdHours`.
- `notifications`: recipient، type/severity/title/message، entity/link، `deduplicationKey`, `createdAt/readAt`. Unique recipient+deduplicationKey.
- `tableServiceRequests` يضيف `requestOwnerKey` المشتق من Session أو Guest. Partial Unique `requestOwnerKey+type` للحالة OPEN.
- `orderReviews` يستخدم Unique Index عام على `orderId` لضمان تقييم واحد مهما كان نوع المالك.
- `tableOrderProposals.items` وTotals هي Server Snapshots؛ لا تُحفظ أسعار العميل كحقيقة.

## ملحق Schemas: Customer Web

- `customers`: `phoneNormalized` unique، آخر اسم وعنوان ووقت طلب، `orderCount`, status/version.
- `customerOrderCredentials`: `orderId` unique، `customerId`, `trackingTokenHash` مخفي وفريد، status/expiry/lastUsed/version.
- `orders`: `channel=CUSTOMER_WEB`, `fulfillmentType=DELIVERY|TAKEAWAY`, customer snapshots، `publicOrderNumber`, `barcodeValue`, `eventSequence`, و`customerReceiptStatus`.
- Unique `orderReviews.orderId` يضمن تقييمًا واحدًا. Barcode لا يحمل الهاتف أو ObjectId خامًا.

قرار التدقيق النهائي: `customerOrderCredentials` يحمل `trackingReadTokenHash` و`orderActionTokenHash` منفصلين، كلاهما `select:false` وUnique. `orders.customerReceiptStatus` قيمته `NOT_APPLICABLE|LOCKED|AVAILABLE|CONFIRMED|ADMIN_CONFIRMED`؛ لا توجد حالة Order باسم CUSTOMER_RECEIPT_PENDING. يضاف `customers.lastProfileOrderAt` و`customerAccessSessions` لاستعادة التاريخ بعد إثبات ملكية طلب.
