# خطة Codex لتنفيذ الباك إند كاملًا

هذه الخطة تحدد كيف سأنفذ أنا المشروع فعليًا داخل Workspace، اعتمادًا على ملفات `final-2`. التنفيذ سيكون في مجلد مستقل مقترح اسمه:

```text
C:\Users\hp\Desktop\last 404\404-coffee-backend-v2
```

لن أعدل الباك القديم، ولن أغير ملفات `backend-design/final`. ملفات `final-2` هي المرجع التنفيذي.

# 1. دوري أثناء التنفيذ

سأنفذ كل مرحلة بالكامل بدل الاكتفاء بكتابة تعليمات. في كل مرحلة سأقوم بالآتي:

1. أقرأ الجزء المرتبط بها من ERD وAPI والهيكل والخطة المرجعية.
2. أنشئ الملفات الفعلية بأسمائها المعتمدة.
3. أنفذ Models وIndexes وValidation وServices وQueries وControllers وRoutes.
4. أربط Permissions وIdempotency وTransactions وAudit وOutbox.
5. أكتب الاختبارات الضرورية للحالات ذات الأثر والتزامن.
6. أشغل lint وcontract وintegration tests.
7. أصلح كل خطأ ظهر قبل الانتقال.
8. أراجع Diff وأتحقق أن المرحلة لم توسع النطاق أو تكسر موديولًا سابقًا.
9. أحدث سجل التقدم والـtraceability داخل مشروع v2.

# 2. قواعد العمل التي سألتزم بها

- لا أنفذ أكثر من موديول مالي/مخزني كبير في دفعة غير قابلة للمراجعة.
- لا أترك Stub أو TODO في مسار مطلوب وأعلن المرحلة مكتملة.
- لا أستخدم Mock fallback داخل Production code.
- لا أثق في السعر أو الحالة أو المجموع القادم من الفرونت.
- لا أستخدم Float للأموال أو الكميات.
- لا أرسل Socket قبل نجاح Commit.
- لا أكرر Business Logic بين Admin وCustomer وTable؛ أستخدم Public Services.
- لا أستخدم `autoIndex:true` في Production.
- لا أضع DeepSeek key أو Token أو Password في Logs أو Git.
- الدفع كاش فقط: `DIRECT` أو `COD`.

# 3. ملفات التحكم التي سأنشئها أولًا

داخل المشروع الجديد:

```text
IMPLEMENTATION_STATUS.md       # حالة كل Phase وOperation ID.
TRACEABILITY.json              # requirement→operation→route→function→test.
DECISIONS.md                   # أي قرار تنفيذي جديد وسببه.
KNOWN_LIMITATIONS.md           # التكاملات أو القيود الحقيقية فقط.
```

`IMPLEMENTATION_STATUS.md` سيستخدم الحالات:

```text
NOT_STARTED → IN_PROGRESS → IMPLEMENTED → VERIFIED
                         ↘ BLOCKED
```

لن تصبح العملية `VERIFIED` إلا بعد نجاح اختبارها ومرور Contract check.

# 4. الدفعة 0 — فحص البيئة ومساحة العمل

## ما سأنفذه

- فحص إصدارات Node وnpm وMongo المتاحة.
- فحص Git status حتى لا أنسب تغييرات موجودة مسبقًا لنفسي.
- قراءة `AGENTS.md` أو قواعد المشروع إن وجدت.
- فحص Frontend endpoints وDTOs التي ستحتاج توافقًا لاحقًا.
- إنشاء المجلد المستقل فقط، من دون نسخ الباك القديم.

## الناتج

- تقرير بيئة قصير داخل `IMPLEMENTATION_STATUS.md`.
- لا Dependencies مثبتة قبل إنشاء package واضح.

## التحقق

- المسار الجديد مستقل.
- لا ملف قديم تغير.
- Git diff يوضح الملفات الجديدة فقط.

# 5. الدفعة 1 — Scaffold قابل للتشغيل

## التنفيذ

