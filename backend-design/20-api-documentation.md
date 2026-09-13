# API Documentation — Backend MERN

الإصدار v1. كل المسارات تبدأ بـ/api/v1. JSON UTF-8. التوقيت UTC ISO-8601، والتواريخ التجارية YYYY-MM-DD.

## 1. القواعد العامة

Headers:

- Authorization: Bearer accessToken للموظفين.
- X-Table-Token لواجهة الطربيزة.
- Idempotency-Key لكل Mutation حرجة.
- If-Match أو expectedVersion في Body للعمليات المتزامنة.
- X-Request-Id اختياري؛ الخادم يولده إن غاب.

Success:

    {
      "success": true,
      "data": {},
      "message": "تمت العملية",
      "meta": { "requestId": "...", "serverMs": 184 }
    }

Paginated:

    {
      "success": true,
      "data": [],
      "pagination": {
        "page": 1,
        "pageSize": 10,
        "totalItems": 24,
        "totalPages": 3,
        "hasNext": true,
        "hasPrevious": false
      },
      "summary": {},
      "meta": { "requestId": "...", "generatedAt": "..." }
    }

Error:

    {
      "success": false,
      "code": "INSUFFICIENT_STOCK",
      "message": "الكمية غير متاحة",
      "fieldErrors": [],
      "details": {},
      "requestId": "..."
    }

أكواد HTTP: 200 قراءة/تحديث، 201 إنشاء، 202 Job، 204 حذف غير مستخدم، 400 Validation، 401 Auth، 403 Permission، 404، 409 State/Version/Idempotency، 422 رصيد/مخزون، 429 Rate Limit.

Query القوائم: page=1، pageSize=10، search، sort، order، from، to، status. أي Filter غير معروف يرجع 400.

هدف الأداء: p95<=500ms وp99<=1000ms. Export الكبير 202.

## 2. Auth

### POST /auth/login

Body: name، password، device {fingerprint,name,userAgent}.

نتيجة جهاز جديد: pendingDeviceApproval=true ولا Tokens.
نتيجة النجاح: employee، role، permissions بعناصر page_key/visible/actions، notifications، shift، auth access_token/refresh_token.

### POST /auth/refresh

Body: refresh_token. يتحقق من Employee/Device/Session وpermissionsVersion.

### POST /auth/logout

يلغي الجلسة الحالية.

### POST /auth/logout-all

يلغي كل جلسات الموظف. يحتاج الموظف نفسه أو صلاحية إدارية.

### GET /auth/me

يعيد نفس Bootstrap DTO دون كلمة المرور.

## 3. الموظفون

- GET /employees — قائمة paginated. filters status/position/search.
- POST /employees — name/password/position/workStart/workEnd/roleId.
- GET /employees/:id — البيانات والملخص فقط.
- PUT /employees/:id — البيانات الأساسية وexpectedVersion.
- PATCH /employees/:id/status — status/reason/version.
- GET /employees/:id/password — عرض مدقق بصلاحية مستقلة.
- PUT /employees/:id/password — password/version ويلغي الجلسات.
- GET /employees/:id/page-access — Sidebar/Actions.
- PUT /employees/:id/page-access — pages/permissions/version.
- GET /employees/:id/devices — pagination.
- POST /employees/:id/devices/:deviceId/approve.
- POST /employees/:id/devices/:deviceId/reject.
- POST /employees/:id/devices/:deviceId/block.
- POST /employees/:id/devices/:deviceId/unblock.
- GET /employees/:id/attendance — pagination/date filters.
- POST /employees/:id/attendance/check-out — notes/version.
- POST /attendance/:id/adjustments — changes/reason.
- GET /employees/:id/audit-events — pagination.

## 4. الموردون

### GET /suppliers

filters search/status/type/city. pageSize=10.

### POST /suppliers

Body: name، contactPerson، phone، supplierType، city.

### GET /suppliers/:id

يعيد supplier، account summary، materialCount. السجلات عبر endpoints مستقلة.

### PUT /suppliers/:id

الحقول الأساسية وexpectedVersion.

### PATCH /suppliers/:id/status

status/reason/version.

### GET /suppliers/:id/materials

Pagination للمواد المرتبطة.

### GET /suppliers/:id/account

debtBalance وreceivableBalance.

### GET /suppliers/:id/account-entries

filters kind/from/to، pagination.

### POST /suppliers/:id/account-entries

Body: kind DEBT أو RECEIVABLE، amount، occurredOn، notes.

### POST /suppliers/:id/debt-payments

Body: amount، notes، expectedAccountVersion. يحتاج درجًا مفتوحًا.

