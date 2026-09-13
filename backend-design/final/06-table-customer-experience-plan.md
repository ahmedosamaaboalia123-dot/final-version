# خطة جزء الطاولة — تجربة العميل على الطربيزة

الإصدار 1.0. المشروع له ثلاث واجهات مستقلة فوق نفس الباك إند:

1. Admin: إدارة وتشغيل الكافيه.
2. Table: تجربة العميل الجالس على طربيزة بواسطة QR.
3. Customer: طلبات الأونلاين والتيك أواي.

هذه الوثيقة تضيف واجهة Table دون تغيير تحليل Admin القائم.

## 1. القرارات

- الصفحة الرئيسية تبقى بروح وتصميم الفرونت الحالي.
- حذف قسم العروض وكل Weekly Offer أو Promo من جزء الطاولة.
- حذف المساعد/الويتر الذكي وChatbot وAI Modal وروابطه وRoute الخاص به.
- العميل على الطربيزة لا يؤكد Order.
- العميل يضيف المنتجات للسلة ثم يضغط «طلب الجرسون».
- الضغط يرسل Proposal ومكالمة جرسون للإدارة، ولا يخصم مخزونًا.
- الموظف يراجع السلة مع العميل ثم يؤكدها من Admin.
- عند تأكيد الموظف فقط ينشأ Order أو تضاف العناصر للطلب القائم ويخصم المخزون.
- خدمات الجرسون الخمس مرتبطة بالإدارة Realtime.
- صفحة الطلبات تعرض طلبات جلسة الضيف فقط.
- صفحة التتبع تعرض حالة كل منتج والأعداد والإجماليات Realtime.
- صفحة التقييمات تعرض الآراء، ويظهر ترك التقييم للطلب المكتمل.
- لا بيانات اسم/هاتف/عنوان للعميل على الطربيزة.

## 2. حدود الواجهات الثلاث

### Admin

Employee Auth + Device Approval + Permissions. يستطيع تأكيد Proposal، تجهيز وإلغاء وإنهاء ودفع وطباعة وحل خدمات الطربيزة.

### Table

X-Table-Token من QR، بلا Employee Token وبلا Customer Account. يرى Table Catalog وCart وطلبات جلسة الطربيزة وخدماتها وتقييماتها فقط.

### Customer

طلبات Delivery/Pickup وCustomer Account/Phone/Address/Tracking/Reviews. لا يستخدم Table Token.

لا يقبل Endpoint Token من نوع مكان Token آخر.

## 3. Routes النهائية للطاولة

- /table/:tableId — الترحيب والرئيسية.
- /table/:tableId/menu — المينيو والفلاتر.
- /table/:tableId/menu/product/:productId — تفاصيل المنتج والحجم.
- Cart Drawer أو /table/:tableId/cart.
- /table/:tableId/orders — طلبات الجلسة.
- /table/:tableId/orders/:orderId/track — المتابعة.
- /table/:tableId/feedback — التقييمات وترك تقييم.
- /table/:tableId/services — خدمات الجرسون.

يحذف:

- /table/:tableId/chatbot.
- /table/chatbot.
- روابط AI من Header وHero وDrawer.
- WeeklyOfferBanner وoffers-anchor وأكواد الخصم الخاصة بالطاولة.
- Fortune Wheel وPersonality Quiz إذا كانا يعتمدان عروضًا/ذكاءً أو نقاطًا غير موجودة بالباك.
- اختيار طربيزة يدويًا من العميل؛ رقم الطربيزة يأتي من QR Token لمنع تبديلها.

يمكن الاحتفاظ بمعلومات الفرع، Footer، Notifications الخاصة بحالة الطلب، الأكثر طلبًا، الأقسام والتقييمات.

## 4. بدء جلسة الضيف

QR لكل طربيزة يحمل tableNumber وQR secret آمن. عند المسح:

1. GET bootstrap يتحقق من QR signature والطربيزة ACTIVE.
2. ينشئ أو يستعيد tableGuestSession.
3. يصدر X-Table-Token قصير العمر مرتبطًا بالطربيزة.
4. يعيد branding، table، active order summary، cart proposal summary، service summary، routes/features.
5. الواجهة تحفظ Token في sessionStorage لا localStorage الدائم.
6. Token لا يغير حالة كارد Admin.

