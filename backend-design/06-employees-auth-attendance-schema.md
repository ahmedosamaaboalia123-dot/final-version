# موديول الموظفين الكامل

الإصدار 1.0. الموديول جزء واحد يضم الموظفين والأجهزة والحضور والانصراف والصلاحيات وسجل أحداث الشخص. التقنية MERN وMongoDB وMongoose. الباك القديم خارج التصميم، والفرونت الحالي مرجع للحقول وشكل الاستجابة.

## 1. النطاق والقرارات

- إنشاء الموظف وتعديله وإيقافه وأرشفته.
- صفحة شخصية تعرض البيانات والمنصب والمواعيد وكلمة المرور حسب الصلاحية.
- أكثر من جهاز معتمد للموظف، وكل جهاز جديد يحتاج موافقة.
- الحضور يحدث تلقائيًا عند أول دخول ناجح من جهاز معتمد.
- الانصراف ينفذه الأدمن من صفحة الموظف.
- الصلاحيات تشمل ظهور الصفحة والأفعال داخلها.
- سجل الشخص يعرض الأحداث التي نفذها.
- كل جدول وسجل يستخدم Pagination من الخادم، 10 صفوف افتراضيًا.
- كلمة المرور تحفظ كنص واضح passwordPlainText حسب قرار مالك النظام. لا تظهر إلا بصلاحية employees.view_password، ولا تدخل القوائم أو تسجيل الدخول أو السجلات أو الطباعة.

حفظ كلمة المرور بهذه الصورة يجعلها قابلة للقراءة لمن يصل إلى قاعدة البيانات أو النسخة الاحتياطية. لذلك مشاهدة الكلمة من الواجهة نفسها حدث مدقق، والوصول لقواعد البيانات والنسخ الاحتياطية يجب أن يكون محصورًا.

## 2. الشاشات

### 2.1 قائمة الموظفين

نموذج الإنشاء: الاسم، كلمة المرور الظاهرة، اسم المنصب، بداية العمل، نهاية العمل. الجدول: الاسم، المنصب، بداية ونهاية العمل، الحالة، تاريخ الإنشاء، آخر دخول، وزر عرض. البحث بالاسم والمنصب، وفلتر الحالة، والترتيب الافتراضي بالأحدث.

الاسم مطلوب، وكلمة المرور ستة أحرف على الأقل بما يوافق الفرونت. المقترح أن normalizedName فريد حتى لا يلتبس اسم تسجيل الدخول. البداية والنهاية بصيغة HH:mm. يسمح بدوام يعبر منتصف الليل، مثل 20:00 إلى 04:00، ويسجل crossesMidnight. تساوي البداية والنهاية مرفوض ما لم يضاف لاحقًا مفهوم دوام 24 ساعة.

### 2.2 صفحة الموظف

تعرض البيانات الأساسية، وكلمة المرور لمن يملك الصلاحية، وتعديل الاسم والمنصب والمواعيد والحالة. وتضم زر الانصراف إذا كان له حضور مفتوح، وجدول الأجهزة، وإعداد الصلاحيات، وجدول الحضور، وجدول سجل أحداث الشخص.

كل جدول له page وpageSize وفلاتر مستقلة. استجابة التفاصيل لا تحمل كل السجلات؛ الجداول تقرأ من endpoints منفصلة.

## 3. حالات الموظف

- ACTIVE: يمكنه الدخول والعمل.
- SUSPENDED: لا يحصل على جلسة جديدة وتلغى جلساته الحالية.
- ARCHIVED: محفوظ للتاريخ ولا يستخدم تشغيليًا.

الانتقالات ACTIVE إلى SUSPENDED والعكس، ثم ACTIVE أو SUSPENDED إلى ARCHIVED. لا حذف فعلي لموظف له حضور أو أجهزة أو عمليات. لا يستطيع الموظف إيقاف نفسه، ولا إيقاف آخر SUPER_ADMIN نشط، ولا تعديل شخص أعلى منه.

إنشاء الموظف ينشئ الموظف وصلاحياته الافتراضية ويسجل EMPLOYEE_CREATED في transaction واحدة. تعديل البيانات يزيد version. تعديل المواعيد لا يغير حضورًا بدأ؛ الحضور يحتفظ بنسخة من الموعد. تغيير كلمة المرور يلغي الجلسات ولا يحذف الأجهزة، ولا تسجل القيمة القديمة أو الجديدة في Audit.

