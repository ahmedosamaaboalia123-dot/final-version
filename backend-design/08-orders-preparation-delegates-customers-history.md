# الطلبات والتحضير والمندوبون والعملاء وسجل الطلبات — التحليل الكامل

الإصدار 1.0. امتداد للمرجع التنفيذي MERN. يغطي خمسة موديولات مترابطة: الطلبات الأونلاين والتيك أواي، التحضير، المندوبون، العملاء، وسجل الطلبات. طلبات الطاولات تستخدم نفس محرك الطلب والمخزون والتحضير، ويأتي تحليل جلسة الطربيزة وإنهائها كاملًا داخل هذه الوثيقة.

## 1. القرارات الحاكمة

1. شاشة الطلبات الأونلاين تحتوي كارد إنشاء طلب وكروت الطلبات النشطة.
2. صفحة البيع تختار PICKUP للتيك أواي أو DELIVERY للأونلاين.
3. PICKUP يحتاج الاسم والهاتف. DELIVERY يحتاج الاسم والهاتف والعنوان.
4. تأكيد الطلب ينشئ العميل أو يربطه، يثبت الأسعار والوصفة، يخصم المخزون من الدفعات حسب الأولوية، وينشئ الطلب في Transaction واحدة.
5. كل عنصر طلب له حالة PREPARING أو READY أو CANCELLED. الظاهر للمستخدم جاري التحضير أو جاهز.
6. حالة الطلب PREPARING إذا بقي عنصر نشط غير جاهز، وREADY إذا كانت كل العناصر النشطة جاهزة.
7. إضافة عنصر لطلب READY تعيده إلى PREPARING، وتبقي العناصر القديمة READY والجديدة PREPARING.
8. إلغاء عنصر أو الطلب يعيد نفس الكميات إلى نفس الدفعات التي خُصمت منها، وفق قرار المستخدم، وينشئ حركات عكسية مستقلة.
9. إنهاء PICKUP الجاهز يحوله إلى COMPLETED ويسلمه للعميل.
10. إنهاء DELIVERY الجاهز يحتاج اختيار مندوب، ثم يصبح OUT_FOR_DELIVERY. يظهر زر «تسليم» في صفحة المندوب بجوار الطلب، ويضغطه الأدمن بعد تأكيد الاستلام، فيتحول الطلب إلى COMPLETED.
11. لكل طلب رقم فريد، Tracking Code، وQR/Barcode يحمل رابط تتبع آمن.
12. كل طلب له فاتورة قابلة للطباعة من شاشة الطلب ومن العميل والمندوب والسجل.
13. كل جدول أو سجل Server-side Pagination، افتراضي 10.
14. كل تغيير حالة أو مخزون أو تسليم أو مشاركة واتساب يسجل الوقت والمنفذ وسجل أحداث.
15. الأسعار والتكاليف والوصفات والعناوين والأسماء تحفظ Snapshots حتى لا يتغير التاريخ.

## 2. المصطلحات وحدود الموديولات

- Order: رأس الطلب ومصدره والعميل والإجماليات والحالة.
- Order Item: سطر بيع لحجم منتج وكمية وحالة مستقلة.
- Inventory Allocation: توزيع خامات السطر على دفعات المخزون الفعلية.
- Preparation: قراءة تشغيلية للطلبات وعناصرها، وليست نسخة ثانية منها.
- Delivery Assignment: تسليم طلب DELIVERY لمندوب.
- Customer: حساب العميل الذي ترتبط به طلباته.
- Delegate: بيانات المندوب وحالته وتكليفاته.
- Invoice: Read Model ثابت من الطلب وSnapshots، وليست Collection مالية مكررة.
- Tracking: قراءة عامة محدودة للطلب باستخدام Code وToken.

الموديولات الخمسة تشترك في orders وorderItems، ولا تنسخ الطلب في كل قسم. التحضير والسجل والعملاء والمندوبون يعرضون Queries مختلفة لنفس المصدر.

## 3. حالات الطلب

### 3.1 الحالات الداخلية

- PREPARING: مؤكد ومخزونه مخصوم ويوجد عنصر نشط غير جاهز.
- READY: كل العناصر النشطة جاهزة ولم تُسلّم.
- OUT_FOR_DELIVERY: طلب توصيل سُلّم لمندوب ولم يؤكد التسليم.
- COMPLETED: تيك أواي سُلّم للعميل أو توصيل تم تسليمه.
- CANCELLED: أُلغي الطلب كله.
- PARTIALLY_CANCELLED ليست حالة رئيسية؛ تظهر كعلامة إذا أُلغي بعض العناصر وبقي غيرها.

يمكن الاحتفاظ بحالة DRAFT في الفرونت فقط قبل الضغط على التأكيد. لا تحفظ Draft على الخادم في النسخة البسيطة. إذا دعمت الطلبات العامة الواردة لاحقًا يمكن إضافة PENDING_ACCEPTANCE، لكن الطلب الذي ينشئه الموظف يبدأ PREPARING بعد نجاح التأكيد.

### 3.2 انتقالات الطلب

- تأكيد ناجح: لا شيء إلى PREPARING.
- تجهيز آخر عنصر نشط: PREPARING إلى READY.
- إضافة منتج إلى READY: READY إلى PREPARING.
- إضافة منتج إلى PREPARING: يبقى PREPARING.
- إلغاء بعض العناصر مع بقاء غير جاهز: يبقى PREPARING.
- إلغاء كل العناصر غير الجاهزة وباقي العناصر READY: يتحول READY.
- إلغاء آخر عنصر نشط: يتحول CANCELLED.
- إنهاء PICKUP من READY: COMPLETED.
- تعيين مندوب لـDELIVERY من READY: OUT_FOR_DELIVERY.
- ضغط الأدمن زر «تسليم» من صفحة المندوب: OUT_FOR_DELIVERY إلى COMPLETED مع deliveredAt وdeliveredConfirmedBy.
- إلغاء الطلب قبل COMPLETED: CANCELLED مع إرجاع كل التخصيصات غير المعكوسة.
- COMPLETED لا يعود إلى حالة سابقة. التصحيح بعد التسليم يحتاج Workflow استرجاع/Refund مستقل.

الخادم يشتق حالة الطلب ولا يقبل من العميل كتابة أي انتقال غير مسموح.

## 4. حالات عناصر الطلب

- PREPARING: جاري التحضير ومخزونه مخصوم.
- READY: تم التحضير.
- CANCELLED: أُلغي وعُكست تخصيصاته.
- يمكن إضافة DELIVERED للعرض فقط، لكن المصدر الأبسط يجعل التسليم على رأس الطلب؛ العناصر النشطة تعتبر مسلمة باكتمال الطلب.

زر تم التحضير يعمل على PREPARING فقط. READY مرة ثانية Idempotent. CANCELLED لا يعود READY. إلغاء عنصر PREPARING أو READY مسموح قبل تسليم الطلب، ويعيد مخزونه حسب القرار المتفق عليه. بعد OUT_FOR_DELIVERY لا تعديل عناصر أو إضافة أو إلغاء عادي حتى يعود الطلب من المندوب بأمر إداري موثق.

## 5. موديول الطلبات الأونلاين والتيك أواي

### 5.1 الصفحة الرئيسية

تحتوي كارد إنشاء طلب أونلاين، ثم كروت الطلبات غير المكتملة من النوع PICKUP وDELIVERY. كل كارد يعرض رقم الطلب، النوع، العميل، الوقت، الإجمالي، عدد العناصر، جاهز من إجمالي، الحالة العامة، وحالة كل عنصر. READY تظهر ككلمة جاهز، وPREPARING تظهر جاري التحضير.

الأزرار حسب الحالة:

- فتح ومتابعة في PREPARING.
- إضافة منتجات أخرى في PREPARING أو READY.
- إلغاء الطلب قبل التسليم.
- إنهاء الفاتورة في READY فقط.
- طباعة الفاتورة في كل حالة مع توضيح الحالة.
- عرض المندوب والتتبع في OUT_FOR_DELIVERY.
- لا تظهر COMPLETED وCANCELLED في الكروت النشطة؛ تظهر في السجل.

الكروت نفسها قائمة paginated، 10 في الصفحة. تحديث الحالة يصل بـSocket.IO، مع إعادة مزامنة بعد reconnect.

### 5.2 صفحة البيع

أعلى الصفحة Switch بين PICKUP وDELIVERY. DELIVERY هو معنى أونلاين/توصيل داخل شاشة الموظف.

حقول PICKUP: customerName وphone.
حقول DELIVERY: customerName وphone وaddress.
يمكن البحث بالهاتف أثناء الكتابة؛ إذا وجد عميل تُملأ بياناته ويمكن تعديل عنوان الطلب دون الكتابة فوق عنوانه الافتراضي إلا بموافقة صريحة.

يمين الصفحة الأقسام، ويسارها المنتجات والأحجام المتاحة، وأسفلها معاينة الفاتورة. اختيار المنتج يحدد النوع والحجم والكمية. المنتج المخفي أو الحجم غير النشط لا يظهر. عدم كفاية خامة يظهر قبل التأكيد كتقدير، لكن الفحص الحاسم داخل Transaction.

