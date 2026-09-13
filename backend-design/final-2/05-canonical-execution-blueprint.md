# خطة التنفيذ المرجعية — Canonical Execution Blueprint

هذا الملف هو خطة التنفيذ المنظمة والمعتمدة للنطاق الحالي. يضمن اكتمال التخطيط عبر ربط المتطلبات والعمليات والـAPI والـFunctions والبيانات والأحداث والاختبارات. المقصود بـ100% هنا: كل وظيفة متفق عليها في وثائق `final-2` لها موضع تنفيذ واختبار وتتبع؛ صحة التطبيق الفعلي لا تعتمد إلا بعد مرور بوابات الاختبار المذكورة.

## طريقة استخدام الملف

1. مدير المشروع يختار Phase بالترتيب.
2. المطور ينفذ Operations الخاصة بالمرحلة فقط.
3. كل Operation يجب أن تملك Trace Record: `requirementId, operationId, route, permission, controller, service, collections, transaction, auditEvent, realtimeEvent, tests`.
4. CI يرفض Route غير موجودة في OpenAPI، وFunction عامة بلا اختبار/مستخدم، وOperation بلا Permission/Audit policy.
5. لا تغلق Phase قبل نجاح Definition of Done الخاص بها وسجل التغطية في آخر الملف.

## قواعد ثابتة

- الدفع `CASH` فقط؛ `DIRECT` يدخل الدرج عند التسليم و`COD` عهدة مندوبوب حتى التسوية.
- لا يوجد موديول إعدادات ولا Payment Gateway.
- Mongo Replica Set إلزامي للـTransactions.
- القوائم `limit=10`، والـscreen endpoint لأول Render، وSocket بدل polling.
- كل Mutation حرجة: Idempotency + version/state guard + Audit + Outbox.
- لا يوجد Network call داخل Mongo Transaction.

---

# الجزء A — خريطة التسليم

## بوابة G0: العقد

تثبت Enums وERD وSchemas وOpenAPI وError codes. الناتج قابل للقراءة آليًا، ولا يبدأ Model قبل اكتماله.

## بوابة G1: الأساس التقني

App/bootstrap/config، Mongo/Decimal/Transaction، HTTP envelopes، Auth context، Idempotency، Audit، Outbox، Realtime foundations.

## بوابة G2: الإدارة والهوية

Employees/Roles/Permissions/Devices/Auth/Attendance. بعدها يمكن حماية كل Endpoint واختبار actor الحقيقي.

## بوابة G3: الكتالوج والمخزون

Suppliers/Accounts، Units/Materials/Batches/Movements، Warnings، Products/Recipes/Catalog، Purchases/Returns.

## بوابة G4: البيع والتشغيل

Drawer، Cash Payments/Invoices، Orders/Allocations، Preparation، Customers/Reviews، Customer Web، Delivery.

## بوابة G5: الطاولات

Tables/Sessions، Guest Tokens، Proposals، Table Services، الإغلاق والفاتورة والتقييم.

## بوابة G6: الرقابة والإطلاق

Notifications، Dashboard، Reports، Audit UI، Media، Migrations/Indexes، Performance/Security/Restore/Deployment.

---

# الجزء B — سجل العمليات الكامل

صيغة كل سطر: `Operation ID — Entry → Core Function → Data effects → Required proof`.

## SUP — الموردون

- `SUP-01` إنشاء مورد — POST supplier → `createSupplier` → suppliers+supplierAccounts → Transaction/Audit/created test.
- `SUP-02` تعديل مورد — PATCH → `updateSupplier` → supplier version → conflict/history tests.
- `SUP-03` تغيير الحالة — command → `setSupplierStatus` → يمنع الاستخدام الجديد → dependency tests.
- `SUP-04` دين يدوي — `recordDebt` → account entry+balance → no drawer test.
- `SUP-05` مستحق يدوي — `recordReceivable` → entry+balance → no drawer test.
- `SUP-06` دفع دين — `payDebt` → entry+drawer OUT → atomic/insufficient/double-click tests.
- `SUP-07` تحصيل مستحق — `collectReceivable` → entry+drawer IN → atomic tests.
- `SUP-08` عكس قيد — `reverseSupplierEntry` → reversal+drawer inverse عند الحاجة → one-reversal test.
- `SUP-09` شاشة/تفاصيل/سجل — Queries مفهرسة → DTOs pages مستقلة → query-budget tests.

## INV — المواد والمخزون والتحذيرات

- `INV-01` إنشاء مادة مع المورد — `createRawMaterial` → rawMaterials → active supplier/unit/conversion tests.
- `INV-02` تعديل/إيقاف — `updateRawMaterial/changeMaterialStatus` → lock/version tests.
- `INV-03` قفل المورد والوحدات — `lockMaterialSupplierAndUnits` → first batch/recipe race test.
- `INV-04` تسجيل Batch — Inventory public service → batch+movement → purchase linkage test.
- `INV-05` محاكاة تكلفة — `simulateRecipeRequirements` → read only plan → no-write test.
- `INV-06` تخصيص بيع — `allocateRecipeRequirements` → batches+movements+allocations → no-negative/concurrency test.
- `INV-07` استعادة — `restoreAllocations` → exact batches/value → one-restore test.
- `INV-08` سحب نهائي — `withdrawBatchQuantity` → batch+WITHDRAWAL → no restore test.
- `INV-09` ترتيب أولوية — reorder service → priorities+version → sale race test.
- `WAR-01..06` Low/expiring/expired/shift-long، summary، cache invalidation → Cairo/source-version/data-quality tests.

