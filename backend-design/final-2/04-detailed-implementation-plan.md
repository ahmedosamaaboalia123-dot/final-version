# خطة التنفيذ التفصيلية الكاملة

هذه الخطة تحول الـERD والـAPI والهيكل إلى خطوات برمجية قابلة للتنفيذ. التقنية Node.js وExpress وMongoDB/Mongoose وJavaScript ESM. الدفع كاش فقط `DIRECT|COD`. لا يوجد موديول إعدادات ولا بوابة دفع.

# 1. قواعد تنفيذ الخطة

1. لا تبدأ مرحلة قبل نجاح Exit Criteria للمرحلة السابقة.
2. كل Function لها مدخل وناتج واضحان ولا تعتمد على `req/res` خارج Controller.
3. كل Service يقبل `context={actor,requestId,correlationId,operationId,session?}`.
4. كل Function كتابة حرجة تعيد Domain Result، وتكتب Audit/Outbox داخل Transaction.
5. كل Query ترجع DTO خامًا للMapper، ولا تعيد Mongoose Document للController.
6. كل أموال/كميات تستخدم Decimal helpers، ولا تستخدم JavaScript Number للحساب.
7. كل مرحلة تضيف Contract tests وIntegration tests اللازمة، ثم قياس query count/latency.
8. أسماء الـFunctions أدناه هي العقد المقترح؛ لا تستبدل بأسماء عامة مثل `handleData` أو `process`.

## شكل Context الموحد

```js
{
  actor: { type, id, name, permissions },
  requestId,
  correlationId,
  operationId,
  deviceId,
  ip,
  userAgent,
  session // Mongo ClientSession عند وجود Transaction
}
```

## شكل نتيجة Command

```js
{ entity, relatedEntities, events, version, eventSequence }
```

# المرحلة 0 — تثبيت القرارات والعقود

## الهدف

تحويل ملفات التوثيق إلى Constants وOpenAPI وقائمة Indexes قبل كتابة Business Logic، ومنع اختلاف الأسماء بين المطورين.

## الملفات والـFunctions

### `src/shared/constants/order.constants.js`

```js
export const ORDER_STATUS = Object.freeze({ CONFIRMED, PREPARING, READY, OUT_FOR_DELIVERY, COMPLETED, CANCELLED });
export const ITEM_STATUS = Object.freeze({ PREPARING, READY, CANCELLED });
export const FULFILLMENT_TYPE = Object.freeze({ TAKEAWAY, DELIVERY, DINE_IN });
export const ORDER_CHANNEL = Object.freeze({ ADMIN, CUSTOMER_WEB, TABLE });
export const CUSTOMER_RECEIPT_STATUS = Object.freeze({ NOT_APPLICABLE, LOCKED, AVAILABLE, CONFIRMED, ADMIN_CONFIRMED });
```

لا توجد Functions؛ الملف مصدر Enum وحيد. يمنع كتابة String يدوي في Services.

### `payment.constants.js`

`PAYMENT_METHOD={CASH}`، `COLLECTION_MODE={DIRECT,COD}`، `PAYMENT_STATUS={PENDING,COLLECTED,SETTLED,PARTIALLY_REFUNDED,REFUNDED}`.

### بقية Constants

- `inventory.constants.js`: movement kinds، unit kinds، material/batch statuses.
- `table.constants.js`: session/proposal/service states.
- `auth.constants.js`: employee/device/session/attempt states.
- `audit.constants.js`: result/severity/category/source.

### `docs/openapi.yaml`

يكتب Components المشتركة وSecurity Schemes وPaths الموجودة في API Doc. لا Business Functions، لكنه مصدر Contract test.

### `src/platform/database/index-manifest.js`

```js
export function getRequiredIndexes() {}
export function getIndexesForCollection(collectionName) {}
```

الأولى تجمع تعريفًا ثابتًا لكل Index؛ الثانية تستخدمها Scripts والاختبارات.

## الاختبارات

- لا Enum مكرر بقيمة مختلفة.
- OpenAPI parser ينجح.
- كل Route موثقة لها operationId فريد.
- كل Collection في ERD لها Model مخطط أو مرحلة محددة.

## Exit Criteria

Constants/OpenAPI/Index manifest يمران lint، وتوقيع Architecture Decision يثبت Cash-only وMongo Replica Set وlimit=10.

# المرحلة 1 — Scaffold والتشغيل والإعداد

## الملفات والـFunctions

### `src/config/env.js`

```js
export function loadEnv(source = process.env) {}
export function assertRequiredEnv(config) {}
export function redactConfig(config) {}
```

`loadEnv` يحول PORT/timeouts/booleans ويجمع Mongo/DeepSeek/HTTP config. `assertRequiredEnv` يرجع قائمة أخطاء مرة واحدة. `redactConfig` يسمح بتسجيل أسماء الإعدادات دون القيم الحساسة.

### `src/config/business.js`

```js
export function loadBusinessConfig(env) {}
export function getPricingSnapshot(config) {}
export function getBusinessProfileSnapshot(config) {}
```

إعداد نشر ثابت لاسم الكافيه والعنوان والعملة والضريبة ورسوم التوصيل. الـSnapshot يدخل الطلب والفاتورة حتى لا يتغير التاريخ إذا تغير Deploy لاحقًا.

### `src/app.js`

```js
export function createApp({ config, dependencies }) {}
```

ينشئ Express، يثبت middleware بالترتيب، v1 routes ثم notFound/error. لا يتصل بقاعدة البيانات ولا يبدأ listen.

### `src/bootstrap.js`

```js
export async function bootstrap() {}
export async function shutdown(runtime, signal) {}
```

`bootstrap`: config → Mongo → index health → app → HTTP → Socket → Workers → readiness. `shutdown`: mark unready → stop workers → drain HTTP → close socket/db.

### `src/server.js`

```js
async function main() {}
function registerProcessHandlers(runtime) {}
```

`main` هو entrypoint الوحيد. أي bootstrap failure يكتب Error آمن وينهي process non-zero.

## Exit Criteria

`GET /health/live` يعمل بلا DB، `ready` يفشل عند قطع DB، graceful shutdown لا يقطع Request جارٍ ضمن المهلة.

# المرحلة 2 — Platform HTTP والأخطاء والـValidation

### `api-error.js`

```js
export class ApiError extends Error { constructor({code,status,messageAr,fieldErrors,retryable,cause}) {} }
export function assertOrThrow(condition, errorFactory) {}
```

### `response.js`

```js
export function sendSuccess(res, data, meta = {}) {}
export function sendCreated(res, data, meta = {}) {}
export function sendList(res, items, pageMeta, extra = {}) {}
export function sendAccepted(res, data, meta = {}) {}
```

كلها تضيف requestId/serverTime من `res.locals` ولا تسمح بإرجاع Document خام.

### `request-id.js`

```js
export function requestIdMiddleware(req,res,next) {}
export function createCorrelationId() {}
```

يتحقق من طول/صيغة Header أو يولد UUID، ويضعه في AsyncLocalStorage.

### `validate.middleware.js`

```js
export function validate({params,query,body}) {}
export function formatValidationIssues(issues) {}
```

يمرر `req.validated` مجمدًا؛ يمنع بقية الحقول بدل تجاهلها.

### `pagination.js`

```js
export function parsePage(query) {}
export function buildSkipLimit({page,limit}) {}
export function buildPageMeta({page,limit,totalItems,sort}) {}
export function appendStableTieBreaker(sort) {}
```

limit دائمًا ≤10، و`_id` tie-breaker إلزامي.

### `error-handler.js`

```js
export function notFoundHandler(req,res,next) {}
export function errorHandler(err,req,res,next) {}
export function mapMongoError(err) {}
```

Duplicate key يتحول لكود مجال معروف، Transaction conflict إلى retryable، ولا Stack في Production.

## Exit Criteria

Contract test لكل envelope، رفض operator injection، body >limit يرجع 413، وكل خطأ يحمل requestId.

# المرحلة 3 — Mongo وDecimal والـTransactions

### `mongoose.js`

```js
export async function connectMongo(config) {}
export async function disconnectMongo() {}
export function getConnectionHealth() {}
```

### `decimal.js`

```js
export function decimal(value) {}
export function add(a,b) {}
export function subtract(a,b) {}
export function multiply(a,b) {}
export function divide(a,b,scale) {}
export function compare(a,b) {}
export function isPositive(value) {}
export function toApiString(value) {}
```

كل Function تستخدم Decimal128/decimal library مع rounding policy موحدة. لا Float وسيط.

### `transaction.js`

```js
export async function runInTransaction(work, context, options = {}) {}
export function isTransientTransactionError(error) {}
export function isUnknownCommitResult(error) {}
```

إذا context يحمل session تستخدمه ولا تفتح nested transaction. Retry مرتان للأخطاء المؤقتة فقط. Unknown Commit يستعلم operation result بدل تكرار عشوائي.

## Exit Criteria

اختبار Replica Set حقيقي، rollback متعدد Collections، ودقة جمع/ضرب/تقريب حتى آخر قرش/جرام.

# المرحلة 4 — Idempotency وAudit وOutbox

### `operation-request.model.js`

Schema كما بالـERD مع unique `(actorId,scope,key)`.

### `idempotency.service.js`

```js
export async function beginOperation({actorId,scope,key,requestHash,leaseMs},context) {}
export async function completeOperation(operationId,responseSnapshot,context) {}
export async function failOperation(operationId,errorSnapshot,context) {}
export async function getOperationResult({actorId,scope,key}) {}
export function hashCanonicalRequest(input) {}
```

`beginOperation` يعيد `NEW|PROCESSING|COMPLETED|FAILED`. نفس المفتاح وHash مختلف 409. Completed يعيد نفس response.

### `audit-writer.js`

```js
export async function writeAudit(event, context) {}
export function buildChanges(before,after,allowlist) {}
export function buildEntityContext(entity,snapshot) {}
```

### `outbox-writer.js`

```js
export async function enqueueDomainEvent({aggregateType,aggregateId,eventType,payload,sequence},context) {}
```

### `outbox-publisher.js`

```js
export async function claimOutboxBatch({workerId,limit,leaseMs}) {}
export async function publishClaimedEvent(event) {}
export async function markPublished(eventId) {}
export async function scheduleRetry(eventId,error) {}
export async function moveToDeadLetter(eventId,error) {}
```

## Exit Criteria

Double click ينتج أثرًا واحدًا، crash بعد Commit وقبل response يعيد نفس النتيجة، وفشل Socket لا يرجع Business transaction.

# المرحلة 5 — الموظفون والأدوار والصلاحيات

## `employees/employee.service.js`

```js
export async function createEmployee(input,context) {}
export async function updateEmployee(employeeId,patch,context) {}
export async function changeEmployeeStatus(employeeId,{status,reason,expectedVersion},context) {}
export async function changeEmployeePassword(employeeId,{passwordPlainText,expectedVersion},context) {}
export async function revealEmployeePassword(employeeId,context) {}
```

`createEmployee` يتحقق role/schedule/name، يحفظ password plaintext حسب القرار مع select:false، ويكتب Audit لا يحتوي القيمة. `reveal` يحتاج permission خاصة ويسجل Sensitive Read.

## `permission.service.js`

```js
export async function computeEffectivePermissions(employeeId,context) {}
export async function replacePermissionMatrix(employeeId,input,context) {}
export async function replaceRolePermissions(roleId,input,context) {}
export async function assertPermission(actor,key,context) {}
```

الاستبدال ذري ويحذف/ينشئ الفرق ويزيد `permissionsVersion`. DENY override له أولوية على ALLOW.