الإجماليات: عدد الوحدات، subtotal، خصم وضريبة ورسوم توصيل إن أضيفت بسياسة واضحة، total. النسخة الأولى: الخصم والضريبة ورسوم التوصيل صفر ما لم يُدخل لها إعداد صريح. الخادم يعيد حساب كل سعر ولا يثق في إجمالي الفرونت.

### 5.3 تأكيد الطلب

داخل MongoDB Transaction:

1. التحقق من Idempotency-Key والموظف والصلاحية والدرج عند وجود تحصيل نقدي فوري.
2. التحقق من النوع وبيانات العميل.
3. العثور على العميل بالهاتف normalizedPhone أو إنشاؤه.
4. توليد orderNumber وtrackingCode وtrackingToken.
5. قراءة المنتجات والأحجام والوصفات الحالية.
6. جمع احتياج كل مادة لكل العناصر قبل الخصم.
7. تخصيص الكميات من الدفعات حسب salePriority، والمنتهي مسموح كما اتفقنا.
8. إذا نقصت أي خامة يرجع الطلب كله ولا ينشأ عميل جديد أو طلب جزئي أو خصم جزئي.
9. إنشاء order وorderItems وorderInventoryAllocations وحركات SALE_CONSUMPTION.
10. حفظ تكلفة كل سطر والتكلفة الفعلية للطلب.
11. إنشاء OrderStatusEvent وAudit.
12. Commit ثم نشر Socket event وتحديث التحذيرات وCache التكلفة.

رقم الطلب لا يكرر. فقدان الرد ثم إعادة نفس المفتاح يعيد نفس الطلب. طلبان متزامنان يستخدمان stockVersion ومعاملة لمنع السالب.

## 6. العميل وربطه بالطلب

الهاتف هو مفتاح المطابقة التشغيلي بعد التطبيع، وليس الاسم. السيناريوهات:

- هاتف جديد: ينشأ Customer ثم يرتبط الطلب.
- هاتف موجود والاسم نفسه: يرتبط ويحدث lastOrderAt.
- هاتف موجود واسم مختلف: لا ينشأ حساب ثان تلقائيًا؛ تعرض الواجهة العميل الموجود، ويمكن تعديل الاسم بصلاحية أو حفظ الاسم الجديد Snapshot للطلب فقط.
- PICKUP بلا عنوان: لا يحذف عنوان العميل القديم.
- DELIVERY بعنوان جديد: يحفظ orderAddressSnapshot، ويمكن اختيار تحديث العنوان الافتراضي.
- فشل الطلب بسبب المخزون: لا ينشأ حساب عميل يتيم؛ الإنشاء جزء من Transaction.
- حذف العميل ممنوع إذا له طلبات؛ يستخدم ACTIVE/ARCHIVED.
- دمج حسابين مكررين عملية إدارية مستقلة تحفظ redirects والمراجع.

## 7. إضافة منتجات أخرى

زر الإضافة يفتح صفحة البيع في وضع append، ويعرض رقم الطلب والمنتجات الحالية للقراءة. يسمح للطلب PREPARING أو READY فقط.

التدفق:

1. يختار المستخدم المنتجات الجديدة.
2. الخادم يقرأ الطلب وversion ويتحقق أنه غير مسلّم أو ملغي.
3. يثبت أسعار ووصفات المنتجات الجديدة وقت الإضافة.
4. يخصص خاماتها من الدفعات الحالية، وليس من Snapshot تكلفة العناصر القديمة.
5. ينشئ سطورًا وتخصيصات وحركات خصم جديدة في Transaction.
6. يعيد حساب totals وcounts.
7. العناصر الجديدة PREPARING.
8. إذا كان الطلب READY يعود PREPARING ويسجل READY_TO_PREPARING بسبب ADD_ITEMS.
9. العناصر القديمة READY تبقى READY.
10. ينشر تحديثًا للتحضير وشاشة الطلب والعميل.

إذا عنصر واحد من الإضافة غير متاح تفشل الإضافة كلها، ولا تمس الطلب القديم. الضغط مرتين لا يكرر العناصر. سعر المنتج تغير منذ فتح الصفحة: الخادم يعيد السعر الجديد قبل التأكيد ويطلب قبول الفرق إذا كان مختلفًا عن العرض.

الإضافة غير متاحة في OUT_FOR_DELIVERY أو COMPLETED أو CANCELLED. لإضافة شيء بعد التسليم ينشأ طلب جديد.

## 8. إلغاء عنصر

يمكن إلغاء PREPARING أو READY قبل خروج الطلب للتوصيل أو اكتماله. السبب إلزامي، والصلاحية orders.items.cancel.

داخل Transaction:

1. فحص حالة الطلب والعنصر وversion.
2. قراءة كل allocations غير المعكوسة للعنصر.
3. زيادة remainingQuantitySmall والقيمة في نفس rawMaterialBatch لكل allocation.
4. إنشاء SALE_CANCELLATION_RESTORE في inventoryMovements مرتبطًا بحركة الاستهلاك الأصلية.
5. تعليم allocation reversedAt وreversalMovementId.
6. تعليم العنصر CANCELLED مع السبب والمنفذ والوقت.
7. خصم سعر السطر من subtotal وtotal، وتحديث activeItemCount وreadyCount.
8. اشتقاق حالة الطلب.
9. تسجيل OrderItemStatusEvent وOrderStatusEvent عند تغير الرأس وAudit.
10. Commit ثم Socket events.

لا إعادة إلى دفعة مختلفة ولا استخدام آخر سعر. تعاد الكمية والقيمة اللتان خرجتا فعلًا. العملية المكررة لا تضاعف الإرجاع. إذا بقي صفر عناصر نشطة يصبح الطلب CANCELLED. إذا بقيت كلها READY يصبح READY.

إذا تم تحصيل مال قبل الإلغاء، استرجاع المال يحتاج Refund transaction في الدرج؛ إرجاع المخزون وحده لا يعني رد نقدي. النسخة الأولى تمنع إلغاء عنصر بعد تحصيل نهائي إلا بصلاحية Refund واضحة.

## 9. إلغاء الطلب بالكامل

مسموح في PREPARING وREADY. وفي OUT_FOR_DELIVERY يحتاج أولًا إلغاء/استرجاع تكليف المندوب وتأكيد عودة الطلب. لا يسمح بعد COMPLETED عبر زر الإلغاء العادي.

ينفذ نفس منطق عكس المخزون لكل العناصر النشطة في Transaction واحدة، ثم يجعل العناصر CANCELLED والطلب CANCELLED. فشل عكس دفعة واحدة يرجع العملية كلها. السبب إلزامي. العناصر التي ألغيت سابقًا لا تعكس مرة ثانية.

إذا كان الطلب غير مدفوع فلا حركة درج. إذا كان مدفوعًا نقديًا، الإلغاء الكامل ينشئ Refund OUT من الدرج ويربطه بالطلب، ويحتاج درجًا مفتوحًا ونقدًا كافيًا. فشل رد المال يرجع إلغاء الطلب كله أو يحوله إلى PENDING_REFUND وفق سياسة مالية صريحة؛ المقترح الأبسط منع الإلغاء المالي حتى يمكن تنفيذ رد كامل ذريًا.

رقم الطلب والفاتورة لا يحذفان. يظهر في السجل CANCELLED مع سبب الإلغاء والقيمة قبل وبعد.

## 10. موديول التحضير

### 10.1 الصفحة

تبويبان: الطلبات الحالية PREPARING، والطلبات الجاهزة READY. داخل كل تبويب جدول طلبات الطاولات وجدول الأونلاين/التيك أواي. كل جدول Pagination مستقل 10.

الأعمدة: رقم الطلب، المصدر، الطاولة أو العميل، وقت التأكيد، عدد الوحدات، جاهز/الإجمالي، النسبة، الحالة، مدة الانتظار، وزر فتح. ترتيب الجاري بالأقدم أولًا، والجاهز بالأقدم جاهزية أولًا.

OUT_FOR_DELIVERY وCOMPLETED وCANCELLED لا تظهر في التحضير. إضافة عنصر لطلب READY تنقله لحظيًا من تبويب الجاهزة إلى الحالية.

### 10.2 صفحة فتح الطلب

كل عنصر في كارد مستطيل يعرض المنتج والنوع والحجم والكمية والملاحظات، ومكونات الوصفة Snapshot وكميات الوحدة الصغيرة، والحالة، وزر تم التحضير، وزر إلغاء حسب الصلاحية.

الملخص يعرض:

- عدد السطور النشطة.
- مجموع وحدات المنتجات.
- readyItemCount وpreparingItemCount وcancelledItemCount.
- النسبة readyActiveItems / activeItems.
- الإجمالي المالي للطلب.
- createdAt وconfirmedAt وreadyAt.
- زمن الانتظار وزمن التحضير.

إذا quantity للسطر أكبر من واحد، قرار النسخة الأولى أن السطر كله وحدة تشغيل واحدة ويصبح READY دفعة واحدة. إذا احتاج تجهيز جزئي مستقبلًا نضيف preparedQuantity؛ لا نغيّر status عدة مرات بلا كمية.

### 10.3 تم التحضير

