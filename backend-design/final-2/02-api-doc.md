# API Documentation الكامل — MERN Backend

الإصدار `v1`. هذا الملف هو عقد الفرونت والباك الكامل. Base URL: `/api/v1`. JSON UTF-8، والوقت UTC ISO-8601، والتاريخ التجاري `YYYY-MM-DD` بمنطقة `Africa/Cairo`.

# 1. التصميم الهندسي وتقليل عدد الطلبات

## 1.1 قواعد منع Request Explosion

1. كل شاشة رئيسية لها Endpoint اسمه `*-screen` يعيد البيانات اللازمة لأول Render في طلب واحد: summary + أول صفحة + filters + permissions + realtime cursor.
2. التفاصيل تستخدم `?include=` بقائمة مسموحة، مثل `include=account,materials,recentEntries`، بحد أقصى 4 includes. لا توجد GraphQL queries حرة.
3. القوائم تستخدم `page=1&limit=10` وترتيبًا ثابتًا. الحد الأقصى 10 حسب قرار المشروع.
4. الكتالوج يستخدم `ETag/If-None-Match`, و`Cache-Control: private,max-age=60,stale-while-revalidate=300`، ويرجع `304` دون Body عند عدم التغيير.
5. الحالات اللحظية تصل عبر Socket.IO؛ لا Polling كل ثانية. بعد reconnect يستخدم `sync?afterSequence=`.
6. Dashboard والتقارير تستخدم Read Models وCache versions؛ لا ينفذ الفرونت عشرات Endpoints ليجمع الأرقام.
7. إدراج المشتريات يدعم أمرًا واحدًا للسطر، و`register-many` لعدة سطور داخل حدود Transaction/حجم آمن.
8. تغيير أولويات الدفعات يرسل الترتيب كاملًا مرة واحدة، وليس Request لكل صف.
9. تعديل صلاحيات الموظف يستخدم Matrix واحدة.
10. Print endpoint يرجع DTO كاملًا للطباعة؛ لا تجمع الطباعة بيانات من عدة APIs.
11. البحث Debounce 300ms، والحد الأدنى حرفان، والعميل يلغي الطلب السابق بـAbortController.
12. لا Nested N+1: الخدمات تستخدم aggregation/batched `$in` وprojections مفهرسة.

## 1.2 ميزانية الأداء

- Interactive reads/writes: p95 ≤500ms، p99 ≤1000ms.
- Socket acknowledgement: p95 ≤300ms بعد Commit.
- AI: timeout 8s مستقل، لا يدخل ميزانية Transaction.
- Export: `202 Accepted` وJob غير متزامن.
- Request body الافتراضي ≤256KB، الصور Upload منفصل، Batch commands ≤50 عنصرًا.
- DB transaction قصيرة ≤700ms مستهدفة، بحد Retry مرتين للأخطاء المؤقتة فقط.

## 1.3 Headers

```http
Authorization: Bearer <employeeAccessToken>
X-Table-Token: <tableGuestToken>
X-Tracking-Read-Token: <readToken>
X-Order-Action-Token: <actionToken>
Idempotency-Key: <uuid>
If-Match: "<version>"
X-Request-Id: <uuid optional>
Accept-Language: ar-EG
```

تستخدم واجهة Admin أول Header، والطاولة الثاني، وتتبع العميل الثالث، وعمليات العميل الحساسة الرابع. كل POST مالي/مخزني وحالات الطلب يحتاج Idempotency-Key. PATCH والحالات المتنافسة تحتاج If-Match أو `expectedVersion`.

# 2. شكل الاستجابات الموحد

## 2.1 نجاح عنصر

```json
{"ok":true,"data":{},"meta":{"requestId":"req_...","serverTime":"2026-09-11T12:00:00.000Z","version":4}}
```

## 2.2 نجاح قائمة

```json
{"ok":true,"data":{"items":[]},"meta":{"page":1,"limit":10,"totalItems":0,"totalPages":0,"hasNext":false,"sort":"createdAt:desc,_id:desc","requestId":"req_...","serverTime":"..."}}
```

## 2.3 خطأ

```json
{"ok":false,"error":{"code":"VALIDATION_ERROR","messageAr":"البيانات غير صحيحة","fieldErrors":[{"field":"phone","code":"INVALID_PHONE","messageAr":"رقم الهاتف غير صحيح"}],"retryable":false},"meta":{"requestId":"req_...","serverTime":"..."}}
```