## PUR — المشتريات والمرتجعات

- `PUR-01..03` create/update/delete Draft → group/items/totals → state/version tests.
- `PUR-04` split suppliers → supplier invoices+splitVersion → stale split test.
- `PUR-05` register item → Batch+Movement+links → atomic/double register test.
- `PUR-06` register many → ≤50 items transaction → all-or-none test.
- `PUR-07` group/invoice print → snapshots → read-only test.
- `RET-01` validate return plan → batches read/versions → no-write on invalid test.
- `RET-02` execute return → return/items/movements/batches → concurrency/idempotency test.
- `RET-03` list/detail/print → historical supplier snapshots → pagination test.

## PRD — المنتجات

- `PRD-01..02` category create/update/status/delete-unused.
- `PRD-03..05` product create/update/visibility/status/delete-unused.
- `PRD-06` type create/update/order/disable.
- `PRD-07` size create/update/price/disable.
- `PRD-08` recipe replace → validate materials+lock+version.
- `PRD-09` addon create/update/recipe/cost completeness.
- `PRD-10` expected cost → inventory simulation+profit/margin.
- `CAT-01..03` catalog list/detail/AI projection → ETag/no recipe leakage tests.

## DRW/PAY — الدرج والدفع الكاش

- `DRW-01` open shift → opening/next warning → one-active test.
- `DRW-02..03` manual IN/OUT → ledger+projection → classification/balance tests.
- `DRW-04` source transaction → unique source → duplicate test.
- `DRW-05` reverse manual → inverse movement → one reversal test.
- `DRW-06` close → CLOSING/recompute/reconciliation/CLOSED → movement race/mismatch tests.
- `DRW-07` 12h warnings → alerts+notifications+outbox → 12/24/downtime tests.
- `PAY-01` direct cash → payment+drawer IN.
- `PAY-02` COD collection → payment/delegate custody بلا drawer.
- `PAY-03` COD settlement → drawer IN unique.
- `PAY-04` cash refund → drawer OUT أو PENDING_CASH_REFUND.
- `INVOC-01..03` preview/finalize/print event → immutable checksum tests.

## ORD/PREP — الطلبات والتحضير

- `ORD-01` confirm order → pricing/snapshots/customer/inventory/order/events transaction.
- `ORD-02` append items → allocations/totals وREADY→PREPARING.
- `ORD-03` cancel item → exact restore/totals/refund impact.
- `ORD-04` cancel order → all restore/case/payment policy.
- `ORD-05` complete Takeaway → cash+invoice+COMPLETED.
- `ORD-06` complete Table → cash/session/services/invoice.
- `ORD-07` complete Delivery → receipt+invoice، COD منفصل.
- `ORD-08` detail/history/tracking/print projections.
- `PREP-01` mark item ready → item event+order progress.
- `PREP-02` last item ready → order READY.
- `PREP-03` screen/current/ready/detail → no N+1/realtime sync.

## CUS/WEB/REV — العملاء والواجهة والتقييم

- `CUS-01` atomic upsert by phone؛ `CUS-02` latest profile ordering؛ `CUS-03` Admin correction/status.
- `WEB-01` public checkout → Order+credentials، raw tokens مرة واحدة.
- `WEB-02` lookup limited؛ `WEB-03` read tracking؛ `WEB-04` append using action token.
- `WEB-05` cancellation request؛ `WEB-06` customer receipt؛ `WEB-07` access session/history recovery.
- `REV-01` submit after completed؛ `REV-02` revision؛ `REV-03` moderation preserving original.
- `AI-01` DeepSeek chat؛ `AI-02` product tool only؛ `AI-03` suggestion validation؛ timeout/rate/prompt-injection tests.

## DEL — المندوب

- `DEL-01` delegate CRUD/status/capacity.
- `DEL-02` assign one active؛ `DEL-03` handover and receipt AVAILABLE.
- `DEL-04` reassign with reason؛ `DEL-05` failed attempt؛ `DEL-06` returned to store.
- `DEL-07` customer confirmation؛ `DEL-08` Admin override permission+reason.
- `DEL-09` WhatsApp link-open event فقط؛ `DEL-10` cash ledger/settlement/history.

## TBL/SVC — الطاولات والخدمات

- `TBL-01` 20-card board derived status؛ `TBL-02` open session once.
- `TBL-03` Admin first order؛ `TBL-04` append؛ `TBL-05` cancel؛ `TBL-06` close and print.
- `GST-01` QR bootstrap؛ `GST-02` refresh/revoke/scope؛ old QR rejected.
- `PRO-01` create proposal + waiter without stock؛ `PRO-02` review/change/reject/cancel.
- `PRO-03` confirm → session/order/inventory atomically؛ conflict/no-stock tests.
- `SVC-01` five service types؛ `SVC-02` duplicate owner/type؛ `SVC-03` resolve/cancel.
- `SVC-04` guest→session link؛ `SVC-05` session close resolves BILL/cancels others.

## EMP/AUTH/ATT — الموظفون والأمان والحضور

- `EMP-01..05` create/update/status/password reveal/matrix/queries.
- `AUTH-01` login approved؛ `AUTH-02` pending device؛ `AUTH-03` approve/block؛ `AUTH-04` refresh rotate؛ `AUTH-05` logout/revoke.
- `ATT-01` check-in once؛ `ATT-02` Admin checkout؛ `ATT-03` force close؛ `ATT-04` adjustment with history.
- كل مسار يختبر password/token redaction وpermissionsVersion/device revocation.