POST على العنصر بـIdempotency-Key. PREPARING إلى READY فقط. عند آخر عنصر نشط، يحسب الخادم الطلب READY ويحفظ readyAt مرة واحدة. إذا ألغي عنصر غير جاهز وكان الباقي جاهزًا يتحول الطلب READY أيضًا.

ضغط موظفين في الوقت نفسه: تحديث شرطي على version/status؛ أحدهما يكتب والآخر يعيد الحالة الحالية. لا خصم مخزون هنا لأنه خُصم عند التأكيد.

## 11. إنهاء الفاتورة والتسليم

### 11.1 تيك أواي

زر إنهاء الفاتورة متاح فقط عندما order.type=PICKUP وstatus=READY. يعرض تأكيدًا ووسيلة الدفع. في النسخة النقدية:

1. يتأكد من درج مفتوح.
2. ينشئ CashDrawerTransaction IN وaccountingClass=REVENUE بالمبلغ المستحق.
3. يجعل paymentStatus=PAID.
4. يجعل الطلب COMPLETED ويحفظ completedAt وcompletedBy وcompletionMethod=DIRECT_PICKUP.
5. ينشئ Invoice Read Snapshot وأحداث الحالة.
6. كل ذلك Transaction واحدة.

إذا كان الطلب مدفوعًا مسبقًا لا تكرر حركة الدرج. إذا فشل الدرج لا ينتهي الطلب. الفاتورة تطبع قبل أو بعد الإنهاء، وتوضح حالة الدفع والتسليم.

### 11.2 توصيل

زر إنهاء الفاتورة في DELIVERY وREADY يفتح قائمة المندوبين ACTIVE غير المشغولين أو يعرض حالة انشغالهم. اختيار المندوب ثم التأكيد:

1. يفحص أن الطلب READY وغير مكلف.
2. يفحص المندوب ACTIVE.
3. ينشئ deliveryAssignment.
4. يغير الطلب OUT_FOR_DELIVERY.
5. يحفظ handedOverAt وhandedOverBy وdelegate Snapshot.
6. يسجل الحدث ويظهر الطلب في صفحة المندوب.
7. لا يسجل إيرادًا نقديًا لمجرد التسليم للمندوب.

إذا كان المندوب لديه حد أقصى للطلبات يتجاوز الحد يرفض. يمكن للمندوب حمل عدة طلبات إذا maxActiveOrders يسمح.

بعد أن يبلغ المندوب بوصول الطلب، يفتح الأدمن صفحة المندوب ويضغط زر «تسليم» بجوار الطلب. يتحقق الخادم من أن الطلب OUT_FOR_DELIVERY وأنه مكلف لهذا المندوب، ثم يسجل deliveredAt وdeliveredConfirmedBy، ويغلق التكليف DELIVERED، ويحول الطلب إلى COMPLETED. بعدها يظهر للعميل خيار ترك تقييم في صفحة طلباته. العميل لا يملك صلاحية تغيير حالة التسليم.

إذا كان الدفع Cash on Delivery، يسجل التأكيد أن المندوب حصل المبلغ paymentStatus=COLLECTED_BY_DELEGATE. لا يدخل النقد الدرج حتى يسلمه المندوب فعليًا للدرج؛ عندها يصبح SETTLED. اكتمال التسليم منفصل عن اكتمال التسوية المالية.

تعذر التسليم يسجل FAILED_ATTEMPT وسببًا، ويبقى OUT_FOR_DELIVERY أو يعود READY/RETURNED_TO_STORE بقرار إداري. عودته للمحل لا تعيد المخزون تلقائيًا؛ الإلغاء المنفصل هو الذي يعكسه.

## 12. موديول المندوبين

### 12.1 البيانات والشاشات

نموذج: الاسم، الهاتف، رقم واتساب، الحالة، maxActiveOrders وملاحظات اختيارية. الجدول: الاسم والهاتف والواتساب والحالة وعدد الطلبات النشطة والمكتملة وآخر تسليم وزر عرض. Pagination 10 وبحث وفلاتر.

صفحة المندوب تعرض بياناته، الطلبات الحالية، وسجل الطلبات التي استلمها أو وصلها. كل جدول Pagination مستقل. لكل طلب فتح، طباعة الفاتورة، إرسال على واتساب، تم التسليم، وتعذر التسليم حسب الحالة.

الهاتف وواتساب نصان normalized ويحافظان على كود الدولة. رقم واتساب يمكن أن يساوي الهاتف. الاسم ليس unique، والرقم normalizedPhone unique مقترح.

### 12.2 حالات المندوب

ACTIVE، INACTIVE، BLOCKED. لا تكليف جديد لغير ACTIVE. إيقاف مندوب لديه طلبات نشطة ممنوع حتى نقلها أو إرجاعها. لا حذف مندوب له تاريخ.

### 12.3 تكليف ونقل الطلب

طلب واحد له تكليف نشط واحد فقط. إعادة الضغط لا تنشئ تكليفًا ثانيًا. نقل طلب من مندوب لآخر يحتاج سببًا؛ يغلق التكليف الأول REASSIGNED وينشئ ثانيًا ويحفظ السجل. لا نقل COMPLETED أو CANCELLED.

حالات التكليف: ASSIGNED، ACCEPTED اختياري، OUT_FOR_DELIVERY، DELIVERED، FAILED، RETURNED، REASSIGNED، CANCELLED. النسخة البسيطة يمكن أن تبدأ مباشرة OUT_FOR_DELIVERY عند التسليم الفعلي للمندوب.

### 12.4 واتساب

الخادم يبني invoiceShareText من Snapshot الفاتورة: رقم الطلب، العميل، العنوان، العناصر، الإجمالي، رابط التتبع. الفرونت يفتح wa.me على رقم المندوب أو يستخدم WhatsApp API إذا رُبطت خدمة رسمية لاحقًا.

فتح رابط واتساب لا يثبت أن الرسالة وصلت. نسجل WHATSAPP_SHARE_OPENED عند الضغط. لا نسجل SENT أو DELIVERED إلا عند وجود API يعيد Webhook موثوقًا. النص لا يحتوي trackingToken إداريًا أو بيانات غير لازمة.

## 13. موديول العملاء

### 13.1 البيانات

الاسم، الهاتف، العناوين، وروابط السوشيال. Social links مصفوفة من platform وurl وlabel. يمكن وجود عدة عناوين: label، addressLine، area، landmark، notes، isDefault. الطلب يحتفظ بنسخة العنوان المستخدم.

صفحة القائمة بها النموذج وجدول العملاء Pagination 10: الاسم، الهاتف، العنوان الافتراضي، عدد الطلبات، إجمالي الطلبات المكتملة، آخر طلب، الحالة، عرض.

صفحة العميل تعرض بياناته وعناوينه وروابطه وجدول كل طلباته Pagination 10. كل صف: الرقم، النوع، التاريخ، الحالة، العناصر، الإجمالي، الدفع، التتبع، زر الفاتورة والطباعة.

### 13.2 الإنشاء التلقائي واليدوي

الإنشاء اليدوي يتحقق من الهاتف. إنشاء الطلب يستعمل upsert داخل Transaction على normalizedPhone. لا يعتمد على الاسم. الطلب يرتبط customerId ويحتفظ customerNameSnapshot وphoneSnapshot وaddressSnapshot.

تعديل العميل لا يغير طلبًا أو فاتورة قديمة. إيقاف العميل لا يمنع بالضرورة طلبًا جديدًا إلا إذا BLOCKED؛ ACTIVE عادي، ARCHIVED يعاد تنشيطه بمراجعة، BLOCKED يمنع ويظهر السبب للأدمن.

إجماليات العميل لا تجمع CANCELLED. orderCount وcompletedOrderCount وlifetimeValue يمكن اشتقاقها أو حفظ Projection يعاد بناؤه. لا تعتمد على الصفحة الظاهرة.

## 14. موديول سجل الطلبات

صفحة واحدة بتبويبين:

1. الأونلاين والتيك أواي: fulfillmentType DELIVERY أو PICKUP.
2. طلبات الطاولات: DINE_IN.

كل تبويب جدول Pagination مستقل 10. الفلاتر: رقم الطلب، Tracking Code، العميل/الهاتف، المندوب، الحالة، نوع الطلب، طريقة الدفع، التاريخ، الموظف. الأعمدة: الرقم، النوع/الطاولة، العميل، عدد العناصر، الإجمالي، التكلفة الفعلية، الربح الفعلي حسب الصلاحية، الدفع، الحالة، التاريخ، المندوب، طباعة.

السجل يشمل COMPLETED وCANCELLED، ويمكن بصلاحية عرض كل الحالات. الضغط على الصف يفتح Timeline كاملًا. زر الطباعة لا يغير الحالة. الترتيب بالأحدث مع _id tie-breaker.

طلبات الطاولات تستخدم نفس orders وorderItems والفاتورة والمخزون والحالات، مع fulfillmentType=DINE_IN وtableSessionId وtableNumberSnapshot. دورة إنشاء جلسة الطربيزة وتتبعها وإغلاقها موضحة في قسم موديول طلبات الطربيزات.

## 15. التتبع والباركود

عند التأكيد يولد:

- orderNumber داخلي قابل للقراءة مثل ORD-2026-000001.
- trackingCode قصير وفريد يكتبه العميل.
- trackingToken عشوائي طويل، يخزن Hash فقط.
- QR يحمل رابط /customer/orders/{trackingCode}/track?token=...

واجهة التتبع العامة تعرض رقم الطلب والنوع والحالة العامة، حالة كل عنصر، readyCount/totalCount، Timeline آمن، ووقت آخر تحديث. للتوصيل يمكن عرض خرج للتوصيل دون بيانات المندوب الشخصية كاملة.

لا تكشف التكلفة أو المخزون أو الموظفين أو سجل Audit. محاولات التتبع Rate Limited. تغيير حالة ينشر realtime على room خاص بالطلب باستخدام Token صالح. الباركود القديم يستمر لأن Code لا يتغير.

## 15.1 تأكيد التسليم من صفحة المندوب والتقييم

### زر تسليم في صفحة المندوب

يظهر زر «تسليم» بجوار كل طلب نشط في صفحة المندوب عندما يكون تكليف الطلب OUT_FOR_DELIVERY. الزر يراه ويستخدمه الأدمن صاحب صلاحية delegates.mark_delivered. لا يظهر في صفحة العميل، ولا لطلب READY لم يسلم للمندوب، ولا لطلب COMPLETED أو CANCELLED أو FAILED أو RETURNED.

عند الضغط تظهر نافذة تأكيد تعرض رقم الطلب، العميل، المندوب، الإجمالي، وطريقة الدفع. وإذا كان الدفع عند الاستلام يدخل الأدمن المبلغ الذي أكد المندوب تحصيله. السبب أو الملاحظة اختيارية في التسليم الطبيعي وإلزامية لو نفذه مسؤول بصلاحية تجاوز.

داخل Transaction واحدة:

1. التحقق من صلاحية الأدمن وحالة الموظف والجهاز والجلسة.
2. التحقق أن التكليف النشط يخص المندوب المعروض.
3. التحقق أن الطلب OUT_FOR_DELIVERY ولم يسجل تسليمه سابقًا.
4. تسجيل deliveryConfirmation بالمصدر ADMIN ومنفذ العملية.
5. تغيير deliveryAssignment إلى DELIVERED.
6. تغيير order إلى COMPLETED.
7. حفظ deliveredAt وdeliveredConfirmedBy وdelegate Snapshot.
8. إذا كان COD، تسجيل paymentStatus=COLLECTED_BY_DELEGATE والمبلغ المحصل، دون إدخاله للدرج قبل التسوية.
9. إنشاء Delivery Event وOrder Status Event وAudit.
10. نشر Realtime لصفحة المندوب وسجل الطلب وصفحة العميل.
11. إتاحة «ترك تقييم» للعميل.

الضغط مرتين بنفس Idempotency-Key يعيد نفس النتيجة. الضغط بعد اكتمال الطلب يعيد ALREADY_DELIVERED ولا يكرر التحصيل أو الأحداث. إذا نقل الطلب لمندوب آخر، زر التكليف القديم معطل. إذا كان المندوب أو الطلب موقوفًا أثناء العملية، يعتمد التحقق على التكليف النشط وحالة الطلب، ولا يقبل معرف مندوب من الواجهة وحده.

### تعذر التسليم والعودة

بدل «تسليم» يستطيع الأدمن اختيار «تعذر التسليم» بسبب إلزامي. يتحول التكليف FAILED، ويبقى الطلب OUT_FOR_DELIVERY لحين قرار: إعادة المحاولة مع نفس المندوب، نقل لمندوب آخر، أو RETURNED_TO_STORE. العودة للمحل لا تعيد الخام تلقائيًا. إلغاء الطلب هو الذي يعكس تخصيصات المخزون وفق قواعد الإلغاء.

لا يجوز ضغط «تسليم» على تكليف FAILED أو RETURNED قبل إنشاء محاولة/تكليف نشط جديد. نقل الطلب يغلق التكليف القديم REASSIGNED وينشئ تكليفًا جديدًا.

### التقييم لكل طلب

كل طلب DELIVERY أو PICKUP مكتمل يسمح بتقييم واحد مرتبطًا بالطلب والعميل. النموذج: rating من 1 إلى 5، comment اختياري، ووسوم تجربة اختيارية.

- DELIVERY: يظهر «ترك تقييم» في صفحة العميل بعد أن يضغط الأدمن «تسليم» من صفحة المندوب ويصبح الطلب COMPLETED.
- PICKUP: يظهر بعد إنهاء الكاشير وتسليم الطلب مباشرة.
- لا تقييم قبل COMPLETED ولا لطلب CANCELLED.
- العميل لا يغير حالة التسليم؛ صفحة العميل تقرأها فقط.
- كل طلب له Review واحد. إعادة الإرسال لا تكرر.
- التقييم للطلب كله. تقييم المنتجات أو المندوب بشكل منفصل يحتاج حقولًا صريحة مستقبلًا.
- يسمح بتعديل التقييم خلال 24 ساعة مقترحة، مع Review Revisions.
- الأدمن يستطيع إخفاء تعليق مسيء دون حذف النجوم أو التاريخ.
- التقييم لا يغير حالة الطلب أو المخزون أو الدرج أو حساب المندوب.
- جدول طلبات العميل يعرض «ترك تقييم» للمكتمل غير المقيم، و«عرض التقييم» للمقيم.

### Schemas الإضافية

deliveryConfirmations: _id، orderId unique، assignmentId unique، delegateId، source ADMIN، confirmedByEmployeeId، confirmedAt، amountReportedCollected، paymentMethodSnapshot، notes، deviceId، ipAddress، operationRequestId unique.

orderReviews: _id، orderId unique، customerId، fulfillmentTypeSnapshot، rating integer من 1 إلى 5، comment، tags محدودة، status VISIBLE/HIDDEN، submittedAt، updatedAt، hiddenAt/By، moderationReason، version، operationRequestId.

reviewRevisions: _id، reviewId، previousRating، newRating، previousComment، newComment، changedAt، changeSource CUSTOMER/ADMIN، actorId nullable، reason. Immutable.

orders يضاف له deliveredConfirmedByEmployeeId، deliveryConfirmationId، reviewId، reviewSubmittedAt. DTO صفحة العميل يعيد canReview وreviewSummary، ولا يعيد أي Action لتغيير التسليم.

### API الإضافية

- POST /api/delegates/:delegateId/orders/:orderId/deliver للأدمن مع Idempotency-Key.
- POST /api/delegates/:delegateId/orders/:orderId/delivery-failed.
- POST /api/public/orders/:trackingCode/review لإنشاء تقييم العميل.
- PUT /api/public/orders/:trackingCode/review للتعديل داخل المدة.
- GET /api/customers/:id/orders يعيد canReview وreview.
- GET /api/orders/:id/review للإدارة.
- PATCH /api/order-reviews/:id/moderation لإخفاء أو إظهار التعليق.

### حالات القبول الإضافية

1. زر تسليم يظهر في صفحة المندوب للطلب OUT_FOR_DELIVERY فقط.
2. الأدمن المصرح له يكمل الطلب والتكليف مرة واحدة.
3. أدمن بلا delegates.mark_delivered لا يرى الزر ويرفضه API.
4. الطلب لا يسلم من صفحة مندوب غير مكلف به.
5. الضغط المزدوج لا يكرر التسليم أو تحصيل COD.
6. التكليف القديم بعد النقل لا يستطيع إنهاء الطلب.
7. FAILED أو RETURNED لا يقبل تسليمًا دون تكليف نشط.
8. العميل لا يرى زر تغيير حالة التسليم.
9. DELIVERY يعرض ترك تقييم بعد تسليم الأدمن فقط.
10. PICKUP يعرض ترك تقييم بعد إكمال الكاشير.
11. غير المكتمل والملغي لا يقبل Review.
12. طلب واحد لا يقبل Review ثانيًا.
13. التعديل داخل النافذة ينشئ Revision.
14. إخفاء التعليق لا يغير النجوم.
15. التقييم لا يحرك المخزون أو الدرج.
16. صفحة العميل تعرض حالة التقييم لكل طلب مع Pagination.
## 16. الفاتورة والطباعة

Invoice DTO يبنى من Snapshots:

- هوية الكافيه وبياناته.
- invoiceNumber/orderNumber وbarcode.
- نوع الطلب والعميل والعنوان.
- العناصر النشطة والملغاة موضحة، النوع والحجم والكمية وسعر الوحدة والإجمالي.
- subtotal والخصم والضريبة والتوصيل وtotal والمدفوع والمتبقي.
- حالة التحضير والدفع والتسليم.
- المندوب Snapshot في التوصيل.
- createdAt وconfirmedAt وreadyAt وcompletedAt.
- المنشئ ومن أنهى الطلب حسب الصلاحية.

كل مكان يستدعي endpoint print-data نفسه، لذلك فاتورة العميل والمندوب والسجل متطابقة. الطباعة HTML/CSS محسنة لـ80mm وA4. الطباعة لا تغير الحالة ولا الدفع. تعديل الطلب قبل التسليم يغير الفاتورة الحالية ويحفظ invoiceRevision. بعد COMPLETED تصبح النسخة النهائية immutable؛ أي تصحيح يصدر Credit/Refund document مستقل.

