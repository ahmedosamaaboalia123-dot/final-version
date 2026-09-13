# هيكل مشروع الباك إند — Modular Monolith بسيط

## 1. الاختيار

Backend مستقل جديد: Node.js + Express + MongoDB + Mongoose، JavaScript ESM.

النمط Modular Monolith: تطبيق واحد وDatabase واحدة، لكن الكود مقسم حسب موديول العمل. هذا يسمح بـMongoDB Transactions بين الطلب والمخزون والدرج دون تعقيد Microservices.

لا نضيف Repository Layer عام في البداية. Mongoose Model يستخدم داخل Service/Queries. إذا أصبحت Queries موديول معقدة، ينشأ ملف queries خاص بدل طبقة Boilerplate.

## 2. شجرة المشروع

    coffee-backend/
    ├─ package.json
    ├─ .env.example
    ├─ .gitignore
    ├─ README.md
    ├─ openapi.yaml
    ├─ src/
    │  ├─ app.js
    │  ├─ server.js
    │  ├─ config/
    │  │  ├─ env.js
    │  │  ├─ database.js
    │  │  ├─ logger.js
    │  │  └─ constants.js
    │  ├─ shared/
    │  │  ├─ errors/
    │  │  │  ├─ AppError.js
    │  │  │  └─ errorCodes.js
    │  │  ├─ middleware/
    │  │  │  ├─ auth.js
    │  │  │  ├─ permission.js
    │  │  │  ├─ validate.js
    │  │  │  ├─ requestContext.js
    │  │  │  ├─ idempotency.js
    │  │  │  ├─ rateLimit.js
    │  │  │  ├─ notFound.js
    │  │  │  └─ errorHandler.js
    │  │  ├─ database/
    │  │  │  ├─ transaction.js
    │  │  │  ├─ decimal.js
    │  │  │  ├─ pagination.js
    │  │  │  └─ counters.js
    │  │  ├─ http/
    │  │  │  ├─ response.js
    │  │  │  └─ query.js
    │  │  ├─ security/
    │  │  │  ├─ tokens.js
    │  │  │  ├─ redaction.js
    │  │  │  └─ fingerprint.js
    │  │  ├─ time/
    │  │  │  └─ cairoTime.js
    │  │  └─ events/
    │  │     ├─ eventBus.js
    │  │     └─ outboxPublisher.js
    │  ├─ modules/
    │  │  ├─ auth/
    │  │  ├─ employees/
    │  │  ├─ attendance/
    │  │  ├─ suppliers/
    │  │  ├─ inventory/
    │  │  ├─ warnings/
    │  │  ├─ purchases/
    │  │  ├─ purchase-returns/
    │  │  ├─ products/
    │  │  ├─ orders/
    │  │  ├─ preparation/
    │  │  ├─ tables/
    │  │  ├─ table-services/
    │  │  ├─ customers/
    │  │  ├─ delegates/
    │  │  ├─ drawer/
    │  │  ├─ reports/
    │  │  └─ audit/
    │  ├─ jobs/
    │  │  ├─ worker.js
    │  │  ├─ exportReport.job.js
    │  │  ├─ publishOutbox.job.js
    │  │  └─ consistencyCheck.job.js
    │  ├─ realtime/
    │  │  ├─ socket.js
    │  │  ├─ rooms.js
    │  │  └─ permissions.js
    │  └─ routes/
    │     └─ index.js
    ├─ scripts/
    │  ├─ seedAdmin.js
    │  ├─ seedPermissions.js
    │  ├─ seedTables.js
    │  └─ createIndexes.js
    └─ tests/
       ├─ integration/
       ├─ race/
       └─ helpers/

## 3. شكل الموديول

مثال suppliers:

    modules/suppliers/
    ├─ supplier.model.js
    ├─ supplierAccount.model.js
    ├─ supplierAccountEntry.model.js
    ├─ supplier.validation.js
    ├─ supplier.permissions.js
    ├─ supplier.service.js
    ├─ supplier.queries.js
    ├─ supplier.controller.js
    ├─ supplier.routes.js
    ├─ supplier.mapper.js
    ├─ supplier.events.js
    └─ index.js

الملفات الضرورية فقط: model، validation، service، controller، routes. mapper/queries/events تضاف عندما تكون مفيدة.

## 4. مسؤولية الملفات

### model

Mongoose Schema والفهارس والـEnums المحلية. لا Business Workflow.

### validation

Schemas لـparams/query/body. يطبع المدخلات ويمنع الحقول الزائدة. يمكن استخدام Zod أو Joi؛ الاختيار واحد للنظام كله. المقترح Zod لبساطته.

### permissions