## RPT/AUD/NTF/OPS — الرقابة والتشغيل

- `DASH-01` screen projection؛ `DASH-02` event projector؛ `DASH-03` rebuild/checkpoint.
- `RPT-01..06` financial screen/sales/inventory/drawer/supplier/delegate؛ `RPT-07` async export.
- `AUD-01` write critical event؛ `AUD-02` screen/detail/timeline؛ `AUD-03` chain verify؛ `AUD-04` export.
- `NTF-01` create deduplicated؛ `NTF-02` read/read-all؛ `RT-01` publish rooms؛ `RT-02` reconnect sync.
- `MED-01` upload/scan/ready؛ `MED-02` attach؛ `MED-03` signed URL؛ `MED-04` delete unused.
- `OPS-01` migrations lock/checksum/chunks؛ `OPS-02` indexes diff/safe create؛ `OPS-03` restore/integrity؛ `OPS-04` graceful deploy.

---

# الجزء C — الخطة المرحلية التفصيلية

يأتي النص التالي من الخطة التفصيلية، مع توقيعات الـFunctions وآلية التنفيذ والاختبارات وExit Criteria لكل مرحلة.
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



---
# الجزء D — فهرس Functions حسب المرحلة


## المرحلة 0 — تثبيت القرارات والعقود

- `getRequiredIndexes` — `export function getRequiredIndexes() {}`
- `getIndexesForCollection` — `export function getIndexesForCollection(collectionName) {}`

## المرحلة 1 — Scaffold والتشغيل والإعداد

- `loadEnv` — `export function loadEnv(source = process.env) {}`
- `assertRequiredEnv` — `export function assertRequiredEnv(config) {}`
- `redactConfig` — `export function redactConfig(config) {}`
- `loadBusinessConfig` — `export function loadBusinessConfig(env) {}`
- `getPricingSnapshot` — `export function getPricingSnapshot(config) {}`
- `getBusinessProfileSnapshot` — `export function getBusinessProfileSnapshot(config) {}`
- `createApp` — `export function createApp({ config, dependencies }) {}`
- `bootstrap` — `export async function bootstrap() {}`
- `shutdown` — `export async function shutdown(runtime, signal) {}`

## المرحلة 10 — التحذيرات

- `evaluateLowStock` — `export function evaluateLowStock(material,stock) {}`
- `evaluateBatchExpiry` — `export function evaluateBatchExpiry(batch,businessToday,days) {}`
- `calculateDaysUntilExpiry` — `export function calculateDaysUntilExpiry(expiryOn,businessToday) {}`
- `mergeWarningSummary` — `export function mergeWarningSummary(items,shiftAlerts) {}`
- `getWarningsScreen` — `export async function getWarningsScreen(filters,context) {}`
- `getWarningsSummary` — `export async function getWarningsSummary(context) {}`

## المرحلة 11 — المنتجات والوصفات والكتالوج

- `createCategory` — `export async function createCategory(input,context) {}`
- `updateCategory` — `export async function updateCategory(id,patch,context) {}`
- `createProduct` — `export async function createProduct(input,context) {}`
- `updateProduct` — `export async function updateProduct(id,patch,context) {}`
- `setProductVisibility` — `export async function setProductVisibility(id,input,context) {}`
- `addProductType` — `export async function addProductType(productId,input,context) {}`
- `addProductSize` — `export async function addProductSize(productId,input,context) {}`
- `upsertAddon` — `export async function upsertAddon(productId,input,context) {}`
- `replaceSizeRecipe` — `export async function replaceSizeRecipe(sizeId,input,context) {}`
- `validateRecipeIngredients` — `export async function validateRecipeIngredients(ingredients,context) {}`
- `buildRecipeSnapshot` — `export async function buildRecipeSnapshot(sizeId,addonIds,context) {}`

## المرحلة 12 — المشتريات

- `createPurchaseGroup` — `export async function createPurchaseGroup(input,context) {}`
- `updatePurchaseGroup` — `export async function updatePurchaseGroup(id,input,context) {}`
- `deleteDraftPurchaseGroup` — `export async function deleteDraftPurchaseGroup(id,input,context) {}`
- `registerPurchaseItem` — `export async function registerPurchaseItem(itemId,input,context) {}`
- `registerPurchaseItems` — `export async function registerPurchaseItems(groupId,input,context) {}`
- `recomputePurchaseStatuses` — `export async function recomputePurchaseStatuses(groupId,context) {}`

## المرحلة 13 — مرتجعات المشتريات

- `createPurchaseReturn` — `export async function createPurchaseReturn(input,context) {}`
- `validateReturnItems` — `export async function validateReturnItems(items,context) {}`
- `executeReturnPlan` — `export async function executeReturnPlan(plan,context) {}`

## المرحلة 14 — الدرج الأساسي

- `openShift` — `export async function openShift(input,context) {}`
- `createManualCashIn` — `export async function createManualCashIn(shiftId,input,context) {}`
- `createManualCashOut` — `export async function createManualCashOut(shiftId,input,context) {}`
- `closeShift` — `export async function closeShift(shiftId,input,context) {}`
- `createSourceCashTransaction` — `export async function createSourceCashTransaction(input,context) {}`
- `reverseManualCashTransaction` — `export async function reverseManualCashTransaction(transactionId,input,context) {}`
- `calculateShiftLedgerTotals` — `export async function calculateShiftLedgerTotals(shiftId,context) {}`
- `findDueOpenShifts` — `export async function findDueOpenShifts(now,limit) {}`
- `emitDueShiftWarnings` — `export async function emitDueShiftWarnings(shiftId,now,context) {}`
- `calculateDueThresholds` — `export function calculateDueThresholds(openedAt,lastThreshold,now) {}`