## 17. الدفع والدرج

حالة الدفع: UNPAID، PAID، COLLECTED_BY_DELEGATE، SETTLED، REFUNDED، PARTIALLY_REFUNDED.

- PICKUP النقدي: يدخل الدرج عند إنهاء الطلب وتسليمه.
- DELIVERY دفع عند الاستلام: لا يدخل الدرج عند تعيين المندوب. يسجل تحصيل المندوب عند التسليم، ثم يدخل الدرج عند التسوية.
- PREPAID: يسجل مصدر الدفع المناسب وقت تأكيده، ولا يكرر عند الإنهاء.
- CARD/TRANSFER لا يدخل درج النقد، لكنه يظهر في التقارير.
- إلغاء غير مدفوع لا يحرك الدرج.
- إلغاء مدفوع يحتاج Refund مربوطًا بالدفع والأمر.
- المبيعات تسجل REVENUE عند تحقق واقعة الدفع، والتكلفة الفعلية من allocations لتقرير الربح.

Collection orderPayments منفصلة تسمح بأكثر من دفعة وتسوية. مجموع المدفوع والمردود والمستحق يجب أن يطابق total وفق الحالة.

## 18. Data Flow

### 18.1 إنشاء الطلب

Employee إلى Sales UI إلى Customer lookup/upsert إلى Product/Recipe snapshots إلى Batch allocation حسب الأولوية إلى Order/Items/Allocations إلى Inventory Movements إلى Status Events/Audit إلى Preparation وTracking وCustomer history.

### 18.2 التحضير

Preparation Query إلى Order Items PREPARING إلى mark READY إلى Item Event إلى recompute Order إلى READY عند اكتمال الجميع إلى Socket.IO إلى شاشة الطلب وتتبع العميل.

### 18.3 الإضافة

Active Order إلى Add Items UI إلى current Product/Recipe/Price إلى allocate new stock إلى new Items PREPARING إلى totals/version إلى إعادة READY إلى PREPARING إن لزم إلى التحضير.

### 18.4 الإلغاء

Order أو Item إلى allocations الأصلية إلى restore نفس batches والقيم إلى reversal movements إلى cancel statuses إلى totals إلى Refund إن كان مدفوعًا إلى Audit وRealtime.

### 18.5 التوصيل

READY DELIVERY إلى select ACTIVE Delegate إلى Delivery Assignment إلى OUT_FOR_DELIVERY إلى delegate page وinvoice share إلى Delivered أو Failed إلى payment collection/settlement إلى COMPLETED وhistory.

## 19. Schemas

### 19.1 customers

_id، name، normalizedName، phone، normalizedPhone unique، addresses subdocuments، socialLinks subdocuments، status ACTIVE/ARCHIVED/BLOCKED، blockReason، orderCount، completedOrderCount، lifetimeValue، lastOrderAt، createdAt/By، updatedAt/By، version.

### 19.2 delegates

_id، name، phone، normalizedPhone unique، whatsappNumber، normalizedWhatsappNumber، status، maxActiveOrders، activeOrderCount، notes، lastDeliveryAt، createdAt/By، updatedAt/By، statusChangedAt/By، reason، version.

### 19.3 orders

_id، orderNumber unique، trackingCode unique، trackingTokenHash، channel ADMIN/PUBLIC/TABLE، fulfillmentType PICKUP/DELIVERY/DINE_IN، customerId، customer snapshots، addressSnapshot، tableSessionId، tableNumberSnapshot، status، hasPartialCancellation، itemCount، activeItemCount، unitCount، readyItemCount، preparingItemCount، cancelledItemCount، subtotal، discount، tax، deliveryFee، total، actualInventoryCost، actualProfit، currency، paymentStatus، assignedDelegateId، currentDeliveryAssignmentId، invoiceRevision، createdAt/By، confirmedAt/By، readyAt، handedOverAt/By، completedAt/By، cancelledAt/By، cancellationReason، version.

فهارس status مع fulfillmentType والوقت، customerId مع createdAt، assignedDelegateId مع status، trackingCode، orderNumber. partial unique يمنع أكثر من طلب بنفس idempotency operation.

### 19.4 orderItems

_id، orderId، lineNo، productId وproductSizeId، product/type/size snapshots، recipeVersion، recipeSnapshot، quantity، unitSellingPrice، lineSubtotal، actualInventoryCost، actualProfit، notes، status PREPARING/READY/CANCELLED، addedAt/By، readyAt/By، cancelledAt/By، cancellationReason، version.

unique orderId مع lineNo، وفهارس orderId/status. لا دمج سطر جديد مع سطر قديم جاهز؛ الإضافة تنشئ lineNo جديدًا لحفظ تاريخ التحضير والتكلفة.

### 19.5 orderInventoryAllocations

_id، orderId، orderItemId، materialId، batchId، consumptionMovementId unique، quantitySmall، inventoryValue، unitCostSnapshot، reversedQuantitySmall، reversalMovementId، allocatedAt، reversedAt/By، reversalReason، status CONSUMED/REVERSED، operationRequestId.

الـinventoryMovements يستخدم SALE_CONSUMPTION عند التأكيد وSALE_CANCELLATION_RESTORE عند الإلغاء، مع referenceType وreferenceId وفهرس unique للمصدر.

### 19.6 orderStatusEvents وorderItemStatusEvents

كل سجل: orderId، itemId اختياري، fromStatus، toStatus، reasonCode، notes، actorType، actorId، deviceId، occurredAt، requestId، metadataSafe. Immutable، وفهرس orderId/occurredAt. Timeline يعتمد هذه السجلات.

### 19.7 deliveryAssignments

_id، assignmentNo unique، orderId، delegateId، snapshots للمندوب والطلب والعنوان، status، assignedAt/By، acceptedAt، handedOverAt/By، deliveredAt/By، failedAt/By، returnedAt/By، failureReason، deliveryNotes، cashExpected، cashCollected، cashSettled، settlementTransactionId، reassignedFromId، version.

unique جزئي على orderId عندما الحالة نشطة. فهارس delegateId/status/assignedAt.

### 19.8 deliveryEvents

_id، assignmentId، orderId، delegateId، type ASSIGNED/ACCEPTED/HANDED_OVER/DELIVERED/FAILED/RETURNED/REASSIGNED/WHATSAPP_SHARE_OPENED/CASH_SETTLED، actorId، notes، location optional، occurredAt، requestId. Immutable.

### 19.9 orderPayments

_id، orderId، paymentNo، method CASH/CARD/TRANSFER/COD، status PENDING/COLLECTED/SETTLED/REFUNDED، amount، collectedByType، collectedById، collectedAt، settledAt/By، cashDrawerTransactionId، refundedAmount، refundTransactionIds، idempotencyKey، version. unique orderId/paymentNo.

### 19.10 counters وoperationRequests

orderCounters يولد أرقام الطلب والتكليف والفاتورة ذريًا. operationRequests يستخدم actorId وscope وkey وrequestHash وresponse لمنع التكرار في التأكيد والإضافة والإلغاء والتجهيز والتسليم.

الفاتورة Read Model من orders وitems وpayments وassignment snapshots. يمكن إنشاء invoiceSnapshots عند COMPLETED للأرشفة: orderId unique، revision، payloadSafe، finalizedAt، checksum.

## 20. API

- GET /api/orders/catalog للأقسام والمنتجات المتاحة.
- POST /api/orders/admin لإنشاء PICKUP أو DELIVERY.
- GET /api/orders/active مع pagination والفلاتر.
- GET /api/orders/:id.
- POST /api/orders/:id/items لإضافة منتجات.
- POST /api/orders/:id/items/:itemId/ready.
- POST /api/orders/:id/items/:itemId/cancel.
- POST /api/orders/:id/cancel.
- POST /api/orders/:id/complete-pickup.
- POST /api/orders/:id/assign-delegate.
- POST /api/orders/:id/delivery/delivered أو failed أو returned.
- POST /api/orders/:id/payments وsettlements وrefunds.
- GET /api/orders/:id/print-data.
- GET /api/orders/history?scope=online أو tables.
- GET /api/preparation/orders?tab=current أو ready&scope=online أو tables.
- CRUD مقيد للمندوبين، وGET طلبات المندوب وshare-data.
- CRUD مقيد للعملاء، وGET طلبات العميل.
- GET /api/public/orders/:trackingCode/tracking مع Token.

كل GET قائمة يستخدم page=1&pageSize=10 ويعيد data وpagination وsummary. المجاميع من كل النتائج بعد الفلتر، لا من الصفحة الحالية.

## 21. الصلاحيات

Orders: read، create، add_items، cancel_item، cancel_order، complete_pickup، assign_delegate، print، read_cost، read_profit.

Preparation: read، mark_item_ready، cancel_item.

Delegates: read، create، update، change_status، assign_order، reassign_order، mark_delivered، mark_failed، share_whatsapp، read_settlements، settle_cash.

Customers: read، create، update، change_status، merge، read_orders، print_invoice.

History: read_online، read_tables، print، read_cost، read_profit.

Payments: collect، settle، refund، read.

