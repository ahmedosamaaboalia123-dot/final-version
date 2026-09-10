# دليل اختبار كل الـ endpoints بـ curl (بالترتيب المنطقي)

> بيستهدف `http://localhost:5000` — لازم الـ server شغال.
> قاعدة البيانات: PostgreSQL (`coffee_404@localhost:5432`)

## 0) التحضير

```bash
BASE=http://localhost:5000

# تسجيل الدخول
curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","password":"root123"}'

# حفظ الـ token (التوكن في data.auth.access_token)
TOKEN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"name":"Admin","password":"root123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['auth']['access_token'])")
AUTH="Authorization: Bearer $TOKEN"
```

## 1) Health + Docs

```bash
curl -s $BASE/api/health
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/docs/
curl -s $BASE/api/docs.json | python3 -c "import sys,json;print(list(json.load(sys.stdin)['paths'].keys()))"
```

## 2) المستخدمون + RBAC

```bash
# قائمة المستخدمين
curl -s -H "$AUTH" $BASE/api/users

# إنشاء مستخدم جديد
curl -s -X POST $BASE/api/users -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"name":"Cashier1","password":"123456","position":"Cashier","role":"CASHIER"}'

# صلاحيات مستخدم
curl -s -H "$AUTH" $BASE/api/users/1/permissions
```

## 3) المنتجات

```bash
# قائمة المنتجات (مع variants)
curl -s -H "$AUTH" "$BASE/api/products"

# تفاصيل منتج (مع variants)
curl -s -H "$AUTH" $BASE/api/products/1

# إنشاء منتج
curl -s -X POST $BASE/api/products -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"name":"Espresso","category":"Coffee","isActive":true}'

# تحديث منتج
curl -s -X PUT $BASE/api/products/1 -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"name":"Espresso Updated"}'

# حذف منتج
curl -s -X DELETE -H "$AUTH" $BASE/api/products/6
```

## 4) العملاء

```bash
# قائمة العملاء
curl -s -H "$AUTH" $BASE/api/customers

# إنشاء عميل (مع الحقول الجديدة)
curl -s -X POST $BASE/api/customers -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"name":"Ahmed","phone":"01012345678","address":"123 Test St","orderType":"online","social":{"facebook":"https://fb.com/test","whatsapp":"https://wa.me/999"},"feedback":"Great customer"}'

# طلبات عميل
curl -s -H "$AUTH" $BASE/api/customers/1/orders
```

## 5) الموردين + المندوبين

```bash
# موردين
curl -s -H "$AUTH" $BASE/api/suppliers
curl -s -X POST $BASE/api/suppliers -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"name":"Supplier1","contactPerson":"Ali","phone":"01099999999","city":"Cairo","supplierType":"raw","supplierCategory":"beans"}'

# مندوبين
curl -s -H "$AUTH" $BASE/api/delegates
curl -s -X POST $BASE/api/delegates -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"name":"Delegate1","whatsapp":"01088888888","phone":"01088888888"}'
```

## 6) الطلبات

```bash
# قائمة الطلبات
curl -s -H "$AUTH" $BASE/api/orders

# إنشاء طلب أونلاين
curl -s -X POST $BASE/api/orders -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"orderType":"online","customerName":"Ahmed","customerPhone":"01012345678","items":[{"productId":1,"productSizeId":1,"quantity":2}]}'

# إنشاء طلب طربيزات
curl -s -X POST $BASE/api/orders -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"orderType":"tables","table":"3","items":[{"productId":1,"productSizeId":1,"quantity":1}]}'

# تتبع حالة الطلب
curl -s -H "$AUTH" $BASE/api/orders/14/tracking

# تحديث حالة عنصر الطلب
curl -s -X PATCH $BASE/api/orders/14/items/1/status -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"status":"PREPARING"}'
```

## 7) المشتريات + المرتجعات

```bash
# مشتريات
curl -s -H "$AUTH" $BASE/api/purchases
curl -s -X POST $BASE/api/purchases -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"invoiceNo":"INV-001","supplierId":1,"invoiceDate":"2026-08-28","items":[{"rawMaterialId":1,"quantity":10,"unit":"kg","pricePerUnit":50}]}'

# مرتجعات
curl -s -H "$AUTH" $BASE/api/returns
curl -s -X POST $BASE/api/returns -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"returnNo":"RET-001","supplierId":1,"items":[{"rawMaterialId":1,"quantity":2,"unit":"kg","pricePerUnit":50}]}'
```

## 8) الدرج والورديات

```bash
# وردية مفتوحة
curl -s -H "$AUTH" $BASE/api/cash-drawer-shifts/current

# فتح وردية
curl -s -X POST $BASE/api/cash-drawer-shifts -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"openingBalance":1000}'

# إضافة سحب/إيداع
curl -s -X POST $BASE/api/cash-drawer-shifts/1/cash-in -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"amount":500,"type":"SALES"}'
```

## 9) التقارير +Dashboard

```bash
# ملخص
curl -s -H "$AUTH" $BASE/api/dashboard

# تقارير مبيعات
curl -s -H "$AUTH" $BASE/api/financial-reports/sales

# تقارير أرباح
curl -s -H "$AUTH" $BASE/api/financial-reports/profit
```

## 10) التنبيهات + الإعدادات

```bash
# تنبيهات
curl -s -H "$AUTH" $BASE/api/warnings

# إعدادات
curl -s -H "$AUTH" $BASE/api/settings
curl -s -X PUT $BASE/api/settings/test_key -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"value":"test_value"}'
```

## 11) سجل المراجعة

```bash
curl -s -H "$AUTH" $BASE/api/audit-logs
```