## المرحلة 15 — الدفع الكاش والفواتير

- `collectDirectCash` — `export async function collectDirectCash(orderId,input,context) {}`
- `recordCodCollection` — `export async function recordCodCollection(orderId,assignmentId,input,context) {}`
- `settleDelegateCash` — `export async function settleDelegateCash(assignmentId,input,context) {}`
- `createCashRefund` — `export async function createCashRefund(paymentId,input,context) {}`
- `calculateOrderPaymentSummary` — `export async function calculateOrderPaymentSummary(orderId,context) {}`
- `buildInvoicePreview` — `export async function buildInvoicePreview(orderId,context) {}`
- `finalizeInvoice` — `export async function finalizeInvoice(orderId,context) {}`
- `recordInvoicePrint` — `export async function recordInvoicePrint(invoiceId,input,context) {}`
- `calculateInvoiceChecksum` — `export function calculateInvoiceChecksum(payload) {}`

## المرحلة 16 — الطلبات الأساسية

- `priceOrderItems` — `export async function priceOrderItems(inputItems,fulfillmentType,context) {}`
- `calculateOrderTotals` — `export function calculateOrderTotals(pricedItems,businessConfig) {}`
- `calculateBalanceDue` — `export function calculateBalanceDue(total,paymentSummary) {}`
- `confirmNewOrder` — `export async function confirmNewOrder(input,context) {}`
- `appendOrderItems` — `export async function appendOrderItems(orderId,input,context) {}`
- `cancelOrderItem` — `export async function cancelOrderItem(orderId,itemId,input,context) {}`
- `cancelWholeOrder` — `export async function cancelWholeOrder(orderId,input,context) {}`
- `restoreCancelledItemInventory` — `export async function restoreCancelledItemInventory(item,context) {}`
- `completeTakeawayOrder` — `export async function completeTakeawayOrder(orderId,input,context) {}`
- `completeTableOrder` — `export async function completeTableOrder(orderId,input,context) {}`
- `completeDeliveredOrder` — `export async function completeDeliveredOrder(orderId,receipt,context) {}`

## المرحلة 17 — التحضير

- `markOrderItemReady` — `export async function markOrderItemReady(itemId,input,context) {}`
- `recomputeOrderPreparationState` — `export async function recomputeOrderPreparationState(orderId,context) {}`

## المرحلة 18 — العملاء والتقييمات

- `upsertCustomerForOrder` — `export async function upsertCustomerForOrder(input,orderCreatedAt,context) {}`
- `updateCustomerProfile` — `export async function updateCustomerProfile(id,input,context) {}`
- `changeCustomerStatus` — `export async function changeCustomerStatus(id,input,context) {}`
- `submitOrderReview` — `export async function submitOrderReview(orderId,input,owner,context) {}`
- `updateOrderReview` — `export async function updateOrderReview(reviewId,input,owner,context) {}`
- `moderateReview` — `export async function moderateReview(reviewId,input,context) {}`

## المرحلة 19 — Customer Web والتتبع

- `createPublicOrder` — `export async function createPublicOrder(input,context) {}`
- `issueOrderCredentials` — `export async function issueOrderCredentials(order,context) {}`
- `lookupPublicOrder` — `export async function lookupPublicOrder(input,context) {}`
- `addItemsUsingActionToken` — `export async function addItemsUsingActionToken(order,input,context) {}`
- `confirmCustomerReceipt` — `export async function confirmCustomerReceipt(order,input,context) {}`
- `createCustomerAccessSession` — `export async function createCustomerAccessSession(input,context) {}`
- `requireTrackingReadToken` — `export async function requireTrackingReadToken(req,res,next) {}`
- `requireOrderActionToken` — `export async function requireOrderActionToken(req,res,next) {}`
- `requireCustomerAccessSession` — `export async function requireCustomerAccessSession(req,res,next) {}`

## المرحلة 2 — Platform HTTP والأخطاء والـValidation

- `assertOrThrow` — `export function assertOrThrow(condition, errorFactory) {}`
- `sendSuccess` — `export function sendSuccess(res, data, meta = {}) {}`
- `sendCreated` — `export function sendCreated(res, data, meta = {}) {}`
- `sendList` — `export function sendList(res, items, pageMeta, extra = {}) {}`
- `sendAccepted` — `export function sendAccepted(res, data, meta = {}) {}`
- `requestIdMiddleware` — `export function requestIdMiddleware(req,res,next) {}`
- `createCorrelationId` — `export function createCorrelationId() {}`
- `validate` — `export function validate({params,query,body}) {}`
- `formatValidationIssues` — `export function formatValidationIssues(issues) {}`
- `parsePage` — `export function parsePage(query) {}`
- `buildSkipLimit` — `export function buildSkipLimit({page,limit}) {}`
- `buildPageMeta` — `export function buildPageMeta({page,limit,totalItems,sort}) {}`
- `appendStableTieBreaker` — `export function appendStableTieBreaker(sort) {}`
- `notFoundHandler` — `export function notFoundHandler(req,res,next) {}`
- `errorHandler` — `export function errorHandler(err,req,res,next) {}`
- `mapMongoError` — `export function mapMongoError(err) {}`