كل Endpoint يفحص الصلاحية. تغيير الواجهة أو إرسال status مباشرة لا يتجاوز state machine.

## 22. التزامن والـRealtime

كل Mutation يحمل Idempotency-Key وexpectedVersion. MongoDB يعمل Replica Set لدعم Transactions. لا يُرسل Socket event قبل Commit. Outbox مقترح لضمان نشر الحدث إذا وقع الخادم بعد Commit.

غرف Socket: preparation، orders-active، order:{id}، tracking:{id}، delegate:{id}، customer:{id}. كل رسالة تحمل entityVersion وeventId. العميل يتجاهل الإصدار الأقدم ويعيد GET بعد reconnect.

عدادات ready/preparing والتكلفة والإجمالي تحدث في نفس Transaction. Job اتساق دوري يقارن projections مع items وallocations ويرفع تنبيهًا ولا يصحح المال أو المخزون بصمت.

## 23. الحالات الاستثنائية ومعايير القبول

1. تأكيد طلب بلا عناصر مرفوض.
2. PICKUP بلا اسم أو هاتف مرفوض.
3. DELIVERY بلا عنوان مرفوض.
4. هاتف جديد ينشئ عميلًا ويربط الطلب.
5. هاتف موجود لا ينشئ عميلًا مكررًا.
6. منتج مخفي أو حجم موقوف مرفوض.
7. نقص خامة واحدة يلغي التأكيد كله.
8. التأكيد يخصم من دفعات الأولوية ويحفظ التكلفة الفعلية.
9. الدفعة المنتهية تشارك وفق الأولوية.
10. إعادة التأكيد بالمفتاح نفسه لا تكرر الطلب أو الخصم.
11. READY لا يحدث إلا عند جاهزية كل العناصر النشطة.
12. تجهيز عنصر مرتين لا يغير العد مرتين.
13. إضافة عنصر إلى READY تعيده PREPARING.
14. فشل إضافة عنصر لا يغير الطلب القديم.
15. سعر جديد يثبت فقط للعنصر المضاف.
16. إلغاء عنصر يعيد نفس الدفعات والكلفة مرة واحدة.
17. إلغاء آخر عنصر يحول الطلب CANCELLED.
18. إلغاء غير الجاهز والباقي جاهز يحول الطلب READY.
19. الإلغاء الكامل يعكس كل allocation غير معكوس.
20. الإلغاء المتكرر لا يزيد المخزون مرتين.
21. لا تعديل بعد OUT_FOR_DELIVERY دون سحب التكليف.
22. PICKUP READY ينتهي مباشرة للعميل.
23. DELIVERY READY لا ينتهي بلا مندوب.
24. تعيين مندوب لا يسجل نقدًا في الدرج.
25. تسليم COD يسجل تحصيل المندوب ثم التسوية.
26. مندوب غير نشط لا يستلم طلبًا.
27. طلب واحد لا يملك تكليفين نشطين.
28. نقل التكليف يحفظ القديم.
29. تعذر التسليم لا يعيد المخزون تلقائيًا.
30. COMPLETED لا يلغى بزر عادي.
31. Refund منفصل عن عكس المخزون لكنه ذري عند الإلغاء المدفوع.
32. كارت الطلب يعرض جاهز/الإجمالي الصحيحين.
33. الجداول الأربعة في التحضير Paginated بصورة مستقلة.
34. السجل مقسم Online/Pickup وTables.
35. صفحة العميل تعرض كل طلباته Pagination.
36. صفحة المندوب تعرض الحالي والتاريخ Pagination.
37. كل فاتورة من كل شاشة تستخدم نفس Print DTO.
38. الطباعة لا تغير حالة.
39. WhatsApp Open لا يدعي وصول الرسالة.
40. QR لا يكشف بيانات إدارية.
41. Token خاطئ أو Rate Limit يمنع التتبع.
42. تغير اسم العميل لا يغير فاتورة قديمة.
43. تغير وصفة المنتج لا يغير عنصرًا قديمًا.
44. تغير المندوب لا يغير Snapshot التكليف القديم.
45. صفحتان تعدلان الطلب؛ version يمنع فقد تحديث.
46. Socket قديم لا يرجع الحالة للخلف.
47. فشل Audit أو Inventory داخل العملية يرجع Transaction.
48. فشل Socket بعد Commit لا يرجع الطلب؛ Outbox يعيد النشر.
49. CANCELLED يظهر بالسجل ولا يظهر بالنشط أو التحضير.
50. OUT_FOR_DELIVERY يظهر بصفحة المندوب وشاشة متابعة الطلب.
51. إجماليات الصفحة تعتمد Count/Aggregation لا طول الصفحة.
52. كل تاريخ يخزن UTC ويعرض Africa/Cairo.
53. Decimal128 ينقل المال كسلاسل.
54. لا Number عائم لحساب المال أو تكلفة المخزون.
55. كل عملية تسجل employeeId وdeviceId وrequestId.
56. باركود الطلب يبقى صالحًا بعد تغير الحالة.
57. عنوان الطلب Snapshot لا يتغير مع تعديل العميل.
58. إيقاف عميل لا يمحو تاريخه.
59. إيقاف مندوب بطلب نشط مرفوض حتى النقل.
60. طلب الطاولة يستخدم نفس التحضير والسجل دون خلطه بإنشاء Online.

## 24. موديول طلبات الطربيزات

### 24.1 الهدف والشاشة الرئيسية

صفحة الطربيزات تعرض 20 كارد مرقمة من 1 إلى 20. العدد ثابت للنسخة الأولى، ويُنشأ عند Seed قاعدة البيانات. كل طربيزة لها اسم/رقم وحالة تشغيل مشتقة:

- EMPTY: الكارد أبيض ومكتوب «فارغ».
- OCCUPIED مع طلب PREPARING: الكارد أخضر ومكتوب «مشغول — جاري التحضير».
- OCCUPIED مع طلب READY: الكارد أخضر ومكتوب «مشغول — جاهز».
- OCCUPIED مع حالة مختلطة: الكارد أخضر ويعرض جاهز X من Y وجاري التحضير Z.
- CLOSING حالة داخلية قصيرة أثناء إنهاء الطلب لمنع ضغطين متزامنين، وتعرض «جاري الإنهاء» إذا استغرق الرد.
- OUT_OF_SERVICE حالة إدارية مقترحة لطربيزة معطلة؛ لون محايد ولا تقبل طلبًا.

اللون ناتج من status ولا يُخزن كقيمة. كل كارد يعرض رقم الطربيزة، الحالة، رقم الطلب النشط، الإجمالي، عدد العناصر، جاهز/الإجمالي، ومدة الجلسة. شبكة العشرين ليست جدول جدول Pagination، لأنها قائمة تشغيل ثابتة وصغيرة. سجل جلسات الطربيزات وجدول الطلبات يستخدمان Pagination 10.

يوجد Socket.IO لتحديث الكروت لحظيًا عند التأكيد أو التجهيز أو الإضافة أو الإلغاء أو الإنهاء. بعد انقطاع الاتصال تعيد الصفحة GET snapshot كاملًا للعشرين.

### 24.2 مصدر حقيقة حالة الطربيزة

لا نحدث table.status يدويًا مع كل طلب. الطربيزة فارغة إذا لم توجد لها tableSession بحالة OPEN أو CLOSING، ومشغولة إذا وجدت. يوجد فهرس unique جزئي يمنع أكثر من جلسة نشطة للطربيزة.

حالة التحضير الظاهرة مشتقة من الطلب النشط المرتبط بالجلسة:

- يوجد عنصر PREPARING واحد على الأقل: جاري التحضير.
- كل العناصر النشطة READY: جاهز.
- لا عناصر نشطة بعد إلغاء الكل: تغلق الجلسة CANCELLED وتعود الطربيزة فارغة.
- وجود مشكلة اتساق، مثل جلسة مفتوحة بلا طلب، يظهر ERROR للإدارة ولا يعتبر فارغًا كي لا تبدأ جلسة ثانية فوقها.

### 24.3 الضغط على طربيزة فارغة

يفتح صفحة البيع نفسها المستخدمة في الأونلاين من حيث الأقسام والمنتجات والأحجام ومعاينة الفاتورة والإجماليات، مع الاختلافات التالية:

- fulfillmentType ثابت DINE_IN.
- يظهر رقم الطربيزة بوضوح.
- لا اسم عميل ولا هاتف ولا عنوان.
- لا اختيار مندوب أو توصيل.
- زر «تأكيد الفاتورة».
- مسودة الاختيار محلية في الفرونت، ولا تجعل الطربيزة مشغولة.

إذا فتح موظفان الطربيزة الفارغة في الوقت نفسه، كلاهما قد يرى صفحة البيع، لكن أول تأكيد ناجح فقط ينشئ الجلسة. الثاني يرجع TABLE_ALREADY_OCCUPIED مع رقم الطلب الحالي، ولا يخصم مخزونًا ولا ينشئ طلبًا ثانيًا.

### 24.4 تأكيد أول طلب للطربيزة

داخل MongoDB Transaction واحدة:

1. التحقق من الطربيزة ACTIVE وليست OUT_OF_SERVICE.
2. التحقق من عدم وجود جلسة نشطة.
3. التحقق من المنتجات والأحجام والأسعار والوصفات.
4. تجميع احتياجات الخام لكل العناصر.
5. تخصيص الدفعات حسب salePriority، والسماح بالدفعات المنتهية كما اتفقنا.
6. فشل أي خامة يرجع العملية كاملة.
7. إنشاء tableSession بحالة OPEN وopenedAt وopenedBy.
8. إنشاء order واحد fulfillmentType=DINE_IN وحالة PREPARING.
9. ربط order.tableSessionId وحفظ tableNumberSnapshot.
10. إنشاء orderItems وallocations وحركات SALE_CONSUMPTION.
11. حفظ السعر والتكلفة والوصفة Snapshots والإجماليات.
12. إنشاء أحداث الطلب والجلسة وAudit.
13. Commit ثم Socket events لشاشة الطربيزات والتحضير والسجل.

بعد النجاح يتحول الكارد إلى أخضر مشغول. Idempotency-Key يمنع إنشاء جلستين إذا فقد الرد وأعيد التأكيد.

### 24.5 فتح طربيزة مشغولة

يفتح صفحة متابعة الطلب، وليس صفحة إنشاء طلب جديد. تعرض:

- رقم الطربيزة والطلب والجلسة.
- كل المنتجات وحالة كل عنصر.
- مكونات كل منتج من Recipe Snapshot.
- إجمالي الوحدات والعناصر.
- جاهز، جاري التحضير، وملغي.
- subtotal وtotal والمدفوع والمتبقي.
- أوقات فتح الجلسة وتأكيد الطلب والجاهزية.
- أزرار إضافة منتجات، إلغاء عنصر، إلغاء الطلب، طباعة فاتورة حالية، وإنهاء الطلب حسب الحالة والصلاحية.

إذا تغيرت الحالة أثناء فتح الصفحة، يصل event بإصدار أعلى. الأمر المرسل بإصدار قديم يرجع VERSION_CONFLICT ويعاد تحميل الطلب.

### 24.6 إضافة منتجات أخرى

زر «إضافة منتجات أخرى» متاح في PREPARING وREADY ويفتح صفحة البيع في وضع append مع رقم الطربيزة والطلب. لا يعرض حقول عميل.

التأكيد يثبت سعر ووصفة العناصر الجديدة ويخصم خاماتها من الدفعات الحالية في Transaction مستقلة، ثم يضيف orderItems جديدة بحالة PREPARING ويحدث الإجماليات. إذا كان الطلب READY يعود PREPARING وينتقل من جاهز إلى الحالي في قسم التحضير. العناصر القديمة الجاهزة تظل READY.

فشل خامة واحدة يلغي الإضافة كلها ولا يغير الطلب أو الطربيزة. الضغط المكرر لا يكرر السطور. لا إضافة أثناء CLOSING أو بعد COMPLETED/CANCELLED.

### 24.7 التحضير والتتبع

فور تأكيد الطلب يظهر في جدول «طلبات الطربيزات» داخل تبويب الطلبات الحالية في قسم التحضير. زر فتح يعرض الكروت المستطيلة لكل منتج ومكوناته.

ضغط «تم التحضير» يحول العنصر PREPARING إلى READY. لا يحدث خصم مخزون هنا. عندما تصبح جميع العناصر النشطة READY:

- order.status يصبح READY.
- يحفظ readyAt.
- ينتقل الصف إلى تبويب الطلبات الجاهزة.
- كارد الطربيزة يظل أخضر ويعرض «جاهز».
- زر إنهاء الطلب يصبح متاحًا في صفحة الطربيزة.

التتبع داخل صفحة الطربيزة يعرض readyItemCount من activeItemCount والنسبة والوقت. لا يحتاج Tracking Token عام لأن الصفحة إدارية محمية. يمكن استخدام QR للطربيزة للواجهة العامة مستقبلًا، لكنه خارج هذا القرار.

### 24.8 إلغاء منتج من طلب الطربيزة

مسموح لعنصر PREPARING أو READY قبل إنهاء الطلب، بسبب إلزامي وصلاحية orders.items.cancel. يستخدم نفس محرك الإلغاء:

1. يقرأ allocations الأصلية.
2. يعيد الكمية والقيمة إلى نفس الدفعات.
3. ينشئ SALE_CANCELLATION_RESTORE لكل حركة.
4. يجعل العنصر CANCELLED.
5. يعيد حساب الإجماليات والأعداد.
6. يشتق حالة الطلب.
7. يحدث كارد الطربيزة والتحضير وAudit.

إذا بقيت العناصر كلها READY يصبح الطلب READY. إذا بقي عنصر غير جاهز يبقى PREPARING. إذا ألغي آخر عنصر نشط يتحول الطلب والجلسة إلى CANCELLED وتعود الطربيزة EMPTY.

الإلغاء المتكرر لا يعيد المخزون مرتين. بعد الدفع أو COMPLETED لا يوجد إلغاء عادي؛ يحتاج Refund/تصحيح مستقل.

### 24.9 إلغاء الطلب كاملًا

متاح في PREPARING أو READY بصلاحية وسبب. يعكس كل allocation غير معكوس في Transaction واحدة، ويجعل كل العناصر النشطة CANCELLED، والطلب CANCELLED، والجلسة CANCELLED مع closedAt/By، والطربيزة فارغة.

إذا فشل عكس دفعة واحدة يرجع كل الإلغاء وتظل الطربيزة مشغولة. إذا كان هناك دفع مسجل، يلزم Refund ذري وحركة OUT من الدرج حسب قواعد الدفع؛ لا يغلق الطلب ويترك مالًا غير مسوى.

إلغاء المسودة قبل التأكيد لا يحتاج API ولا يؤثر على الطربيزة أو المخزون.

### 24.10 إنهاء الطلب

زر «إنهاء الطلب» يظهر داخل كارد/صفحة الطربيزة عندما يكون الطلب READY. لا يعمل في PREPARING أو CLOSING أو COMPLETED أو CANCELLED.

عند الضغط تظهر مراجعة نهائية: رقم الطربيزة، العناصر، الملغي، subtotal، الإجمالي، طريقة الدفع، المدفوع والمتبقي. النسخة الأولى تدعم CASH، مع CARD/TRANSFER دون دخول درج النقد.

داخل Transaction واحدة:

1. التحقق من الحالة READY وversion.
2. قفل الجلسة منطقيًا CLOSING.
3. التحقق من عدم وجود عناصر PREPARING.
4. التحقق من طريقة الدفع والمبلغ.
5. CASH يحتاج درجًا مفتوحًا وينشئ CashDrawerTransaction IN وREVENUE.
6. CARD/TRANSFER ينشئ orderPayment بلا حركة درج نقدي.
7. جعل paymentStatus=PAID أو SETTLED حسب الطريقة.
8. جعل order COMPLETED وحفظ completedAt/By وcompletionMethod=TABLE_DIRECT.
9. جعل tableSession CLOSED وحفظ closing totals وclosedAt/By.
10. إنشاء invoiceSnapshot نهائي غير قابل للتعديل.
11. إنشاء Status Events وAudit.
12. Commit ثم جعل الطربيزة EMPTY ونشر الأحداث.
13. إعادة printData للفرونت لفتح نافذة الطباعة تلقائيًا.

إنشاء الفاتورة وإغلاق الطلب لا يعتمدان على نجاح الطابعة. إذا أغلق المستخدم نافذة الطباعة أو تعطلت الطابعة يبقى الطلب مكتملًا والطربيزة فارغة، ويمكن إعادة الطباعة من سجل الطلبات أو سجل جلسات الطربيزات. لا نرجع البيع بسبب عطل طابعة.

ضغط إنهاء مرتين بنفس Idempotency-Key يعيد الفاتورة نفسها. ضغط بمفتاح مختلف بعد الإكمال يرجع ALREADY_COMPLETED ولا يكرر حركة الدرج.

### 24.11 الفاتورة

كل طلب طربيزة له فاتورة منذ التأكيد بحالة CURRENT، ونسخة نهائية عند الإنهاء. تحتوي:

- بيانات الكافيه.
- رقم الفاتورة والطلب والطربيزة والجلسة.
- العناصر النشطة والملغاة موضحة.
- النوع والحجم والكمية والسعر وإجمالي السطر.
- subtotal والخصم والضريبة وtotal والمدفوع والمتبقي.
- طريقة الدفع.
- أوقات فتح الطربيزة والتأكيد والجاهزية والإنهاء.
- فاتح الجلسة ومن أنهاها.
- QR/Barcode لرقم الطلب للاستخدام الداخلي.
- حالة DRAFT/CURRENT/FINAL/CANCELLED بوضوح.

الطباعة التلقائية عند الإنهاء تستخدم نفس GET print-data. زر طباعة موجود في صفحة الطربيزة وسجل الطلبات وسجل جلسات الطربيزات. Print DTO موحد ويدعم 80mm وA4.

### 24.12 سجل جلسات الطربيزات

سجل مستقل Pagination 10 يعرض sessionNumber، رقم الطربيزة، orderNumber، openedAt/By، closedAt/By، المدة، الحالة، عدد العناصر، الإجمالي، الدفع، وحالة الفاتورة، مع عرض وطباعة.