- إنشاء `package.json` وScripts: `dev`, `start`, `lint`, `test`, `test:integration`, `test:contract`, `migrate`, `indexes:check`.
- إنشاء `src/server.js`, `app.js`, `bootstrap.js`.
- إنشاء Config validation وHealth endpoints.
- إعداد ESLint/Prettier/Vitest/jsconfig aliases.
- إعداد Mongo Replica Set محلي في Docker Compose عند الحاجة.

## الاختبارات

- app factory يبدأ بدون listen.
- `/health/live` يعيد 200.
- `/health/ready` يعيد 503 بدون Mongo و200 بعد الاتصال.
- SIGTERM يغلق الموارد.

## معيار الإكمال

تطبيق فارغ يعمل، lint/test ينجحان، ولا يوجد Business module بعد.

# 6. الدفعة 2 — Platform Core

## التنفيذ

- ApiError وResponse envelopes.
- requestId/AsyncLocalStorage/logger/redaction.
- Validation middleware وPagination.
- Decimal helpers.
- Mongo transaction wrapper.
- Idempotency operationRequests.
- Audit writer وOutbox writer/publisher.
- Base auth context interfaces.

## الاختبارات

- Decimal boundaries.
- rollback متعدد Collections.
- double idempotency.
- نفس المفتاح مع Body مختلف يرجع 409.
- Outbox يبقى بعد Commit حتى لو فشل Publisher.
- Error response لا يحتوي Stack/Secret.

## معيار الإكمال

كل موديول لاحق يستطيع تنفيذ Command آمن بدون اختراع بنية جديدة.

# 7. الدفعة 3 — الموظفون والمصادقة والصلاحيات

## التنفيذ

- Employee/Role/Permission/Page Access Models.
- إنشاء وتعديل وإيقاف الموظف.
- Password plaintext مع `select:false` وPermission للعرض.
- Device/Fingerprint records.
- Pending/Approve/Block flow.
- Access/Refresh sessions وrotation/revocation.
- Admin bootstrap وSidebar permission DTO.

## الاختبارات

- إنشاء موظف وعرض password فقط للمصرح.
- Login بجهاز جديد لا يعطي Session كاملة.
- Approve يسمح، Block يلغي Refresh.
- تغيير Permission يبطل النسخة القديمة.
- تعطيل موظف يمنع Login/Refresh.

## التسليم المرحلي

API قابلة للدخول والتحكم في صلاحيات كل Endpoint قادم.

# 8. الدفعة 4 — الحضور والانصراف

## التنفيذ

- Attendance/Adjustment Models.
- Check-in عند Login المعتمد وفق السياسة.
- Admin checkout من صفحة الموظف.
- حساب التأخير والعمل والورديات العابرة لمنتصف الليل.
- منع انصراف مسؤول درج مفتوح.

## التحقق

اختبارات Cairo timezone، duplicate check-in، Admin correction، وAudit التاريخي.

# 9. الدفعة 5 — الموردون والحساب اليدوي

## التنفيذ

- Supplier وSupplierAccount وEntry.
- Screen/detail/list pagination.
- Debt/Receivable اليدويان.
- Cash Debt Payment/Receivable Collection عبر Drawer contract مؤقت typed interface حتى اكتمال الدرج.
- Reversal مرة واحدة.

## ملحوظة ترتيبية

سأنشئ Drawer public contract وFake test adapter فقط داخل الاختبار. Production implementation يضاف في دفعة الدرج؛ لا Mock fallback في التشغيل.

## التحقق

كل حالات الرصيد والتزامن والتاريخ والإيقاف والعكس.

# 10. الدفعة 6 — الوحدات والمواد والدفعات والمخزون

## التنفيذ

- Measurement Units.
- Raw Material مع Supplier required والـlocks.
- Batch وMovement ledgers.
- Unit conversion وinventory value.
- Allocation simulation/consumption/restoration.
- Withdrawal النهائي وترتيب الأولوية.
- Screen/detail/movements.

## الاختبارات الحرجة