## 4. الأجهزة وFingerprintJS

FingerprintJS يرسل fingerprint مع اسم الجهاز وUser Agent. البصمة إشارة تعريف وليست وحدها إثبات هوية؛ الدخول يحتاج كلمة صحيحة وموظفًا نشطًا وجهازًا معتمدًا.

حالات الجهاز: PENDING ينتظر الأدمن، APPROVED مسموح، REJECTED مرفوض، وBLOCKED محظور حتى فك الحظر.

### 4.1 جهاز جديد

1. يتحقق الخادم من الاسم وكلمة المرور أولًا.
2. كلمة خاطئة لا تنشئ جهازًا.
3. الموظف الموقوف لا ينشئ جلسة أو حضورًا.
4. بصمة جديدة تنشئ جهازًا PENDING.
5. لا تصدر Tokens ولا يسجل حضور.
6. تعاد pendingDeviceApproval=true وبيانات آمنة.
7. التكرار يحدث lastSeenAt وعداد المحاولات ولا يكرر الصف.

الموافقة تغير PENDING أو REJECTED إلى APPROVED وتسجل المراجع والوقت. يمكن اعتماد عدة أجهزة. الموافقة لا تسجل حضورًا؛ يعيد الموظف الدخول. الرفض يحول PENDING إلى REJECTED. الحظر يلغي جلسات الجهاز فورًا. فك الحظر يحتاج صلاحية وسببًا.

القرارات المتزامنة تستخدم version؛ الأول ينجح والثاني VERSION_CONFLICT. إعادة الأمر بنفس Idempotency-Key تعيد نفس النتيجة.

## 5. تسجيل الدخول والجلسة

ترتيب الفحص: البيانات، الموظف، كلمة المرور، حالته، الجهاز، ثم الجلسة والحضور. رسالة الاسم أو الكلمة الخطأ عامة.

استجابة الانتظار تحتوي success وpendingDeviceApproval وmessage وdevice بالحالة PENDING.

استجابة النجاح تحتوي employee ببياناته وحضوره الحالي، role، permissions بعناصر page_key وlabel وvisible وactions، notifications، shift، وauth الذي يضم access_token وrefresh_token. هذا يطابق ما ينتظره الفرونت.

الـSidebar يعتمد page_key وvisible. الباك يفحص actions لكل endpoint. shift يخص الدرج ولا يفتح بالحضور. Refresh token مرتبط بالموظف والجهاز؛ حظر الجهاز أو إيقاف الموظف يمنع التجديد.

## 6. الحضور

أول دخول ناجح خلال يوم العمل من جهاز APPROVED ينشئ attendanceRecord مفتوحًا. الدخول المتكرر يعيد الحضور المفتوح ولا يكرر الصف. يحفظ checkInAt من الخادم، والجهاز والجلسة، ونسخة workStart وworkEnd والمنطقة الزمنية.

lateMinutes هو الفرق بعد البداية مع graceMinutes. قبل الموعد وفترة السماح ON_TIME، وبعدها LATE. دوام منتصف الليل ينسب الدخول بعد منتصف الليل ليوم العمل السابق عندما يقع داخل نافذة الدوام.

إذا وجد حضور قديم مفتوح خارج نافذة الدوام فلا ينشأ سجل ثان بصمت؛ يحتاج إغلاقًا إداريًا بوقت وسبب. pending وblocked وكلمة خطأ لا تنشئ حضورًا.

## 7. الانصراف

زر الانصراف يظهر لمن يملك employees.attendance.check_out عند وجود حضور OPEN. يتحقق الخادم من الصلاحية، ويستخدم وقته، ويسجل checkOutAt وcheckedOutBy وADMIN، ويحسب workedMinutes، ويغلق السجل ويسجل الحدث.

لا حضور مفتوح يرجع NO_OPEN_ATTENDANCE. لا يمكن أن يسبق الانصراف الحضور. الضغط بنفس المفتاح يعيد النتيجة، وبعد الإغلاق لا ينشئ ثانيًا. التصحيح AttendanceAdjustment بسبب وصلاحية.