مفاتيح الصلاحيات التي يحتاجها الموديول، بلا منطق Role داخل Controller.

### service

كل قواعد العمل، State Machine، Transaction، التعامل مع موديولات أخرى، Idempotency وAudit. لا req/res.

### queries

قراءات مركبة وAggregation وPagination. لا Mutation. الملف اختياري.

### controller

يأخذ البيانات المتحققة وrequestContext، يستدعي Service، ويعيد DTO. لا حساب مال أو حالة.

### mapper

تحويل Model إلى API DTO وحجب الحقول. اختياري للموديولات البسيطة.

### routes

تعريف Method/Path وتسلسل Middleware والController.

### events

أسماء Domain Events وبناء payload الآمن. النشر عبر Outbox بعد Commit.

### index

Public API للموديول. يمنع الموديولات الأخرى من استيراد ملفات داخلية عشوائيًا.

## 5. مثال تدفق Request

    Route
      -> requestContext
      -> auth
      -> permission
      -> validate
      -> idempotency
      -> controller
      -> service
      -> transaction
      -> models + other module public services
      -> audit + outbox
      -> mapper
      -> response
      -> socket after commit

Error يذهب إلى errorHandler مرة واحدة.

## 6. مثال Route

    router.post(
      "/:id/debt-payments",
      requireAuth,
      requirePermission("suppliers.account.pay"),
      validate(payDebtSchema),
      requireIdempotency,
      supplierController.payDebt
    );

Controller:

    async function payDebt(req, res) {
      const result = await supplierService.payDebt({
        supplierId: req.params.id,
        input: req.validated.body,
        context: req.context
      });
      return ok(res, result);
    }

Service وحده ينفذ Supplier Entry + Drawer + Audit داخل Transaction.

## 7. حدود الموديولات

- لا يستورد orders موديول rawMaterialBatch.model مباشرة.
- orders يستدعي inventoryService.allocateForOrder داخل نفس Session.
- purchases يستدعي inventoryService.receivePurchaseItem.
- suppliers يستدعي drawerService.createSupplierSettlement.
- tables يستدعي ordersService.createTableOrder.
- table-services يستدعي tablesService.requireActiveSession.
- reports يستدعي Query Contracts للقراءة فقط.
- audit يقدم auditService.record وOutbox.
- realtime لا يكتب Business Data.

كل موديول يصدر Public Contract من index.js.

## 8. Dependencies المسموحة

    auth -> employees
    attendance -> employees
    purchases -> suppliers + inventory
    purchase-returns -> inventory
    products -> inventory read contracts
    orders -> products + inventory + customers + payments
    preparation -> orders
    tables -> orders + drawer + table-services contract
    table-services -> tables
    delegates -> orders + drawer
    reports -> read contracts from all
    audit <- called by all
    realtime <- consumes outbox

يمنع Circular Dependency. عند الحاجة لعكس الاتجاه يستخدم Domain Event أو ينقل Contract إلى shared business interface صغير.

## 9. تقسيم الموديولات الكبيرة

### inventory

    inventory/
    ├─ material.model.js
    ├─ batch.model.js
    ├─ movement.model.js
    ├─ inventory.service.js
    ├─ allocation.service.js
    ├─ withdrawal.service.js
    ├─ inventory.queries.js
    ├─ inventory.controller.js
    └─ inventory.routes.js

### orders

    orders/
    ├─ order.model.js
    ├─ orderItem.model.js
    ├─ allocation.model.js
    ├─ payment.model.js
    ├─ invoiceSnapshot.model.js
    ├─ order.validation.js
    ├─ orderState.js
    ├─ order.service.js
    ├─ orderItem.service.js
    ├─ cancellation.service.js
    ├─ payment.service.js
    ├─ invoice.service.js
    ├─ order.queries.js
    ├─ order.controller.js
    └─ order.routes.js

تقسيم Service حسب Use Case، لا ملف order.service.js عملاق.

### employees

auth منفصل للمصادقة والجلسات والأجهزة، employees للبيانات والصلاحيات، attendance للحضور. كلها تظهر للمستخدم كموديول موظفين واحد لكن الكود الداخلي واضح.

## 10. Shared Core

Shared يحتوي أدوات تقنية فقط:

- Errors.
- Transaction runner.
- Decimal.
- Pagination.
- Time.
- Auth middleware.
- Response.
- Request context.
- Redaction.
- Event transport.

لا نضع Business Helpers مثل حساب Order Status في shared؛ تبقى داخل orders.

## 11. Config

env.js يقرأ ويتحقق مرة واحدة:

- NODE_ENV.
- PORT.
- MONGODB_URI.
- ACCESS_TOKEN_SECRET.
- REFRESH_TOKEN_SECRET.
- TIMEZONE=Africa/Cairo.
- CURRENCY=EGP.
- LOG_LEVEL.
- CORS_ORIGINS.
- REQUEST_SLO_MS=1000.
- REPORT_JOB_TIMEOUT.
- RATE_LIMIT settings.

.env.example بلا Secrets. التطبيق يفشل مبكرًا إذا إعداد إلزامي مفقود.

## 12. app.js وserver.js

app.js يبني Express: security، JSON limits، requestContext، routes، notFound، errorHandler. لا listen ولا اتصال DB، ليسهل الاختبار.

server.js يتصل بMongo، يبدأ HTTP/Socket/Workers، ويتعامل مع graceful shutdown.

## 13. Route Registration

كل module/index.js يصدر router وpermissions وstartup checks. routes/index.js:

    router.use("/auth", authRouter);
    router.use("/employees", employeeRouter);
    router.use("/suppliers", supplierRouter);
    router.use("/raw-materials", inventoryRouter);
    router.use("/purchase-groups", purchaseRouter);
    router.use("/orders", orderRouter);
    router.use("/tables", tableRouter);
    router.use("/table-service-requests", tableServiceRouter);
    ...

كلها تحت /api/v1 من app.js.

## 14. Transaction Helper

withTransaction يقبل callback وcontext:

- يبدأ Mongoose Session.
- retries transient مرتين ضمن الميزانية.
- يمرر session لكل Model call.
- لا ينشر Socket قبل Commit.
- ينهي Session في finally.
- لا يخفي Domain Errors.

أي Service يستدعي Service آخر يمرر session نفسها؛ لا يبدأ Nested Transaction.

## 15. Audit Helper

auditService.record يستقبل eventType، actor، entity، before/after safe، result، correlationId، session. Event Catalog ينقح الحقول.

لا يمرر req.body كاملًا. requestContext يحتوي requestId، employeeId، deviceId، IP، route، time.

## 16. Validation وDTO

Validation عند حدود HTTP، والتحقق من وجود الكيان والحالة داخل Service. كل API له Input Schema وOutput DTO موثق في OpenAPI.

Mapper يمنع:

- passwordPlainText إلا Endpoint مستقل.
- token hashes.
- internal versions إذا لا يحتاجها العميل.
- Mongo internal fields.
- metadata غير منقحة.

version يعاد للكيانات القابلة للتعديل.

## 17. الأخطاء

AppError يحتوي code، message، status، fieldErrors، detailsSafe، isOperational.

لا try/catch متكرر في كل Controller إذا Express async handler مركزي. لا يرجع Stack في Production. Logger يربط requestId.

## 18. الأداء

- lean للقراءات.
- Projection للحقول المطلوبة.
- Index لكل Filter/Sort.
- Pagination في Mongo.
- لا N+1.
- لا Populate عميق.
- Catalog Cache قصير.
- Export Worker.
- Outbox بعد Commit.
- p95 500ms وp99 1000ms.

كل Query معقدة لها explain في اختبار الأداء قبل الإطلاق.

## 19. الاختبارات

لا نكتب اختبارات شكلية لكل Getter. الاختبارات المهمة:

- Integration لكل Workflow حرجة.
- Race tests المذكورة في وثيقة 15.
- Contract tests للـAPI/OpenAPI.
- Permission tests للعمليات الحساسة.
- حسابات Decimal والمخزون والتقارير.
- State transitions.
- Idempotency وTimeout recovery.

MongoMemoryServer قد لا يدعم كل سلوك Replica Set إلا بوضع Replica Set؛ اختبارات Transactions تستخدم بيئة Mongo مطابقة.

## 20. Scripts وSeeds

- seedAdmin ينشئ أول Super Admin مرة واحدة.
- seedPermissions ينشئ Page/Action Catalog Idempotently.
- seedTables ينشئ 1..20 دون تكرار.
- createIndexes يراجع الفهارس.

لا Seed لطلبات أو أرصدة وهمية في Production.

## 21. Logging

Logger structured JSON في Production. حقول: level، message، requestId، module، event، durationMs، errorCode. Redaction مركزي.

Audit Business داخل Mongo. Technical Logs للتشغيل. لا console.log عشوائيًا داخل Services.

## 22. Jobs

Worker داخل Process منفصل اختياري بنفس Codebase:

- Report Export.
- Audit Export.
- Outbox Publish.
- Consistency Check.
- Cache rebuild.

Job لا يكتب مباشرة في موديول؛ يستدعي Service عامة.

## 23. Realtime

Socket Gateway يقرأ Outbox/Domain Events. Rooms معرفة مركزيًا، والتحقق من Permission قبل Join. Payload مختصر وإصدار.