tableGuestSession منفصلة عن tableSession. الأولى لجلسة تصفح العميل. الثانية تبدأ عندما يؤكد الموظف أول Order وتحدد OCCUPIED في Admin.

تغلق Guest Session عند إنهاء/إلغاء جلسة الطربيزة أو انتهاء صلاحيتها أو تدوير QR. يمكن تجديد Token ما دامت الجلسة صالحة.

## 5. الصفحة الرئيسية

الترتيب:

1. Header: الشعار، رقم الطربيزة، Notifications، السلة، القائمة.
2. Welcome/Hero: «مرحبًا بك على طربيزة رقم X».
3. Active Order Bar إن وجد، مع الحالة والتتبع.
4. Search يوجه للمينيو.
5. Category shortcuts.
6. Best sellers من المنتجات الفعلية المتاحة.
7. Reviews preview مع «عرض الكل».
8. Quick services: خدمات الجرسون.
9. Branch information.
10. Footer.
11. Bottom navigation: الرئيسية، المينيو، السلة، طلباتي، الخدمات.

لا عروض ولا Chatbot ولا زر «اطلب الآن وأكد». النص يصبح «اختر طلبك ثم اطلب الجرسون لمراجعته».

بيانات Best Sellers من تقرير الطلبات المكتملة، لا Mock. فشل تحميلها لا يمنع المينيو.

## 6. المينيو والفلاتر

يعرض Product Catalog نفسه المستخدم في Admin وCustomer، مع tableMode:

- الأقسام الفعالة.
- البحث.
- فلتر القسم.
- المنتج والأنواع والأحجام.
- السعر الحالي.
- الصورة والوصف.
- الإتاحة الحالية.
- الملاحظات والتخصيصات المدعومة.
- إضافة للسلة.

المنتج المخفي أو غير النشط لا يظهر. نقص المخزون يمكن أن يظهر «غير متاح»، لكن الفحص النهائي عند اعتماد الموظف.

لا أسعار Mock، ولا عروض، ولا Coupon، ولا AI recommendations.

Catalog Response مستهدف أقل من ثانية ويمكن Cache قصيرًا حسب catalogVersion.

## 7. السلة

السلة محلية حتى الضغط على طلب الجرسون. تحتوي:

- productId/productSizeId.
- الاسم/النوع/الحجم للعرض.
- quantity.
- unitPrice preview.
- notes/customizations.
- line estimate.
- subtotal estimate.
- total units.

العميل يستطيع الزيادة والنقص والحذف والتفريغ. الإجمالي استرشادي حتى مراجعة الموظف؛ الخادم يعيد السعر عند Proposal.

الزر الرئيسي الوحيد: «طلب الجرسون لمراجعة الطلب». لا زر «تأكيد طلب الطربيزة».

## 8. إرسال السلة وطلب الجرسون

عند الضغط:

1. منع السلة الفارغة.
2. توليد Idempotency-Key.
3. إرسال العناصر مع X-Table-Token.
4. الخادم يتحقق من Guest Session والطربيزة والمنتجات.
5. يحسب Preview بالأسعار الحالية دون حجز أو خصم.
6. ينشئ tableOrderProposal بحالة WAITING_WAITER.
7. ينشئ/يربط tableServiceRequest نوع CALL_WAITER وغرض ORDER_REVIEW.
8. يحفظ proposalId داخل طلب الخدمة.
9. Audit + Outbox داخل Transaction.
10. Realtime يظهر الطلب في Admin Table Services وكارد/صفحة الطربيزة.
11. السلة تصبح Submitted/read-only بدل مسحها فورًا.
12. تظهر للعميل «تم طلب الجرسون لمراجعة الطلب».

لا Order ولا Inventory Movement ولا Customer ولا Payment ولا Table Session تشغيلية في هذه الخطوة.

## 9. حالات Proposal

- WAITING_WAITER: أرسل وينتظر.
- UNDER_REVIEW: الموظف فتحه ويتحدث مع العميل.
- NEEDS_CHANGES: يحتاج تعديل من العميل/الموظف.
- CONFIRMED: الموظف أنشأ Order أو أضاف للطلب.
- REJECTED: رفض بسبب منتج/سعر/طلب العميل.
- CANCELLED: ألغاه العميل قبل الاعتماد.
- EXPIRED: انتهت Guest Session أو المهلة.