- طلبان يستهلكان آخر كمية.
- بيع وسحب متزامنان.
- استعادة نفس Allocation مرتين.
- عبور أكثر من Batch.
- Expired Batch مسموحة.
- آخر خروج يصفر القيمة والكمية.

# 11. الدفعة 7 — التحذيرات

## التنفيذ

- Low stock وExpiring وExpired derived queries.
- Warning screen/summary.
- Cache source versions.
- Cairo business date.
- Data quality عند فشل المصدر.

## التحقق

حدود اليوم والصلاحية والصفر، invalidation بعد كل حركة مخزون.

# 12. الدفعة 8 — المنتجات والوصفات والكتالوج

## التنفيذ

- Categories/Products/Types/Sizes/Recipes/Addons.
- Expected cost simulation وprofit/margin.
- Menu visibility.
- Public catalog DTO وETag.
- AI product projection من دون Recipe.
- Product image reference بعد تجهيز Media contract.

## التحقق

- Recipe material duplicate/invalid.
- Supplier/unit lock عند Recipe use.
- تكلفة من عدة Batches.
- لا Recipe/Cost leak في Public API.

# 13. الدفعة 9 — المشتريات

## التنفيذ

- Purchase Group/Items/Supplier Invoice.
- Draft/edit/delete.
- Split حسب Supplier الموجود على المادة.
- Register one/register-many.
- Batch/Movement داخل Transaction.
- Unregistered/registered screens وPrint DTO.

## التحقق

Stale split، double register، expired purchase، Batch linkage، all-or-none register-many.

# 14. الدفعة 10 — مرتجعات المشتريات

## التنفيذ

- Return header/items.
- Batch validation والخروج بالقيمة الأصلية.
- History/detail/print.
- لا Supplier balance ولا Drawer movement.

## التحقق

Return/sale race، كمية أكبر، double click، immutable invoice.

# 15. الدفعة 11 — الدرج والوردية

## التنفيذ

- Shift/Transaction/Alert Models.
- Open/manual IN/OUT/source transactions/reversal/close.
- Reconciliation وPrint.
- Warning Worker كل 12 ساعة.
- Notifications + Outbox.
- استبدال Drawer test adapter في Suppliers بالـproduction public service.

## التحقق

- وردية واحدة.
- Opening لا Revenue.
- حركة مع Close race.
- Ledger mismatch يمنع الإغلاق.
- 12/24/36 ساعة وDowntime.
- كل تكامل Supplier cash يعمل ذريًا.

# 16. الدفعة 12 — الدفع الكاش والفواتير

## التنفيذ

- Payment وCash Refund.
- DIRECT cash إلى الدرج.
- COD custody وSettlement.
- Invoice preview/final/checksum/print event.
- PENDING_CASH_REFUND عند عدم إمكانية الرد.

## التحقق

عدم وجود أي دفع غير نقدي، ومنع التسوية المكررة، ومعالجة عدم كفاية الكاش للرد، وثبات الفاتورة النهائية.

# 17. الدفعة 13 — الطلبات والخصم الفعلي

## التنفيذ

- Orders/Items/Allocations/Status Events.
- Server pricing وBusiness config snapshot.
- Confirm/Admin order.
- Add items.
- Cancel item/order.
- Exact stock restoration.
- Progress/status derivation.
- Completion services لكل fulfillment.

## التحقق

End-to-end inventory cost، races، snapshot history، idempotency، payment balanceDue.

# 18. الدفعة 14 — التحضير

## التنفيذ

- Preparation screen بجدوليها وتبويباتها.
- Order detail بوصفة Snapshot.
- Mark ready.
- Last item → READY.
- Realtime events وإعادة الطلب Current عند الإضافة.

## التحقق

Ready/cancel race، إضافة إلى READY، counts صحيحة، query count ثابت.

# 19. الدفعة 15 — العملاء والتقييمات

## التنفيذ

- Customer atomic upsert.
- Latest profile ordering.
- Customer details/orders/timeline.
- Review submit/update/revision/moderation.

## التحقق

نفس الهاتف متزامن، هاتف جديد منفصل، تقييم واحد، عدم تغير Snapshots.