### POST /suppliers/:id/receivable-collections

نفس السابق، حركة IN.

### POST /suppliers/:id/account-entries/:entryId/reverse

Body: reason/version. لا عكس مرتين.

## 5. المواد الخام والتحذيرات

- GET /measurement-units.
- GET /raw-materials — pagination/search/supplier/status.
- GET /raw-materials/options — بحث paginated خفيف.
- POST /raw-materials — التعريف بلا كمية.
- GET /raw-materials/:id — التفاصيل والملخص.
- PUT /raw-materials/:id — تعديل التعريف.
- DELETE /raw-materials/:id — غير مستخدمة فقط.
- GET /raw-materials/:id/batches — pagination.
- PUT /raw-materials/:id/batch-priority — orderedBatchIds/expectedPriorityVersion.
- POST /raw-materials/:id/withdrawals — batchId/quantityLarge/reason/version.
- GET /raw-material-withdrawals — pagination/filters.
- GET /inventory/movements — pagination/material/batch/type/date.
- GET /warnings — pagination/type/material/supplier.
- GET /warnings/summary.

إنشاء Batch غير متاح من Raw Materials API؛ يأتي من Purchase Registration.

## 6. المشتريات

- POST /purchase-groups — items [{materialId,quantityLarge,largeUnitPrice}].
- GET /purchase-groups — pagination/status/search/date.
- GET /purchase-groups/unregistered.
- GET /purchase-groups/registered.
- GET /purchase-groups/:id.
- PUT /purchase-groups/:id — Draft فقط.
- DELETE /purchase-groups/:id — Draft غير مستخدمة.
- POST /purchase-groups/:id/split-by-supplier.
- POST /purchase-groups/:id/refresh-split.
- GET /purchase-groups/:id/supplier-invoices — pagination.
- POST /purchase-items/:itemId/register — expiryOn/expectedVersion.
- GET /purchase-groups/:id/print-data.
- GET /supplier-purchase-invoices/:id/print-data.

Register ينشئ Batch وMovement ويحدث الحالات في Transaction. لا مورد/درج.

## 7. مرتجعات الخام

- POST /purchase-returns — Draft بعناصر batchId/quantityLarge/reason.
- GET /purchase-returns — pagination/status/date/material/supplier.
- GET /purchase-returns/:id.
- PUT /purchase-returns/:id — Draft فقط.
- POST /purchase-returns/:id/execute.
- GET /purchase-returns/:id/print-data.
- GET /raw-materials/:id/return-options — الدفعات المتاحة مرتبة بالأحدث.

## 8. المنتجات

- GET /product-categories.
- POST /product-categories.
- PUT /product-categories/:id.
- PATCH /product-categories/:id/status.
- GET /products — pagination/category/visibility/status/search.
- POST /products.
- GET /products/:id.
- PUT /products/:id.
- PATCH /products/:id/visibility.
- PATCH /products/:id/status.
- POST /products/:id/types.
- PUT /product-types/:id.
- POST /product-types/:id/sizes.
- PUT /product-sizes/:id.
- PUT /product-sizes/:id/recipe.
- GET /product-sizes/:id/expected-cost — Simulation فقط.
- GET /product-sizes/:id/availability.
- GET /catalog — الأقسام والمنتجات المتاحة للبيع.

## 9. الطلبات المشتركة

### POST /orders

Body:

    {
      "fulfillmentType": "PICKUP|DELIVERY",
      "customer": { "name": "...", "phone": "...", "address": "..." },
      "items": [
        { "productSizeId": "...", "quantity": "2", "notes": "" }
      ]
    }

DELIVERY يحتاج عنوان. الخادم يعيد الأسعار ويخصم المخزون.

- GET /orders/active — pagination/channel/status.
- GET /orders/:id.
- POST /orders/:id/items — إضافة عناصر.
- POST /orders/:id/items/:itemId/ready.
- POST /orders/:id/items/:itemId/cancel — reason/version.
- POST /orders/:id/cancel.
- POST /orders/:id/complete-pickup — payment/version.
- GET /orders/:id/print-data.
- POST /orders/:id/print-events.
- GET /orders/history — scope online/tables وpagination.
- GET /orders/:id/timeline — pagination.

## 10. التحضير

- GET /preparation/orders — tab current/ready، scope online/tables، pagination.
- GET /preparation/orders/:id — Order Details + Recipe Snapshots.
- POST /orders/:id/items/:itemId/ready — Endpoint المشترك.
- POST /orders/:id/items/:itemId/cancel.

كل جدول في الصفحة يرسل Query مستقل.

## 11. الطربيزات وطلباتها

### GET /tables/board

