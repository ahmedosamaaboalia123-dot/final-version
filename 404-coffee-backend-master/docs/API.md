# 404 Coffee Backend — API Reference (v3.0)

> آخر تحديث: 28 أغسطس 2026 — **v3.0**: PostgreSQL + Frontend Contract Alignment

## معلومات أساسية

- Base URL: `http://localhost:5000`
- كل الـ endpoints (عدا `POST /api/auth/login` و `GET /api/health`) تتطلب:
  ```
  Authorization: Bearer <JWT>
  ```
- **نظام الصلاحيات (RBAC)** — كل مستخدم له `role` من 4 أدوار:

  | الدور | الصلاحيات |
  |---|---|
  | `OWNER` | كل حاجة + النسخ الاحتياطي + إدارة كل المستخدمين |
  | `MANAGER` | كل حاجة ما عدا: حذف موظف، تعديل الإعدادات، النسخ الاحتياطي |
  | `CASHIER` | المبيعات، العملاء، الطلبات، الوردية/الدرج، عرض المخزون/المنتجات/الموردين/المندوبين |
  | `DELEGATE` | الطلبات (عرض/تعديل)، المبيعات (عرض)، التنبيهات |

- **Pagination**: كل قوائم الـ list بتقبل `page` (افتراضي 1) و `pageSize` (افتراضي 20، أقصى 100) وترجع:
  ```json
  { "success": true, "data": [...], "pagination": { "page": 1, "pageSize": 20, "total": 5, "totalPages": 1 } }
  ```
- **التوثيق التفاعلي (Swagger UI)**: `GET /api/docs` (JSON خام: `/api/docs.json`).
- **Rate limiting**: عام 600/15 دقيقة لكل IP، login 60/15 دقيقة، chat 30/15 دقيقة.
- الاستجابة الخطأ القياسية: `{ "success": false, message: "..." }` — في الـ production تفاصيل الأخطاء 500 مخفية.
- قاعدة البيانات: **PostgreSQL** (`coffee_404@localhost:5432`)

---

## Auth

### POST `/api/auth/login`
تسجيل دخول (عام — بدون توكن).

Body:
```json
{ "name": "Admin", "password": "root123" }
```