## `employee.queries.js`

```js
export async function getEmployeesScreen(filters,context) {}
export async function getEmployeeDetails(employeeId,includes,context) {}
export async function listEmployeeActivity(employeeId,page,context) {}
```

تفاصيل كل include أول صفحة مستقلة. Mapper يقرر ظهور password.

## Exit Criteria

إنشاء/تعديل/إيقاف، منع password leakage، permissions version invalidation، وقوائم 10.

# المرحلة 6 — الأجهزة والمصادقة

## `auth.service.js`

```js
export async function login(input,requestContext) {}
export async function refreshSession(input,requestContext) {}
export async function logout(input,context) {}
export async function revokeAllEmployeeSessions(employeeId,reason,context) {}
```

`login`: lookup employee → compare plaintext constant-time قدر الإمكان → upsert/find device → لو Pending يسجل attempt ويرجع 202 → لو approved ينشئ tokens/session → update last login. لا يسجل password/fingerprint خام.

## `device.service.js`

```js
export async function registerDeviceAttempt(employee,input,context) {}
export async function approveDevice(deviceId,input,context) {}
export async function blockDevice(deviceId,input,context) {}
export async function assertApprovedDevice(deviceId,employeeId,context) {}
```

Block يحدث الجهاز ويلغي Sessions داخل Transaction. approve/block يشترطان version.

## `token.service.js`

```js
export function issueAccessToken(claims) {}
export async function issueRefreshToken(sessionData,context) {}
export function verifyAccessToken(token) {}
export async function rotateRefreshToken(rawToken,context) {}
```

Refresh الخام يظهر مرة، والـHash فقط يحفظ.

## Exit Criteria

جهاز جديد/مقبول/محظور، token rotation/reuse detection، وتعطيل الموظف يمنع refresh.

# المرحلة 7 — الحضور

## `attendance.service.js`

```js
export async function checkIn(employeeId,context) {}
export async function adminCheckOut(attendanceId,input,context) {}
export async function forceCloseAttendance(attendanceId,input,context) {}
export function calculateAttendanceMetrics({schedule,checkInAt,checkOutAt,timezone}) {}
```

Check-in يأخذ schedule snapshot ويمنع سجل OPEN ثانٍ. Checkout يتحقق صلاحية Admin والدرج المفتوح، ثم يحسب worked/late. Overnight يعتمد business timezone.

## `attendance-adjustment.service.js`

```js
export async function createAttendanceAdjustment(attendanceId,changes,reason,context) {}
```

يحفظ old/new في Adjustment ويعيد الحساب، ولا يمحو وقتًا تاريخيًا دون أثر.

## Exit Criteria

نوبات عادية/عابرة لمنتصف الليل، تكرار Check-in، درج مفتوح، وتصحيح كامل Audit.

# المرحلة 8 — الموردون وحساب المورد

## `supplier.service.js`

```js
export async function createSupplier(input,context) {}
export async function updateSupplier(id,patch,context) {}
export async function setSupplierStatus(id,input,context) {}
export async function assertActiveSupplier(id,context) {}
export async function getSupplierSnapshot(id,context) {}
```

إنشاء Supplier وAccount صفري في Transaction. INACTIVE يمنع الاستخدام الجديد ولا يمنع التسوية.

## `supplier-account.service.js`

```js
export async function recordDebt(supplierId,input,context) {}
export async function recordReceivable(supplierId,input,context) {}
export async function payDebt(supplierId,input,context) {}
export async function collectReceivable(supplierId,input,context) {}
export async function reverseSupplierEntry(entryId,input,context) {}
```

الوظيفتان النقديتان تستدعيان Drawer public service بنفس session. Conditional account update يمنع رصيدًا سالبًا. العكس unique بالأصل.

## Queries

`getSuppliersScreen`, `getSupplierDetails`, `listSupplierEntries`, `listSupplierMaterials`. كل Query projection وفهرس وPagination مستقل.

## Exit Criteria

كل أنواع القيود، oversize payment، reverse، concurrency، ودرج غير مفتوح.

# المرحلة 9 — المواد الخام والوحدات والدفعات

## `inventory.service.js`

```js
export async function createRawMaterial(input,context) {}
export async function updateRawMaterial(id,patch,context) {}
export async function changeMaterialStatus(id,input,context) {}
export async function lockMaterialSupplierAndUnits(materialId,reason,context) {}
export async function withdrawBatchQuantity(input,context) {}
```

Create يثبت Supplier ACTIVE والوحدتين والمعامل. Update supplier/units يستخدم lock fields. Withdrawal يحسب small quantity/value ويكتب Movement داخل Transaction.

## `stock-allocation.service.js`

```js
export async function simulateRecipeRequirements(requirements,context) {}
export async function allocateRecipeRequirements(requirements,source,context) {}
export async function consumeFromBatch(batch,quantitySmall,source,context) {}
export async function restoreAllocations(allocationIds,reason,context) {}
```

يجمع requirements حسب material، يقرأ Batches sort priority، يبني plan كامل، ثم conditional updates. لا يكتب قبل التأكد أن كل المواد تكفي.

## `batch-priority.service.js`

`reorderMaterialBatches(materialId,{orderedBatchIds,expectedPriorityVersion},context)` يتحقق أن القائمة تضم كل الدفعات القابلة للترتيب مرة واحدة ويحدثها bulk داخل Transaction.

## Exit Criteria

تحويل وحدات، expired allowed، multi-batch allocation، concurrent sale/withdraw، zeroing rounding، وإعادة التخصيص مرة واحدة.

# المرحلة 10 — التحذيرات

## `warning-evaluator.js`

```js
export function evaluateLowStock(material,stock) {}
export function evaluateBatchExpiry(batch,businessToday,days) {}
export function calculateDaysUntilExpiry(expiryOn,businessToday) {}
export function mergeWarningSummary(items,shiftAlerts) {}
```

Pure functions قابلة لاختبار boundary day.

## `warning.queries.js`

```js
export async function getWarningsScreen(filters,context) {}
export async function getWarningsSummary(context) {}
```

تقرأ sourceVersions، تبني summary وpage بنفس evaluatedAt. Cache key يحمل business day/inventory version.

## Exit Criteria

Low/expiring/expired، expiry null، threshold zero، القاهرة، cache invalidation، وفشل مصدر واضح.

# المرحلة 11 — المنتجات والوصفات والكتالوج

## `product.service.js`

```js
export async function createCategory(input,context) {}
export async function updateCategory(id,patch,context) {}
export async function createProduct(input,context) {}
export async function updateProduct(id,patch,context) {}
export async function setProductVisibility(id,input,context) {}
export async function addProductType(productId,input,context) {}
export async function addProductSize(productId,input,context) {}
export async function upsertAddon(productId,input,context) {}
```

كل Parent يتحقق active/history/uniqueness. إخفاء المنتج لا يغير الطلبات القديمة.

## `recipe.service.js`

```js
export async function replaceSizeRecipe(sizeId,input,context) {}
export async function validateRecipeIngredients(ingredients,context) {}
export async function buildRecipeSnapshot(sizeId,addonIds,context) {}
```

Validation يجمع material IDs في Query واحدة، يتحقق active/unit، يقفل مادة الاستخدام، ويحفظ recipe version.

## `product-cost.service.js`

`calculateExpectedProductCost(sizeId,addonIds,context)` يحول Recipe requirements ثم يستدعي Inventory simulate ويحسب profit/margin/costCompleteness.

## `catalog.queries.js`

`getCatalog`, `getCatalogProduct`, `searchVisibleProductsForAi`. الأخيرة projection ثابت لا يحتوي Recipe/Cost/Batch.

## Exit Criteria

CRUD hierarchy، recipe duplicate، cost across batches، ETag، وعدم تسريب وصفات للـPublic/AI.

# المرحلة 12 — المشتريات

## `purchase.service.js`

```js
export async function createPurchaseGroup(input,context) {}
export async function updatePurchaseGroup(id,input,context) {}
export async function deleteDraftPurchaseGroup(id,input,context) {}
```

يعيد حساب quantities/totals من Materials والوحدات، ويمنع duplicate material.

## `purchase-split.service.js`

`splitPurchaseGroupBySupplier(groupId,{expectedVersion},context)` يقرأ Items+Materials، يبني groups حسب supplierId، ينشئ/يستبدل Supplier Invoices لنفس splitVersion، ويحفظ snapshots.

## `purchase-registration.service.js`

```js
export async function registerPurchaseItem(itemId,input,context) {}
export async function registerPurchaseItems(groupId,input,context) {}
export async function recomputePurchaseStatuses(groupId,context) {}
```

Register يتحقق item pending/split current، ينادي Inventory register batch، يقفل المادة، يربط movement/batch، ثم يعيد الحالات. register-many Transaction واحدة حتى 50.

## Exit Criteria

Draft/edit/split/resplit/register one/all، expired batch، double register، وإكمال الحالة والطباعة.

# المرحلة 13 — مرتجعات المشتريات

## `purchase-return.service.js`

```js
export async function createPurchaseReturn(input,context) {}
export async function validateReturnItems(items,context) {}
export async function executeReturnPlan(plan,context) {}
```

يبني plan من Batches دفعة واحدة، يتحقق remaining/version، ثم ينشئ الرأس/السطور ومخزون movements. لا Supplier/Drawer calls.

## Exit Criteria

دفعة أخيرة مقترحة لكن الاختيار صريح، quantities boundaries، concurrency، print immutable.

# المرحلة 14 — الدرج الأساسي

## `drawer.service.js`

```js
export async function openShift(input,context) {}
export async function createManualCashIn(shiftId,input,context) {}
export async function createManualCashOut(shiftId,input,context) {}
export async function closeShift(shiftId,input,context) {}
```

Open partial unique للنطاق ويحدد next warning +12h. Close conditional OPEN→CLOSING، يعيد ledger totals، وإذا اختلفت projection تفشل Transaction وتظل OPEN وتنشئ Alert في عملية منفصلة آمنة، وإلا يحفظ reconciliation ثم CLOSED.

## `drawer-transaction.service.js`

```js
export async function createSourceCashTransaction(input,context) {}
export async function reverseManualCashTransaction(transactionId,input,context) {}
export async function calculateShiftLedgerTotals(shiftId,context) {}
```

المصدر الآلي unique `(sourceType,sourceId)`. OUT يتحقق expected balance. الحركة والمجاميع sequence داخل session.

## `open-shift-warning.service.js`

```js
export async function findDueOpenShifts(now,limit) {}
export async function emitDueShiftWarnings(shiftId,now,context) {}
export function calculateDueThresholds(openedAt,lastThreshold,now) {}
```

يحفظ كل threshold 12/24/... unique، ويرسل Notification مجمعة، ويحدث الموعد التالي.

## Exit Criteria

فتح/حركات/عكس/إغلاق/عجز/زيادة/race/25-hour downtime alerts.

# المرحلة 15 — الدفع الكاش والفواتير

## `payment.service.js`

```js
export async function collectDirectCash(orderId,input,context) {}
export async function recordCodCollection(orderId,assignmentId,input,context) {}
export async function settleDelegateCash(assignmentId,input,context) {}
export async function createCashRefund(paymentId,input,context) {}
export async function calculateOrderPaymentSummary(orderId,context) {}
```

Direct ينشئ Payment+Drawer IN. COD collection يجعل المال عهدة ولا يحرك الدرج. Settlement ينشئ Drawer IN unique. Refund ينشئ Drawer OUT؛ لو لا يمكن يصبح Case `PENDING_CASH_REFUND`.

