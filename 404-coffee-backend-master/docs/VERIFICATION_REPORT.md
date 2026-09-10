# 404 Coffee Backend — Verification Report (v3.0)

> آخر تحديث: 28 أغسطس 2026

## ملخص الحالة

| البند | الحالة |
|---|---|
| PostgreSQL | ✅ مكتمل |
| Login response (frontend contract) | ✅ مكتمل |
| OrderType (tables/online) | ✅ مكتمل |
| Order number (A-XXXX / T{n}-{n}) | ✅ مكتمل |
| Order item tracking | ✅ مكتمل |
| Order tracking endpoint | ✅ مكتمل |
| Product variants mapping | ✅ مكتمل |
| Customer fields (orderType, social, feedback) | ✅ مكتمل |
| Customer order history | ✅ مكتمل |
| ProductSize isActive | ✅ مكتمل |
| Review module removed | ✅ مكتمل |
| TAKEAWAY removed | ✅ مكتمل |
| tableNumber → table | ✅ مكتمل |
| Documentation updated | ✅ مكتمل |

---

## تفاصيل التغييرات

### PostgreSQL Conversion
- `prisma/schema.prisma`: `provider = "postgresql"`
- `src/lib/prisma.js`: `PrismaPg` adapter + `Pool`
- `.env`: `DATABASE_URL="postgresql://postgres:root2001@localhost:5432/coffee_404"`

### Login Response (J2)
- `auth.service.js` returns `{ auth, employee, role, permissions, notifications, preferences, session }`
- Matches frontend `authStore.setAuth()` contract
- `permissions` built from `roles.config.js` with Arabic page names, icons, paths

### Order Types (J1, J6)
- `OrderType` enum: `tables`, `online` (was `DINE_IN/TAKEAWAY/ONLINE`)
- `TAKEAWAY` removed (frontend has no takeaway concept)
- DB enum type swapped via raw SQL migration

### Order Number Format (J4)
- Online: `A-0001`, `A-0002`, ... (4-digit zero-padded)
- Tables: `T{table}-{seq}` — e.g., `T3-1`, `T5-2`

### Order Item Status
- `OrderItemStatus` enum: `PENDING`, `PREPARING`, `READY`, `CANCELLED`
- `PATCH /api/orders/:id/items/:itemId/status` — updates item + auto-updates order status

### Product Variants
- `toVariants()` transforms flat `types[] + sizes[]` into `variants[{ type, sizes[{ name, price }] }]`
- Applied to `getProducts` and `getProductById` responses
- Admin page uses flat arrays (types, sizes, addons) — still available

### Customer Model
- Added: `orderType` (String?), `social` (Json?), `feedback` (String?)
- `GET /api/customers/:id/orders` — customer order history endpoint

### ProductSize isActive
- Added `isActive` Boolean field (default true) for per-item availability

### Review Module (J5)
- Deleted: model, routes, service, controller, DB table
- Frontend has no review/rating functionality

### Removed (J3)
- `tableNumber` → `table` (schema, DB column, API field)
- Old value `DINE_IN` rejected with 400

---

## API Endpoints Summary (20 modules)

| Module | Endpoints |
|---|---|
| Auth | POST /login |
| Users | GET, POST, PUT, PATCH /:id/status, DELETE, GET /:id/permissions |
| Products | GET, POST, PUT, DELETE, sizes CRUD, types CRUD, addons CRUD |
| Customers | GET, POST, PUT, DELETE, GET /:id/orders |
| Suppliers | GET, POST, PUT, DELETE |
| Delegates | GET, POST, PUT, DELETE, PATCH /:id/status |
| Raw Materials | GET, POST, PUT, DELETE, batches CRUD |
| Orders | GET, POST, PUT, DELETE, GET /:id/tracking, PATCH /:id/items/:itemId/status |
| Sales | GET, POST, PUT, DELETE |
| Purchases | GET, POST, PUT, DELETE, PATCH /approve, PATCH /cancel |
| Returns | GET, POST, PUT, DELETE, PATCH /approve, PATCH /cancel |
| Cash Drawer Shifts | GET, POST, GET /current, POST /:id/close, POST /:id/cash-in, POST /:id/cash-out |
| Financial Reports | GET /sales, GET /profit, GET /treasury |
| Dashboard | GET |
| Warnings | GET |
| Audit Logs | GET |
| Settings | GET, PUT /:key, POST /bulk |
| Chat | POST |
| Health | GET |