الحضور والدرج دورتان مستقلتان. إذا كان الموظف مسؤولًا عن درج مفتوح تظهر المعلومة. السياسة المقترحة تمنع الانصراف حتى إغلاق الدرج أو نقل مسؤوليته إداريًا.

## 8. الصلاحيات

الصلاحيات مستويان: ظهور الصفحة والأفعال. الظهور لا يمنح التنفيذ، والإخفاء لا يغني عن منع API.

مفاتيح الفرونت: suppliers, inventory, warnings, purchases, returns, products, orders_online, orders_tables, orders_table_services, orders_history, orders_preparation, customers, delegates, drawer, employees. يضاف audit_log للسجل العام.

أفعال الموظفين تشمل read وcreate وupdate وchange_status وview_password وchange_password وpermissions.manage وdevices.read/review/block/unblock وattendance.read/check_out/correct وaudit.read.

لا يمنح المستخدم صلاحية لا يملكها، ولا يعدل رتبة مساوية أو أعلى حسب role.level. تغيير الصلاحيات يزيد permissionsVersion لتطبق فورًا.

## 9. سجل أحداث الشخص

مصدره auditEvents العام مع actorEmployeeId. الأحداث الإدارية الواقعة عليه تستخدم subjectEmployeeId وتعرض بفلتر مستقل. لا Collection مكررة لسجل الشخص.

الحدث يحتوي المنفذ والموديول والصفحة والفعل والكيان ووصفًا آمنًا والتغييرات غير الحساسة وIP والجهاز وrequestId والنتيجة والوقت. لا يحتوي كلمة مرور أو Token أو Authorization أو بصمة كاملة. مشاهدة الكلمة تسجل EMPLOYEE_PASSWORD_VIEWED فقط.

السجلات immutable. أحداث النظام actorType=SYSTEM. جدول الشخص والسجل العام Pagination 10 مع فلاتر التاريخ والموديول والفعل والنتيجة.

## 10. Pagination

كل endpoint قائمة يقبل page موجبًا وpageSize افتراضي 10، والحد الأقصى 100. الاستجابة تحتوي data وpagination: page وpageSize وtotalItems وtotalPages وhasNext وhasPrevious. الفلاتر تسبق العد، والترتيب يضم _id كفاصل ثابت. الصفحة بعد النهاية تعيد قائمة فارغة وبيانات صحيحة.

## 11. Schemas

### employees

_id، name، normalizedName unique، passwordPlainText مع select:false، position، roleId، status، workStart، workEnd، crossesMidnight، timezone، graceMinutes، permissionsVersion، lastLoginAt، createdAt/By، updatedAt/By، statusChangedAt/By، statusChangeReason، version.

### roles والصلاحيات

roles: _id، name unique، level، description، isSystem، timestamps.

permissions: _id، key unique، pageKey، action، label.

rolePermissions: roleId، permissionId، unique عليهما.

employeePermissions: employeeId، permissionId، effect ALLOW أو DENY، grantedAt/By، reason، unique عليهما. DENY يغلب ALLOW.

employeePageAccess: employeeId، pageKey، visible، updatedAt/By، unique employeeId مع pageKey. عقد عرض للـSidebar، والحماية الفعلية permissions.

### employeeDevices

_id، employeeId، fingerprint، fingerprintHash، name، browser، os، userAgentSummary، status، firstSeenAt، lastSeenAt، lastLoginAt، attemptCount، approvedAt/By، rejectedAt/By، blockedAt/By، decisionReason، version، timestamps. unique employeeId مع fingerprintHash.

### authSessions وloginAttempts

authSessions: employeeId، deviceId، refreshTokenHash، issuedAt، lastUsedAt، expiresAt TTL، revokedAt/By، revokeReason، IP وUser Agent. Tokens لا تحفظ واضحة.

loginAttempts: employeeId nullable، normalizedLoginName، deviceId، fingerprintHash، result، IP، occurredAt، requestId. النتائج SUCCESS وINVALID_CREDENTIALS وPENDING_DEVICE وBLOCKED_DEVICE وSUSPENDED. لا كلمة مرور.

### attendanceRecords

_id، employeeId، attendanceDate، scheduledStart، scheduledEnd، crossesMidnightSnapshot، timezoneSnapshot، graceMinutesSnapshot، checkInAt، checkInDeviceId، checkInSessionId، checkOutAt، checkedOutBy، checkOutMethod، lateMinutes، workedMinutes، status OPEN/CLOSED/ADMIN_CORRECTED، notes، version، timestamps.