## `invoice.service.js`

```js
export async function buildInvoicePreview(orderId,context) {}
export async function finalizeInvoice(orderId,context) {}
export async function recordInvoicePrint(invoiceId,input,context) {}
export function calculateInvoiceChecksum(payload) {}
```

Final unique order/revision وpayload snapshots. Print يزيد counter فقط ولا يغير المال.

## Exit Criteria

Takeaway cash، table cash، COD collection/settlement، refund insufficient cash، final invoice idempotency.

# المرحلة 16 — الطلبات الأساسية

## `order-pricing.service.js`

```js
export async function priceOrderItems(inputItems,fulfillmentType,context) {}
export function calculateOrderTotals(pricedItems,businessConfig) {}
export function calculateBalanceDue(total,paymentSummary) {}
```

يعيد السعر من Product snapshots، ولا يقبل إجمالي Client.

## `order-confirmation.service.js`

```js
export async function confirmNewOrder(input,context) {}
export async function appendOrderItems(orderId,input,context) {}
```

Confirm: customer/table context → price → recipe requirements → inventory allocation → Order/Items/Allocations/Events → versions/audit/outbox. Append يعيد نفس الدورة ويحول READY إلى PREPARING.

## `order-cancellation.service.js`

```js
export async function cancelOrderItem(orderId,itemId,input,context) {}
export async function cancelWholeOrder(orderId,input,context) {}
export async function restoreCancelledItemInventory(item,context) {}
```

يستخدم allocations الفعلية، يعيد totals/progress، ويربط Refund Case إذا مدفوع.

## `order-completion.service.js`

```js
export async function completeTakeawayOrder(orderId,input,context) {}
export async function completeTableOrder(orderId,input,context) {}
export async function completeDeliveredOrder(orderId,receipt,context) {}
```

كل مسار يتحقق READY/payment/fulfillment، ينشئ final invoice ويحدث completed event. Delivery يسمح OUT_FOR_DELIVERY.

## Exit Criteria

كل transition، multi-batch costs، add/cancel races، paid balance، invoices/events.

# المرحلة 17 — التحضير

## `preparation.service.js`

```js
export async function markOrderItemReady(itemId,input,context) {}
export async function recomputeOrderPreparationState(orderId,context) {}
```

الأولى conditional PREPARING/version، تنشئ Item Event، الثانية تحسب active items؛ آخر عنصر يجعل Order READY. نفس Transaction.

## `preparation.queries.js`

`getPreparationScreen`, `listPreparationOrders`, `getPreparationOrderDetails` تستخدم Aggregations ثابتة ولا N+1.

## Exit Criteria

لوحتان/تبويبان، last item، concurrent cancel/ready، append after ready، Realtime.

# المرحلة 18 — العملاء والتقييمات

## `customer.service.js`

```js
export async function upsertCustomerForOrder(input,orderCreatedAt,context) {}
export async function updateCustomerProfile(id,input,context) {}
export async function changeCustomerStatus(id,input,context) {}
```

Upsert بالهاتف مع duplicate-key retry؛ آخر profile يتحدث فقط لو تاريخ الطلب أحدث.

## `review.service.js`

```js
export async function submitOrderReview(orderId,input,owner,context) {}
export async function updateOrderReview(reviewId,input,owner,context) {}
export async function moderateReview(reviewId,input,context) {}
```

يتحقق COMPLETED/ownership/unique order/time window، ويحفظ Revision للتعديل أو الإخفاء.

## Exit Criteria

Customer واحد لطلبات متزامنة، profile ordering، table/customer ownership، one review، revisions.

# المرحلة 19 — Customer Web والتتبع

## `customer-experience.service.js`

```js
export async function createPublicOrder(input,context) {}
export async function issueOrderCredentials(order,context) {}
export async function lookupPublicOrder(input,context) {}
export async function addItemsUsingActionToken(order,input,context) {}
export async function confirmCustomerReceipt(order,input,context) {}
export async function createCustomerAccessSession(input,context) {}
```

Credentials تستخدم random bytes، تحفظ Hash وتعيد raw مرة واحدة. Lookup projection محدود. Receipt يتحقق Action Token/assignment/AVAILABLE ثم يستدعي Delivery confirmation وOrder completion.

## Middlewares

```js
export async function requireTrackingReadToken(req,res,next) {}
export async function requireOrderActionToken(req,res,next) {}
export async function requireCustomerAccessSession(req,res,next) {}
```

كل واحد يحدد scope ولا يضع Token في log/context.

## Exit Criteria

Local storage contract، read/action separation، lookup abuse، receipt timing، history recovery، إضافة realtime.

# المرحلة 20 — المندوب والتوصيل

## `delivery.service.js`

```js
export async function assignDelegate(orderId,input,context) {}
export async function handoverToDelegate(assignmentId,input,context) {}
export async function reassignDelivery(assignmentId,input,context) {}
export async function recordFailedAttempt(assignmentId,input,context) {}
export async function returnDeliveryToStore(assignmentId,input,context) {}
```

Partial unique active assignment. Handover يجعل Order OUT_FOR_DELIVERY وreceipt AVAILABLE. Return لا يعيد المخزون.

## `delivery-confirmation.service.js`

```js
export async function confirmByCustomer(orderId,credentialId,input,context) {}
export async function confirmByAdminOverride(assignmentId,input,context) {}
```

Confirmation unique order/assignment. Admin يحتاج permission+reason. كلاهما يستدعي completion مرة واحدة، وCOD collection يسجل منفصلًا.

## Exit Criteria

assign/capacity/reassign/fail/return/customer/admin override/double confirmation/COD.

# المرحلة 21 — الطاولات

## `table-session.service.js`

```js
export async function openTableSession(tableId,input,context) {}
export async function getOrOpenSessionForConfirmedProposal(tableId,context) {}
export async function addItemsToTableSession(sessionId,input,context) {}
export async function cancelTableSession(sessionId,input,context) {}
export async function closeTableSession(sessionId,input,context) {}
```

Open partial unique. Close OPEN→CLOSING، complete cash payment، invoice، resolve/cancel services، close guest links، table empty.

## `table-board.queries.js`

`getTablesBoard(context)` Aggregation واحدة ترجع 20 Card وحالة مشتقة.

## Exit Criteria

20 cards، open race، add/close race، payment failure leaves active، print/history.

# المرحلة 22 — Guest Table وProposals

## `table-guest-session.service.js`

```js
export async function bootstrapGuestSession(qrToken,input,context) {}
export async function refreshGuestToken(sessionId,context) {}
export async function revokeGuestSession(sessionId,reason,context) {}
export async function assertGuestScope(token,context) {}
```

QR signature/version/table status، Token hash/expiry، ولا تشغيل للطاولة.

## `table-order-proposal.service.js`

```js
export async function createProposal(guest,input,context) {}
export async function startProposalReview(id,input,context) {}
export async function requestProposalChanges(id,input,context) {}
export async function rejectProposal(id,input,context) {}
export async function cancelProposal(id,input,context) {}
export async function confirmProposal(id,input,context) {}
```

Create يسعر Server-side وينشئ CALL_WAITER. Confirm يعيد السعر/المخزون، يفتح/يقرأ Table Session، ينشئ/يضيف Order، ويخصم داخل Transaction.

## Exit Criteria

QR old/expired، proposal duplicate، no stock، confirm race، ready→preparing، no pre-confirm deduction.

# المرحلة 23 — خدمات الطاولة

## `table-service.service.js`

```js
export async function createTableServiceRequest(owner,input,context) {}
export async function resolveTableServiceRequest(id,input,context) {}
export async function cancelTableServiceRequest(id,input,context) {}
export async function closeSessionServiceRequests(sessionId,reason,context) {}
export async function migrateGuestRequestsToSession(guestId,sessionId,context) {}
```

Owner key مشتق. Duplicate OPEN يعيد الموجود. Close يحل BILL ويلغي الباقي. Migration يربط دون كسر unique.

## Exit Criteria

الأنواع الخمسة، required fields، duplicate، resolve/cancel race، pre-order owner، Realtime.

# المرحلة 24 — Order Cases والـCash Refund

## `order-case.service.js`

```js
export async function requestOrderCancellation(orderId,input,requester,context) {}
export async function approveCancellationRequest(caseId,input,context) {}
export async function rejectCancellationRequest(caseId,input,context) {}
export async function executeApprovedCancellation(caseId,context) {}
export async function retryPendingCashRefund(caseId,input,context) {}
```

Case active unique لكل Order/scope. Execute يقفل Case/Order، يعكس المخزون مرة، ثم يحاول Cash Refund. نقص الدرج ينتج PENDING_CASH_REFUND ولا يعكس المخزون ثانية عند retry.

## Exit Criteria

كل order state، returned delivery، paid/unpaid، pending cash، approve/reject races.

# المرحلة 25 — الإشعارات والـRealtime

## `notification.service.js`

```js
export async function createNotifications(recipients,payload,context) {}
export async function markNotificationRead(id,employeeId,context) {}
export async function markAllNotificationsRead(employeeId,before,context) {}
```

deduplicationKey يمنع النسخ. القراءة لا تغير Business state.

## `socket-publisher.js`

```js
export function resolveEventRooms(event) {}
export function mapRealtimePayload(event) {}
export async function publishRealtimeEvent(event) {}
```

Room membership يتحقق Auth/Scope. Payload Mapper لا يستخدم Audit payload الخام.

## `realtime-sync.queries.js`

`syncAggregates({rooms,afterSequence},context)` يعيد snapshots/events المسموحة فقط.

## Exit Criteria

Reconnect/gap/out-of-order/duplicate event، permission revocation، no token leakage.

# المرحلة 26 — Dashboard والتقارير

## `dashboard-summary.projector.js`

```js
export async function applyDashboardEvent(event,context) {}
export async function rebuildDashboardProjection(period,context) {}
```

processedEvent يمنع التكرار، checkpoint يمنع gap.

## `financial-report.service.js`

```js
export async function getFinancialReportScreen(filters,context) {}
export async function getSalesReport(filters,context) {}
export async function getInventoryReport(filters,context) {}
export async function getDrawerReport(filters,context) {}
export async function getSupplierReport(filters,context) {}
export async function getDelegateReport(filters,context) {}
```

يبني period مرة، يتحقق cache sourceVersions، يشغل Queries مستقلة بconcurrency محدود، يجمع dataQuality.

## `report-export.service.js`

```js
export async function requestReportExport(input,context) {}
export async function processReportExport(exportId,context) {}
export async function getReportExportStatus(exportId,context) {}
```

Job يقرأ chunks ويكتب stream، يحفظ checksum/expiry، ولا يحمل كل الصفوف.

## Exit Criteria

Net sales/COGS/cash/COD/suppliers/waste، Cairo periods، cache invalidation، partial source، async export.

# المرحلة 27 — سجل الأحداث والنزاهة

## `audit.queries.js`

```js
export async function getAuditScreen(filters,context) {}
export async function getAuditEvent(id,context) {}
export async function getEntityTimeline(entityType,entityId,page,context) {}
```

يطبق permission/redaction وindexes.

## `audit-integrity.service.js`

```js
export function calculateEventHash(event,previousHash) {}
export async function verifyAuditChain(scope,range,context) {}
export async function recordIntegrityFailure(result,context) {}
```

لا يصلح أو يحذف؛ يبلغ بالانقطاع.

## Exit Criteria

كل event category، sensitive reads، redaction، chain verification، export async.

# المرحلة 28 — الصور والملفات

## `media.service.js`