## المرحلة 20 — المندوب والتوصيل

- `assignDelegate` — `export async function assignDelegate(orderId,input,context) {}`
- `handoverToDelegate` — `export async function handoverToDelegate(assignmentId,input,context) {}`
- `reassignDelivery` — `export async function reassignDelivery(assignmentId,input,context) {}`
- `recordFailedAttempt` — `export async function recordFailedAttempt(assignmentId,input,context) {}`
- `returnDeliveryToStore` — `export async function returnDeliveryToStore(assignmentId,input,context) {}`
- `confirmByCustomer` — `export async function confirmByCustomer(orderId,credentialId,input,context) {}`
- `confirmByAdminOverride` — `export async function confirmByAdminOverride(assignmentId,input,context) {}`

## المرحلة 21 — الطاولات

- `openTableSession` — `export async function openTableSession(tableId,input,context) {}`
- `getOrOpenSessionForConfirmedProposal` — `export async function getOrOpenSessionForConfirmedProposal(tableId,context) {}`
- `addItemsToTableSession` — `export async function addItemsToTableSession(sessionId,input,context) {}`
- `cancelTableSession` — `export async function cancelTableSession(sessionId,input,context) {}`
- `closeTableSession` — `export async function closeTableSession(sessionId,input,context) {}`

## المرحلة 22 — Guest Table وProposals

- `bootstrapGuestSession` — `export async function bootstrapGuestSession(qrToken,input,context) {}`
- `refreshGuestToken` — `export async function refreshGuestToken(sessionId,context) {}`
- `revokeGuestSession` — `export async function revokeGuestSession(sessionId,reason,context) {}`
- `assertGuestScope` — `export async function assertGuestScope(token,context) {}`
- `createProposal` — `export async function createProposal(guest,input,context) {}`
- `startProposalReview` — `export async function startProposalReview(id,input,context) {}`
- `requestProposalChanges` — `export async function requestProposalChanges(id,input,context) {}`
- `rejectProposal` — `export async function rejectProposal(id,input,context) {}`
- `cancelProposal` — `export async function cancelProposal(id,input,context) {}`
- `confirmProposal` — `export async function confirmProposal(id,input,context) {}`

## المرحلة 23 — خدمات الطاولة

- `createTableServiceRequest` — `export async function createTableServiceRequest(owner,input,context) {}`
- `resolveTableServiceRequest` — `export async function resolveTableServiceRequest(id,input,context) {}`
- `cancelTableServiceRequest` — `export async function cancelTableServiceRequest(id,input,context) {}`
- `closeSessionServiceRequests` — `export async function closeSessionServiceRequests(sessionId,reason,context) {}`
- `migrateGuestRequestsToSession` — `export async function migrateGuestRequestsToSession(guestId,sessionId,context) {}`

## المرحلة 24 — Order Cases والـCash Refund

- `requestOrderCancellation` — `export async function requestOrderCancellation(orderId,input,requester,context) {}`
- `approveCancellationRequest` — `export async function approveCancellationRequest(caseId,input,context) {}`
- `rejectCancellationRequest` — `export async function rejectCancellationRequest(caseId,input,context) {}`
- `executeApprovedCancellation` — `export async function executeApprovedCancellation(caseId,context) {}`
- `retryPendingCashRefund` — `export async function retryPendingCashRefund(caseId,input,context) {}`

## المرحلة 25 — الإشعارات والـRealtime

- `createNotifications` — `export async function createNotifications(recipients,payload,context) {}`
- `markNotificationRead` — `export async function markNotificationRead(id,employeeId,context) {}`
- `markAllNotificationsRead` — `export async function markAllNotificationsRead(employeeId,before,context) {}`
- `resolveEventRooms` — `export function resolveEventRooms(event) {}`
- `mapRealtimePayload` — `export function mapRealtimePayload(event) {}`
- `publishRealtimeEvent` — `export async function publishRealtimeEvent(event) {}`

## المرحلة 26 — Dashboard والتقارير

- `applyDashboardEvent` — `export async function applyDashboardEvent(event,context) {}`
- `rebuildDashboardProjection` — `export async function rebuildDashboardProjection(period,context) {}`
- `getFinancialReportScreen` — `export async function getFinancialReportScreen(filters,context) {}`
- `getSalesReport` — `export async function getSalesReport(filters,context) {}`
- `getInventoryReport` — `export async function getInventoryReport(filters,context) {}`
- `getDrawerReport` — `export async function getDrawerReport(filters,context) {}`
- `getSupplierReport` — `export async function getSupplierReport(filters,context) {}`
- `getDelegateReport` — `export async function getDelegateReport(filters,context) {}`
- `requestReportExport` — `export async function requestReportExport(input,context) {}`
- `processReportExport` — `export async function processReportExport(exportId,context) {}`
- `getReportExportStatus` — `export async function getReportExportStatus(exportId,context) {}`

## المرحلة 27 — سجل الأحداث والنزاهة

- `getAuditScreen` — `export async function getAuditScreen(filters,context) {}`
- `getAuditEvent` — `export async function getAuditEvent(id,context) {}`
- `getEntityTimeline` — `export async function getEntityTimeline(entityType,entityId,page,context) {}`
- `calculateEventHash` — `export function calculateEventHash(event,previousHash) {}`
- `verifyAuditChain` — `export async function verifyAuditChain(scope,range,context) {}`
- `recordIntegrityFailure` — `export async function recordIntegrityFailure(result,context) {}`