الأكواد: `VALIDATION_ERROR 400`, `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `STATE_CONFLICT 409`, `VERSION_CONFLICT 409`, `IDEMPOTENCY_KEY_REUSED 409`, `INSUFFICIENT_STOCK 409`, `RATE_LIMITED 429`, `DEPENDENCY_TIMEOUT 504`, `INTERNAL_ERROR 500`.

# 3. DTOs المشتركة الكاملة

```ts
type Money = string; // Decimal128 e.g. "125.50"
type Quantity = string;
type RefSnapshot = { id:string; name:string; number?:string };
type PageMeta = { page:number; limit:10; totalItems:number; totalPages:number; hasNext:boolean; sort:string };
type Actor = { id:string; name:string; type:"EMPLOYEE"|"CUSTOMER"|"TABLE_GUEST"|"SYSTEM" };
type Address = { city:string; area:string; street:string; building:string; floor?:string; landmark?:string };
type ApiMeta = { requestId:string; serverTime:string; version?:number; eventSequence?:number };
```

`id` String ObjectId. كل Decimal يخرج String. كل DTO تاريخي يستخدم Snapshot، ولا يعتمد على الاسم الحالي.

# 4. Auth وBootstrap

## POST `/auth/login`

Request: `{"name":"admin","password":"plain-value","fingerprint":"fp","device":{"name":"Chrome","browser":"Chrome","os":"Windows"}}`.

Response approved: `{"ok":true,"data":{"employee":{"id":"","name":"","position":"","status":"ACTIVE"},"role":{"id":"","name":""},"permissions":[{"pageKey":"orders_online","visible":true,"actions":["read","create"]}],"notifications":{"unreadCount":2,"items":[]},"shift":null,"auth":{"accessToken":"","refreshToken":"","expiresIn":900}},"meta":{...}}`.

Response new device `202`: `{"ok":true,"data":{"status":"DEVICE_APPROVAL_REQUIRED","deviceRequestId":"","pollAfterSeconds":5},"meta":{...}}`.

## POST `/auth/refresh`

Request: `{"refreshToken":""}`. Response: `{"ok":true,"data":{"accessToken":"","refreshToken":"","expiresIn":900},"meta":{...}}`.

## POST `/auth/logout`

Request: `{"refreshToken":"","allSessions":false}`. Response: `{"ok":true,"data":{"revoked":true},"meta":{...}}`.

## GET `/admin/bootstrap`

طلب واحد بعد الدخول. Response data: `{employee,role,permissions,notifications:{unreadCount,items[0..9]},currentAttendance,currentShift,featureFlags,realtime:{token,lastSequence}}`.

# 5. الموردون

## GET `/suppliers-screen?search=&status=&page=1&limit=10`

Response data: `{"summary":{"active":0,"inactive":0,"totalDebt":"0","totalReceivable":"0"},"filters":{"types":[],"cities":[]},"suppliers":[SupplierListItem]}` مع PageMeta. `SupplierListItem={id,name,contactPerson,phone,supplierType,city,status,debtBalance,receivableBalance,createdAt,version}`.

## POST `/suppliers`

Request: `{name,contactPerson,phone,supplierType,city}`. Response `201`: `{supplier:SupplierDetails,account:{debtBalance:"0",receivableBalance:"0"}}`.

## GET `/suppliers/:id?include=account,materials,recentEntries`

Response: `{supplier:SupplierDetails,account,materials:{items,pageMeta},recentEntries:{items,pageMeta}}`. كل include أول صفحة فقط.

## PATCH `/suppliers/:id`

Request: `{name?,contactPerson?,phone?,supplierType?,city?,expectedVersion}`. Response: `{supplier}`.

## POST `/suppliers/:id/status`

Request: `{status:"ACTIVE|INACTIVE",reason,expectedVersion}`. Response `{supplier}`.

## POST `/suppliers/:id/account-entries`

Request: `{kind:"DEBT|RECEIVABLE|DEBT_PAYMENT|RECEIVABLE_COLLECTION",amount:"100.00",occurredOn:"2026-09-11",notes?,expectedAccountVersion}`. Response: `{entry,account,drawerTransaction:null|CashDrawerTransaction}`.

## GET `/suppliers/:id/account-entries?page=1&limit=10&kind=&from=&to=`

Response `{items:[SupplierAccountEntry],account:{debtBalance,receivableBalance}}` + PageMeta.

## POST `/supplier-account-entries/:id/reverse`

Request `{reason,expectedAccountVersion}`. Response `{originalEntry,reversalEntry,account,drawerTransaction}`.

# 6. المواد الخام والتحذيرات

## GET `/raw-materials-screen?search=&supplierId=&status=&page=1&limit=10`

Response `{summary:{materials,lowStock,expiring,expired},filters:{suppliers,units,statuses},materials:[{id,name,supplier,largeUnit,smallUnit,conversionFactor,stockLarge,stockSmall,lastPurchasePrice,nextExpiry,minStockSmall,status,version}]}`.

## POST `/raw-materials`

Request `{name,supplierId,largeUnitId,smallUnitId,conversionFactor:"1000",smallQuantityStep:"1",referenceLargeUnitPrice?:"",currency:"EGP",minStockSmall:"500",expiryAlertDays:7}`. Response `201` `{material}`. المورد ACTIVE وإلزامي.

## GET `/raw-materials/:id?include=batches,movements,affectedProducts`

Response `{material,stockSummary,batches:{items,pageMeta},movements:{items,pageMeta},affectedProducts:{items,pageMeta}}`.

## PATCH `/raw-materials/:id`

Request `{name?,supplierId?,minStockSmall?,expiryAlertDays?,status?,expectedVersion}`. Response `{material}`. supplierId/units ترفض بعد القفل.

## POST `/raw-materials/:id/withdrawals`

Request `{batchId,quantityLarge:"1.5",reason,occurredOn,expectedBatchVersion}`. Response `201` `{withdrawal,movement,batch,materialStock}`.

## PUT `/raw-materials/:id/batch-priorities`

Request `{expectedPriorityVersion,orderedBatchIds:["id1","id2"]}`. Response `{materialId,priorityVersion,batches:[{id,salePriority}]}`.

## GET `/withdrawals?page=1&limit=10&materialId=&supplierId=&from=&to=`

Response `{items:[{movementNo,material,batch,supplier,quantityLarge,quantitySmall,inventoryValue,reason,actor,recordedAt}]}`.

## GET `/warnings-screen?type=&materialId=&supplierId=&page=1&limit=10`

Response `{summary:{lowStock,expiring,expired,openShiftLong},evaluatedAt,businessToday,timezone,items:[WarningItem]}`. `WarningItem={id,type,severity,material?,batch?,supplier?,threshold,currentValue,expiryOn?,daysUntilExpiry?,shift?,link}`.

# 7. المشتريات

## GET `/purchases-screen?tab=unregistered&page=1&limit=10`

Response `{summary:{draft,split,partiallyRegistered,registered},groups:[PurchaseGroupListItem],filters}`.

## POST `/purchase-groups`

Request `{items:[{materialId,quantityLarge:"2",largeUnitPrice:"300.00"}],invoiceDate?}`. Response `201` `{group,items,totals}`. المورد والأسعار المرجعية يعيدها الخادم.

## PATCH `/purchase-groups/:id`

Request `{items:[...],invoiceDate?,expectedVersion}`. Response `{group,items,totals,splitOutdated}`. ممنوع بعد أول تسجيل.

## DELETE `/purchase-groups/:id`

Headers Idempotency/If-Match. Response `{deleted:true,groupNo}` للـDraft فقط.

## POST `/purchase-groups/:id/split-by-supplier`

Request `{expectedVersion}`. Response `{group,supplierInvoices:[{id,invoiceNo,supplier,items,subtotal,status}]}`.

## POST `/purchase-items/:id/register`

Request `{receivedOn,expiryOn:null|"2026-12-31",expectedVersion}`. Response `{item,batch,movement,groupStatus,supplierInvoiceStatus,warningsSummary}`.

## POST `/purchase-groups/:id/register-many`

Request `{expectedVersion,items:[{purchaseItemId,receivedOn,expiryOn,expectedItemVersion}]}` بحد 50. Response `{registered:[{item,batch,movement}],group}`؛ فشل عنصر يرجع الكل.

## GET `/purchase-groups/:id/print-data` و`/supplier-purchase-invoices/:id/print-data`

Response `{documentType,number,status,dates,supplier?,items,totals,currency,actors,generatedAt}`.

# 8. مرتجعات المشتريات

## GET `/purchase-returns-screen?page=1&limit=10&from=&to=&supplierId=`

Response `{summary:{count,totalInventoryValue},returns:[ReturnListItem],filters}`.

## POST `/purchase-returns`

Request `{returnDate,notes?,items:[{batchId,quantityLarge:"1",reason,expectedBatchVersion}]}`. Response `201` `{return,items,movements,affectedMaterials}`.

## GET `/purchase-returns/:id` و`/purchase-returns/:id/print-data`

Response التفاصيل `{return,items:[{material,batch,supplier,quantityLarge,quantitySmall,unitCost,totalValue,reason}],totals,actors}`؛ Print يضيف document metadata.

# 9. المنتجات والكتالوج

## GET `/products-screen?categoryId=&status=&visible=&search=&page=1&limit=10`

Response `{summary,filters:{categories,statuses},products:[ProductListItem]}`.

## POST/PATCH `/product-categories` و`/product-categories/:id`

Create `{name,description?,sortOrder}`؛ Patch `{name?,description?,isActive?,sortOrder?,expectedVersion}`؛ Response `{category}`.

## POST `/products`

Request `{name,description?,imageId?,categoryId,isVisibleInMenu,status}`. Response `{product}`.

## GET/PATCH `/products/:id`

GET include `types,sizes,recipes,addons,costPreview`; Response `{product,types,sizes,recipes,addons,costPreview}`. Patch الحقول العامة + expectedVersion.

## POST `/products/:id/types`

Request `{name,allowedMaterialIds:[],sortOrder}`. Response `{type}`.

## POST `/products/:id/sizes`

Request `{typeId,name,sellingPrice:"50.00",sortOrder}`. Response `{size,costPreview}`.

## PUT `/product-sizes/:id/recipe`

Request `{ingredients:[{materialId,quantitySmall:"20"}],expectedVersion}`. Response `{recipe,costPreview:{available,cost,profit,margin,costCompleteness,simulatedAllocations}}`.

## POST/PATCH `/products/:id/addons` و`/product-addons/:id`

Request `{name,sellingPrice,recipe?:{ingredients:[]},isActive,expectedVersion?}`. Response `{addon,costCompleteness}`.

## GET `/catalog?categoryId=&typeId=&search=&page=1&limit=10`

Public projection فقط. Response `{catalogVersion,categories,products:[{id,name,description,image,category,isAvailable,types:[{id,name,sizes:[{id,name,price}]}],addons:[{id,name,price}]}]}`. يدعم ETag.

# 10. إنشاء الطلبات والإدارة

## GET `/orders-online-screen?tab=active&page=1&limit=10`

Response `{summary:{active,preparing,ready,outForDelivery},orders:[OrderCard],filters,realtime}`. `OrderCard={id,orderNumber,fulfillmentType,customer,total,status,progress:{ready,total},delegate?,createdAt,version}`.

## POST `/orders`

Admin request `{fulfillmentType:"TAKEAWAY|DELIVERY",customer:{name,phone,address?},items:[OrderInputItem]}`. `OrderInputItem={productId,productSizeId,quantity,addonIds?,notes?}`. Response `201` `{order,items,totals,allocationsSummary,tracking:{publicOrderNumber,barcodeValue},customer}`. لا ترسل بيانات دفع عند الإنشاء؛ التحصيل كاش عند التسليم.

## GET `/orders/:id?include=items,timeline,payment,delivery,invoice`

Response `{order,items,timeline,payment,delivery,invoice}` بحسب include.

## POST `/orders/:id/items`

Request `{items:[OrderInputItem],expectedVersion}`. Response `{order,addedItems,totals,stockMovements,progress}`.

## POST `/orders/:id/items/:itemId/cancel`

Request `{reason,expectedOrderVersion,expectedItemVersion}`. Response `{order,item,restoredAllocations,refundImpact,totals}`.

## POST `/orders/:id/cancel`

Request `{reason,expectedVersion,refundDecision?}`. Response `{order,restoredAllocations,payment:{status,refundCase?}}`.

## POST `/orders/:id/complete-takeaway`

Request `{payment:{method,amount},expectedVersion}`. Response `{order,payment,drawerTransaction?,invoice}`.

# 11. التحضير

## GET `/preparation-screen`

طلب واحد يعيد `{tables:{current,ready},online:{current,ready},counts,realtime:{lastSequence}}`; كل قائمة أول 10 وعند load-more تستخدم endpoint التالي.

## GET `/preparation/orders?group=online&tab=current&page=1&limit=10`

Response `{items:[OrderPreparationCard]}`. الكارت يشمل items progress ولا يعيد Recipe كاملة.

## GET `/preparation/orders/:orderId`

Response `{order,items:[{id,product,type,size,quantity,recipeSnapshot,notes,status,readyAt,version}],progress,version}`.

## POST `/preparation/order-items/:itemId/ready`

Request `{expectedItemVersion,expectedOrderVersion}`. Response `{item,order:{id,status,progress,eventSequence}}`.

# 12. المندوبون والتوصيل

## GET `/delegates-screen?status=&search=&page=1&limit=10`

Response `{summary:{active,busy,inactive,outstandingCash},delegates:[{id,name,phone,whatsappNumber,status,activeOrderCount,outstandingCash,version}]}`.

## POST/PATCH `/delegates` و`/delegates/:id`

Create `{name,phone,whatsappNumber,status,maxActiveOrders,notes?}`؛ Patch نفس الاختيارات + expectedVersion. Response `{delegate}`.

## GET `/delegates/:id?include=activeOrders,history,cashLedger`

Response `{delegate,activeOrders:{items,pageMeta},history:{items,pageMeta},cashLedger:{items,pageMeta,summary}}`.

## POST `/orders/:id/assign-delegate`

Request `{delegateId,expectedOrderVersion}`. Response `{order,assignment}`.

## POST `/delivery-assignments/:id/handover`

Request `{expectedVersion}`. Response `{assignment,order:{status:"OUT_FOR_DELIVERY",customerReceiptStatus:"AVAILABLE"}}`.

## POST `/delivery-assignments/:id/reassign`

Request `{newDelegateId,reason,expectedVersion}`. Response `{oldAssignment,newAssignment,order}`.

## POST `/delivery-assignments/:id/failed` و`/returned`

Failed `{reason,notes?,expectedVersion}`؛ Returned `{reason,expectedVersion}`. Response `{assignment,order,nextActions}`.

## POST `/delivery-assignments/:id/admin-confirm-delivery`

Request `{reason,amountReportedCollected?,expectedVersion}`. صلاحية override. Response `{order,assignment,deliveryConfirmation,payment}`.

## POST `/delivery-assignments/:id/settle-cash`

Request `{amount,expectedVersion}`. Response `{assignment,payment,drawerTransaction,outstandingCash}`.

## POST `/delivery-assignments/:id/whatsapp-share-opened`

Request `{expectedVersion}`. Response `{event,shareUrl}`؛ لا يدعي نجاح إرسال الرسالة.

# 13. العملاء وCustomer Web

## GET `/customers-screen?search=&status=&page=1&limit=10`

Response `{summary,customers:[{id,lastName,phone,status,orderCount,completedOrderCount,lifetimeValue,lastOrderAt,version}]}`.

## POST/PATCH `/customers` و`/customers/:id`

Create يدوي `{name,phone,address?,socialLinks?}`؛ Patch `{name?,address?,socialLinks?,status?,reason?,expectedVersion}`. Response `{customer}`.

## GET `/customers/:id?include=orders,reviews,timeline`

Response `{customer,orders:{items,pageMeta},reviews:{items,pageMeta},timeline:{items,pageMeta}}`.

## POST `/public-orders`

Request `{fulfillmentType:"TAKEAWAY|DELIVERY",customer:{name,phone,address?},items:[OrderInputItem]}`. Response `201`: `{order:{id,publicOrderNumber,status,fulfillmentType,items,totals,createdAt},customer:{id,lastName},tracking:{barcodeValue,trackingReadToken,orderActionToken,readExpiresAt,actionExpiresAt}}`. Tokens تظهر مرة واحدة.

## POST `/public-orders/lookup`

Request `{orderNumber,phone}`. Response projection `{orderNumber,status,fulfillmentType,createdAt,maskedPhone,canProveOwnership}`؛ لا Tokens أو عنوان كامل.

## GET `/public-orders/:orderNumber/tracking`

Read Token. Response `{orderNumber,barcodeValue,status,customerReceiptStatus,progress,items:[{name,size,quantity,status}],timeline,totals,delivery:{delegateName?,eta?},eventSequence}`.

## POST `/public-orders/:orderNumber/items`

Action Token. Request `{items:[OrderInputItem],expectedVersion}`. Response `{order,addedItems,totals,progress,eventSequence,balanceDue}`.

## POST `/public-orders/:orderNumber/cancellation-request`

Request `{reason,expectedVersion}`. Response `{request:{id,status:"PENDING|AUTO_APPROVED",createdAt},order}`.

## POST `/public-orders/:orderNumber/receive`

Request `{expectedVersion}`. Response `{order:{status:"COMPLETED",customerReceiptStatus:"CONFIRMED",completedAt},deliveryConfirmation,reviewAvailable:true}`.

## POST `/public-orders/:orderNumber/reviews`

Request `{rating:1,comment?,tags?,expectedOrderVersion}`. Response `201` `{review}`.

## POST `/customer-access-sessions`

Request `{orderNumber,orderActionToken}`. Response `{customerAccessToken,expiresAt,customer:{id,lastName,maskedPhone}}`.

## GET `/customer/orders?page=1&limit=10`

Customer Access Token. Response `{items:[{orderNumber,barcodeValue,fulfillmentType,status,total,createdAt,reviewStatus}]}`.

# 14. الطاولات وواجهة الضيف

## POST `/table-experience/bootstrap`

Request `{qrToken,fingerprint?}`. Response `{table:{id,number,name},guestSession:{id,number,expiresAt},tableToken,catalogVersion,activeOrder?,openServices?,realtime}`.

## POST `/table-experience/refresh` و`/logout`

Refresh Request `{}` مع Table Token ويرجع `{tableToken,expiresAt}`. Logout يرجع `{closed:true}` إذا مسموح.

## GET `/table-experience/home-screen`

طلب واحد: `{table,categories,featuredProducts,reviews,activeOrder,openServices,cartPolicy,realtime}`. لا عروض أو AI.

## GET `/table-experience/catalog` و`/products/:id`

نفس Public Product DTO مع Table Token وETag.

## POST `/table-experience/order-proposals`

Request `{items:[OrderInputItem],catalogVersion}`. Response `201` `{proposal:{id,proposalNumber,status:"WAITING_WAITER",items,totals,version},serviceRequest:{id,type:"CALL_WAITER",purpose:"ORDER_REVIEW",status:"OPEN"}}`. لا Order/خصم.

## GET `/table-experience/order-proposals/:id` وPOST `/:id/cancel`

GET `{proposal}`؛ Cancel `{reason?,expectedVersion}` ويرجع `{proposal:{status:"CANCELLED"},serviceRequest}`.

## GET `/table-order-proposals-screen?status=&tableId=&page=1&limit=10`

Admin response `{summary,proposals:[{id,number,table,itemsCount,total,status,waitingSeconds,version}],realtime}`.

## POST `/table-order-proposals/:id/start-review|request-changes|reject|confirm`

Start `{expectedVersion}`؛ changes `{message,expectedVersion}`؛ reject `{reason,expectedVersion}`؛ confirm `{reviewedItems?,expectedVersion}`. Confirm response `{proposal,tableSession,order,stockMovements}`.

## GET `/table-experience/orders` و`/orders/:id/tracking`

Response list/detail scoped by Guest Session، بنفس Tracking DTO من دون أسرار.

## POST `/table-experience/orders/:id/reviews`

Request `{rating,comment?,expectedOrderVersion}`. Response `{review}` بعد DINE_IN completed.

# 15. خدمات الطاولة

## POST `/table-experience/services`

Request `{type:"CALL_WAITER|WATER_REQUEST|PARTY_SURPRISE|BILL_REQUEST|REPORT_PROBLEM",details?,problemCategory?,requestedQuantity?}`. Response `201` أو الموجود: `{serviceRequest,alreadyOpen:boolean}`.

## GET `/table-services-screen?tab=open&page=1&limit=10`

Admin response `{summary:{open,highPriority,averageResponseSeconds},openRequests,completedRequests,filters,realtime}`.

## POST `/table-service-requests/:id/resolve`

Request `{resolutionNote?,resultCode:"HANDLED",expectedVersion}`. Response `{serviceRequest:{status:"RESOLVED",handledAt,handledBy,responseDurationSeconds}}`.

## POST `/table-experience/services/:id/cancel`

Request `{reason?,expectedVersion}`. Response `{serviceRequest:{status:"CANCELLED"}}` قبل التعامل فقط.

# 16. الدرج والوردية

## GET `/cash-drawer-screen`

Response `{currentShift,summary,recentTransactions:{items,pageMeta},openShiftAlerts:{items,pageMeta},permissions}`.

## POST `/cash-drawer-shifts`

Request `{openingBalance:"500.00",notes?}`. Response `201` `{shift:{id,shiftNo,status:"OPEN",openingBalance,totalCashIn:"0",totalCashOut:"0",expectedClosingBalance:"500",openedAt,openedBy,nextOpenShiftWarningAt,version}}`.

## GET `/cash-drawer-shifts/current` و`/:id`

Response `{shift,summary,alertsSummary}`؛ details يمكن `include=transactions,alerts` لأول صفحة.

## POST `/cash-drawer-shifts/:id/cash-in` و`/cash-out`

Request `{amount,accountingClass,description,reason,expectedVersion}`. Response `{transaction,shift:{totals,expectedClosingBalance,version}}`.

## POST `/cash-drawer-transactions/:id/reverse`

Request `{reason,expectedShiftVersion}`. Response `{original,reversal,shift}` لليدوي المسموح.

## POST `/cash-drawer-shifts/:id/close`

Request `{actualClosingBalance,closingNotes?,differenceReason?,expectedVersion}`. Response `{shift:{status:"CLOSED",expectedClosingBalance,actualClosingBalance,reconciliationDifference,reconciliationStatus,closedAt},printDataUrl}`.

## GET `/cash-drawer-shifts?page=1&limit=10&status=&from=&to=` و`/:id/transactions`

Response lists القياسية. Transactions filters direction/class/source.

## GET `/cash-drawer-shifts/:id/alerts` و`/print-data`

Alerts `{items:[DrawerShiftAlert]}`؛ Print `{shift,transactions,totals,reconciliation,alerts,actors,generatedAt}`.

# 17. الموظفون والأجهزة والحضور والصلاحيات

## GET `/employees-screen?search=&status=&page=1&limit=10`

Response `{summary,employees:[{id,name,position,role,status,attendanceStatus,devicesPending,lastLoginAt,version}],roles}`. لا password.

## POST `/employees`

Request `{name,passwordPlainText,position,roleId,status,workStart,workEnd,crossesMidnight,timezone:"Africa/Cairo",graceMinutes}`. Response `201` `{employee,passwordPlainText}` فقط لصلاحية العرض وفي نفس الإنشاء.

## GET `/employees/:id?include=devices,attendance,permissions,activity`

Response `{employee,passwordPlainText? وفق الصلاحية,devices:{items,pageMeta},attendance:{items,pageMeta},permissions,activity:{items,pageMeta}}`.

## PATCH `/employees/:id`

Request `{name?,passwordPlainText?,position?,roleId?,status?,schedule?,reason?,expectedVersion}`. Response `{employee,passwordChanged:boolean}`.

## GET `/employee-devices?status=PENDING&page=1&limit=10`

Response `{items:[{id,employee,name,browser,os,status,firstSeenAt,lastSeenAt,attemptCount,version}]}`.

## POST `/employee-devices/:id/approve` و`/block`

Approve `{name?,expectedVersion}`؛ Block `{reason,expectedVersion}`. Response `{device,revokedSessionsCount}`.

## POST `/attendance/check-in`

Request `{}` من Session approved. Response `{attendance:{status:"OPEN",checkInAt,lateMinutes,scheduleSnapshot}}`.

## POST `/attendance/:id/check-out`

Admin request `{notes?,expectedVersion}`. Response `{attendance:{status:"CLOSED",checkOutAt,workedMinutes,checkedOutBy}}`.

## PUT `/employees/:id/permission-matrix`

Request `{roleId,permissions:[{permissionKey,effect:"ALLOW|DENY"}],pages:[{pageKey,visible}],expectedPermissionsVersion}`. Response `{role,permissions,pages,permissionsVersion}`.

# 18. سجل الطلبات والفواتير

## GET `/order-history-screen?group=online&page=1&limit=10&status=&from=&to=&search=`

Response `{summary,groups:{onlineTakeaway?,tables?},orders:[OrderHistoryItem],filters}`. عند الشاشة يطلب Group واحد فقط؛ تبديل التبويب يجلب الآخر.

## GET `/orders/:id/print-data`

Response `{invoice:{number,revision,status,orderNumber,channel,fulfillmentType,customer?,table?,items,subtotal,discount,tax,deliveryFee,total,payment,delivery?,actors,createdAt,finalizedAt,checksum}}`.

## POST `/orders/:id/print-events`

Request `{documentRevision,printerType:"80MM|A4"}`. Response `{recorded:true,printCount}`؛ تسجيل فقط ولا يغير الطلب.

# 19. التقارير المالية

## GET `/financial-reports-screen?from=&to=&compare=previous_period`

Response واحدة: `{period,comparisonPeriod,dataQuality,cards:{netSales,cogs,grossProfit,cashIn,cashOut,inventoryValue,supplierDebt,supplierReceivable,delegateOutstanding},charts:{salesTrend,channelMix},topProducts,alerts,sourceVersions,generatedAt}`.

## GET `/financial-reports/sales|inventory|drawer|suppliers|delegates`

Query `{from,to,page,limit,sort,filters}`. Response `{summary,items,breakdowns,dataQuality,generatedAt}` + PageMeta. لا يجمع الفرونت الأرقام بنفسه.

## POST `/financial-reports/exports`

Request `{reportType,from,to,filters,format:"PDF|XLSX|CSV"}`. Response `202` `{export:{id,exportNo,status:"QUEUED",statusUrl,expiresAt}}`.

## GET `/financial-reports/exports/:id`

Response `{export:{status,progress,rowCount,fileUrl?,checksum?,errorCode?}}`.

# 20. سجل الأحداث والإشعارات

## GET `/audit-events-screen?page=1&limit=10&module=&eventType=&actorId=&result=&severity=&from=&to=`

Response `{summary:{total,success,failed,denied,warning,critical},items:[AuditEventListItem],filters}`.

## GET `/audit-events/:id`

Response `{event:{identity,type,module,action,actor,subject,entity,result,severity,reason,changesSafe,financialContext,inventoryContext,request,device,occurredAt,integrity}}` مع إخفاء الحساس.

## GET `/entities/:entityType/:entityId/timeline?page=1&limit=10`

Response `{items:[{eventNo,eventType,action,actor,result,severity,occurredAt,summary}]}`.

## GET `/notifications?page=1&limit=10&unread=true`

Response `{unreadCount,items:[{id,type,severity,title,message,entityType,entityId,link,createdAt,readAt}]}`.

## POST `/notifications/:id/read` و`/notifications/read-all`

Request `{}` أو `{before?}`. Response `{updatedCount,unreadCount}`.

# 21. الباريستا الذكي

## POST `/customer-ai/chat`

Request `{conversationId?,message,context:{visibleProductIds?,cartSummary?:[{productId,sizeId,quantity}]}}`. Response `{conversationId,answer,productSuggestions:[{productId,sizeId,reason,displayName,price,isAvailable}],draftCartActions:[{action:"ADD",productId,sizeId,quantity}],usage:{provider:"DEEPSEEK",latencyMs},safety:{catalogOnly:true}}`.

لا Recipe/Materials/Costs/Stock count/Customer/Order access. المفتاح Server secret. الاقتراح لا يعدل Cart أو Order؛ الفرونت يمرره عبر Catalog validation.

# 22. Realtime Contract

Socket namespaces/rooms: `employee:{id}`, `admin:orders`, `admin:preparation`, `admin:table-services`, `admin:table-proposals`, `table:{id}`, `guest-session:{id}`, `order:{id}`, `customer-session:{id}`, `drawer:{scope}`.

Envelope:

```json
{"eventId":"evt_","type":"order.updated","aggregateType":"ORDER","aggregateId":"","sequence":18,"occurredAt":"...","data":{"status":"READY","progress":{"ready":3,"total":3}},"requestId":"req_"}
```

الأحداث: `order.created|updated|ready|completed|cancelled`, `order-item.added|ready|cancelled`, `proposal.created|updated|confirmed|rejected`, `table-service.created|resolved|cancelled`, `delivery.assigned|handed-over|failed|returned|completed`, `drawer.updated|closed|shift-open-too-long`, `warning.summary.updated`, `notification.created`, `permissions.updated`.

## GET `/realtime/sync?rooms=...&afterSequence=17`

Response `{snapshots:[{aggregateType,aggregateId,currentSequence,state}],events:[RealtimeEnvelope],hasMore}`. يستخدم بعد reconnect؛ Socket ليس مصدر الحقيقة.

# 23. Health وعمليات النظام

## GET `/health/live`

`200 {"status":"UP"}` دون فحص DB.

## GET `/health/ready`

`200/503 {"status":"UP|DOWN","dependencies":{"mongodb":"UP","outbox":"UP","deepseek":"DEGRADED"},"serverTime":"..."}`. لا أسرار.

## GET `/system/version`

Response `{apiVersion:"v1",schemaVersion,build,serverTime}`.

# 24. Rate Limits وCaching

- Login: 5/15min لكل IP+name، مع progressive delay.
- Public lookup: 10/10min لكل IP+order fingerprint.
- Table services: 5/min لكل Guest Session والنوع المفتوح deduplicated.
- Customer AI: 10/min و100/day لكل device/session.
- Admin reads: 120/min، writes 60/min، exports 5/hour.
- Catalog: ETag؛ screen endpoints private no-store إذا بها بيانات حساسة.
- لا Cache لاستجابات مالية متغيرة دون sourceVersions وexpiresAt.

# 25. Endpoints الإدارة المكملة

## وحدات القياس

- `GET /measurement-units?kind=&active=true`: Response `{items:[{id,code,nameAr,kind,physicalFactor,isActive}]}`.
- `POST /measurement-units`: Request `{code,nameAr,kind,physicalFactor}`؛ Response `201 {unit}`.
- `PATCH /measurement-units/:id`: Request `{nameAr?,isActive?,expectedVersion}`؛ Response `{unit}`. الوحدة المستخدمة لا تحذف.

## حالات المنتجات والحذف الآمن

- `POST /products/:id/status`: Request `{status:"ACTIVE|INACTIVE",reason,expectedVersion}`؛ Response `{product}`.
- `POST /products/:id/menu-visibility`: Request `{visible,expectedVersion}`؛ Response `{product}`.
- `DELETE /products/:id`: Response `{deleted:true}` لغير المستخدم فقط، وإلا `409 ENTITY_HAS_HISTORY`.
- نفس قاعدة الحذف/الإيقاف للأقسام والأنواع والأحجام والإضافات مع Route المورد المناسب.

## المدفوعات والاسترجاع

- `POST /orders/:id/payments`: Request `{method:"CASH",collectionMode:"DIRECT|COD",amount,expectedOrderVersion}`؛ Response `{payment,order,drawerTransaction?}`. DIRECT يدخل الدرج فورًا، وCOD يسجل عهدة المندوب حتى التسوية.
- `POST /order-payments/:id/refunds`: Request `{amount,reason,expectedPaymentVersion}`؛ Response `{payment,refund,drawerTransaction?,order}`.
- `GET /orders/:id/payments?page=1&limit=10`: Response `{items:[PaymentDTO],summary:{paid,refunded,balanceDue}}`.

## لوحة وجلسات الطاولات في Admin

- `GET /tables-board`: Response `{tables:[20 TableCard],summary,realtime}`؛ `TableCard={id,number,operationalStatus:"EMPTY|OCCUPIED|OUT_OF_SERVICE",orderStatus?,progress?,total?,sessionId?,orderId?,version}`.
- `POST /tables/:id/admin-orders`: Request `{items,expectedTableVersion}`؛ Response `{tableSession,order,stockMovements}` لأول طلب Admin.
- `GET /table-sessions/:id?include=order,services,timeline`: Response `{session,order,services,timeline}`.
- `POST /table-sessions/:id/items`: Request `{items,expectedSessionVersion,expectedOrderVersion}`؛ Response `{session,order,addedItems,stockMovements}`.
- `POST /table-sessions/:id/cancel`: Request `{reason,expectedVersion}`؛ Response `{session,order,restoredAllocations,paymentImpact}`.
- `POST /table-sessions/:id/close`: Request `{payment,expectedVersion}`؛ Response `{session,order,payment,drawerTransaction?,invoice,table}`.
- `GET /table-sessions?page=1&limit=10&tableId=&status=&from=&to=`: Response `{items:[TableSessionListItem]}` + PageMeta.
- `GET /table-sessions/:id/print-data`: Response `{invoice,session,table,items,totals,payment,actors}`.

## الأدوار والصلاحيات

- `GET /roles?include=permissions`: Response `{items:[{id,name,level,description,isSystem,permissions:[]}]}`.
- `POST /roles`: Request `{name,level,description?,permissionKeys:[]}`؛ Response `201 {role,permissions}`.
- `PATCH /roles/:id`: Request `{name?,level?,description?,expectedVersion}`؛ Response `{role}`.
- `PUT /roles/:id/permissions`: Request `{permissionKeys:[],expectedVersion}`؛ Response `{role,permissions,affectedEmployees,newPermissionsVersion}`.
- `GET /permissions`: Response `{items:[{key,pageKey,action,label}]}`؛ Read-only catalog في النسخة الأولى.

## الحضور والتصحيح

- `GET /attendance?page=1&limit=10&employeeId=&status=&from=&to=`: Response `{items:[AttendanceDTO],summary}`.
- `GET /attendance/:id`: Response `{attendance,adjustments}`.
- `POST /attendance/:id/adjustments`: Request `{kind,changes:{checkInAt?,checkOutAt?},reason,expectedVersion}`؛ Response `{attendance,adjustment}`.
- `POST /attendance/:id/force-close`: Request `{checkOutAt?,reason,expectedVersion}`؛ Response `{attendance,adjustment}` بصلاحية إدارية.

## مراجعة التقييمات

- `GET /reviews?page=1&limit=10&status=&rating=&channel=`: Response `{items:[ReviewDTO],summary}`.
- `PATCH /reviews/:id`: صاحب التقييم Request `{rating?,comment?,expectedVersion}`؛ Response `{review,revision}` داخل المدة.
- `POST /reviews/:id/moderation`: Request `{status:"VISIBLE|HIDDEN",reason,expectedVersion}`؛ Response `{review,revision}`.

## إدارة التحذيرات والتنبيهات

- `GET /warnings/summary`: Response `{counts,evaluatedAt,businessToday,sourceVersions}` للاستخدام في Header.
- `GET /cash-drawer-shifts/:id/alerts?page=1&limit=10`: Response `{items:[DrawerShiftAlert]}`.
- لا يوجد Delete/Acknowledge يغير Warning مشتق. قراءة Notification منفصلة عن سبب التحذير.

## سجل الفواتير والتصدير

- `GET /invoices?page=1&limit=10&channel=&status=&from=&to=&search=`: Response `{items:[InvoiceListItem],summary}`.
- `GET /invoices/:id`: Response `{invoice}` من Snapshot النهائي.
- `POST /audit-events/exports`: Request `{filters,format}`؛ Response `202 {export:{id,statusUrl}}`.
- `GET /audit-events/exports/:id`: Response `{status,progress,fileUrl?,expiresAt,errorCode?}`.

## عمليات النظام الداخلية

ليست Public Routes: `openShiftWarningJob`, `outboxPublisher`, `warningSummaryInvalidator`, `reportExportWorker`, `tokenCleanupJob`. كل Worker يستخدم lease، deduplication key، retries محدودة وAudit تقني. لا يسمح للفرونت بتشغيله إلا Endpoint صيانة محمي خارج النسخة الأولى.

# 26. مصفوفة اكتمال الـAPI

كل Endpoint كتابة محدد له: Auth scope، permission، validation، idempotency، expectedVersion، transaction boundary، audit event، realtime event بعد Commit، error map، response projection. كل Endpoint قائمة له: filters allowlist، index مطابق، pagination، stable sort، maxTimeMS، permissions projection. كل Endpoint طباعة Read-only. كل External provider خلف Adapter وtimeout/circuit breaker. بهذه القواعد لا يحتاج الفرونت طلبات متكررة لبناء الشاشة، ولا يستطيع Client تجاوز مصدر الحقيقة في الخادم.