الانتقالات بأوامر. CONFIRMED/REJECTED/CANCELLED/EXPIRED نهائية.

لا يوجد أكثر من Proposal نشط لنفس Guest Session. إذا عدل العميل السلة بعد WAITING، يلغي Proposal أو ينشئ Revision بأمر واضح؛ النسخة الأولى تجعلها read-only وتوفر «إلغاء وإعادة التعديل».

## 10. مراجعة الموظف في Admin

طلب CALL_WAITER/ORDER_REVIEW يعرض:

- الطربيزة.
- وقت الانتظار.
- عناصر السلة والكميات والملاحظات.
- Preview القديم والسعر الحالي وأي فرق.
- حالة المخزون الحالية.
- طلب نشط حالي للطربيزة إن وجد.
- أزرار: بدء المراجعة، تأكيد وإرسال للتحضير، رفض، تم التعامل بعد القرار.

الموظف لا يعتمد السعر المرسل من العميل. يعيد الباك Validation وPricing وAllocation لحظة التأكيد.

إذا لا يوجد Order نشط:

- ينشئ Table Session + DINE_IN Order.
- يخصم المخزون.
- الكارد يصبح مشغولًا.
- الطلب يظهر في التحضير.

إذا يوجد Order PREPARING أو READY:

- يضيف العناصر كـappend.
- READY يعود PREPARING.
- لا ينشئ Order ثانيًا.

إذا Order CLOSING/COMPLETED/CANCELLED، لا يضاف إليه؛ يحتاج جلسة/طلب جديد وفق حالة الطربيزة.

بعد النجاح Proposal=CONFIRMED، Service=RESOLVED، العميل يمسح السلة ويعرض orderNumber ورابط التتبع.

## 11. Race Conditions

### العميل يضغط مرتين

Idempotency يعيد Proposal نفسها. Partial Unique يمنع Proposal نشطة ثانية.

### الموظفان يؤكدان Proposal

update يشترط WAITING_WAITER/UNDER_REVIEW + version. واحد ينجح. confirmedOrderId unique يمنع Order مزدوجًا.

### الموظف يؤكد والعميل يلغي

أول Transaction تحسم. إن CANCELLED أولًا يفشل التأكيد. إن CONFIRMED أولًا يفشل الإلغاء ويعرض رقم الطلب.

### السعر تغير

التأكيد يعيد currentPrice. إذا الفرق موجود، Proposal يدخل NEEDS_CHANGES أو الموظف يؤكد بعد موافقة العميل مع priceChangeAcknowledged=true. لا يخصم بصمت بسعر مختلف.

### المخزون نفد

Proposal يبقى UNDER_REVIEW/NEEDS_CHANGES بلا خصم جزئي. الموظف يعدل أو يرفض.

### طلب قائم يصبح READY أثناء التأكيد

Append وReady يستخدمان order.version. النتيجة النهائية PREPARING إذا أضيفت عناصر جديدة.

### الطربيزة أغلقت

guestSession/token/proposal تصبح EXPIRED أو CANCELLED. لا تأكيد على Session CLOSED.

### Timeout

العميل/الموظف يعيد نفس Idempotency-Key ويتحقق من operation status. لا Proposal/Order مكرر.

## 12. صفحة الطلبات

تعرض Orders المرتبطة بـtableGuestSession/tableSession الحالية فقط:

- orderNumber.
- tableNumber.
- createdAt.
- item counts.
- total.
- status.
- زر متابعة.
- زر فاتورة عندما تتاح.
- review status بعد completion.

تعرض أيضًا Proposal النشطة منفصلة كـ«في انتظار مراجعة الجرسون»، ولا تخلطها مع Order مؤكد.

Pagination 10 للسجل. Active Order يظهر أعلى الصفحة.

## 13. متابعة الطلب

Realtime ويعرض:

- رقم الطلب والطربيزة.
- PREPARING/READY/COMPLETED/CANCELLED.
- كل عنصر وحالته.
- readyCount/preparingCount/cancelledCount.
- progress percentage.
- المكونات من Recipe Snapshot.
- totals.
- timeline.
- invoice عند الجاهزية/الإكمال حسب السياسة.
- وقت آخر تحديث.