لا Business Logic داخل Socket Handler؛ يستدعي نفس Service المستخدمة في HTTP إن وجدت Mutation.

## 24. OpenAPI

openapi.yaml في جذر الباك. Tags تطابق الموديولات. كل Route يحدد Permission وIdempotency كـextensions:

- x-permission.
- x-idempotency-required.
- x-target-slo-ms.
- x-audit-event.

CI يفشل لو OpenAPI غير صالح أو Route غير موثق.

## 25. تسمية الملفات والكود

- الملفات camelCase أو kebab-case واحد ثابت؛ المقترح camelCase للملفات البرمجية.
- Models مفردة: order.model.js.
- Collections أسماء جمع صريحة.
- Functions أفعال: confirmOrder، cancelItem، resolveService.
- لا Utils عامة غامضة.
- Constants داخل موديولها.
- Controller رفيع، Service واضح، Model بلا Workflow.

## 26. لماذا الهيكل سهل التعديل

- كل ميزة في فولدر واحد.
- كل موديول له Public API.
- تغيير UI لا يغير Domain Logic.
- تغيير قاعدة بيانات موديول لا ينتشر عبر Imports داخلية.
- Workflows الحرجة ظاهرة في Services.
- Queries منفصلة عن Mutations.
- Shared صغير ولا يتحول لمخزن عشوائي.
- Modular Monolith يمكن تقسيمه لاحقًا إن احتاج، دون تكلفة Microservices الآن.

## 27. ترتيب التنفيذ المقترح

1. config/shared/auth/audit foundation.
2. employees/permissions/devices/attendance.
3. suppliers/drawer.
4. inventory/products.
5. purchases/returns/warnings.
6. orders/customers/preparation.
7. tables/table-services.
8. delegates/delivery/payments.
9. reports/exports.
10. race/load tests وOpenAPI final verification.

كل مرحلة تبني Contract وتختبر التكامل قبل التالية.
# ملحق الهيكل: Table Experience

يضاف موديول حدودي مستقل لواجهة الطاولة، مع إبقاء منطق الطلبات والمخزون داخل موديولاته الأصلية:

```text
src/modules/table-experience/
├── table-experience.routes.js
├── table-experience.controller.js
├── table-token.middleware.js
├── guest-session.model.js
├── guest-session.service.js
├── order-proposal.model.js
├── order-proposal.service.js
├── order-proposal-admin.controller.js
├── order-proposal.validation.js
├── table-experience.realtime.js
└── table-experience.events.js
```

الموديول يملك جلسات الضيوف والـProposals فقط. يقرأ الكتالوج عبر Public Query من `products`، وينادي Public Services من `table-services` و`orders`. خدمة `orders` وحدها تعتمد الطلب وتخصم المخزون داخل Transaction. لا يستورد Controller أي Model من موديول آخر.

في الفرونت توجد ثلاث Apps/Boundaries واضحة: `admin`, `table`, `customer`. واجهة `table` تحذف Route الـchatbot والعروض وSmart Waiter، وتحذف اختيار رقم الطاولة يدويًا؛ الـQR Token يحدد الطاولة. صفحة السلة ترسل Proposal وتطلب الجرسون بدل تأكيد Order مباشر.

## ملحق Worker تحذير الوردية

```text
src/modules/drawer/
├── drawer-shift-alert.model.js
├── open-shift-warning.job.js
├── open-shift-warning.service.js
└── drawer-notification.publisher.js

src/modules/notifications/
├── notification.model.js
├── notification.service.js
├── notification.controller.js
└── notification.routes.js
```

الـJob يفحص `nextOpenShiftWarningAt` دوريًا، والخدمة تنشئ Alert وOutbox وتحدث موعد التحذير التالي داخل Transaction. موديول Notifications ينشر Socket بعد Commit ويعيد المحاولة بأمان. موديول Inventory يتحقق ويقفل `supplierId`؛ موديول Purchases يقرأه ولا يسمح بتجاوزه.

## ملحق هيكل Customer Web

```text
src/modules/customer-experience/
├── public-order.controller.js
├── public-order.routes.js
├── tracking-credential.model.js
├── tracking-token.middleware.js
├── customer-profile.service.js
└── customer-receipt.service.js

src/modules/customer-ai/
├── customer-ai.controller.js
├── customer-ai.routes.js
├── deepseek.client.js
├── product-catalog.tool.js
└── customer-ai.guard.js
```

`customer-experience` ينسق فقط؛ إنشاء الطلب والخصم داخل Orders/Inventory. `customer-ai` يعتمد على Product public projection ولا يستورد Recipe أو Batch Models. مفتاح DeepSeek يبقى في server secrets.