الفلاتر: الطربيزة، الموظف، الحالة، التاريخ، رقم الطلب. الجلسة الملغاة تبقى في السجل ولا تحذف. المجاميع تعتمد كل النتائج بعد الفلتر لا الصفحة.

سجل الطلبات العام يعرض نفس الطلب في تبويب «طلبات الطربيزات». لا نكرر مستند الطلب؛ سجل الجلسات يعرض زاوية تشغيل الطربيزة، وسجل الطلبات يعرض زاوية البيع.

### 24.13 Schemas الطربيزات

tables:

_id، tableNumber integer unique من 1 إلى 20، displayName، status ACTIVE/OUT_OF_SERVICE، sortOrder، createdAt، updatedAt/By، version. لا يخزن EMPTY/OCCUPIED كمصدر حقيقة.

tableSessions:

_id، sessionNumber unique، tableId، tableNumberSnapshot، activeOrderId، status OPEN/CLOSING/CLOSED/CANCELLED، openedAt/By، closingStartedAt/By، closedAt/By، cancellationReason، subtotalSnapshot، totalSnapshot، paymentStatusSnapshot، invoiceSnapshotId، version، timestamps.

فهرس unique جزئي على tableId للحالات OPEN وCLOSING. فهارس tableId/openedAt وstatus/openedAt وactiveOrderId unique.

orders يستخدم fulfillmentType=DINE_IN وtableSessionId وtableId وtableNumberSnapshot. customerId والعنوان والمندوب null. unique جزئي على tableSessionId للطلب النشط في النسخة الأولى.

tableSessionEvents:

_id، tableSessionId، tableId، orderId، type OPENED/ORDER_CONFIRMED/ITEMS_ADDED/ORDER_READY/CLOSING/CLOSED/CANCELLED/PRINT_REQUESTED/REPRINTED، actorId، fromStatus، toStatus، notes، requestId، occurredAt. Immutable.

invoiceSnapshots:

_id، invoiceNumber unique، orderId unique، tableSessionId، revision، status FINAL/CANCELLED، payloadSafe، totals، finalizedAt/By، checksum، printCount، lastPrintedAt/By. زيادة printCount حدث تشغيلي لا تغير payload النهائي.

### 24.14 API الطربيزات

- GET /api/tables/board يعيد العشرين وملخص الجلسة والطلب.
- GET /api/tables/:tableNumber.
- POST /api/tables/:tableNumber/orders لتأكيد أول طلب.
- GET /api/tables/:tableNumber/active-order.
- POST /api/orders/:orderId/items للإضافة المشتركة.
- POST /api/orders/:orderId/items/:itemId/ready.
- POST /api/orders/:orderId/items/:itemId/cancel.
- POST /api/orders/:orderId/cancel.
- POST /api/tables/:tableNumber/complete.
- GET /api/orders/:orderId/print-data.
- POST /api/orders/:orderId/print-events لتسجيل طلب الطباعة اختياريًا.
- GET /api/table-sessions?page=1&pageSize=10.
- GET /api/table-sessions/:id.
- PATCH /api/tables/:id/status لحالة الخدمة.

Board لا يحتاج Pagination لأنه 20 كارد ثابتة. أي جدول جلسات أو طلبات أو أحداث يستخدم Pagination 10.

### 24.15 الصلاحيات

- tables.read_board.
- tables.open_order.
- tables.read_order.
- tables.add_items.
- tables.cancel_item.
- tables.cancel_order.
- tables.complete_order.
- tables.print_invoice.
- tables.read_sessions.
- tables.change_service_status.
- preparation.read وpreparation.mark_item_ready.
- payments.collect وdrawer.create_sale_transaction عند CASH.

الكاشير لا يغير READY يدويًا من صفحة الطربيزة إذا لم يملك صلاحية التحضير. الباك يفحص كل عملية بصرف النظر عن ظهور الزر.

### 24.16 Data Flow الطربيزات

طربيزة EMPTY → صفحة بيع محلية → تأكيد → Recipe/Batches → خصم المخزون → Table Session OPEN + Order PREPARING → كارد OCCUPIED أخضر → قسم التحضير.

التحضير → عناصر READY واحدًا واحدًا → Order READY → تبويب الجاهز + كارد الطربيزة جاهز.

طربيزة مشغولة → إضافة منتجات → خصم جديد → عناصر PREPARING → إن كان READY يعود PREPARING → قسم الحالي.

إلغاء عنصر/طلب → allocations الأصلية → استعادة نفس الدفعات → Reversal Movements → إعادة الحالات والإجماليات → إغلاق الجلسة إذا لم يبق عنصر.

Order READY → إنهاء → Payment/Drawer → Order COMPLETED + Session CLOSED + Invoice FINAL → Table EMPTY → طباعة تلقائية → السجل.

### 24.17 الحالات ومعايير القبول

1. تظهر 20 طربيزة بالأرقام الصحيحة.
2. الفارغة بيضاء والمشغولة خضراء.
3. فتح صفحة بيع لا يشغل الطربيزة.
4. نجاح أول تأكيد فقط هو الذي يشغلها.
5. تأكيدان متزامنان ينتجان طلبًا واحدًا.
6. لا بيانات عميل في DINE_IN.
7. نقص خامة يمنع الجلسة والطلب والخصم كله.
8. التأكيد يخصم حسب أولوية الدفعات.
9. المنتهي الصلاحية مسموح وفق الأولوية.
10. الطلب يظهر في جدول الطربيزات بالتحضير.
11. الكارد يعرض جاري التحضير ما دام عنصر غير جاهز.
12. آخر عنصر READY يحول الطلب والكارد إلى جاهز.
13. تم التحضير مرتين لا يكرر الحدث.
14. إضافة عنصر إلى READY تعيده PREPARING.
15. العناصر القديمة الجاهزة تبقى READY.
16. فشل الإضافة لا يغير الطلب.
17. إلغاء عنصر يعيد نفس الدفعات مرة واحدة.
18. إلغاء عنصر غير جاهز والباقي جاهز يحول READY.
19. إلغاء آخر عنصر يغلق الجلسة ويلون الكارد أبيض.
20. إلغاء الطلب يعكس كل تخصيص غير معكوس.
21. فشل عكس واحد يرجع الإلغاء كله.
22. زر الإنهاء لا يعمل قبل READY.
23. CASH بلا درج مفتوح يمنع الإنهاء.
24. CASH ينشئ حركة دخل واحدة.
25. CARD لا ينشئ حركة نقد.
26. الإنهاء يغلق الطلب والجلسة معًا.
27. بعد الإنهاء تصبح الطربيزة فارغة فورًا.
28. الإنهاء المكرر لا يكرر البيع أو الفاتورة.
29. الفاتورة النهائية تحفظ Snapshots.
30. عطل الطابعة لا يعيد فتح الطربيزة.
31. يمكن إعادة الطباعة من السجل.
32. الفاتورة الحالية قبل الإنهاء توضح أنها غير نهائية.
33. تغيير اسم منتج لاحقًا لا يغير فاتورة قديمة.
34. تغيير رقم/حالة الطربيزة لا يغير Snapshot قديم.
35. OUT_OF_SERVICE لا يقبل طلبًا جديدًا.
36. لا توقف طربيزة عليها جلسة نشطة.
37. Socket event قديم لا يرجع حالة الكارد.
38. Reconnect يعيد Snapshot للعشرين.
39. سجل الجلسات Pagination 10.
40. تبويب الطربيزات بسجل الطلبات Pagination 10.
41. كل وقت UTC ويعرض Africa/Cairo.
42. كل مال Decimal128 ويرسل String.
43. كل Mutation يحمل employeeId وdeviceId وrequestId.
44. الطلب الملغي يبقى في التاريخ.
45. لا حذف لجلسة أو فاتورة نهائية.
46. CLOSING يمنع إضافة أو إلغاء متزامن.
47. Version يمنع فقد تحديثين.
48. المجاميع لا تعتمد طول الصفحة.
49. الطربيزة المشغولة تفتح التتبع لا بيعًا جديدًا.
50. طلب الطربيزة لا يظهر في قائمة المندوب أو العملاء.
## 25. مراجعة الفرونت والفروق المطلوبة

تمت مراجعة SalesPage وOnlineScreen وPreparationPage وOrderDetailsPage وOrderHistoryPage وDeliveryModal وDelegateHandoverInvoiceModal، صفحات العملاء والمندوبين، OrderBarcode، gateways وendpoints.

الموجود يدعم شكل البيع يمين/يسار، حالات PREPARING وREADY، عرض مكونات المنتج، إلغاء العنصر والطلب، اختيار المندوب، الباركود، صفحات العملاء والمندوبين، وRealtime.

التعديلات المطلوبة عند التنفيذ: تحويل القوائم من تحميل كامل إلى Pagination 10، إضافة كروت تقدم كل عنصر، إضافة append items، فصل OUT_FOR_DELIVERY عن COMPLETED، إضافة تسوية المندوب، توحيد Print DTO، وإرسال حالات وآعداد محسوبة من الخادم بدل اشتقاقات متفرقة في الواجهة.