العميل لا يضغط Ready أو Cancel أو Complete. هذه أوامر Admin. يمكنه طلب الجرسون لإجراء تعديل/إلغاء، فينفذ الموظف من Admin.

Socket Event يحمل version. Reconnect يعمل GET. Event قديم لا يرجع الحالة.

## 14. صفحة التقييمات

جزآن:

1. Reviews عامة مرئية Paginated، مع متوسط وعدد.
2. «اترك تقييمك» للطلبات المكتملة في Guest Session ولم تُقيّم.

Review للطربيزة مرتبط orderId وtableGuestSessionId، بلا Customer Account. rating 1..5، comment اختياري، tags اختيارية. Review واحدة لكل Order.

لا يظهر النموذج قبل COMPLETED أو للملغي. يمكن تعديل خلال 24 ساعة مع Revision. الإدارة تستطيع إخفاء تعليق دون تغيير النجوم.

التقييم الجديد يظهر في Admin Reviews/Audit، وبعد moderation policy يظهر في قائمة الآراء. لا يسمح بتقييم عام بلا Order لمنع الوهمي.

## 15. خدمات الجرسون

الخمس خدمات كما وثقت:

- مناداة جرسون.
- مياه.
- مفاجأة/حفلة.
- الحساب.
- مشكلة.

مرتبطة بـtableGuestSession، وtableSessionId اختياري قبل أول Order. تظهر Realtime في Admin. «تم التعامل» يحولها للمنتهي.

CALL_WAITER من السلة يحمل purpose=ORDER_REVIEW وproposalId. CALL_WAITER عادي بلا سلة purpose=GENERAL.

طلب الحساب يحتاج Order نشط. المياه المدفوعة تضاف Order Item بواسطة الموظف. المشكلة لا تلغي تلقائيًا.

## 16. الإضافات الموجودة بالفرونت

يبقى:

- Header/Branding.
- Welcome Hero.
- Search/Categories.
- Best Sellers.
- Product Details.
- Cart.
- Active Order Bar.
- Orders/Tracking/Invoice.
- Reviews.
- Services.
- Notifications الخاصة بالطلب.
- Branch info/Footer.
- Bottom Nav.

يحذف من Table:

- Weekly Offers/Coupons.
- Chatbot/AI Barista/AiBotModal.
- AI route/navigation.
- Fortune Wheel.
- Personality Quiz.
- Invite Friends إن لم يكن له Backend مطلوب.
- تغيير رقم الطربيزة يدويًا من TableSelector.
- Mock Orders/Reviews/Prices عند الربط الحقيقي.
- زر Confirm Order من Cart.

هذه التغييرات لا تحذف العروض أو AI من تطبيق Customer العام إذا قرر صاحب المشروع إبقاءها هناك؛ القرار خاص بواجهة Table.

## 17. Schemas الجديدة والتعديلات

### tableGuestSessions

_id، guestSessionNumber، tableId، tableNumberSnapshot، tokenHash select:false، qrVersion، status ACTIVE/CLOSED/EXPIRED/REVOKED، activeTableSessionId nullable، activeOrderId nullable، startedAt، lastSeenAt، expiresAt، closedAt، closeReason، deviceFingerprintHash، version، timestamps.

Indexes: tokenHash unique، tableId+status، expiresAt TTL مع الاحتفاظ بسجل مختصر قبل الحذف إذا لزم Audit.

### tableOrderProposals

_id، proposalNumber unique، tableGuestSessionId، tableId، tableNumberSnapshot، tableSessionId nullable، targetOrderId nullable، status، items array محدودة {lineNo,productId,productSizeId,quantity,notes,product/size snapshots,previewUnitPrice,previewLineTotal}، previewSubtotal/Total، catalogVersion، submittedAt، reviewStartedAt/By، confirmedAt/By، confirmedOrderId، rejection/cancellation/expiry fields، priceChangeAcknowledged، serviceRequestId، operationRequestId، version، timestamps.

Indexes: partial unique tableGuestSessionId للحالات النشطة، status+submittedAt، tableId+status، confirmedOrderId partial unique، serviceRequestId unique.

### tableServiceRequests تعديل

tableGuestSessionId required لطلبات العميل، tableSessionId nullable، proposalId nullable، purpose GENERAL/ORDER_REVIEW، unique OPEN يعتمد guestSessionId+type+purpose. عند إنشاء Order يحدث tableSessionId.