يعيد 20 عنصرًا بلا Pagination: tableNumber، availability، order summary.

### GET /tables/:tableNumber

Table + Active Session Summary.

### POST /tables/:tableNumber/orders

Body items فقط، بلا عميل. ينشئ Session وOrder ويخصم في Transaction.

### GET /tables/:tableNumber/active-order

يحتاج Employee Auth للإدارة أو Table Token لقراءة العميل المحدودة.

### POST /tables/:tableNumber/complete

Body: orderId، payment، expectedOrderVersion، expectedSessionVersion. يغلق ويعيد invoice/printData.

- GET /table-sessions — pagination.
- GET /table-sessions/:id.
- PATCH /tables/:id/status — ACTIVE/OUT_OF_SERVICE.
- GET /table-sessions/:id/print-data.

إضافة/إلغاء/جاهزية تستخدم Orders endpoints.

## 12. خدمات الطربيزات

### واجهة العميل

- GET /table-sessions/:tableNumber/service-options — X-Table-Token.
- POST /table-sessions/:tableNumber/service-requests — type/details/problemCategory/requestedQuantity.
- GET /table-sessions/:tableNumber/service-requests — pagination.
- POST /table-sessions/:tableNumber/service-requests/:id/cancel.

### الإدارة

- GET /table-service-requests — status/scope/type/table/priority/date، pagination.
- GET /table-service-requests/summary.
- GET /table-service-requests/:id.
- POST /table-service-requests/:id/resolve — resolutionNote/version.
- POST /table-service-requests/:id/cancel — reason/version.
- PATCH /table-service-requests/:id/priority.

الخدمات: CALL_WAITER، WATER_REQUEST، PARTY_SURPRISE، BILL_REQUEST، REPORT_PROBLEM.

## 13. المندوبون

- GET /delegates — pagination/search/status.
- POST /delegates.
- GET /delegates/:id.
- PUT /delegates/:id.
- PATCH /delegates/:id/status.
- GET /delegates/:id/active-orders — pagination.
- GET /delegates/:id/orders — history pagination.
- POST /orders/:id/assign-delegate — delegateId/version.
- POST /delivery-assignments/:id/reassign — delegateId/reason/version.
- POST /delegates/:delegateId/orders/:orderId/deliver — COD details/version.
- POST /delegates/:delegateId/orders/:orderId/delivery-failed.
- POST /delivery-assignments/:id/returned.
- GET /delivery-assignments/:id/invoice-share-data.
- POST /delivery-assignments/:id/whatsapp-share-event.
- POST /delivery-assignments/:id/cash-settlement.

## 14. العملاء والتقييمات

- GET /customers — pagination/search/status.
- POST /customers.
- GET /customers/:id.
- PUT /customers/:id.
- PATCH /customers/:id/status.
- GET /customers/:id/orders — pagination/canReview/review.
- POST /customers/merge — sourceId/targetId/reason.
- POST /public/orders/:trackingCode/review — Token/rating/comment/tags.
- PUT /public/orders/:trackingCode/review.
- GET /orders/:id/review.
- PATCH /order-reviews/:id/moderation.

الطلب ينشئ/يربط العميل بالهاتف. DINE_IN بلا Customer.

## 15. التتبع العام

- GET /public/orders/:trackingCode/tracking?token=...
- GET /public/orders/by-phone — تحقق مناسب ورقم/رمز.
- Socket room خاص بالطلب بعد Token.

لا يعيد تكلفة أو مخزونًا أو Audit.

## 16. الدرج والدفع

- GET /cash-drawer-shifts/current.
- POST /cash-drawer-shifts — openingBalance/notes.
- GET /cash-drawer-shifts — pagination.
- GET /cash-drawer-shifts/:id.
- GET /cash-drawer-shifts/:id/transactions — pagination.
- POST /cash-drawer-shifts/:id/cash-in.
- POST /cash-drawer-shifts/:id/cash-out.
- POST /cash-drawer-shifts/:id/close — actualClosingBalance/reason/version.
- POST /cash-drawer-transactions/:id/reverse.
- GET /cash-drawer-shifts/:id/print-data.
- POST /orders/:id/payments.
- POST /orders/:id/refunds.
- POST /delivery-assignments/:id/cash-settlement.

## 17. التقارير المالية

كل GET يقبل from/to/channel/paymentMethod/compare/page/pageSize حيث ينطبق.

- GET /financial-reports/overview.
- GET /financial-reports/sales/daily.
- GET /financial-reports/sales/monthly.
- GET /financial-reports/sales/by-channel.
- GET /financial-reports/products.
- GET /financial-reports/inventory.
- GET /financial-reports/drawers.
- GET /financial-reports/suppliers.
- GET /financial-reports/delegates.
- GET /financial-reports/invoices.
- POST /financial-reports/exports — 202/jobId.
- GET /financial-reports/exports/:id.