فهرس employeeId مع attendanceDate، وunique جزئي لحضور OPEN واحد. attendanceAdjustments يحتفظ attendanceId والقيم القديمة والجديدة الآمنة والسبب والمنفذ والوقت.

### auditEvents

_id، eventNo، actorType، actorEmployeeId، subjectEmployeeId، module، pageKey، action، entityType، entityId، description، changesSafe، result، ipAddress، deviceId، requestId، correlationId، occurredAt، metadataSafe. فهارس المنفذ والموضوع والموديول والكيان مع الوقت. لا update أو delete API.

## 12. API

- GET وPOST /api/users.
- GET وPUT /api/users/:id وPATCH للحالة.
- GET /api/users/:id/password للمشاهدة المدققة.
- PUT /api/users/:id/password للتغيير وإلغاء الجلسات.
- GET وPUT /api/users/:id/page-access.
- GET أجهزة الموظف، وأوامر approve وreject وblock وunblock.
- POST auth/login وrefresh وlogout وlogout-all.
- GET حضور الموظف، وPOST attendance/check-out، وPOST adjustments.
- GET أحداث الموظف وGET السجل العام.

## 13. الربط مع النظام

كل createdBy وupdatedBy وrecordedBy وapprovedBy وregisteredBy وreturnedBy وopenedBy وclosedBy يشير إلى employees._id. المستندات التاريخية المهمة تحفظ employeeNameSnapshot وpositionSnapshot.

دفعة دين المورد تحتاج موظفًا ودرجًا مفتوحًا. المشتريات تسجل المنفذ وتضيف مخزونًا بلا حركة مورد أو درج. السحب والمرتجع والبيع يحفظون المنفذ. فتح وإغلاق الدرج مرتبط بموظف. كل ذلك ينشئ auditEvent وصفحة الموظف تعرض ما نفذه.

## 14. الحالات واختبارات القبول

1. كلمة خاطئة لا تنشئ جهازًا أو حضورًا.
2. جهاز جديد صحيح يصبح PENDING بلا Tokens.
3. الموافقة لا تسجل الحضور حتى إعادة الدخول.
4. عدة أجهزة APPROVED تعمل.
5. حظر جهاز يلغي جلساته فقط.
6. إيقاف الموظف يلغي جميع جلساته.
7. أول دخول يسجل حضورًا واحدًا.
8. التأخير يحسب من Snapshot.
9. منتصف الليل ينسب لليوم الصحيح.
10. الانصراف الإداري يحدث مرة واحدة.
11. الانصراف بلا OPEN مرفوض.
12. تعديل الموعد لا يغير القديم.
13. تغيير الكلمة يلغي الجلسات ويحفظ الأجهزة.
14. القوائم لا تعرض الكلمة.
15. عرضها يحتاج صلاحية ويسجل الحدث.
16. المدير لا يمنح ما لا يملك.
17. الموظف الموقوف يبقى تاريخيًا.
18. Pagination مستقلة لكل جدول.
19. Audit لا يسرب أسرارًا.
20. تزامن قرار الجهاز يحسمه version.
21. Idempotency يمنع تكرار الانصراف.
22. الدرج المفتوح يعالج قبل الانصراف.
23. لا حذف لموظف ذي مراجع.
24. انتهاء الجلسة لا يغلق الحضور تلقائيًا.
25. إعادة الدخول بعد انقطاع لا تكرر الحضور.
26. BLOCKED لا يعود تلقائيًا.
27. تغير البصمة يعامل كجهاز جديد.
28. ملخص العد يعتمد count لا طول الصفحة.
29. فشل جزء من transaction يرجع العملية كلها.
30. كل وقت يسجل UTC ويعرض Africa/Cairo.

## 15. مراجعة الفرونت

تمت مراجعة AddEmployeeForm وEmployeeEditor وEmployeeDevices وEmployeePageAccess وEmployeeActivity وEmployeeDetailsPage وemployeesService وloginService وuseLogin وAuthBootstrap وProtectedRoute وSidebar وendpoints. العقد يحافظ على page_key وvisible وauth وemployee وrole وpermissions وnotifications وshift.