## المرحلة 28 — الصور والملفات

- `createUpload` — `export async function createUpload(input,file,context) {}`
- `markAssetReady` — `export async function markAssetReady(assetId,processed,context) {}`
- `attachAsset` — `export async function attachAsset(assetId,owner,context) {}`
- `deleteUnusedAsset` — `export async function deleteUnusedAsset(assetId,context) {}`
- `getSignedAssetUrl` — `export async function getSignedAssetUrl(assetId,viewer,context) {}`

## المرحلة 29 — Migrations والـIndexes

- `acquireMigrationLock` — `export async function acquireMigrationLock(owner,ttl) {}`
- `listPendingMigrations` — `export async function listPendingMigrations() {}`
- `runPendingMigrations` — `export async function runPendingMigrations(context) {}`
- `applyMigration` — `export async function applyMigration(migration,context) {}`
- `verifyMigrationChecksum` — `export function verifyMigrationChecksum(migration,record) {}`
- `readExistingIndexes` — `export async function readExistingIndexes(connection) {}`
- `calculateIndexDiff` — `export function calculateIndexDiff(required,existing) {}`
- `applySafeIndexCreates` — `export async function applySafeIndexCreates(diff,context) {}`

## المرحلة 3 — Mongo وDecimal والـTransactions

- `connectMongo` — `export async function connectMongo(config) {}`
- `disconnectMongo` — `export async function disconnectMongo() {}`
- `getConnectionHealth` — `export function getConnectionHealth() {}`
- `decimal` — `export function decimal(value) {}`
- `add` — `export function add(a,b) {}`
- `subtract` — `export function subtract(a,b) {}`
- `multiply` — `export function multiply(a,b) {}`
- `divide` — `export function divide(a,b,scale) {}`
- `compare` — `export function compare(a,b) {}`
- `isPositive` — `export function isPositive(value) {}`
- `toApiString` — `export function toApiString(value) {}`
- `runInTransaction` — `export async function runInTransaction(work, context, options = {}) {}`
- `isTransientTransactionError` — `export function isTransientTransactionError(error) {}`
- `isUnknownCommitResult` — `export function isUnknownCommitResult(error) {}`

## المرحلة 30 — الاختبارات الشاملة والأداء

- `createTestApp` — `export async function createTestApp(overrides) {}`
- `startReplicaSet` — `export async function startReplicaSet() {}`
- `freezeClock` — `export function freezeClock(isoDate) {}`
- `runConcurrent` — `export async function runConcurrent(actions) {}`
- `assertLedgerProjectionMatches` — `export async function assertLedgerProjectionMatches(scope) {}`
- `measureQueryCount` — `export async function measureQueryCount(work) {}`

## المرحلة 31 — التشغيل التجريبي والإطلاق

- `runStartupDiagnostics` — `export async function runStartupDiagnostics(runtime) {}`
- `runSmokeSuite` — `export async function runSmokeSuite(baseUrl,credentials) {}`
- `verifyPostDeployIntegrity` — `export async function verifyPostDeployIntegrity(context) {}`
- `rollbackApplicationVersion` — `export async function rollbackApplicationVersion(release) {}`
- `executeCommand` — `export async function executeCommand(input, context) {`

## المرحلة 4 — Idempotency وAudit وOutbox

- `beginOperation` — `export async function beginOperation({actorId,scope,key,requestHash,leaseMs},context) {}`
- `completeOperation` — `export async function completeOperation(operationId,responseSnapshot,context) {}`
- `failOperation` — `export async function failOperation(operationId,errorSnapshot,context) {}`
- `getOperationResult` — `export async function getOperationResult({actorId,scope,key}) {}`
- `hashCanonicalRequest` — `export function hashCanonicalRequest(input) {}`
- `writeAudit` — `export async function writeAudit(event, context) {}`
- `buildChanges` — `export function buildChanges(before,after,allowlist) {}`
- `buildEntityContext` — `export function buildEntityContext(entity,snapshot) {}`
- `enqueueDomainEvent` — `export async function enqueueDomainEvent({aggregateType,aggregateId,eventType,payload,sequence},context) {}`
- `claimOutboxBatch` — `export async function claimOutboxBatch({workerId,limit,leaseMs}) {}`
- `publishClaimedEvent` — `export async function publishClaimedEvent(event) {}`
- `markPublished` — `export async function markPublished(eventId) {}`
- `scheduleRetry` — `export async function scheduleRetry(eventId,error) {}`
- `moveToDeadLetter` — `export async function moveToDeadLetter(eventId,error) {}`

## المرحلة 5 — الموظفون والأدوار والصلاحيات

- `createEmployee` — `export async function createEmployee(input,context) {}`
- `updateEmployee` — `export async function updateEmployee(employeeId,patch,context) {}`
- `changeEmployeeStatus` — `export async function changeEmployeeStatus(employeeId,{status,reason,expectedVersion},context) {}`
- `changeEmployeePassword` — `export async function changeEmployeePassword(employeeId,{passwordPlainText,expectedVersion},context) {}`
- `revealEmployeePassword` — `export async function revealEmployeePassword(employeeId,context) {}`
- `computeEffectivePermissions` — `export async function computeEffectivePermissions(employeeId,context) {}`
- `replacePermissionMatrix` — `export async function replacePermissionMatrix(employeeId,input,context) {}`
- `replaceRolePermissions` — `export async function replaceRolePermissions(roleId,input,context) {}`
- `assertPermission` — `export async function assertPermission(actor,key,context) {}`
- `getEmployeesScreen` — `export async function getEmployeesScreen(filters,context) {}`
- `getEmployeeDetails` — `export async function getEmployeeDetails(employeeId,includes,context) {}`
- `listEmployeeActivity` — `export async function listEmployeeActivity(employeeId,page,context) {}`