## 18. سجل الأحداث

- GET /audit-events — pagination والفلاتر.
- GET /audit-events/summary.
- GET /audit-events/:id.
- GET /audit-events/timeline/:correlationId.
- GET /entities/:entityType/:entityId/audit-events.
- GET /employees/:id/audit-events.
- POST /audit-events/exports — 202.
- GET /audit-events/exports/:id.
- GET /audit-event-catalog.

لا POST عام لإنشاء Business Event ولا Update/Delete.

## 19. Operation Status والـJobs

- GET /operations/:scope/:idempotencyKey/status.
- GET /jobs/:id.
- POST /jobs/:id/cancel للـQUEUED فقط.

Operation response: PROCESSING/COMPLETED/FAILED وresult عند الاكتمال. المفتاح لا يظهر في Logs واضحًا.

## 20. أمثلة العمليات

### إضافة عنصر لطلب

Request:

    POST /api/v1/orders/abc/items
    Idempotency-Key: 6fe...
    {
      "expectedVersion": 4,
      "items": [{"productSizeId":"...","quantity":"1"}]
    }

Response يعيد order summary، addedItems، totals، inventoryCost، previousStatus، currentStatus.

### حل خدمة طربيزة

    POST /api/v1/table-service-requests/abc/resolve
    {
      "expectedVersion": 0,
      "resolutionNote": "تم حضور الجرسون للطربيزة"
    }

يعيد request بالحالة RESOLVED وhandledAt/By وresponseDurationSeconds.

### Version Conflict

    {
      "success": false,
      "code": "VERSION_CONFLICT",
      "message": "تم تعديل البيانات بواسطة مستخدم آخر",
      "details": {"currentVersion": 5},
      "requestId": "req_..."
    }

## 21. Realtime Events

Namespace واحد /admin مع Rooms حسب الصلاحية:

- order.created/updated/item.updated.
- preparation.updated.
- table.board.updated.
- table-service.created/resolved/cancelled.
- drawer.updated.
- delegate.updated.
- warning.summary.updated.

كل Payload: eventId، entityId، entityVersion، occurredAt، summary. لا Payload كامل حساس. بعد reconnect تعمل الواجهة Refetch.

## 22. Versioning والتوافق

Breaking Change ينشئ /api/v2. إضافة حقل اختياري لا تحتاج إصدارًا. Enum جديد يحتاج تحديث Catalog والفرونت قبل استخدامه.

الفرونت الحالي الذي يستخدم /users يمكن دعمه Alias مؤقت إلى /employees، لكن العقد الرسمي الجديد /api/v1/employees. يوضع Deprecation header ويزال بعد نقل الفرونت.

## 23. OpenAPI عند التنفيذ

ينشأ ملف openapi.yaml من هذا العقد أو بالتوازي معه. كل Route يجب أن يحتوي request schema، response schema، error codes، security، permission، idempotency requirement، pagination، وأمثلة. CI يتحقق من صحة OpenAPI وعدم وجود Route غير موثق.
# ملحق API: Table Experience

كل مسارات العميل التالية تستخدم `X-Table-Token`. لا يقبل الـAPI رقم طاولة يرسله العميل كمصدر ثقة؛ يستخرج الطاولة من الـToken.

## جلسة الطاولة والكتالوج

- `POST /table-experience/bootstrap`: يستبدل QR token قصير العمر بجلسة ضيف وبيانات الطاولة.
- `POST /table-experience/refresh`: يجدد Table Token للجلسة الفعالة.
- `POST /table-experience/logout`: يغلق جلسة الضيف محليًا عند السماح بذلك.
- `GET /table-experience/catalog?categoryId=&search=&page=1&limit=10`.
- `GET /table-experience/products/:productId`.

## السلة وطلب الجرسون

`POST /table-experience/order-proposals` مع `Idempotency-Key`:

```json
{
  "items": [{"productId":"...","variantId":"...","sizeId":"...","quantity":2,"notes":"بدون سكر"}],
  "catalogVersion":"42"
}
```

يرجع `201` وفيه `proposal` بحالة `WAITING_WAITER` و`serviceRequest` من نوع `CALL_WAITER` وغرض `ORDER_REVIEW`. لا ينشئ Order ولا يخصم مخزونًا.