```js
export async function createUpload(input,file,context) {}
export async function markAssetReady(assetId,processed,context) {}
export async function attachAsset(assetId,owner,context) {}
export async function deleteUnusedAsset(assetId,context) {}
export async function getSignedAssetUrl(assetId,viewer,context) {}
```

MIME sniff وحجم/pixels/checksum، quarantine، thumbnail job. لا Base64 في JSON.

## Exit Criteria

ملف مزيف/كبير/duplicate/orphan، product attach، signed/public URL policy.

# المرحلة 29 — Migrations والـIndexes

## `migration-runner.js`

```js
export async function acquireMigrationLock(owner,ttl) {}
export async function listPendingMigrations() {}
export async function runPendingMigrations(context) {}
export async function applyMigration(migration,context) {}
export function verifyMigrationChecksum(migration,record) {}
```

## `index-diff.js`

```js
export async function readExistingIndexes(connection) {}
export function calculateIndexDiff(required,existing) {}
export async function applySafeIndexCreates(diff,context) {}
```

لا حذف تلقائي. Backfill قبل unique.

## Exit Criteria

Fresh DB وupgrade DB وfailed migration وduplicate precheck وrollback deployment.

# المرحلة 30 — الاختبارات الشاملة والأداء

## Test helpers

```js
export async function createTestApp(overrides) {}
export async function startReplicaSet() {}
export function freezeClock(isoDate) {}
export async function runConcurrent(actions) {}
export async function assertLedgerProjectionMatches(scope) {}
export async function measureQueryCount(work) {}
```

## Suites الإلزامية

- Supplier debt/payment/reversal races.
- Purchase→Batch→Order→Cancel exact restore.
- Takeaway cash lifecycle.
- Delivery COD→Customer receipt→Delegate settlement.
- Table QR→Proposal→Waiter→Order→Close.
- Shift open 25h warnings and close race.
- Device approval/block and permissions revocation.
- Report source equality and dataQuality.
- Public token separation and abuse limits.
- DeepSeek prompt injection and timeout.

## Performance budgets

كل screen endpoint ≤عدد ثابت من Queries موثق؛ لا N+1. اختبارات حمل ببيانات مماثلة للإنتاج تقيس p95≤500ms وp99≤1000ms. أي Endpoint يتجاوز الميزانية يعالج index/projection قبل القبول، لا يرفع timeout تلقائيًا.

# المرحلة 31 — التشغيل التجريبي والإطلاق

## خطوات التنفيذ

1. تشغيل migrations وindex health على Staging.
2. Seed units/permissions/first admin.
3. تشغيل integrity baseline وحفظ النتيجة.
4. Smoke tests لكل screen وcommand حرج.
5. Load test وrace tests.
6. Restore test لنسخة Staging.
7. تفعيل Workers تدريجيًا: Outbox ثم notifications ثم shift warnings ثم exports.
8. فحص logs redaction وعدم ظهور password/tokens.
9. نشر Production، readiness قبل تحويل traffic.
10. مراقبة latency/errors/query count/outbox lag/job failures/ledger mismatches.

## Functions التشغيلية

```js
export async function runStartupDiagnostics(runtime) {}
export async function runSmokeSuite(baseUrl,credentials) {}
export async function verifyPostDeployIntegrity(context) {}
export async function rollbackApplicationVersion(release) {}
```

Rollback الكود لا يرجع Migration destructive تلقائيًا. إذا Schema backward compatible يرجع التطبيق؛ وإلا يتبع Runbook.

# 32. ترتيب بناء Function داخل أي ملف

1. imports من platform/shared/public contracts.
2. constants الخاصة بالملف.
3. exported use-case functions.
4. private orchestration helpers.
5. pure calculation helpers.
6. لا side effect عند import.

مثال Service:

```js
export async function executeCommand(input, context) {
  return runInTransaction(async (session) => {
    const txContext = { ...context, session };
    const entity = await loadAndAssert(input.id, txContext);
    assertAllowed(entity, input, txContext);
    const result = await applyChanges(entity, input, txContext);
    await writeAudit(buildAudit(result), txContext);
    await enqueueDomainEvent(buildEvent(result), txContext);
    return result;
  }, context);
}
```

لا يستدعي Controller أكثر من Use Case لتجميع Transaction؛ إذا العملية تحتاج عدة موديولات، Service المنسق هو الذي يستدعي Public Services بنفس Session.

# 33. Definition of Done لكل مرحلة

- الملفات والتوقيعات المذكورة موجودة بأسماء واضحة.
- Validation وPermissions وPolicies متصلة بكل Route.
- Models وIndexes مطابقان لملف ERD.
- API request/response مطابقان للـOpenAPI.
- Idempotency/Version/Transaction محددة لكل Mutation.
- Audit وOutbox داخل Commit الصحيح.
- Realtime بعد Commit وقابل للاستعادة REST.
- Unit tests للحسابات والسياسات، Integration للأثر، Contract للـDTO.
- Query explain ولا N+1، وقياس الأداء ناجح.
- حالات العكس والتعافي والفشل الجزئي مجربة.
- لا Password/Token/PII حساس في Logs أو Responses غير المصرحة.

# 34. الناتج النهائي المتوقع

بعد المرحلة 31 يكون لدينا تطبيق واحد Modular Monolith، قاعدة Mongo Replica Set، API v1 موثق، Realtime موثوق، كاش مباشر وCOD فقط، مخزون دقيق بالدفعات، طاولات وعميل ومندوب، Audit وتقارير، وWorkers قابلة للاستعادة. كل موديول يمكن تعديله من دون فتح ملف موديول آخر؛ التكامل يتم بعقود Public Services وDomain Events، وكل حركة حرجة قابلة للتتبع والعكس أو التعافي المنظم.

# 35. الدليل التفصيلي لكل Function

هذا الدليل يغطي كل توقيع ظهر في الخطة، ويقرأ مع شرح مرحلته لتحديد قاعدة المجال الخاصة به.

## 35.1 `getRequiredIndexes` 

- **المرحلة:** تثبيت القرارات والعقود.
- **التوقيع:** `export function getRequiredIndexes() {}`
- **المدخلات:** ``؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.2 `getIndexesForCollection` 

- **المرحلة:** تثبيت القرارات والعقود.
- **التوقيع:** `export function getIndexesForCollection(collectionName) {}`
- **المدخلات:** `collectionName`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.3 `loadEnv` 

- **المرحلة:** Scaffold والتشغيل والإعداد.
- **التوقيع:** `export function loadEnv(source = process.env) {}`
- **المدخلات:** `source = process.env`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.4 `assertRequiredEnv` 

- **المرحلة:** Scaffold والتشغيل والإعداد.
- **التوقيع:** `export function assertRequiredEnv(config) {}`
- **المدخلات:** `config`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.5 `redactConfig` 

- **المرحلة:** Scaffold والتشغيل والإعداد.
- **التوقيع:** `export function redactConfig(config) {}`
- **المدخلات:** `config`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.6 `loadBusinessConfig` 

- **المرحلة:** Scaffold والتشغيل والإعداد.
- **التوقيع:** `export function loadBusinessConfig(env) {}`
- **المدخلات:** `env`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.7 `getPricingSnapshot` 

- **المرحلة:** Scaffold والتشغيل والإعداد.
- **التوقيع:** `export function getPricingSnapshot(config) {}`
- **المدخلات:** `config`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.8 `getBusinessProfileSnapshot` 

- **المرحلة:** Scaffold والتشغيل والإعداد.
- **التوقيع:** `export function getBusinessProfileSnapshot(config) {}`
- **المدخلات:** `config`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.9 `createApp` 

- **المرحلة:** Scaffold والتشغيل والإعداد.
- **التوقيع:** `export function createApp({ config, dependencies }) {}`
- **المدخلات:** `{ config, dependencies }`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** إدارة مورد تشغيلي أو اختباري من دون خلط قواعد المجال.
- **التنفيذ:** تحقق config → إنشاء المورد مرة → إعلان الجاهزية → إعادة Handle → تنظيف عكسي عند الفشل/الإغلاق.
- **البيانات:** Adapter واتصال بمهلة واضحة؛ لا Models مجال لمجرد فحص التشغيل.
- **الناتج والأخطاء:** Runtime/diagnostic result؛ فشل أساسي يمنع Ready ولا يترك موردًا نصف مفتوح.
- **التدقيق:** Technical logs/metrics فقط ولا Business Audit باسم موظف.

## 35.10 `bootstrap` 

- **المرحلة:** Scaffold والتشغيل والإعداد.
- **التوقيع:** `export async function bootstrap() {}`
- **المدخلات:** ``؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** إدارة مورد تشغيلي أو اختباري من دون خلط قواعد المجال.
- **التنفيذ:** تحقق config → إنشاء المورد مرة → إعلان الجاهزية → إعادة Handle → تنظيف عكسي عند الفشل/الإغلاق.
- **البيانات:** Adapter واتصال بمهلة واضحة؛ لا Models مجال لمجرد فحص التشغيل.
- **الناتج والأخطاء:** Runtime/diagnostic result؛ فشل أساسي يمنع Ready ولا يترك موردًا نصف مفتوح.
- **التدقيق:** Technical logs/metrics فقط ولا Business Audit باسم موظف.

## 35.11 `shutdown` 

- **المرحلة:** Scaffold والتشغيل والإعداد.
- **التوقيع:** `export async function shutdown(runtime, signal) {}`
- **المدخلات:** `runtime, signal`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** إدارة مورد تشغيلي أو اختباري من دون خلط قواعد المجال.
- **التنفيذ:** تحقق config → إنشاء المورد مرة → إعلان الجاهزية → إعادة Handle → تنظيف عكسي عند الفشل/الإغلاق.
- **البيانات:** Adapter واتصال بمهلة واضحة؛ لا Models مجال لمجرد فحص التشغيل.
- **الناتج والأخطاء:** Runtime/diagnostic result؛ فشل أساسي يمنع Ready ولا يترك موردًا نصف مفتوح.
- **التدقيق:** Technical logs/metrics فقط ولا Business Audit باسم موظف.

## 35.12 `assertOrThrow` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function assertOrThrow(condition, errorFactory) {}`
- **المدخلات:** `condition, errorFactory`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.13 `sendSuccess` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function sendSuccess(res, data, meta = {}) {}`
- **المدخلات:** `res, data, meta = {}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.14 `sendCreated` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function sendCreated(res, data, meta = {}) {}`
- **المدخلات:** `res, data, meta = {}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.15 `sendList` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function sendList(res, items, pageMeta, extra = {}) {}`
- **المدخلات:** `res, items, pageMeta, extra = {}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.16 `sendAccepted` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function sendAccepted(res, data, meta = {}) {}`
- **المدخلات:** `res, data, meta = {}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.17 `requestIdMiddleware` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function requestIdMiddleware(req,res,next) {}`
- **المدخلات:** `req,res,next`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.18 `createCorrelationId` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function createCorrelationId() {}`
- **المدخلات:** ``؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.19 `validate` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function validate({params,query,body}) {}`
- **المدخلات:** `{params,query,body}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.20 `formatValidationIssues` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function formatValidationIssues(issues) {}`
- **المدخلات:** `issues`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.21 `parsePage` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function parsePage(query) {}`
- **المدخلات:** `query`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.22 `buildSkipLimit` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function buildSkipLimit({page,limit}) {}`
- **المدخلات:** `{page,limit}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.23 `buildPageMeta` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function buildPageMeta({page,limit,totalItems,sort}) {}`
- **المدخلات:** `{page,limit,totalItems,sort}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.24 `appendStableTieBreaker` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function appendStableTieBreaker(sort) {}`
- **المدخلات:** `sort`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.25 `notFoundHandler` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function notFoundHandler(req,res,next) {}`
- **المدخلات:** `req,res,next`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.26 `errorHandler` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function errorHandler(err,req,res,next) {}`
- **المدخلات:** `err,req,res,next`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.27 `mapMongoError` 

- **المرحلة:** Platform HTTP والأخطاء والـValidation.
- **التوقيع:** `export function mapMongoError(err) {}`
- **المدخلات:** `err`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.28 `connectMongo` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export async function connectMongo(config) {}`
- **المدخلات:** `config`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** إدارة مورد تشغيلي أو اختباري من دون خلط قواعد المجال.
- **التنفيذ:** تحقق config → إنشاء المورد مرة → إعلان الجاهزية → إعادة Handle → تنظيف عكسي عند الفشل/الإغلاق.
- **البيانات:** Adapter واتصال بمهلة واضحة؛ لا Models مجال لمجرد فحص التشغيل.
- **الناتج والأخطاء:** Runtime/diagnostic result؛ فشل أساسي يمنع Ready ولا يترك موردًا نصف مفتوح.
- **التدقيق:** Technical logs/metrics فقط ولا Business Audit باسم موظف.