## المرحلة 6 — الأجهزة والمصادقة

- `login` — `export async function login(input,requestContext) {}`
- `refreshSession` — `export async function refreshSession(input,requestContext) {}`
- `logout` — `export async function logout(input,context) {}`
- `revokeAllEmployeeSessions` — `export async function revokeAllEmployeeSessions(employeeId,reason,context) {}`
- `registerDeviceAttempt` — `export async function registerDeviceAttempt(employee,input,context) {}`
- `approveDevice` — `export async function approveDevice(deviceId,input,context) {}`
- `blockDevice` — `export async function blockDevice(deviceId,input,context) {}`
- `assertApprovedDevice` — `export async function assertApprovedDevice(deviceId,employeeId,context) {}`
- `issueAccessToken` — `export function issueAccessToken(claims) {}`
- `issueRefreshToken` — `export async function issueRefreshToken(sessionData,context) {}`
- `verifyAccessToken` — `export function verifyAccessToken(token) {}`
- `rotateRefreshToken` — `export async function rotateRefreshToken(rawToken,context) {}`

## المرحلة 7 — الحضور

- `checkIn` — `export async function checkIn(employeeId,context) {}`
- `adminCheckOut` — `export async function adminCheckOut(attendanceId,input,context) {}`
- `forceCloseAttendance` — `export async function forceCloseAttendance(attendanceId,input,context) {}`
- `calculateAttendanceMetrics` — `export function calculateAttendanceMetrics({schedule,checkInAt,checkOutAt,timezone}) {}`
- `createAttendanceAdjustment` — `export async function createAttendanceAdjustment(attendanceId,changes,reason,context) {}`

## المرحلة 8 — الموردون وحساب المورد

- `createSupplier` — `export async function createSupplier(input,context) {}`
- `updateSupplier` — `export async function updateSupplier(id,patch,context) {}`
- `setSupplierStatus` — `export async function setSupplierStatus(id,input,context) {}`
- `assertActiveSupplier` — `export async function assertActiveSupplier(id,context) {}`
- `getSupplierSnapshot` — `export async function getSupplierSnapshot(id,context) {}`
- `recordDebt` — `export async function recordDebt(supplierId,input,context) {}`
- `recordReceivable` — `export async function recordReceivable(supplierId,input,context) {}`
- `payDebt` — `export async function payDebt(supplierId,input,context) {}`
- `collectReceivable` — `export async function collectReceivable(supplierId,input,context) {}`
- `reverseSupplierEntry` — `export async function reverseSupplierEntry(entryId,input,context) {}`

## المرحلة 9 — المواد الخام والوحدات والدفعات

- `createRawMaterial` — `export async function createRawMaterial(input,context) {}`
- `updateRawMaterial` — `export async function updateRawMaterial(id,patch,context) {}`
- `changeMaterialStatus` — `export async function changeMaterialStatus(id,input,context) {}`
- `lockMaterialSupplierAndUnits` — `export async function lockMaterialSupplierAndUnits(materialId,reason,context) {}`
- `withdrawBatchQuantity` — `export async function withdrawBatchQuantity(input,context) {}`
- `simulateRecipeRequirements` — `export async function simulateRecipeRequirements(requirements,context) {}`
- `allocateRecipeRequirements` — `export async function allocateRecipeRequirements(requirements,source,context) {}`
- `consumeFromBatch` — `export async function consumeFromBatch(batch,quantitySmall,source,context) {}`
- `restoreAllocations` — `export async function restoreAllocations(allocationIds,reason,context) {}`

---
# الجزء E — فهرس Routes المغطاة