# 20. الدفعة 16 — Customer Web

## التنفيذ

- Public checkout Takeaway/Delivery.
- Read/Action credentials.
- Barcode آمن.
- Lookup/tracking/history access session.
- Add items وCancellation Request.
- Customer receipt والتقييم.
- Local Storage contract documentation للفرونت.

## التحقق

Read Token يفشل في Mutation، Action Token لا يظهر في URL/Log، فقد Local Storage، Realtime reconnect.

# 21. الدفعة 17 — المندوبون والتوصيل

## التنفيذ

- Delegate CRUD/status/capacity.
- Assign/Handover/Reassign/Failed/Returned.
- Customer receipt وAdmin override.
- WhatsApp share-open link.
- COD ledger وSettlement.

## التحقق

تكليف نشط واحد، القديم لا يكمل بعد النقل، الرجوع لا يعيد المخزون، double receipt/settlement.

# 22. الدفعة 18 — الطاولات

## التنفيذ

- 20 Tables seed وBoard aggregation.
- Table Session open/add/cancel/close.
- Admin first order.
- Cash close/invoice/history.

## التحقق

Open race، add/close race، payment failure، EMPTY/OCCUPIED derivation.

# 23. الدفعة 19 — واجهة ضيف الطاولة والـProposals

## التنفيذ

- QR version/Guest Session/Token.
- Home/catalog/tracking.
- Proposal lifecycle.
- Admin review/confirm.
- Confirm يفتح Session ويؤكد Order ويخصم ذريًا.

## التحقق

لا خصم قبل Confirm، QR قديم، Proposal duplicate، confirm race، insufficient stock.

# 24. الدفعة 20 — خدمات الطاولة

## التنفيذ

- الأنواع الخمسة.
- Guest/Session owner key.
- Realtime Admin screen.
- Resolve/Cancel.
- ربط Proposal ومهاجرة owner.
- Close session cleanup.

## التحقق

Duplicate service، pre-order service، resolve race، BILL cleanup، المدفوع لا يخصم مرتين.

# 25. الدفعة 21 — Order Cases والـRefund Recovery

## التنفيذ

- Cancellation Request/Case Events.
- Approve/Reject/Execute.
- Returned delivery requirement.
- Cash refund retry.

## التحقق

Inventory restore مرة واحدة حتى لو Refund pending، وكل حالة Order.

# 26. الدفعة 22 — Dashboard وRealtime Sync

## التنفيذ

- Dashboard projection/projector/checkpoint.
- Screen واحد حسب الصلاحية.
- Socket rooms/payload mappers.
- REST sync بعد sequence gap.

## التحقق

Event duplicate/gap، projection rebuild، permission filtering، عدم N+1.

# 27. الدفعة 23 — التقارير المالية

## التنفيذ

- Sales/COGS/Inventory/Drawer/Supplier/Delegate queries.
- Financial screen/cache/source versions.
- Insights بسيطة.
- Async export.

## التحقق

مقارنة كل رقم بالـledgers، COD outstanding، opening excluded، Cairo ranges، dataQuality.

# 28. الدفعة 24 — Audit UI والنزاهة

## التنفيذ

- Audit screen/detail/timeline.
- Sensitive read events.
- Integrity hashes/verification.
- Async export وretention hooks.

## التحقق

لا Secret/Password/Token، كل Operation ID لها event، chain tamper detected.

# 29. الدفعة 25 — Media

## التنفيذ

- Multipart upload، MIME sniff، limits، processing، attach، URLs، cleanup.
- ربط Product image.

## التحقق

Fake MIME، oversized، orphan، reused asset، no Base64 JSON.

# 30. الدفعة 26 — Migrations والـIndexes وSeed

## التنفيذ

- Migration runner/lock/checksum.
- Index diff/health.
- Seed units/permissions/tables/first admin.
- Projection rebuild/integrity scripts.

## التحقق

Fresh install، upgrade، duplicate precheck، failed migration prevents readiness.

# 31. الدفعة 27 — Contract وSecurity وPerformance