### orderReviews تعديل

customerId nullable، tableGuestSessionId nullable. Exactly one owner context:

- PICKUP/DELIVERY: customerId موجود.
- DINE_IN: tableGuestSessionId موجود.

orderId unique يضمن Review واحدة.

### orders تعديل

tableGuestSessionId يضاف لـDINE_IN حتى تعرضه واجهة الجلسة. لا بيانات عميل.

## 18. API Table Experience

### Bootstrap

- POST /api/v1/table-experience/bootstrap — qrToken/tableNumber.
- POST /api/v1/table-experience/refresh.
- POST /api/v1/table-experience/logout.

### Catalog/Cart Proposal

- GET /api/v1/table-experience/catalog.
- GET /api/v1/table-experience/products/:id.
- POST /api/v1/table-experience/order-proposals.
- GET /api/v1/table-experience/order-proposals/current.
- POST /api/v1/table-experience/order-proposals/:id/cancel.

### Admin Proposal

- GET /api/v1/table-order-proposals — Pagination.
- GET /api/v1/table-order-proposals/:id.
- POST /api/v1/table-order-proposals/:id/start-review.
- POST /api/v1/table-order-proposals/:id/confirm.
- POST /api/v1/table-order-proposals/:id/request-changes.
- POST /api/v1/table-order-proposals/:id/reject.

### Orders/Tracking/Reviews

- GET /api/v1/table-experience/orders — Pagination.
- GET /api/v1/table-experience/orders/:id/tracking.
- GET /api/v1/table-experience/orders/:id/invoice.
- GET /api/v1/table-experience/reviews — Pagination.
- POST /api/v1/table-experience/orders/:id/review.
- PUT /api/v1/table-experience/orders/:id/review.

### Services

تستخدم Table Services API مع X-Table-Token، وتقبل Guest Session قبل Table Session.

## 19. Realtime

Rooms:

- table-guest:{guestSessionId}.
- table:{tableId}.
- table-services-admin.
- table-proposals-admin.
- order:{orderId}.

Events:

- proposal.created/under_review/needs_changes/confirmed/rejected/cancelled/expired.
- table-service.created/resolved/cancelled.
- order.created/updated/item.updated/completed.
- invoice.available.
- review.submitted.

كل Event eventId/entityVersion/occurredAt. لا Tokens أو بيانات حساسة.

## 20. الأداء

- Bootstrap وCatalog وProposal وTracking: p95 <=500ms وp99 <=1000ms.
- Proposal Confirm قد يصل 1000ms لأنه يخصم المخزون Transaction.
- Cache للCatalog فقط.
- Pagination 10.
- لا N+1 للمنتجات.
- Socket بعد Commit.
- الصور URLs.
- Table home يحمل Critical data أولًا، وReviews/Best Sellers لاحقًا بالتوازي.

## 21. سجل الأحداث

يسجل:

TABLE_GUEST_SESSION_STARTED/REFRESHED/CLOSED/EXPIRED/REVOKED.
TABLE_CATALOG_VIEWED.
TABLE_CART_PROPOSAL_SUBMITTED/CANCELLED.
TABLE_PROPOSAL_REVIEW_STARTED/CHANGES_REQUESTED/CONFIRMED/REJECTED/EXPIRED.
TABLE_ORDER_TRACKED.
TABLE_INVOICE_VIEWED.
TABLE_REVIEW_SUBMITTED/UPDATED.
TABLE_SERVICE_REQUESTED/RESOLVED/CANCELLED.
TABLE_TOKEN_DENIED/RATE_LIMITED.

لا يسجل محتوى السلة عند كل تعديل محلي؛ يسجل Snapshot عند Submit. لا Token واضح.

## 22. Data Flow

~~~mermaid
flowchart TD
 QR[QR طربيزة] --> GS[Guest Session + Token]
 GS --> H[الرئيسية]
 H --> M[المينيو والفلاتر]
 M --> C[السلة المحلية]
 C --> W[طلب الجرسون]
 W --> P[Proposal WAITING]
 P --> S[Service Realtime في Admin]
 S --> R[الموظف يراجع]
 R --> Q{يوجد Order نشط؟}
 Q -- لا --> N[إنشاء Table Session + Order]
 Q -- نعم --> A[Append للOrder]
 N --> I[خصم المخزون]
 A --> I
 I --> O[PREPARING ثم التحضير]
 O --> T[تتبع Realtime]
 T --> F[COMPLETED + Invoice]
 F --> V[ترك تقييم]