- `/:id`
- `/:id/cancel`
- `/:id/transactions`
- `/admin/bootstrap`
- `/attendance/:id/check-out`
- `/attendance/check-in`
- `/audit-events/:id`
- `/auth/login`
- `/auth/logout`
- `/auth/refresh`
- `/block`
- `/cash-drawer-screen`
- `/cash-drawer-shifts`
- `/cash-drawer-shifts/:id/alerts`
- `/cash-drawer-shifts/:id/cash-in`
- `/cash-drawer-shifts/:id/close`
- `/cash-drawer-shifts/current`
- `/cash-drawer-transactions/:id/reverse`
- `/cash-out`
- `/customer-access-sessions`
- `/customer-ai/chat`
- `/customer/orders?page=1&limit=10`
- `/customers`
- `/customers/:id`
- `/customers/:id?include=orders,reviews,timeline`
- `/delegates`
- `/delegates/:id`
- `/delegates/:id?include=activeOrders,history,cashLedger`
- `/delivery-assignments/:id/admin-confirm-delivery`
- `/delivery-assignments/:id/failed`
- `/delivery-assignments/:id/handover`
- `/delivery-assignments/:id/reassign`
- `/delivery-assignments/:id/settle-cash`
- `/delivery-assignments/:id/whatsapp-share-opened`
- `/employee-devices/:id/approve`
- `/employees`
- `/employees/:id`
- `/employees/:id?include=devices,attendance,permissions,activity`
- `/employees/:id/permission-matrix`
- `/entities/:entityType/:entityId/timeline?page=1&limit=10`
- `/financial-reports/exports`
- `/financial-reports/exports/:id`
- `/financial-reports/sales|inventory|drawer|suppliers|delegates`
- `/health/live`
- `/health/ready`
- `/logout`
- `/notifications/:id/read`
- `/notifications/read-all`
- `/orders`
- `/orders/:id?include=items,timeline,payment,delivery,invoice`
- `/orders/:id/assign-delegate`
- `/orders/:id/cancel`
- `/orders/:id/complete-takeaway`
- `/orders/:id/items`
- `/orders/:id/items/:itemId/cancel`
- `/orders/:id/print-data`
- `/orders/:id/print-events`
- `/orders/:id/tracking`
- `/preparation-screen`
- `/preparation/order-items/:itemId/ready`
- `/preparation/orders?group=online&tab=current&page=1&limit=10`
- `/preparation/orders/:orderId`
- `/print-data`
- `/product-addons/:id`
- `/product-categories`
- `/product-categories/:id`
- `/product-sizes/:id/recipe`
- `/products`
- `/products/:id`
- `/products/:id/addons`
- `/products/:id/sizes`
- `/products/:id/types`
- `/public-orders`
- `/public-orders/:orderNumber/cancellation-request`
- `/public-orders/:orderNumber/items`
- `/public-orders/:orderNumber/receive`
- `/public-orders/:orderNumber/reviews`
- `/public-orders/:orderNumber/tracking`
- `/public-orders/lookup`
- `/purchase-groups`
- `/purchase-groups/:id`
- `/purchase-groups/:id/print-data`
- `/purchase-groups/:id/register-many`
- `/purchase-groups/:id/split-by-supplier`
- `/purchase-items/:id/register`
- `/purchase-returns`
- `/purchase-returns/:id`
- `/purchase-returns/:id/print-data`
- `/raw-materials`
- `/raw-materials/:id`
- `/raw-materials/:id?include=batches,movements,affectedProducts`
- `/raw-materials/:id/batch-priorities`
- `/raw-materials/:id/withdrawals`
- `/realtime/sync?rooms=...&afterSequence=17`
- `/returned`
- `/supplier-account-entries/:id/reverse`
- `/supplier-purchase-invoices/:id/print-data`
- `/suppliers`
- `/suppliers/:id`
- `/suppliers/:id?include=account,materials,recentEntries`
- `/suppliers/:id/account-entries`
- `/suppliers/:id/account-entries?page=1&limit=10&kind=&from=&to=`
- `/suppliers/:id/status`
- `/system/version`
- `/table-experience/bootstrap`
- `/table-experience/catalog`
- `/table-experience/home-screen`
- `/table-experience/order-proposals`
- `/table-experience/order-proposals/:id`
- `/table-experience/orders`
- `/table-experience/orders/:id/reviews`
- `/table-experience/refresh`
- `/table-experience/services`
- `/table-experience/services/:id/cancel`
- `/table-order-proposals/:id/start-review|request-changes|reject|confirm`
- `/table-service-requests/:id/resolve`
- `DELETE /products/:id`
- `GET /attendance?page=1&limit=10&employeeId=&status=&from=&to=`
- `GET /attendance/:id`
- `GET /audit-events/exports/:id`
- `GET /cash-drawer-shifts/:id/alerts?page=1&limit=10`
- `GET /invoices?page=1&limit=10&channel=&status=&from=&to=&search=`
- `GET /invoices/:id`
- `GET /measurement-units?kind=&active=true`
- `GET /orders/:id/payments?page=1&limit=10`
- `GET /permissions`
- `GET /reviews?page=1&limit=10&status=&rating=&channel=`
- `GET /roles?include=permissions`
- `GET /table-sessions?page=1&limit=10&tableId=&status=&from=&to=`
- `GET /table-sessions/:id?include=order,services,timeline`
- `GET /table-sessions/:id/print-data`
- `GET /tables-board`
- `GET /warnings/summary`
- `PATCH /measurement-units/:id`
- `PATCH /reviews/:id`
- `PATCH /roles/:id`
- `POST /attendance/:id/adjustments`
- `POST /attendance/:id/force-close`
- `POST /audit-events/exports`
- `POST /measurement-units`
- `POST /order-payments/:id/refunds`
- `POST /orders/:id/payments`
- `POST /products/:id/menu-visibility`
- `POST /products/:id/status`
- `POST /reviews/:id/moderation`
- `POST /roles`
- `POST /table-sessions/:id/cancel`
- `POST /table-sessions/:id/close`
- `POST /table-sessions/:id/items`
- `POST /tables/:id/admin-orders`
- `PUT /roles/:id/permissions`

---
# الجزء F — بوابة إثبات اكتمال 100%

- عدد الـFunctions العامة المخططة: **255**؛ كل واحدة معرفة في الجزء C ومفهرسة في D.
- عدد أنماط Routes الملتقطة حرفيًا من API Doc: **151**؛ كلها مدرجة في E.
- كل Operation في B يجب أن ترتبط بمعرف Requirement واختبار قبل تغييرها إلى DONE.
- تقرير CI المطلوب: undocumentedRoutes=0, unimplementedOperations=0, uncoveredPublicFunctions=0, missingPermissions=0, missingAuditPolicies=0, schemaIndexDrift=0, failingContractTests=0.
- كلمة 100% تعني تغطية النطاق المتفق عليه والعقود الحالية. أي متطلب جديد يضيف Operation ID وRoute/Function/Test قبل التنفيذ.