## 35.29 `disconnectMongo` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export async function disconnectMongo() {}`
- **المدخلات:** ``؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** إدارة مورد تشغيلي أو اختباري من دون خلط قواعد المجال.
- **التنفيذ:** تحقق config → إنشاء المورد مرة → إعلان الجاهزية → إعادة Handle → تنظيف عكسي عند الفشل/الإغلاق.
- **البيانات:** Adapter واتصال بمهلة واضحة؛ لا Models مجال لمجرد فحص التشغيل.
- **الناتج والأخطاء:** Runtime/diagnostic result؛ فشل أساسي يمنع Ready ولا يترك موردًا نصف مفتوح.
- **التدقيق:** Technical logs/metrics فقط ولا Business Audit باسم موظف.

## 35.30 `getConnectionHealth` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function getConnectionHealth() {}`
- **المدخلات:** ``؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.31 `decimal` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function decimal(value) {}`
- **المدخلات:** `value`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.32 `add` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function add(a,b) {}`
- **المدخلات:** `a,b`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.33 `subtract` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function subtract(a,b) {}`
- **المدخلات:** `a,b`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.34 `multiply` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function multiply(a,b) {}`
- **المدخلات:** `a,b`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.35 `divide` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function divide(a,b,scale) {}`
- **المدخلات:** `a,b,scale`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.36 `compare` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function compare(a,b) {}`
- **المدخلات:** `a,b`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.37 `isPositive` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function isPositive(value) {}`
- **المدخلات:** `value`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.38 `toApiString` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function toApiString(value) {}`
- **المدخلات:** `value`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.39 `runInTransaction` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export async function runInTransaction(work, context, options = {}) {}`
- **المدخلات:** `work, context, options = {}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.40 `isTransientTransactionError` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function isTransientTransactionError(error) {}`
- **المدخلات:** `error`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.41 `isUnknownCommitResult` 

- **المرحلة:** Mongo وDecimal والـTransactions.
- **التوقيع:** `export function isUnknownCommitResult(error) {}`
- **المدخلات:** `error`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.42 `beginOperation` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function beginOperation({actorId,scope,key,requestHash,leaseMs},context) {}`
- **المدخلات:** `{actorId,scope,key,requestHash,leaseMs},context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.43 `completeOperation` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function completeOperation(operationId,responseSnapshot,context) {}`
- **المدخلات:** `operationId,responseSnapshot,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.44 `failOperation` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function failOperation(operationId,errorSnapshot,context) {}`
- **المدخلات:** `operationId,errorSnapshot,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.45 `getOperationResult` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function getOperationResult({actorId,scope,key}) {}`
- **المدخلات:** `{actorId,scope,key}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.46 `hashCanonicalRequest` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export function hashCanonicalRequest(input) {}`
- **المدخلات:** `input`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.47 `writeAudit` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function writeAudit(event, context) {}`
- **المدخلات:** `event, context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.48 `buildChanges` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export function buildChanges(before,after,allowlist) {}`
- **المدخلات:** `before,after,allowlist`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.49 `buildEntityContext` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export function buildEntityContext(entity,snapshot) {}`
- **المدخلات:** `entity,snapshot`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.50 `enqueueDomainEvent` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function enqueueDomainEvent({aggregateType,aggregateId,eventType,payload,sequence},context) {}`
- **المدخلات:** `{aggregateType,aggregateId,eventType,payload,sequence},context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.51 `claimOutboxBatch` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function claimOutboxBatch({workerId,limit,leaseMs}) {}`
- **المدخلات:** `{workerId,limit,leaseMs}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.52 `publishClaimedEvent` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function publishClaimedEvent(event) {}`
- **المدخلات:** `event`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.53 `markPublished` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function markPublished(eventId) {}`
- **المدخلات:** `eventId`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.54 `scheduleRetry` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function scheduleRetry(eventId,error) {}`
- **المدخلات:** `eventId,error`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.55 `moveToDeadLetter` 

- **المرحلة:** Idempotency وAudit وOutbox.
- **التوقيع:** `export async function moveToDeadLetter(eventId,error) {}`
- **المدخلات:** `eventId,error`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.56 `createEmployee` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function createEmployee(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.57 `updateEmployee` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function updateEmployee(employeeId,patch,context) {}`
- **المدخلات:** `employeeId,patch,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.58 `changeEmployeeStatus` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function changeEmployeeStatus(employeeId,{status,reason,expectedVersion},context) {}`
- **المدخلات:** `employeeId,{status,reason,expectedVersion},context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.59 `changeEmployeePassword` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function changeEmployeePassword(employeeId,{passwordPlainText,expectedVersion},context) {}`
- **المدخلات:** `employeeId,{passwordPlainText,expectedVersion},context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.60 `revealEmployeePassword` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function revealEmployeePassword(employeeId,context) {}`
- **المدخلات:** `employeeId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.61 `computeEffectivePermissions` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function computeEffectivePermissions(employeeId,context) {}`
- **المدخلات:** `employeeId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.62 `replacePermissionMatrix` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function replacePermissionMatrix(employeeId,input,context) {}`
- **المدخلات:** `employeeId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.63 `replaceRolePermissions` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function replaceRolePermissions(roleId,input,context) {}`
- **المدخلات:** `roleId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.64 `assertPermission` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function assertPermission(actor,key,context) {}`
- **المدخلات:** `actor,key,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.65 `getEmployeesScreen` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function getEmployeesScreen(filters,context) {}`
- **المدخلات:** `filters,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.66 `getEmployeeDetails` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function getEmployeeDetails(employeeId,includes,context) {}`
- **المدخلات:** `employeeId,includes,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.67 `listEmployeeActivity` 

- **المرحلة:** الموظفون والأدوار والصلاحيات.
- **التوقيع:** `export async function listEmployeeActivity(employeeId,page,context) {}`
- **المدخلات:** `employeeId,page,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.68 `login` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function login(input,requestContext) {}`
- **المدخلات:** `input,requestContext`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.69 `refreshSession` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function refreshSession(input,requestContext) {}`
- **المدخلات:** `input,requestContext`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.70 `logout` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function logout(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.71 `revokeAllEmployeeSessions` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function revokeAllEmployeeSessions(employeeId,reason,context) {}`
- **المدخلات:** `employeeId,reason,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.72 `registerDeviceAttempt` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function registerDeviceAttempt(employee,input,context) {}`
- **المدخلات:** `employee,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.73 `approveDevice` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function approveDevice(deviceId,input,context) {}`
- **المدخلات:** `deviceId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.74 `blockDevice` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function blockDevice(deviceId,input,context) {}`
- **المدخلات:** `deviceId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.75 `assertApprovedDevice` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function assertApprovedDevice(deviceId,employeeId,context) {}`
- **المدخلات:** `deviceId,employeeId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.76 `issueAccessToken` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export function issueAccessToken(claims) {}`
- **المدخلات:** `claims`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.77 `issueRefreshToken` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function issueRefreshToken(sessionData,context) {}`
- **المدخلات:** `sessionData,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.78 `verifyAccessToken` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export function verifyAccessToken(token) {}`
- **المدخلات:** `token`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.79 `rotateRefreshToken` 

- **المرحلة:** الأجهزة والمصادقة.
- **التوقيع:** `export async function rotateRefreshToken(rawToken,context) {}`
- **المدخلات:** `rawToken,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.80 `checkIn` 

- **المرحلة:** الحضور.
- **التوقيع:** `export async function checkIn(employeeId,context) {}`
- **المدخلات:** `employeeId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.81 `adminCheckOut` 

- **المرحلة:** الحضور.
- **التوقيع:** `export async function adminCheckOut(attendanceId,input,context) {}`
- **المدخلات:** `attendanceId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.82 `forceCloseAttendance` 

- **المرحلة:** الحضور.
- **التوقيع:** `export async function forceCloseAttendance(attendanceId,input,context) {}`
- **المدخلات:** `attendanceId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.83 `calculateAttendanceMetrics` 

- **المرحلة:** الحضور.
- **التوقيع:** `export function calculateAttendanceMetrics({schedule,checkInAt,checkOutAt,timezone}) {}`
- **المدخلات:** `{schedule,checkInAt,checkOutAt,timezone}`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.84 `createAttendanceAdjustment` 

- **المرحلة:** الحضور.
- **التوقيع:** `export async function createAttendanceAdjustment(attendanceId,changes,reason,context) {}`
- **المدخلات:** `attendanceId,changes,reason,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.85 `createSupplier` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function createSupplier(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.86 `updateSupplier` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function updateSupplier(id,patch,context) {}`
- **المدخلات:** `id,patch,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.87 `setSupplierStatus` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function setSupplierStatus(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.88 `assertActiveSupplier` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function assertActiveSupplier(id,context) {}`
- **المدخلات:** `id,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.89 `getSupplierSnapshot` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function getSupplierSnapshot(id,context) {}`
- **المدخلات:** `id,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.90 `recordDebt` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function recordDebt(supplierId,input,context) {}`
- **المدخلات:** `supplierId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.91 `recordReceivable` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function recordReceivable(supplierId,input,context) {}`
- **المدخلات:** `supplierId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.92 `payDebt` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function payDebt(supplierId,input,context) {}`
- **المدخلات:** `supplierId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.93 `collectReceivable` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function collectReceivable(supplierId,input,context) {}`
- **المدخلات:** `supplierId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.94 `reverseSupplierEntry` 

- **المرحلة:** الموردون وحساب المورد.
- **التوقيع:** `export async function reverseSupplierEntry(entryId,input,context) {}`
- **المدخلات:** `entryId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.95 `createRawMaterial` 

- **المرحلة:** المواد الخام والوحدات والدفعات.
- **التوقيع:** `export async function createRawMaterial(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.96 `updateRawMaterial` 

- **المرحلة:** المواد الخام والوحدات والدفعات.
- **التوقيع:** `export async function updateRawMaterial(id,patch,context) {}`
- **المدخلات:** `id,patch,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.97 `changeMaterialStatus` 

- **المرحلة:** المواد الخام والوحدات والدفعات.
- **التوقيع:** `export async function changeMaterialStatus(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.98 `lockMaterialSupplierAndUnits` 

- **المرحلة:** المواد الخام والوحدات والدفعات.
- **التوقيع:** `export async function lockMaterialSupplierAndUnits(materialId,reason,context) {}`
- **المدخلات:** `materialId,reason,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.99 `withdrawBatchQuantity` 

- **المرحلة:** المواد الخام والوحدات والدفعات.
- **التوقيع:** `export async function withdrawBatchQuantity(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.100 `simulateRecipeRequirements` 

- **المرحلة:** المواد الخام والوحدات والدفعات.
- **التوقيع:** `export async function simulateRecipeRequirements(requirements,context) {}`
- **المدخلات:** `requirements,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.101 `allocateRecipeRequirements` 

- **المرحلة:** المواد الخام والوحدات والدفعات.
- **التوقيع:** `export async function allocateRecipeRequirements(requirements,source,context) {}`
- **المدخلات:** `requirements,source,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.102 `consumeFromBatch` 

- **المرحلة:** المواد الخام والوحدات والدفعات.
- **التوقيع:** `export async function consumeFromBatch(batch,quantitySmall,source,context) {}`
- **المدخلات:** `batch,quantitySmall,source,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.103 `restoreAllocations` 

- **المرحلة:** المواد الخام والوحدات والدفعات.
- **التوقيع:** `export async function restoreAllocations(allocationIds,reason,context) {}`
- **المدخلات:** `allocationIds,reason,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.104 `evaluateLowStock` 

- **المرحلة:** التحذيرات.
- **التوقيع:** `export function evaluateLowStock(material,stock) {}`
- **المدخلات:** `material,stock`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.105 `evaluateBatchExpiry` 

- **المرحلة:** التحذيرات.
- **التوقيع:** `export function evaluateBatchExpiry(batch,businessToday,days) {}`
- **المدخلات:** `batch,businessToday,days`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.106 `calculateDaysUntilExpiry` 

- **المرحلة:** التحذيرات.
- **التوقيع:** `export function calculateDaysUntilExpiry(expiryOn,businessToday) {}`
- **المدخلات:** `expiryOn,businessToday`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.107 `mergeWarningSummary` 

- **المرحلة:** التحذيرات.
- **التوقيع:** `export function mergeWarningSummary(items,shiftAlerts) {}`
- **المدخلات:** `items,shiftAlerts`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.108 `getWarningsScreen` 

- **المرحلة:** التحذيرات.
- **التوقيع:** `export async function getWarningsScreen(filters,context) {}`
- **المدخلات:** `filters,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.109 `getWarningsSummary` 

- **المرحلة:** التحذيرات.
- **التوقيع:** `export async function getWarningsSummary(context) {}`
- **المدخلات:** `context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.110 `createCategory` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function createCategory(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.111 `updateCategory` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function updateCategory(id,patch,context) {}`
- **المدخلات:** `id,patch,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.112 `createProduct` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function createProduct(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.113 `updateProduct` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function updateProduct(id,patch,context) {}`
- **المدخلات:** `id,patch,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.114 `setProductVisibility` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function setProductVisibility(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.115 `addProductType` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function addProductType(productId,input,context) {}`
- **المدخلات:** `productId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.116 `addProductSize` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function addProductSize(productId,input,context) {}`
- **المدخلات:** `productId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.117 `upsertAddon` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function upsertAddon(productId,input,context) {}`
- **المدخلات:** `productId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.118 `replaceSizeRecipe` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function replaceSizeRecipe(sizeId,input,context) {}`
- **المدخلات:** `sizeId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.119 `validateRecipeIngredients` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function validateRecipeIngredients(ingredients,context) {}`
- **المدخلات:** `ingredients,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.120 `buildRecipeSnapshot` 

- **المرحلة:** المنتجات والوصفات والكتالوج.
- **التوقيع:** `export async function buildRecipeSnapshot(sizeId,addonIds,context) {}`
- **المدخلات:** `sizeId,addonIds,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.121 `createPurchaseGroup` 

- **المرحلة:** المشتريات.
- **التوقيع:** `export async function createPurchaseGroup(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.122 `updatePurchaseGroup` 

- **المرحلة:** المشتريات.
- **التوقيع:** `export async function updatePurchaseGroup(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.123 `deleteDraftPurchaseGroup` 

- **المرحلة:** المشتريات.
- **التوقيع:** `export async function deleteDraftPurchaseGroup(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.124 `registerPurchaseItem` 

- **المرحلة:** المشتريات.
- **التوقيع:** `export async function registerPurchaseItem(itemId,input,context) {}`
- **المدخلات:** `itemId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.125 `registerPurchaseItems` 

- **المرحلة:** المشتريات.
- **التوقيع:** `export async function registerPurchaseItems(groupId,input,context) {}`
- **المدخلات:** `groupId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.126 `recomputePurchaseStatuses` 

- **المرحلة:** المشتريات.
- **التوقيع:** `export async function recomputePurchaseStatuses(groupId,context) {}`
- **المدخلات:** `groupId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.127 `createPurchaseReturn` 

- **المرحلة:** مرتجعات المشتريات.
- **التوقيع:** `export async function createPurchaseReturn(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.128 `validateReturnItems` 

- **المرحلة:** مرتجعات المشتريات.
- **التوقيع:** `export async function validateReturnItems(items,context) {}`
- **المدخلات:** `items,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.129 `executeReturnPlan` 

- **المرحلة:** مرتجعات المشتريات.
- **التوقيع:** `export async function executeReturnPlan(plan,context) {}`
- **المدخلات:** `plan,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.130 `openShift` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export async function openShift(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.131 `createManualCashIn` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export async function createManualCashIn(shiftId,input,context) {}`
- **المدخلات:** `shiftId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.132 `createManualCashOut` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export async function createManualCashOut(shiftId,input,context) {}`
- **المدخلات:** `shiftId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.133 `closeShift` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export async function closeShift(shiftId,input,context) {}`
- **المدخلات:** `shiftId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.134 `createSourceCashTransaction` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export async function createSourceCashTransaction(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.135 `reverseManualCashTransaction` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export async function reverseManualCashTransaction(transactionId,input,context) {}`
- **المدخلات:** `transactionId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.136 `calculateShiftLedgerTotals` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export async function calculateShiftLedgerTotals(shiftId,context) {}`
- **المدخلات:** `shiftId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.137 `findDueOpenShifts` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export async function findDueOpenShifts(now,limit) {}`
- **المدخلات:** `now,limit`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.138 `emitDueShiftWarnings` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export async function emitDueShiftWarnings(shiftId,now,context) {}`
- **المدخلات:** `shiftId,now,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.139 `calculateDueThresholds` 

- **المرحلة:** الدرج الأساسي.
- **التوقيع:** `export function calculateDueThresholds(openedAt,lastThreshold,now) {}`
- **المدخلات:** `openedAt,lastThreshold,now`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.140 `collectDirectCash` 

- **المرحلة:** الدفع الكاش والفواتير.
- **التوقيع:** `export async function collectDirectCash(orderId,input,context) {}`
- **المدخلات:** `orderId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.141 `recordCodCollection` 

- **المرحلة:** الدفع الكاش والفواتير.
- **التوقيع:** `export async function recordCodCollection(orderId,assignmentId,input,context) {}`
- **المدخلات:** `orderId,assignmentId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.142 `settleDelegateCash` 

- **المرحلة:** الدفع الكاش والفواتير.
- **التوقيع:** `export async function settleDelegateCash(assignmentId,input,context) {}`
- **المدخلات:** `assignmentId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.143 `createCashRefund` 

- **المرحلة:** الدفع الكاش والفواتير.
- **التوقيع:** `export async function createCashRefund(paymentId,input,context) {}`
- **المدخلات:** `paymentId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.144 `calculateOrderPaymentSummary` 

- **المرحلة:** الدفع الكاش والفواتير.
- **التوقيع:** `export async function calculateOrderPaymentSummary(orderId,context) {}`
- **المدخلات:** `orderId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.145 `buildInvoicePreview` 

- **المرحلة:** الدفع الكاش والفواتير.
- **التوقيع:** `export async function buildInvoicePreview(orderId,context) {}`
- **المدخلات:** `orderId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.146 `finalizeInvoice` 

- **المرحلة:** الدفع الكاش والفواتير.
- **التوقيع:** `export async function finalizeInvoice(orderId,context) {}`
- **المدخلات:** `orderId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.147 `recordInvoicePrint` 

- **المرحلة:** الدفع الكاش والفواتير.
- **التوقيع:** `export async function recordInvoicePrint(invoiceId,input,context) {}`
- **المدخلات:** `invoiceId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.148 `calculateInvoiceChecksum` 

- **المرحلة:** الدفع الكاش والفواتير.
- **التوقيع:** `export function calculateInvoiceChecksum(payload) {}`
- **المدخلات:** `payload`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.149 `priceOrderItems` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export async function priceOrderItems(inputItems,fulfillmentType,context) {}`
- **المدخلات:** `inputItems,fulfillmentType,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.150 `calculateOrderTotals` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export function calculateOrderTotals(pricedItems,businessConfig) {}`
- **المدخلات:** `pricedItems,businessConfig`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.151 `calculateBalanceDue` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export function calculateBalanceDue(total,paymentSummary) {}`
- **المدخلات:** `total,paymentSummary`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.152 `confirmNewOrder` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export async function confirmNewOrder(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.153 `appendOrderItems` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export async function appendOrderItems(orderId,input,context) {}`
- **المدخلات:** `orderId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.154 `cancelOrderItem` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export async function cancelOrderItem(orderId,itemId,input,context) {}`
- **المدخلات:** `orderId,itemId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.155 `cancelWholeOrder` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export async function cancelWholeOrder(orderId,input,context) {}`
- **المدخلات:** `orderId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.156 `restoreCancelledItemInventory` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export async function restoreCancelledItemInventory(item,context) {}`
- **المدخلات:** `item,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.157 `completeTakeawayOrder` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export async function completeTakeawayOrder(orderId,input,context) {}`
- **المدخلات:** `orderId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.158 `completeTableOrder` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export async function completeTableOrder(orderId,input,context) {}`
- **المدخلات:** `orderId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.159 `completeDeliveredOrder` 

- **المرحلة:** الطلبات الأساسية.
- **التوقيع:** `export async function completeDeliveredOrder(orderId,receipt,context) {}`
- **المدخلات:** `orderId,receipt,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.160 `markOrderItemReady` 

- **المرحلة:** التحضير.
- **التوقيع:** `export async function markOrderItemReady(itemId,input,context) {}`
- **المدخلات:** `itemId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.161 `recomputeOrderPreparationState` 

- **المرحلة:** التحضير.
- **التوقيع:** `export async function recomputeOrderPreparationState(orderId,context) {}`
- **المدخلات:** `orderId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.162 `upsertCustomerForOrder` 

- **المرحلة:** العملاء والتقييمات.
- **التوقيع:** `export async function upsertCustomerForOrder(input,orderCreatedAt,context) {}`
- **المدخلات:** `input,orderCreatedAt,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.163 `updateCustomerProfile` 

- **المرحلة:** العملاء والتقييمات.
- **التوقيع:** `export async function updateCustomerProfile(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.164 `changeCustomerStatus` 

- **المرحلة:** العملاء والتقييمات.
- **التوقيع:** `export async function changeCustomerStatus(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.165 `submitOrderReview` 

- **المرحلة:** العملاء والتقييمات.
- **التوقيع:** `export async function submitOrderReview(orderId,input,owner,context) {}`
- **المدخلات:** `orderId,input,owner,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.166 `updateOrderReview` 

- **المرحلة:** العملاء والتقييمات.
- **التوقيع:** `export async function updateOrderReview(reviewId,input,owner,context) {}`
- **المدخلات:** `reviewId,input,owner,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.167 `moderateReview` 

- **المرحلة:** العملاء والتقييمات.
- **التوقيع:** `export async function moderateReview(reviewId,input,context) {}`
- **المدخلات:** `reviewId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.168 `createPublicOrder` 

- **المرحلة:** Customer Web والتتبع.
- **التوقيع:** `export async function createPublicOrder(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.169 `issueOrderCredentials` 

- **المرحلة:** Customer Web والتتبع.
- **التوقيع:** `export async function issueOrderCredentials(order,context) {}`
- **المدخلات:** `order,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.170 `lookupPublicOrder` 

- **المرحلة:** Customer Web والتتبع.
- **التوقيع:** `export async function lookupPublicOrder(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.171 `addItemsUsingActionToken` 

- **المرحلة:** Customer Web والتتبع.
- **التوقيع:** `export async function addItemsUsingActionToken(order,input,context) {}`
- **المدخلات:** `order,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.172 `confirmCustomerReceipt` 

- **المرحلة:** Customer Web والتتبع.
- **التوقيع:** `export async function confirmCustomerReceipt(order,input,context) {}`
- **المدخلات:** `order,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.173 `createCustomerAccessSession` 

- **المرحلة:** Customer Web والتتبع.
- **التوقيع:** `export async function createCustomerAccessSession(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.174 `requireTrackingReadToken` 

- **المرحلة:** Customer Web والتتبع.
- **التوقيع:** `export async function requireTrackingReadToken(req,res,next) {}`
- **المدخلات:** `req,res,next`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.175 `requireOrderActionToken` 

- **المرحلة:** Customer Web والتتبع.
- **التوقيع:** `export async function requireOrderActionToken(req,res,next) {}`
- **المدخلات:** `req,res,next`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.176 `requireCustomerAccessSession` 

- **المرحلة:** Customer Web والتتبع.
- **التوقيع:** `export async function requireCustomerAccessSession(req,res,next) {}`
- **المدخلات:** `req,res,next`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.177 `assignDelegate` 

- **المرحلة:** المندوب والتوصيل.
- **التوقيع:** `export async function assignDelegate(orderId,input,context) {}`
- **المدخلات:** `orderId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.178 `handoverToDelegate` 

- **المرحلة:** المندوب والتوصيل.
- **التوقيع:** `export async function handoverToDelegate(assignmentId,input,context) {}`
- **المدخلات:** `assignmentId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.179 `reassignDelivery` 

- **المرحلة:** المندوب والتوصيل.
- **التوقيع:** `export async function reassignDelivery(assignmentId,input,context) {}`
- **المدخلات:** `assignmentId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.180 `recordFailedAttempt` 

- **المرحلة:** المندوب والتوصيل.
- **التوقيع:** `export async function recordFailedAttempt(assignmentId,input,context) {}`
- **المدخلات:** `assignmentId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.181 `returnDeliveryToStore` 

- **المرحلة:** المندوب والتوصيل.
- **التوقيع:** `export async function returnDeliveryToStore(assignmentId,input,context) {}`
- **المدخلات:** `assignmentId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.182 `confirmByCustomer` 

- **المرحلة:** المندوب والتوصيل.
- **التوقيع:** `export async function confirmByCustomer(orderId,credentialId,input,context) {}`
- **المدخلات:** `orderId,credentialId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.183 `confirmByAdminOverride` 

- **المرحلة:** المندوب والتوصيل.
- **التوقيع:** `export async function confirmByAdminOverride(assignmentId,input,context) {}`
- **المدخلات:** `assignmentId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.184 `openTableSession` 

- **المرحلة:** الطاولات.
- **التوقيع:** `export async function openTableSession(tableId,input,context) {}`
- **المدخلات:** `tableId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.185 `getOrOpenSessionForConfirmedProposal` 

- **المرحلة:** الطاولات.
- **التوقيع:** `export async function getOrOpenSessionForConfirmedProposal(tableId,context) {}`
- **المدخلات:** `tableId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.186 `addItemsToTableSession` 

- **المرحلة:** الطاولات.
- **التوقيع:** `export async function addItemsToTableSession(sessionId,input,context) {}`
- **المدخلات:** `sessionId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.187 `cancelTableSession` 

- **المرحلة:** الطاولات.
- **التوقيع:** `export async function cancelTableSession(sessionId,input,context) {}`
- **المدخلات:** `sessionId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.188 `closeTableSession` 

- **المرحلة:** الطاولات.
- **التوقيع:** `export async function closeTableSession(sessionId,input,context) {}`
- **المدخلات:** `sessionId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.189 `bootstrapGuestSession` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function bootstrapGuestSession(qrToken,input,context) {}`
- **المدخلات:** `qrToken,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** إدارة مورد تشغيلي أو اختباري من دون خلط قواعد المجال.
- **التنفيذ:** تحقق config → إنشاء المورد مرة → إعلان الجاهزية → إعادة Handle → تنظيف عكسي عند الفشل/الإغلاق.
- **البيانات:** Adapter واتصال بمهلة واضحة؛ لا Models مجال لمجرد فحص التشغيل.
- **الناتج والأخطاء:** Runtime/diagnostic result؛ فشل أساسي يمنع Ready ولا يترك موردًا نصف مفتوح.
- **التدقيق:** Technical logs/metrics فقط ولا Business Audit باسم موظف.

## 35.190 `refreshGuestToken` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function refreshGuestToken(sessionId,context) {}`
- **المدخلات:** `sessionId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.191 `revokeGuestSession` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function revokeGuestSession(sessionId,reason,context) {}`
- **المدخلات:** `sessionId,reason,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.192 `assertGuestScope` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function assertGuestScope(token,context) {}`
- **المدخلات:** `token,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.193 `createProposal` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function createProposal(guest,input,context) {}`
- **المدخلات:** `guest,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.194 `startProposalReview` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function startProposalReview(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.195 `requestProposalChanges` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function requestProposalChanges(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.196 `rejectProposal` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function rejectProposal(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.197 `cancelProposal` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function cancelProposal(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.198 `confirmProposal` 

- **المرحلة:** Guest Table وProposals.
- **التوقيع:** `export async function confirmProposal(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.199 `createTableServiceRequest` 

- **المرحلة:** خدمات الطاولة.
- **التوقيع:** `export async function createTableServiceRequest(owner,input,context) {}`
- **المدخلات:** `owner,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.200 `resolveTableServiceRequest` 

- **المرحلة:** خدمات الطاولة.
- **التوقيع:** `export async function resolveTableServiceRequest(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.201 `cancelTableServiceRequest` 

- **المرحلة:** خدمات الطاولة.
- **التوقيع:** `export async function cancelTableServiceRequest(id,input,context) {}`
- **المدخلات:** `id,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.202 `closeSessionServiceRequests` 

- **المرحلة:** خدمات الطاولة.
- **التوقيع:** `export async function closeSessionServiceRequests(sessionId,reason,context) {}`
- **المدخلات:** `sessionId,reason,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.203 `migrateGuestRequestsToSession` 

- **المرحلة:** خدمات الطاولة.
- **التوقيع:** `export async function migrateGuestRequestsToSession(guestId,sessionId,context) {}`
- **المدخلات:** `guestId,sessionId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.204 `requestOrderCancellation` 

- **المرحلة:** Order Cases والـCash Refund.
- **التوقيع:** `export async function requestOrderCancellation(orderId,input,requester,context) {}`
- **المدخلات:** `orderId,input,requester,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.205 `approveCancellationRequest` 

- **المرحلة:** Order Cases والـCash Refund.
- **التوقيع:** `export async function approveCancellationRequest(caseId,input,context) {}`
- **المدخلات:** `caseId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.206 `rejectCancellationRequest` 

- **المرحلة:** Order Cases والـCash Refund.
- **التوقيع:** `export async function rejectCancellationRequest(caseId,input,context) {}`
- **المدخلات:** `caseId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.207 `executeApprovedCancellation` 

- **المرحلة:** Order Cases والـCash Refund.
- **التوقيع:** `export async function executeApprovedCancellation(caseId,context) {}`
- **المدخلات:** `caseId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.208 `retryPendingCashRefund` 

- **المرحلة:** Order Cases والـCash Refund.
- **التوقيع:** `export async function retryPendingCashRefund(caseId,input,context) {}`
- **المدخلات:** `caseId,input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.209 `createNotifications` 

- **المرحلة:** الإشعارات والـRealtime.
- **التوقيع:** `export async function createNotifications(recipients,payload,context) {}`
- **المدخلات:** `recipients,payload,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.210 `markNotificationRead` 

- **المرحلة:** الإشعارات والـRealtime.
- **التوقيع:** `export async function markNotificationRead(id,employeeId,context) {}`
- **المدخلات:** `id,employeeId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.211 `markAllNotificationsRead` 

- **المرحلة:** الإشعارات والـRealtime.
- **التوقيع:** `export async function markAllNotificationsRead(employeeId,before,context) {}`
- **المدخلات:** `employeeId,before,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.212 `resolveEventRooms` 

- **المرحلة:** الإشعارات والـRealtime.
- **التوقيع:** `export function resolveEventRooms(event) {}`
- **المدخلات:** `event`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.213 `mapRealtimePayload` 

- **المرحلة:** الإشعارات والـRealtime.
- **التوقيع:** `export function mapRealtimePayload(event) {}`
- **المدخلات:** `event`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.214 `publishRealtimeEvent` 

- **المرحلة:** الإشعارات والـRealtime.
- **التوقيع:** `export async function publishRealtimeEvent(event) {}`
- **المدخلات:** `event`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.215 `applyDashboardEvent` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function applyDashboardEvent(event,context) {}`
- **المدخلات:** `event,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.216 `rebuildDashboardProjection` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function rebuildDashboardProjection(period,context) {}`
- **المدخلات:** `period,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.217 `getFinancialReportScreen` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function getFinancialReportScreen(filters,context) {}`
- **المدخلات:** `filters,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.218 `getSalesReport` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function getSalesReport(filters,context) {}`
- **المدخلات:** `filters,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.219 `getInventoryReport` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function getInventoryReport(filters,context) {}`
- **المدخلات:** `filters,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.220 `getDrawerReport` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function getDrawerReport(filters,context) {}`
- **المدخلات:** `filters,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.221 `getSupplierReport` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function getSupplierReport(filters,context) {}`
- **المدخلات:** `filters,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.222 `getDelegateReport` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function getDelegateReport(filters,context) {}`
- **المدخلات:** `filters,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.223 `requestReportExport` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function requestReportExport(input,context) {}`
- **المدخلات:** `input,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.224 `processReportExport` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function processReportExport(exportId,context) {}`
- **المدخلات:** `exportId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.225 `getReportExportStatus` 

- **المرحلة:** Dashboard والتقارير.
- **التوقيع:** `export async function getReportExportStatus(exportId,context) {}`
- **المدخلات:** `exportId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.226 `getAuditScreen` 

- **المرحلة:** سجل الأحداث والنزاهة.
- **التوقيع:** `export async function getAuditScreen(filters,context) {}`
- **المدخلات:** `filters,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.227 `getAuditEvent` 

- **المرحلة:** سجل الأحداث والنزاهة.
- **التوقيع:** `export async function getAuditEvent(id,context) {}`
- **المدخلات:** `id,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.228 `getEntityTimeline` 

- **المرحلة:** سجل الأحداث والنزاهة.
- **التوقيع:** `export async function getEntityTimeline(entityType,entityId,page,context) {}`
- **المدخلات:** `entityType,entityId,page,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.229 `calculateEventHash` 

- **المرحلة:** سجل الأحداث والنزاهة.
- **التوقيع:** `export function calculateEventHash(event,previousHash) {}`
- **المدخلات:** `event,previousHash`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.230 `verifyAuditChain` 

- **المرحلة:** سجل الأحداث والنزاهة.
- **التوقيع:** `export async function verifyAuditChain(scope,range,context) {}`
- **المدخلات:** `scope,range,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.231 `recordIntegrityFailure` 

- **المرحلة:** سجل الأحداث والنزاهة.
- **التوقيع:** `export async function recordIntegrityFailure(result,context) {}`
- **المدخلات:** `result,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.232 `createUpload` 

- **المرحلة:** الصور والملفات.
- **التوقيع:** `export async function createUpload(input,file,context) {}`
- **المدخلات:** `input,file,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.233 `markAssetReady` 

- **المرحلة:** الصور والملفات.
- **التوقيع:** `export async function markAssetReady(assetId,processed,context) {}`
- **المدخلات:** `assetId,processed,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.234 `attachAsset` 

- **المرحلة:** الصور والملفات.
- **التوقيع:** `export async function attachAsset(assetId,owner,context) {}`
- **المدخلات:** `assetId,owner,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.235 `deleteUnusedAsset` 

- **المرحلة:** الصور والملفات.
- **التوقيع:** `export async function deleteUnusedAsset(assetId,context) {}`
- **المدخلات:** `assetId,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.236 `getSignedAssetUrl` 

- **المرحلة:** الصور والملفات.
- **التوقيع:** `export async function getSignedAssetUrl(assetId,viewer,context) {}`
- **المدخلات:** `assetId,viewer,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.237 `acquireMigrationLock` 

- **المرحلة:** Migrations والـIndexes.
- **التوقيع:** `export async function acquireMigrationLock(owner,ttl) {}`
- **المدخلات:** `owner,ttl`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.238 `listPendingMigrations` 

- **المرحلة:** Migrations والـIndexes.
- **التوقيع:** `export async function listPendingMigrations() {}`
- **المدخلات:** ``؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.239 `runPendingMigrations` 

- **المرحلة:** Migrations والـIndexes.
- **التوقيع:** `export async function runPendingMigrations(context) {}`
- **المدخلات:** `context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.240 `applyMigration` 

- **المرحلة:** Migrations والـIndexes.
- **التوقيع:** `export async function applyMigration(migration,context) {}`
- **المدخلات:** `migration,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.241 `verifyMigrationChecksum` 

- **المرحلة:** Migrations والـIndexes.
- **التوقيع:** `export function verifyMigrationChecksum(migration,record) {}`
- **المدخلات:** `migration,record`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.242 `readExistingIndexes` 

- **المرحلة:** Migrations والـIndexes.
- **التوقيع:** `export async function readExistingIndexes(connection) {}`
- **المدخلات:** `connection`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** قراءة Projection مفهرسة وآمنة تخص العملية، من دون إرجاع Document كامل أو حقل سري.
- **التنفيذ:** صلاحية الرؤية → تطبيع الفلاتر → query/aggregation ثابتة → stable sort و`_id` → Mapper → Page/source metadata.
- **البيانات:** قراءة فقط، لا save أو Transaction كتابية أو Event. يمنع N+1 ويطبق `maxTimeMS`.
- **الناتج والأخطاء:** DTO أو Page؛ 400 للفلاتر، 403 للرؤية، 404 للتفاصيل، 504 للمهلة. الفشل لا يتحول لصفر/قائمة مضللة.
- **التدقيق:** Metrics دائمًا، وSensitive Read Audit للبيانات الحساسة فقط.

## 35.243 `calculateIndexDiff` 

- **المرحلة:** Migrations والـIndexes.
- **التوقيع:** `export function calculateIndexDiff(required,existing) {}`
- **المدخلات:** `required,existing`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** حساب أو تحويل حتمي قابل للاختبار ولا يغير المدخلات.
- **التنفيذ:** تحقق القيمة → تطبيع representation → تطبيق القاعدة الواحدة → إعادة قيمة جديدة. الوقت والسياسة يمران صراحة.
- **البيانات:** بلا DB أو شبكة أو Cache أو Logger، ولا Float للأموال والكميات.
- **الناتج والأخطاء:** قيمة deterministic؛ القيمة المستحيلة ترمي Validation Error ولا تتحول إلى صفر.
- **التدقيق:** لا Transaction/Audit/Event؛ المستدعي يسجل القرار في العملية الأكبر.

## 35.244 `applySafeIndexCreates` 

- **المرحلة:** Migrations والـIndexes.
- **التوقيع:** `export async function applySafeIndexCreates(diff,context) {}`
- **المدخلات:** `diff,context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.245 `createTestApp` 

- **المرحلة:** الاختبارات الشاملة والأداء.
- **التوقيع:** `export async function createTestApp(overrides) {}`
- **المدخلات:** `overrides`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.246 `startReplicaSet` 

- **المرحلة:** الاختبارات الشاملة والأداء.
- **التوقيع:** `export async function startReplicaSet() {}`
- **المدخلات:** ``؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** إدارة مورد تشغيلي أو اختباري من دون خلط قواعد المجال.
- **التنفيذ:** تحقق config → إنشاء المورد مرة → إعلان الجاهزية → إعادة Handle → تنظيف عكسي عند الفشل/الإغلاق.
- **البيانات:** Adapter واتصال بمهلة واضحة؛ لا Models مجال لمجرد فحص التشغيل.
- **الناتج والأخطاء:** Runtime/diagnostic result؛ فشل أساسي يمنع Ready ولا يترك موردًا نصف مفتوح.
- **التدقيق:** Technical logs/metrics فقط ولا Business Audit باسم موظف.

## 35.247 `freezeClock` 

- **المرحلة:** الاختبارات الشاملة والأداء.
- **التوقيع:** `export function freezeClock(isoDate) {}`
- **المدخلات:** `isoDate`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** إدارة مورد تشغيلي أو اختباري من دون خلط قواعد المجال.
- **التنفيذ:** تحقق config → إنشاء المورد مرة → إعلان الجاهزية → إعادة Handle → تنظيف عكسي عند الفشل/الإغلاق.
- **البيانات:** Adapter واتصال بمهلة واضحة؛ لا Models مجال لمجرد فحص التشغيل.
- **الناتج والأخطاء:** Runtime/diagnostic result؛ فشل أساسي يمنع Ready ولا يترك موردًا نصف مفتوح.
- **التدقيق:** Technical logs/metrics فقط ولا Business Audit باسم موظف.

## 35.248 `runConcurrent` 

- **المرحلة:** الاختبارات الشاملة والأداء.
- **التوقيع:** `export async function runConcurrent(actions) {}`
- **المدخلات:** `actions`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.249 `assertLedgerProjectionMatches` 

- **المرحلة:** الاختبارات الشاملة والأداء.
- **التوقيع:** `export async function assertLedgerProjectionMatches(scope) {}`
- **المدخلات:** `scope`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** منع الطلب غير المصرح أو غير الصحيح قبل المنطق المكلف.
- **التنفيذ:** استخراج المصدر المسموح → تحقق الصيغة/الانتهاء → حل الهوية من الخادم → مقارنة scope/permission/version → تمرير Context أو الرفض.
- **البيانات:** Projection مفهرسة صغيرة؛ لا Token أو Password أو Fingerprint خام في Logs.
- **الناتج والأخطاء:** verified context/next؛ 400/401/403/409/429 حسب السبب، ولا Business mutation.
- **التدقيق:** الرفض الأمني Audit منقح، والنجاح لا يصدر Domain Event.

## 35.250 `measureQueryCount` 

- **المرحلة:** الاختبارات الشاملة والأداء.
- **التوقيع:** `export async function measureQueryCount(work) {}`
- **المدخلات:** `work`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** إدارة مورد تشغيلي أو اختباري من دون خلط قواعد المجال.
- **التنفيذ:** تحقق config → إنشاء المورد مرة → إعلان الجاهزية → إعادة Handle → تنظيف عكسي عند الفشل/الإغلاق.
- **البيانات:** Adapter واتصال بمهلة واضحة؛ لا Models مجال لمجرد فحص التشغيل.
- **الناتج والأخطاء:** Runtime/diagnostic result؛ فشل أساسي يمنع Ready ولا يترك موردًا نصف مفتوح.
- **التدقيق:** Technical logs/metrics فقط ولا Business Audit باسم موظف.

## 35.251 `runStartupDiagnostics` 

- **المرحلة:** التشغيل التجريبي والإطلاق.
- **التوقيع:** `export async function runStartupDiagnostics(runtime) {}`
- **المدخلات:** `runtime`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.252 `runSmokeSuite` 

- **المرحلة:** التشغيل التجريبي والإطلاق.
- **التوقيع:** `export async function runSmokeSuite(baseUrl,credentials) {}`
- **المدخلات:** `baseUrl,credentials`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ مهمة قابلة للاستئناف من دون تكرار الأثر التجاري.
- **التنفيذ:** Distributed Lease → Batch محدودة → claim ذري → Service idempotent → checkpoint → retry/backoff → Dead Letter بعد الحد.
- **البيانات:** Transaction قصيرة لكل عنصر/دفعة، ولا تحميل شامل أو Transaction بطول دورة Worker.
- **الناتج والأخطاء:** processed/succeeded/failed/nextCursor؛ تصنيف transient/permanent و`lastErrorSafe`.
- **التدقيق:** Job metrics وstart/end/failure؛ الـBusiness Event تصدره الخدمة المنفذة مرة واحدة.

## 35.253 `verifyPostDeployIntegrity` 

- **المرحلة:** التشغيل التجريبي والإطلاق.
- **التوقيع:** `export async function verifyPostDeployIntegrity(context) {}`
- **المدخلات:** `context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.254 `rollbackApplicationVersion` 

- **المرحلة:** التشغيل التجريبي والإطلاق.
- **التوقيع:** `export async function rollbackApplicationVersion(release) {}`
- **المدخلات:** `release`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.255 `executeCommand` 

- **المرحلة:** التشغيل التجريبي والإطلاق.
- **التوقيع:** `export async function executeCommand(input, context) {`
- **المدخلات:** `input, context`؛ تتحقق الأنواع والحدود والهوية والنسخة، وcontext لا يأخذ actor من Body.
- **الهدف:** تنفيذ أمر المجال المسمى في مرحلة الملف مع إعادة التحقق من الحالة الفعلية قبل الكتابة.
- **التنفيذ:** load references → Policy/state/version → بناء خطة التغيير → استخدام Transaction → conditional writes/ledgers → Audit/Outbox → Commit → Domain Result.
- **البيانات:** Models المملوكة فقط؛ أي موديول آخر عبر Public Service وبنفس session. لا Network داخل Mongo Transaction.
- **الناتج والأخطاء:** entity/related/version/eventSequence؛ 404/409 وكود المجال. قبل Commit بلا أثر، وUnknown Commit يحسم بـoperationRequest.
- **التدقيق:** Audit وOutbox داخل Transaction، وSocket/Cache invalidation بعد Commit فقط.

## 35.256 قاعدة التطبيق

بطاقة الـFunction وشرح مرحلتها عقد واحد. أي تغيير في Signature أو أثر أو Transaction يحدث التوثيق والـOpenAPI والاختبار قبل دمج الكود، ويمنع إنشاء Function ثانية لنفس المسؤولية.