~~~

## 23. الحالات ومعايير القبول

1. المشروع يفصل Admin/Table/Customer Tokens.
2. QR صحيح ينشئ Guest Session.
3. QR خطأ لا يكشف بيانات طربيزة.
4. Guest Session لا تشغل كارد Admin.
5. الصفحة الرئيسية بلا عروض.
6. لا Route أو زر Chatbot في Table.
7. لا Table Selector يدوي.
8. المينيو من Catalog الحقيقي.
9. المنتج المخفي لا يظهر.
10. السلة محلية قبل Submit.
11. لا زر Confirm Order للعميل.
12. الزر الرئيسي طلب الجرسون.
13. السلة الفارغة لا ترسل.
14. Submit ينشئ Proposal + Service.
15. Submit لا يخصم مخزونًا.
16. Submit لا ينشئ Order.
17. التكرار يعيد نفس Proposal.
18. السلة Submitted تصبح read-only.
19. العميل يستطيع إلغاء قبل Confirm.
20. Admin يرى Proposal Realtime.
21. Admin يعيد السعر والمخزون.
22. تغير السعر يحتاج موافقة.
23. نقص المخزون لا يخصم جزئيًا.
24. Confirm أول طلب ينشئ Table Session.
25. Confirm على طلب قائم يعمل Append.
26. READY يعود PREPARING عند Append.
27. Proposal مؤكدة لا تؤكد ثانية.
28. Confirm/Cancel المتزامنان يحسمهما version.
29. بعد Confirm تمسح السلة.
30. Order يظهر في صفحة طلبات الطاولة.
31. Proposal لا تظهر كOrder.
32. Tracking يعرض حالة كل Item.
33. Tracking يعرض counts/totals.
34. Reconnect يعمل Refetch.
35. العميل لا يغير Ready/Cancel/Complete.
36. طلب التعديل يمر بالجرسون.
37. الخدمات الخمس تعمل Realtime.
38. خدمة قبل Order تربط Guest Session.
39. طلب الحساب يحتاج Order نشط.
40. المياه لا تخصم كخدمة.
41. Review يظهر بعد DINE_IN COMPLETED.
42. Review واحدة لكل Order.
43. Review بلا Order مرفوض.
44. Customer Review وTable Review يستخدمان نفس Collection بعلاقة مالك مختلفة.
45. إنهاء Table Session يغلق Guest Session.
46. Token مغلق لا يقرأ الطلبات.
47. سجل الطلبات Pagination 10.
48. Reviews Pagination 10.
49. API أقل من هدف الثانية.
50. Audit لا يسجل Token.
51. Event قديم لا يرجع UI.
52. فشل Socket لا يفقد Proposal.
53. انتهاء Proposal لا ينشئ Order.
54. إلغاء Service المرتبطة لا يؤكد Proposal.
55. رفض Proposal يبقي المخزون كما هو.
56. تعديل الاسم/السعر لاحقًا لا يغير Snapshot.
57. DINE_IN بلا بيانات Customer.
58. الفاتورة تأتي من invoiceSnapshot.
59. عطل الطباعة لا يغير الطلب.
60. تحليل Admin السابق يظل كما هو؛ الإضافة فقط قناة Proposal قبل أمره.

## 24. تعديلات الفرونت المطلوبة لاحقًا

- إزالة TableChatbotPage imports/routes/navigation.
- إزالة WeeklyOfferBanner وhandleApplyOffer.
- إزالة AiBotModal وAI state/actions.
- إزالة FortuneWheel/PersonalityQuiz/InviteFriends من Table إن لم يعتمد لها Backend.
- استبدال submitTableOrder بـsubmitTableOrderProposal.
- تغيير نص زر السلة إلى «طلب الجرسون لمراجعة الطلب».
- عدم مسح السلة قبل proposal.confirmed event.
- إضافة Proposal Status UI.
- ربط Feedback بالOrder المكتمل.
- ربط Services بالأنواع الخمسة الجديدة.
- منع تغيير tableNumber يدويًا واعتماده من Token.
- إزالة Mock fallbacks في Production.