Response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "auth": {
      "access_token": "<JWT>",
      "refresh_token": "<JWT>",
      "expires_in": 3600,
      "token_type": "Bearer"
    },
    "employee": {
      "id": 3,
      "employee_code": "EMP-0003",
      "name": "Admin",
      "position": "ADMIN",
      "email": null,
      "phone": null,
      "department": null,
      "status": "active",
      "last_login": "2026-08-28T08:58:28.981Z",
      "shift": {
        "id": 1,
        "name": "الوردية الصباحية",
        "start_time": "08:00",
        "end_time": "16:00",
        "break_start": "12:00",
        "break_end": "12:30"
      }
    },
    "role": { "id": 2, "name": "Manager", "display_name": "المدير" },
    "permissions": [ { "page_name": "...", "page_key": "...", "icon": "...", "path": "...", "actions": ["view"] } ],
    "notifications": [],
    "preferences": { "language": "ar", "direction": "rtl", "theme": "light", "timezone": "Africa/Cairo" },
    "session": { "login_time": "...", "device": "Chrome", "ip_address": "127.0.0.1" }
  }
}
```

---

## Users — `/api/users`

| Method | Endpoint | Action | ملاحظات |
|---|---|---|---|
| GET | `/api/users` | `view_users` | قائمة + pagination |
| POST | `/api/users` | `create_user` | body: `{ name, password, position, role }` — OWNER فقط يعمل OWNER |
| PUT | `/api/users/:id` | `edit_user` | ممنوع تغيير دورك لنفسك، وممنوع إنقاص آخر OWNER |
| PATCH | `/api/users/:id/status` | `change_user_status` | `{ status: "ACTIVE" | "SUSPENDED" }` |
| GET | `/api/users/:id/permissions` | `view_users` | صلاحيات الدور الفعلية من الـ RBAC config |
| DELETE | `/api/users/:id` | `delete_user` | ممنوع حذف نفسك أو آخر OWNER |

---

## Products — `/api/products`

| Method | Endpoint | ملاحظات |
|---|---|---|
| GET | `/api/products` |فلترة: `category`, `search`, `minPrice`, `maxPrice`, `menu=true`, pagination |
| GET | `/api/products/:id` | يشمل `types`, `sizes`, `addons`, **`variants`** |
| POST | `/api/products` | body: `{ name, description?, image?, category?, isActive? }` |
| PUT | `/api/products/:id` | |
| DELETE | `/api/products/:id` | |
| GET/POST | `/:productId/sizes` | |
| POST | `/:productId/sizes/:sizeId/ingredients` | |
| GET/POST | `/:productId/types` | |
| PUT/DELETE | `/:productId/types/:typeId` | |
| POST/DELETE | `/:productId/types/:typeId/ingredients/:rawMaterialId` | |
| GET/POST | `/:productId/addons` | |
| PUT/DELETE | `/:productId/addons/:addonId` | |

**Product Response ( مع `variants`):**
```json
{
  "id": 1, "name": "Latte", "category": "Coffee", "isActive": true,
  "types": [ { "id": 1, "name": "Hot" } ],
  "sizes": [ { "id": 1, "typeName": "Hot", "name": "Large", "finalPrice": 70 } ],
  "addons": [ { "id": 1, "name": "Extra Shot", "price": 10 } ],
  "variants": [
    { "type": "Hot", "sizes": [ { "name": "Large", "price": 70 } ] }
  ]
}
```

> `variants` = تحويل تلقائي من `types` + `sizes` — الصيغة المطلوبة لـ frontend orders page.

---

## Customers — `/api/customers`

| Method | Endpoint | ملاحظات |
|---|---|---|
| GET | `/api/customers` | paginated — `?search=` |
| GET | `/api/customers/:id` | |
| GET | `/api/customers/:id/orders` | **NEW** — طلبات العميل |
| POST | `/api/customers` | `{ name, phone, address?, orderType?, social?, feedback? }` |
| PUT | `/api/customers/:id` | |
| DELETE | `/api/customers/:id` | |

**Customer fields:**
```json
{
  "id": 1, "name": "Ahmed", "phone": "01012345678",
  "address": "15 Nile St",
  "orderType": "online",
  "social": { "facebook": "...", "whatsapp": "...", "tiktok": "...", "instagram": "..." },
  "feedback": "Great place",
  "loyaltyPoints": 0, "loyaltyLevel": "REGULAR"
}
```

---

## Suppliers / Delegates

| Module | Endpoint | ملاحظات |
|---|---|---|
| `/api/suppliers` | GET/POST/PUT/DELETE | |
| `/api/delegates` | GET/POST/PUT/DELETE + `PATCH /:id/status` | `status`: `AVAILABLE/UNAVAILABLE` |

---

## Raw Materials (Inventory) — `/api/raw-materials`

| Method | Endpoint | Action |
|---|---|---|
| GET | `/api/raw-materials` | `view_inventory` — paginated |
| POST | `/api/raw-materials` | `create_material` — body يشمل `{ name, unit, quantity, pricePerUnit, supplier, minStockAlert, expiryDate? }` |
| GET | `/api/raw-materials/:id/batches` | |
| POST | `/api/raw-materials/:id/batches` | `add_batch` — `{ quantity, pricePerUnit, expiryDate? }` |
| PUT | `/api/raw-materials/:id` | |
| DELETE | `/api/raw-materials/:id` | |

---

## Orders — `/api/orders`

| Method | Endpoint | ملاحظات |
|---|---|---|
| GET | `/api/orders` | paginated — فلترة: `status`, `orderType`, `paymentMethod`, `customerId`, `delegateId` |
| GET | `/api/orders/:id` | |
| GET | `/api/orders/:id/tracking` | **NEW** — تتبع حالة الطلب (ready/pending items) |
| POST | `/api/orders` | **NEW** — `{ orderType: "tables"/"online", table?, customerName?, customerPhone?, items: [...] }` |
| PUT | `/api/orders/:id` | تحديث الحالة: `PENDING/PREPARING/READY/COMPLETED/CANCELLED` |
| PATCH | `/api/orders/:id/items/:itemId/status` | **NEW** — تحديث حالة عنصر واحد |
| DELETE | `/api/orders/:id` | |

**Order Types:** `tables` (طربيزات) | `online` (أونلاين)

**Order Number Format:**
- Online: `A-0001`, `A-0002`, ...
- Tables: `T{table}-{seq}` — e.g., `T3-1`, `T5-2`

**Order Creation:**
```json
{
  "orderType": "online",
  "customerName": "Ahmed",
  "customerPhone": "01012345678",
  "items": [ { "productId": 1, "productSizeId": 1, "quantity": 2 } ]
}
```

**Order Tracking:**
```json
{
  "orderId": 1, "orderNumber": "A-0001", "status": "PENDING",
  "totalItems": 3, "readyCount": 1, "pendingCount": 2,
  "readyItems": [...], "pendingItems": [...]
}
```

---

## Returns — `/api/returns`

| Method | Endpoint | ملاحظات |
|---|---|---|
| GET | `/api/returns` | paginated |
| POST | `/api/returns` | تنشأ `DRAFT` — body: `{ supplierId, returnNo, items: [...] }` |
| PATCH | `/api/returns/:id/approve` | DRAFT → APPROVED |
| PATCH | `/api/returns/:id/cancel` | DRAFT only |
| PUT | `/api/returns/:id` | DRAFT only |
| DELETE | `/api/returns/:id` | DRAFT only |

---

## Purchases — `/api/purchases`

| Method | Endpoint | ملاحظات |
|---|---|---|
| GET | `/api/purchases` | paginated |
| POST | `/api/purchases` | تنشأ `DRAFT` — body: `{ invoiceNo, supplierId, invoiceDate, items: [...] }` |
| PUT | `/api/purchases/:id` | |
| PATCH | `/api/purchases/:id/approve` | DRAFT → APPROVED + يضيف دفعات للمخزون |
| PATCH | `/api/purchases/:id/cancel` | DRAFT only |
| DELETE | `/api/purchases/:id` | DRAFT أو CANCELLED فقط |

---

## Sales — `/api/sales`

| Method | Endpoint | Action |
|---|---|---|
| GET | `/api/sales` | `view_sales_history` — فلترة `search` (اسم/هاتف)، `status`، `paymentMethod` + pagination |
| GET | `/api/sales/:id` | |
| POST | `/api/sales` | `{ customerId?, discount?, paymentMethod?, items: [{ productId, productSizeId, quantity }] }` |
| PUT | `/api/sales/:id` | |
| DELETE | `/api/sales/:id` | soft-cancel |

---

## Cash Drawer / Shifts — `/api/cash-drawer-shifts`

| Method | Endpoint |
|---|---|
| GET | `/api/cash-drawer-shifts` (+ pagination) |
| GET | `/api/cash-drawer-shifts/current` |
| GET | `/api/cash-drawer-shifts/:id` |
| POST | `/api/cash-drawer-shifts` — `{ openingBalance }` |
| POST | `/api/cash-drawer-shifts/:id/close` — `{ closingBalance, actualBalance, notes? }` |
| POST | `/api/cash-drawer-shifts/:id/cash-in` — `{ amount, type }` — `SALES, COLLECTION` |
| POST | `/api/cash-drawer-shifts/:id/cash-out` — `{ amount, type }` — `EXPENSE, SALARY, MAINTENANCE, PURCHASE, INCENTIVE` |

---

## Financial Reports — `/api/financial-reports`

| Method | Endpoint | Action |
|---|---|---|
| GET | `/sales` | `view_sales_report` — `from?` `to?` |
| GET | `/profit` | `view_profit_report` — `from?` `to?` |
| GET | `/treasury` | `view_treasury_report` |

---

## لوحة أخرى

| Module | Endpoint | Action | ملاحظات |
|---|---|---|---|
| Dashboard | `GET /api/dashboard` | `dashboard` | ملخص مبيعات/طلبات/وردية/تنبيهات |
| Warnings | `GET /api/warnings` | `view_warnings` | مخزون منخفض + قرب انتهاء الصلاحية |
| Audit Logs | `GET /api/audit-logs` (+ `/:id`) | `view_audit_log` | paginated — فلترة `page/action/userId/from/to` |
| Settings | `GET /api/settings` | `view_settings` | |
| Settings | `PUT /api/settings/:key` | `update_settings` | `{ value }` — OWNER فقط |
| Chat | `POST /api/chat` | — | DeepSeek API — rate limited |
| Health | `GET /api/health` | — | عام |

---

## إعدادات البيئة (`.env`)

```
PORT=5000
DATABASE_URL="postgresql://postgres:root2001@localhost:5432/coffee_404"
JWT_SECRET="your-secret"
JWT_EXPIRES_IN="7d"
NODE_ENV="development"
DEEPSEEK_API_KEY="sk-..."
DEEPSEEK_MODEL="deepseek-chat"
```