## التنفيذ

- OpenAPI coverage.
- Route→Permission→Operation traceability check.
- Full integration suites.
- Abuse/rate tests.
- Query explain/N+1 tests.
- Load/race tests.

## شروط النجاح

```text
undocumentedRoutes = 0
unimplementedOperations = 0
uncoveredPublicFunctions = 0
missingPermissions = 0
missingAuditPolicies = 0
schemaIndexDrift = 0
failingContractTests = 0
```

والـinteractive p95≤500ms وp99≤1000ms على بيانات الاختبار الحجمية.

# 32. الدفعة 28 — ربط الفرونت على بيئة تجريبية

## التنفيذ

- توليد/تثبيت API client من OpenAPI.
- ربط Admin bootstrap/screens.
- ربط Customer checkout/local storage/tracking.
- ربط Table QR/proposals/services.
- Socket reconnect/sync.
- إزالة Mock fallbacks من المسارات المرتبطة فقط بعد نجاح كل شاشة.

## التحقق

Walkthrough حقيقي لكل Workflow وفواتير الطباعة وNetwork request count.

# 33. الدفعة 29 — Staging والإطلاق

## التنفيذ

- Staging migrate/index/seed.
- Restore rehearsal.
- Smoke وLoad tests.
- Redaction inspection.
- تشغيل Workers تدريجيًا.
- Production deployment/readiness/monitoring.

## مؤشرات أول 24 ساعة

- Error rate وlatency.
- Mongo slow queries/pool.
- Outbox lag/dead letters.
- Stock/Drawer consistency alerts.
- Shift warning jobs.
- Socket reconnect failures.
- DeepSeek timeout/rate.

# 34. طريقة التحديث التي سأرسلها أثناء التنفيذ

بعد كل دفعة سأبلغ المستخدم بأربع نقاط فقط:

1. ما تم تنفيذه وسلوكه.
2. الملفات أو الموديولات المهمة.
3. الاختبارات التي نجحت والنتائج.
4. أي قيد حقيقي أو قرار أحدثه في `DECISIONS.md`.

لن أتوقف بين الدفعات لطلب تأكيد على اختيارات تنفيذ روتينية. أطلب تدخل المستخدم فقط عند قرار منتج لا يمكن استنتاجه أو إجراء خارجي/غير قابل للعكس يحتاج موافقته.

# 35. ترتيب الـCommits المقترح

كل دفعة كبيرة تقسم إلى Commits قابلة للمراجعة:

```text
chore(scope): scaffold/models/indexes
feat(scope): commands and policies
feat(scope): queries controllers and routes
test(scope): integration contract and race coverage
docs(scope): traceability and operational notes
```

لن أخلط Formatting واسع أو تعديل الباك القديم مع التنفيذ الجديد.

# 36. تعريف اكتمال المشروع عندي كمنفذ

المشروع لا يعتبر مكتملًا لمجرد وجود الملفات أو نجاح التشغيل. يكتمل عندما:

- كل Operation ID في الخطة Canonical حالتها VERIFIED.
- كل Route في OpenAPI لها Handler وصلاحية واختبار Contract.
- كل Model/Index يطابق ERD.
- كل حركة مال/مخزون لها اختبار عكس أو تعافٍ.
- Workflows Admin/Customer/Table تعمل End-to-End.
- لا توجد Mocks في Production path.
- لا توجد أخطاء lint/test/contract/index drift.
- أهداف الأداء ناجحة.
- Staging restore وsmoke ناجحان.
- التوثيق يطابق السلوك الفعلي النهائي.

# 37. نقطة البداية الفعلية

عند بدء التنفيذ سأبدأ بالدفعة 0 ثم 1 داخل `404-coffee-backend-v2`. أول ناتج قابل للتشغيل سيكون تطبيق Express مستقل متصل بـMongo Replica Set وله Health/Readiness واختبارات، ثم أبني Platform Core قبل أي Business Module. هذا الترتيب يمنع إعادة كتابة الأمان والمعاملات داخل كل موديول لاحقًا.