- `GET /table-experience/order-proposals/:proposalId`.
- `POST /table-experience/order-proposals/:proposalId/cancel` قبل بدء المراجعة فقط، مع `expectedVersion`.
- `GET /table-experience/orders?page=1&limit=10`.
- `GET /table-experience/orders/:orderId`.
- `GET /table-experience/orders/:orderId/tracking`.
- `POST /table-experience/orders/:orderId/reviews` بعد اكتمال الطلب فقط.
- `GET /table-experience/reviews?page=1&limit=10`.

## خدمات الطاولة

- `POST /table-experience/services` يقبل أحد الأنواع الخمسة المعتمدة.
- `GET /table-experience/services?page=1&limit=10`.
- `POST /table-experience/services/:id/cancel` إذا لم يبدأ الموظف التعامل معها.

## مراجعة الموظف

تستخدم Bearer Token وصلاحيات `tableProposals.read/review/confirm/reject`:

- `GET /table-order-proposals?status=&tableId=&page=1&limit=10`.
- `GET /table-order-proposals/:id`.
- `POST /table-order-proposals/:id/start-review`.
- `PATCH /table-order-proposals/:id` لتعديل الكميات أو الملاحظات بعد مراجعة العميل شفهيًا.
- `POST /table-order-proposals/:id/confirm` مع `expectedVersion` و`Idempotency-Key`.
- `POST /table-order-proposals/:id/request-changes`.
- `POST /table-order-proposals/:id/reject` مع السبب.

نجاح `confirm` يرجع الطلب وتخصيصات المخزون. التعارض يرجع `409 VERSION_CONFLICT`، نقص المخزون `409 INSUFFICIENT_STOCK`، تكرار المفتاح يعيد نفس النتيجة، وTable Token غير صالح يرجع `401 TABLE_SESSION_INVALID`.

## Realtime

قنوات Socket.IO: `table:{tableId}`, `guest-session:{id}`, `admin:table-services`, `admin:table-proposals`. الأحداث الأساسية: `proposal.created|updated|confirmed|rejected`, `table-service.created|resolved`, `order.updated`, `order-item.updated`, `review.created`. بعد reconnect يطلب العميل snapshot من REST باستخدام آخر `eventSequence` لمنع الفقد أو الترتيب الخاطئ.

## ملحق API للاتساق

- إنشاء المادة `POST /api/v1/raw-materials` يتطلب `supplierId`; الخادم يقبل موردًا ACTIVE فقط. لا يقبل المورد في سطر المشتريات كاختيار مستقل.
- تعديل مورد المادة قبل قفله فقط: `PATCH /api/v1/raw-materials/:id` مع `supplierId` و`expectedVersion`. بعد أول دفعة/وصفة يرجع `409 MATERIAL_SUPPLIER_LOCKED`.
- `GET /api/v1/cash-drawer-shifts/:id/alerts?page=1&limit=10`.
- `GET /api/v1/notifications?page=1&limit=10&unread=true`.
- `POST /api/v1/notifications/:id/read` مع `Idempotency-Key`.
- الحدث اللحظي `drawer.shift.open-too-long` يصدر عند 12، 24، 36 ساعة وهكذا، بينما الإشعار المحفوظ هو مصدر الحقيقة.

كل Route قديم مكتوب `/api/...` في أمثلة المتطلبات ينفذ فعليًا تحت `/api/v1/...`.

## ملحق API: Customer Web

- `POST /api/v1/public-orders` لإنشاء Online/Takeaway وخصم المخزون.
- `POST /api/v1/public-orders/lookup` للبحث المثبت برقم الطلب والهاتف.
- `GET /api/v1/public-orders/:orderNumber/tracking` مع `X-Tracking-Token`.
- `POST /api/v1/public-orders/:orderNumber/items` لإضافة عناصر قبل التسليم.
- `POST /api/v1/public-orders/:orderNumber/receive` لتأكيد استلام Online.
- `POST /api/v1/public-orders/:orderNumber/reviews` بعد الإكمال.
- `POST /api/v1/customer-ai/chat` للباريستا الذكي بقراءة كتالوج عام فقط.

كل Mutation تستخدم Idempotency-Key وexpectedVersion. لا يقبل الخادم أسعارًا أو حالات أو customerId من Local Storage كمصدر ثقة.

قرار التدقيق النهائي: Tracking وInvoice يستخدمان `X-Tracking-Read-Token`. إضافة العناصر وطلب الإلغاء والاستلام والتقييم تستخدم `X-Order-Action-Token`. Barcode لا يحتوي Action Token. المسار الطبيعي لتوصيل Online هو ضغط العميل `/receive`; `POST /api/v1/delivery-assignments/:id/admin-confirm-delivery` تجاوز إداري بصلاحية وسبب إلزامي.
