# FINAL PROJECT DELIVERY AUDIT

**Project:** 404 Coffee Backend  
**Date:** 2026-09-04  
**Auditor:** Senior Backend Engineer + QA/API Auditor  
**Scope:** Complete project audit before delivery  

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Readiness** | 55% |
| **Total Routes in Code** | 158 (154 module + 4 global) |
| **Total APIs in Excel Catalog** | 152 |
| **APIs Matching Catalog** | ~131 (Implemented) |
| **Missing APIs (in code but not in catalog)** | ~27 extra |
| **Missing APIs (in catalog but not in code)** | ~15 (mostly optional) |
| **Broken/Buggy APIs** | 7 |
| **Contract Mismatches** | 3 |
| **Security Issues** | 6 Critical, 6 High, 8 Medium |
| **Business Logic Bugs** | 7 Critical, 6 High |
| **Database Schema Issues** | 4 Critical, 3 High |
| **WebSocket Issues** | 2 High (dead events, no client events) |
| **Dead Code** | 4 files + 7 duplicate patterns |

**Critical blockers exist.** The project is NOT ready for delivery in its current state.

---

## 2. Overall Status

### 🔴 NO — BLOCKERS EXIST

The backend has significant critical issues in business logic (inventory never deducted for table orders, double deduction for delivery orders, silent inventory failures), security (weak JWT secret, 7-day token with no revocation, no refresh rate limiting), and missing features (14 endpoints from the catalog are completely absent). These must be fixed before delivery.

---

## 3. API Status Table

### 3.1 APIs That EXIST and WORK

| # | Module | Method | Endpoint | Auth | Status |
|---|--------|--------|----------|------|--------|
| 1 | Auth | POST | /api/auth/login | Public+RateLimit | ✅ OK |
| 2 | Auth | GET | /api/auth/me | Auth | ✅ OK |
| 3 | Auth | POST | /api/auth/refresh | Public | ⚠️ Works but no rate limit |
| 4 | Auth | POST | /api/auth/logout | Auth | ✅ OK |
| 5 | Dashboard | GET | /api/dashboard | Auth+Perm | ✅ OK |
| 6 | Users | GET | /api/users | Auth+Perm | ✅ OK |
| 7 | Users | GET | /api/users/:id | Auth+Perm | ✅ OK |
| 8 | Users | POST | /api/users | Auth+Perm | ✅ OK |
| 9 | Users | PUT | /api/users/:id | Auth+Perm | ✅ OK |
| 10 | Users | PATCH | /api/users/:id/status | Auth+Perm | ✅ OK |
| 11 | Users | DELETE | /api/users/:id | Auth+Perm | ✅ OK |
| 12 | Users | GET | /api/users/:id/permissions | Auth+Perm | ✅ OK |
| 13 | Users | PUT | /api/users/:id/page-access | Auth+Perm | ✅ OK |
| 14 | Users | GET | /api/users/:id/devices | Auth+Perm | ✅ OK |
| 15 | Users | PATCH | /api/users/:id/devices/:deviceId | Auth+Perm | ✅ OK |
| 16 | Users | DELETE | /api/users/:id/devices/:deviceId | Auth+Perm | ✅ OK |
| 17 | Users | GET | /api/users/:id/attendance | Auth+Perm | ✅ OK |
| 18 | Products | GET | /api/products | Auth+Perm | ✅ OK |
| 19 | Products | GET | /api/products/:id | Auth+Perm | ✅ OK |
| 20 | Products | POST | /api/products | Auth+Perm | ✅ OK |
| 21 | Products | PUT | /api/products/:id | Auth+Perm | ✅ OK |
| 22 | Products | DELETE | /api/products/:id | Auth+Perm | ✅ OK |
| 23 | Products | GET | /api/products/:productId/sizes | Auth+Perm | ✅ OK |
| 24 | Products | POST | /api/products/:productId/sizes | Auth+Perm | ✅ OK |
| 25 | Products | POST | /api/products/:productId/sizes/:sizeId/ingredients | Auth+Perm | ✅ OK |
| 26 | Products | GET | /api/products/:productId/types | Auth+Perm | ✅ OK |
| 27 | Products | POST | /api/products/:productId/types | Auth+Perm | ✅ OK |
| 28 | Products | PUT | /api/products/:productId/types/:typeId | Auth+Perm | ✅ OK |
| 29 | Products | DELETE | /api/products/:productId/types/:typeId | Auth+Perm | ✅ OK |
| 30 | Products | POST | .../types/:typeId/ingredients/:rawMaterialId | Auth+Perm | ✅ OK |
| 31 | Products | DELETE | .../types/:typeId/ingredients/:rawMaterialId | Auth+Perm | ✅ OK |
| 32 | Products | GET | /api/products/:productId/addons | Auth+Perm | ✅ OK |
| 33 | Products | POST | /api/products/:productId/addons | Auth+Perm | ✅ OK |
| 34 | Products | PUT | /api/products/:productId/addons/:addonId | Auth+Perm | ✅ OK |
| 35 | Products | DELETE | /api/products/:productId/addons/:addonId | Auth+Perm | ✅ OK |
| 36 | Customers | GET | /api/customers | Auth+Perm | ✅ OK |
| 37 | Customers | GET | /api/customers/lookup | Auth+Perm | ✅ OK |
| 38 | Customers | GET | /api/customers/:id | Auth+Perm | ✅ OK |
| 39 | Customers | POST | /api/customers | Auth+Perm | ✅ OK |
| 40 | Customers | PUT | /api/customers/:id | Auth+Perm | ✅ OK |
| 41 | Customers | DELETE | /api/customers/:id | Auth+Perm | ✅ OK |
| 42 | Customers | GET | /api/customers/:id/orders | Auth+Perm | ✅ OK |
| 43 | Customers | POST | /api/customers/:id/merge | Auth+Perm | ✅ OK |
| 44 | Suppliers | GET | /api/suppliers | Auth+Perm | ✅ OK |
| 45 | Suppliers | GET | /api/suppliers/options | Auth+Perm | ✅ OK |
| 46 | Suppliers | GET | /api/suppliers/:id | Auth+Perm | ✅ OK |
| 47 | Suppliers | POST | /api/suppliers | Auth+Perm | ✅ OK |
| 48 | Suppliers | PUT | /api/suppliers/:id | Auth+Perm | ✅ OK |
| 49 | Suppliers | DELETE | /api/suppliers/:id | Auth+Perm | ✅ OK |
| 50 | Suppliers | GET | /api/suppliers/:id/transactions | Auth+Perm | ✅ OK |
| 51 | Delegates | GET | /api/delegates | Auth+Perm | ✅ OK |
| 52 | Delegates | GET | /api/delegates/options | Auth+Perm | ✅ OK |
| 53 | Delegates | GET | /api/delegates/:id | Auth+Perm | ✅ OK |
| 54 | Delegates | POST | /api/delegates | Auth+Perm | ✅ OK |
| 55 | Delegates | PUT | /api/delegates/:id | Auth+Perm | ✅ OK |
| 56 | Delegates | PATCH | /api/delegates/:id/status | Auth+Perm | ✅ OK |
| 57 | Delegates | DELETE | /api/delegates/:id | Auth+Perm | ✅ OK |
| 58 | Delegates | GET | /api/delegates/:id/orders | Auth+Perm | ✅ OK |
| 59 | Delegates | GET | /api/delegates/:id/collections | Auth+Perm | ✅ OK |
| 60 | Orders | POST | /api/orders | Auth+Perm+Valid | ✅ OK |
| 61 | Orders | GET | /api/orders | Auth+Perm | ✅ OK |
| 62 | Orders | GET | /api/orders/prep | Auth+Perm | ✅ OK |
| 63 | Orders | GET | /api/orders/:id | Auth+Perm | ✅ OK |
| 64 | Orders | PUT | /api/orders/:id | Auth+Perm+Valid | ✅ OK |
| 65 | Orders | DELETE | /api/orders/:id | Auth+Perm | ✅ OK |
| 66 | Orders | GET | /api/orders/:id/tracking | Auth+Perm | ✅ OK |
| 67 | Orders | POST | /api/orders/:id/cancel | Auth+Perm | ⚠️ No reason stored |
| 68 | Orders | GET | /api/orders/:id/invoice | Auth+Perm | ✅ OK |
| 69 | Orders | GET | /api/orders/:id/events | Auth+Perm | ✅ OK |
| 70 | Orders | POST | /api/orders/:id/preparation/start | Auth+Perm | ⚠️ No inventory deduction |
| 71 | Orders | POST | /api/orders/:id/items/:itemId/ready | Auth+Perm | ⚠️ No transition validation |
| 72 | Orders | POST | /api/orders/:id/items/:itemId/reopen | Auth+Perm | ⚠️ No transition validation |
| 73 | Orders | PATCH | /api/orders/:id/status | Auth+Perm | ✅ OK |
| 74 | Orders | PATCH | /api/orders/:id/items/:itemId/status | Auth+Perm | ✅ OK |
| 75 | Orders | POST | /api/orders/:id/delivery/complete | Auth+Perm | 🔴 Double inventory deduction |
| 76 | Orders | PATCH | /api/orders/:id/hand-over-delegate | Auth+Perm | ✅ OK |
| 77 | Orders | GET | /api/orders/tables/summary | Auth+Perm | ✅ OK |
| 78 | Orders | GET | /api/orders/tables/:tableNumber/details | Auth+Perm | ✅ OK |
| 79 | Orders | PATCH | /api/orders/tables/:tableNumber/close | Auth+Perm | 🔴 No inventory deduction |
| 80 | Orders | POST | /api/orders/tables/:tableNumber/orders | Auth+Perm | ✅ OK |
| 81 | Orders | POST | /api/orders/tables/:tableNumber/items | Auth+Perm | ⚠️ Race condition |
| 82 | Orders | POST | /api/orders/tables/:tableNumber/checkout | Auth+Perm | 🔴 No inventory deduction |
| 83 | Orders | GET | /api/orders/tables/:tableNumber/history | Auth+Perm | ✅ OK |
| 84 | Orders | POST | /api/orders/public | Public | ✅ OK |
| 85 | Orders | GET | /api/orders/public/:code/tracking | Public | ✅ OK |
| 86 | Sales | GET | /api/sales | Auth+Perm | ✅ OK |
| 87 | Sales | GET | /api/sales/:id | Auth+Perm | ✅ OK |
| 88 | Sales | POST | /api/sales | Auth+Perm+Valid | ✅ OK |
| 89 | Sales | PUT | /api/sales/:id | Auth+Perm+Valid | ✅ OK |
| 90 | Sales | DELETE | /api/sales/:id | Auth+Perm | ✅ OK |
| 91 | Sales | GET | /api/sales/summary | Auth+Perm | ✅ OK |
| 92 | Cash Drawer | GET | /api/cash-drawer-shifts | Auth+Perm | ✅ OK |
| 93 | Cash Drawer | GET | /api/cash-drawer-shifts/current | Auth+Perm | ✅ OK |
| 94 | Cash Drawer | GET | /api/cash-drawer-shifts/:id | Auth+Perm | ✅ OK |
| 95 | Cash Drawer | POST | /api/cash-drawer-shifts | Auth+Perm+Valid | ✅ OK |
| 96 | Cash Drawer | POST | /api/cash-drawer-shifts/:id/cash-in | Auth+Perm+Valid | ✅ OK |
| 97 | Cash Drawer | POST | /api/cash-drawer-shifts/:id/cash-out | Auth+Perm+Valid | ✅ OK |
| 98 | Cash Drawer | POST | /api/cash-drawer-shifts/:id/close | Auth+Perm+Valid | ✅ OK |
| 99 | Cash Drawer | GET | /api/cash-drawer-shifts/:id/transactions | Auth+Perm | ✅ OK |
| 100 | Cash Drawer | GET | /api/cash-drawer-shifts/:id/reconciliation | Auth+Perm | ✅ OK |
| 101 | Returns | GET | /api/returns | Auth+Perm | ✅ OK |
| 102 | Returns | GET | /api/returns/:id | Auth+Perm | ✅ OK |
| 103 | Returns | POST | /api/returns | Auth+Perm+Valid | ✅ OK |
| 104 | Returns | PATCH | /api/returns/:id/approve | Auth+Perm | ✅ OK |
| 105 | Returns | PATCH | /api/returns/:id/cancel | Auth+Perm | ✅ OK |
| 106 | Returns | PUT | /api/returns/:id | Auth+Perm+Valid | ✅ OK |
| 107 | Returns | DELETE | /api/returns/:id | Auth+Perm | ✅ OK |
| 108 | Purchases | GET | /api/purchases | Auth+Perm | ✅ OK |
| 109 | Purchases | GET | /api/purchases/:id | Auth+Perm | ✅ OK |
| 110 | Purchases | POST | /api/purchases | Auth+Perm | ✅ OK |
| 111 | Purchases | PUT | /api/purchases/:id | Auth+Perm | ✅ OK |
| 112 | Purchases | PATCH | /api/purchases/:id/approve | Auth+Perm | ✅ OK |
| 113 | Purchases | PATCH | /api/purchases/:id/cancel | Auth+Perm | ✅ OK |
| 114 | Purchases | DELETE | /api/purchases/:id | Auth+Perm | ✅ OK |
| 115 | Raw Materials | GET | /api/raw-materials | Auth+Perm | ✅ OK |
| 116 | Raw Materials | POST | /api/raw-materials | Auth+Perm | ✅ OK |
| 117 | Raw Materials | GET | /api/raw-materials/:id/batches | Auth+Perm | ✅ OK |
| 118 | Raw Materials | POST | /api/raw-materials/:id/batches | Auth+Perm | ✅ OK |
| 119 | Raw Materials | PUT | /api/raw-materials/:id | Auth+Perm | ✅ OK |
| 120 | Raw Materials | DELETE | /api/raw-materials/:id | Auth+Perm | ✅ OK |
| 121 | Warnings | GET | /api/warnings | Auth+Perm | ✅ OK |
| 122 | Audit Logs | GET | /api/audit-logs | Auth+Perm | ✅ OK |
| 123 | Audit Logs | GET | /api/audit-logs/:id | Auth+Perm | ✅ OK |
| 124 | Settings | GET | /api/settings | Auth+Perm | ✅ OK |
| 125 | Settings | POST | /api/settings/bulk | Auth+Perm | ✅ OK |
| 126 | Settings | PUT | /api/settings/:key | Auth+Perm | ✅ OK |
| 127 | Reviews | GET | /api/reviews | Auth+Perm | ✅ OK |
| 128 | Reviews | GET | /api/reviews/:id | Auth+Perm | ✅ OK |
| 129 | Reviews | DELETE | /api/reviews/:id | Auth+Perm | ✅ OK |
| 130 | Reviews | POST | /api/reviews | Public+RateLimit | ✅ OK |
| 131 | Chat | POST | /api/chat | Auth+RateLimit | ✅ OK |
| 132 | Attendance | POST | /api/attendance/check-in | Auth | ✅ OK |
| 133 | Attendance | POST | /api/attendance/check-out | Auth | ✅ OK |
| 134 | Devices | POST | /api/auth/devices/register | Auth | ✅ OK |
| 135 | Table Sessions | GET | /api/table-sessions/:tableNumber/active-order | Auth | ✅ OK |
| 136 | Table Sessions | POST | /api/table-sessions/:tableNumber/service-requests | Auth | ⚠️ Placeholder |
| 137 | Health | GET | /api/health | Public | ✅ OK |
| 138 | Health | GET | /api/health/ready | Public | ✅ OK |
| 139 | Health | GET | /api/health/live | Public | ✅ OK |
| 140 | Docs | GET | /api/docs | Public | ✅ OK |
| 141 | Docs | GET | /api/docs.json | Public | ✅ OK |

### 3.2 APIs That Are MISSING (in Excel catalog, NOT in code)

| # | Module | Method | Endpoint | Priority | Why Needed |
|---|--------|--------|----------|----------|------------|
| 1 | Products | POST | /api/products/upload-image | 🔴 P0 | Core feature — product images |
| 2 | Products | POST | /api/products/categories | 🔴 P0 | Category CRUD entirely absent |
| 3 | Products | PUT | /api/products/categories/:id | 🔴 P0 | Category CRUD entirely absent |
| 4 | Products | DELETE | /api/products/categories/:id | 🔴 P0 | Category CRUD entirely absent |
| 5 | Products | POST | /api/products/configuration | 🟠 P1 | Product configuration endpoint |
| 6 | Products | PUT | /api/products/:id/configuration | 🟠 P1 | Per-product configuration |
| 7 | Raw Materials | GET | /api/raw-materials/options | 🔴 P0 | Dropdown data for frontend |
| 8 | Raw Materials | GET | /api/raw-materials/return-options | 🟠 P1 | Return workflow data |
| 9 | Raw Materials | PUT | /api/raw-materials/:id/batches-priority | 🟠 P1 | Batch priority/FEFO logic |
| 10 | Raw Materials | POST | /api/raw-materials/:id/withdrawals | 🟠 P1 | Inventory consumption tracking |
| 11 | Raw Materials | GET | /api/raw-materials/withdrawals | 🟠 P1 | Withdrawal history |
| 12 | Raw Materials | PUT | /api/raw-materials/:id/batches/:batchId | 🟡 P2 | Individual batch update |
| 13 | Raw Materials | DELETE | /api/raw-materials/:id/batches/:batchId | 🟡 P2 | Individual batch deletion |
| 14 | Users | GET | /api/users/:id/events | 🟡 P2 | User activity log |
| 15 | Settings | GET | /api/settings/:key | 🟡 P2 | Single setting retrieval |

### 3.3 APIs That Are BROKEN (exist but don't work correctly)

| # | Module | Endpoint | Issue | Priority |
|---|--------|----------|-------|----------|
| 1 | Orders | POST /api/orders/:id/delivery/complete | Double inventory deduction — deducts at PREPARING and again at completeDelivery | 🔴 P0 |
| 2 | Orders | PATCH /api/orders/tables/:tableNumber/close | No inventory deduction — goes straight to COMPLETED | 🔴 P0 |
| 3 | Orders | POST /api/orders/tables/:tableNumber/checkout | No inventory deduction — goes straight to COMPLETED | 🔴 P0 |
| 4 | Orders | PUT /api/orders/:id | Status update bypasses transition validation — can set COMPLETED without Sale creation | 🔴 P0 |
| 5 | Orders | POST /api/orders/:id/preparation/start | No inventory deduction (unlike updateOrderStatus PENDING→PREPARING) | 🟠 P1 |
| 6 | Orders | POST /api/orders/:id/cancel | Cancellation reason silently discarded — not stored anywhere | 🟡 P2 |
| 7 | Orders | POST /api/orders/:id/items/:itemId/reopen | No status transition validation — can reopen CANCELLED items | 🟠 P1 |

---

## 4. Security Audit

### 🔴 Critical (Must Fix)

| # | Issue | WHERE | WHY | IMPACT | FIX |
|---|-------|-------|-----|--------|-----|
| 1 | Weak JWT secret hardcoded in .env | `.env:5` | `"404_coffee_super_secret_key_change_later"` is trivially brutable | Token forgery, full system compromise | Generate 64+ char random secret, use `JWT_SECRET=$(openssl rand -hex 32)` |
| 2 | Access token `expiresIn: "7d"` | `auth.service.js:404` | 7-day token for a POS system is extremely dangerous | Stolen token = 7 days of access | Change to `expiresIn: "1h"` or `"8h"` (business hours) |
| 3 | `expires_in: 3600` misleading response | `auth.service.js:422` | Client told token expires in 1 hour, actual is 7 days | Client doesn't refresh, token stays valid 7x longer | Match actual JWT expiry |
| 4 | Refresh endpoint has no rate limit | `auth.routes.js:22` | `POST /api/auth/refresh` is completely unprotected | Brute-force refresh tokens indefinitely | Add rate limiter (e.g., 10/15min) |
| 5 | No JWT token revocation/blacklist | `auth.service.js:504` | `logoutUser` deletes device records but doesn't revoke JWT | Stolen token valid until expiry (7 days) | Implement token blacklist or short expiry |
| 6 | Refresh token uses same secret as access | `auth.service.js:408` | Both token types signed with same key | Key leak compromises both token types | Use separate `JWT_REFRESH_SECRET` env var |

### 🟠 High

| # | Issue | WHERE | FIX |
|---|-------|-------|-----|
| 7 | No `algorithms` specified in JWT verify | `auth.middleware.js:37` | Add `{ algorithms: ["HS256"] }` to `jwt.verify()` |
| 8 | Public order creation has no rate limit | `order.routes.js:17` | Add rate limiter (e.g., 30/15min) |
| 9 | Error handler leaks 4xx error messages | `error.middleware.js:20` | Sanitize all errors in production, not just 5xx |
| 10 | Login rate limit too generous (60/15min) | `auth.routes.js:14` | Reduce to 5-10/15min |
| 11 | Session info hardcoded (Chrome, 127.0.0.1) | `auth.service.js:436-439` | Read from `req.headers['user-agent']` and `req.ip` |
| 12 | Refresh token accepts Authorization header | `auth.controller.js:39` | Only accept from request body, not header |

### 🟡 Medium

| # | Issue | WHERE | FIX |
|---|-------|-------|-----|
| 13 | No XSS sanitization on user inputs | Multiple controllers | Add `validator.escape()` or `sanitize-html` |
| 14 | Global rate limit too generous (600/15min) | `app.js:67` | Reduce to 200-300/15min |
| 15 | bcrypt rounds = 10 (OWASP recommends 12+) | `user.controller.js:105` | Increase to 12 |
| 16 | Helmet with default config (no CSP tuning) | `app.js:48` | Customize CSP headers |
| 17 | `NODE_ENV=test` disables all rate limiting | `auth.routes.js:17` | Add guard for production |
| 18 | Swagger docs exposed without auth | `app.js:120` | Add auth or restrict to dev |
| 19 | Health endpoint exposes version + uptime | `app.js:100` | Remove in production |
| 20 | Hardcoded DeepSeek API URL | `chat.service.js:49` | Make configurable via env |

### ✅ Positive Security Findings

- Prisma ORM prevents SQL injection (all queries parameterized)
- CORS restricted to known origins (configurable via env)
- Rate limiting on login, chat, review endpoints
- Helmet security headers enabled
- RBAC permission system is comprehensive
- JWT verification checks user status (ACTIVE)
- No file upload attack surface
- `.env.example` uses placeholder values

---

## 5. Business Logic Audit

### 🔴 Critical Business Logic Bugs

| # | Bug | WHERE | IMPACT |
|---|-----|-------|--------|
| 1 | **Table orders never deduct inventory** | `order.service.js:1050` (closeTableOrder), `:1508` (checkoutTable) | Closing a table or checking out goes straight to COMPLETED without PREPARING. `deductInventoryForOrder` is only called on PENDING→PREPARING transition. All table order inventory is phantom. |
| 2 | **Delivery orders double-deduct inventory** | `order.service.js:1667` (completeDelivery) | If order went through PREPARING→READY (inventory deducted), `completeDelivery` deducts again. |
| 3 | **`deductInventoryForOrder` silently fails** | `order.service.js:974` | If no single batch has enough stock, ingredient is silently skipped. No error, no warning. Order proceeds as if stock was deducted. |
| 4 | **No negative inventory prevention** | `order.service.js:977` | `quantity: { decrement: qty }` can go below 0. No DB-level constraint. |
| 5 | **`deleteOrder` has no status guard** | `order.service.js:645` | Can delete COMPLETED orders (orphaning Sale records) or PREPARING orders (not restoring inventory). |
| 6 | **`updateOrder` bypasses status transition validation** | `order.service.js:532` | `PUT /api/orders/:id` can set `status: "COMPLETED"` without going through `updateOrderStatus`. No Sale created, no drawer transaction, no inventory deduction. |
| 7 | **`startPreparation` doesn't deduct inventory** | `order.service.js:1409` | Unlike `updateOrderStatus` (which deducts on PENDING→PREPARING), `startPreparation` endpoint skips inventory entirely. |

### 🟠 High Business Logic Issues

| # | Issue | WHERE | FIX |
|---|-------|-------|-----|
| 8 | `checkoutTable` double-applies discounts | `order.service.js:1522,1533` | Per-order discounts baked into total, then checkout discount subtracted on top |
| 9 | `closeTableOrder` hardcodes `discount: 0` on Sale | `order.service.js:1069` | Per-order discounts lost in Sale record |
| 10 | Race condition in `addTableItems` (no transaction) | `order.service.js:1481` | Two concurrent adds overwrite each other |
| 11 | `cancelOrder` discards cancellation reason | `order.service.js:1326` | `reason` parameter accepted but never stored |
| 12 | No Sale ↔ Order foreign key linkage | `order.service.js:1227` | `Order.saleId` is never set — Sale and Order are disconnected |
| 13 | `completeDelivery` doesn't use `updateOrderStatus` | `order.service.js:1654` | Bypasses transition validation and version increment |
| 14 | `startPreparation` has no transaction | `order.service.js:1409` | Item update and order update are separate queries |
| 15 | `recordedByUserId` falls back to `customerId` | `order.service.js:1105,1265,1570` | Customers don't record drawer transactions |

### 🟡 Medium Business Logic Issues

| # | Issue | WHERE |
|---|-------|-------|
| 16 | `version` field incremented but never checked (no optimistic locking) | `order.service.js:908` |
| 17 | `restoreInventoryForOrder` restores to newest batch, not oldest (inconsistent with deduction) | `order.service.js:1279` |
| 18 | `markItemReady` has no status transition validation | `order.service.js:1423` |
| 19 | `reopenItem` has no status transition validation | `order.service.js:1443` |
| 20 | Order number generation has race condition (read-then-write) | `order.service.js:148` |

---

## 6. Database Schema Audit

### 🔴 Critical Schema Issues

| # | Issue | Model | Fix |
|---|-------|-------|-----|
| 1 | `ProductCategory` is orphaned — no FK to `Product` | `Product.category` is `String?`, not FK to `ProductCategory` | Add `categoryId Int?` FK to Product, or remove `ProductCategory` |
| 2 | `Review` is orphaned — no FK to `Customer` | Review stores `customerName`/`customerPhone` as free text | Add `customerId Int?` FK to Review |
| 3 | `RawMaterial.supplier` is plain string, not FK to `Supplier` | Supplier names drift across tables | Add `supplierId Int?` FK to RawMaterial |
| 4 | Implicit `onDelete: Restrict` on ~18 required FKs | Deleting a Product with OrderItems will FAIL | Explicitly set `onDelete` on all FKs |

### 🟠 High Schema Issues

| # | Issue | Model |
|---|-------|-------|
| 5 | `Review.rating` has no bounds check (allows -5, 0, 999) | Review |
| 6 | String-based status fields instead of enums (`Attendance.status`, `EmployeeDevice.status`, `OrderEvent.type`) | Multiple |
| 7 | Duplicate `addedAt` + `createdAt` fields on `RawMaterial` and `RawMaterialBatch` | RawMaterial, RawMaterialBatch |

### 🟡 Medium Schema Issues

| # | Issue |
|---|-------|
| 8 | Missing indexes on `Order.table`, `Supplier.supplierType`, `Attendance.status`, `Customer.loyaltyLevel` |
| 9 | Redundant `@@index` on fields that already have `@unique` (`Order.orderNumber`, `Order.trackingToken`) |
| 10 | `Supplier.phone` has no `@unique` constraint |
| 11 | `CashDrawerTransaction` has no `updatedAt` (inconsistent with other models) |

---

## 7. WebSocket Audit

### Current Implementation

| Aspect | Status |
|--------|--------|
| Connection | ✅ Works — JWT auth via handshake |
| Auth middleware | ✅ Checks token, user existence, ACTIVE status |
| Room management | ⚠️ All clients forced into both `orders` and `kitchen` rooms |
| Events emitted | 5 defined, 3 used, 2 dead |
| Client → Server events | ❌ None — push-only system |

### Events

| Event | Used? | Emitted From |
|-------|-------|-------------|
| `order:created` | ✅ Yes | `order.controller.js` (createOrder, createTableOrder) |
| `order:updated` | ✅ Yes | `order.controller.js` (13 call sites) |
| `order:item:updated` | ✅ Yes | `order.controller.js` (updateOrderItemStatus, markItemReady, reopenItem) |
| `dashboard:updated` | ❌ Dead code | Never called anywhere |
| `inventory:updated` | ❌ Dead code | Never called anywhere |

### Issues

| # | Issue | Priority |
|---|-------|----------|
| 1 | `dashboard:updated` and `inventory:updated` are never emitted — dead code | 🟡 P2 |
| 2 | All clients in both rooms — no role-based filtering | 🟡 P2 |
| 3 | No client-to-server event handlers (e.g., "join room X", "subscribe to order Y") | 🟡 P2 |
| 4 | No reconnection/recovery logic | 🟡 P2 |
| 5 | `closeTableOrder` emits per-order in a loop — potential event flooding | 🟡 P2 |
| 6 | Dashboard/inventory updates not pushed in real-time | 🟠 P1 |

---

## 8. Frontend/Backend Contract Analysis

No frontend code is present in this repository. The contract is defined by:
1. The Excel API catalogs (`api_catalog_detailed.xlsx`, `api_catalog_detailed_extended.xlsx`)
2. The actual backend implementation

### Contract Mismatches Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Response format inconsistency** | Some endpoints return `{ success: true, data: [...] }`, others return `{ items: [...] }` or raw arrays. No unified response envelope. |
| 2 | **`expires_in` mismatch** | API tells frontend token expires in 1 hour (`expires_in: 3600`), actual JWT expiry is 7 days. |
| 3 | **Missing pagination in some list endpoints** | Dashboard fetches all products/materials without pagination. Some list endpoints lack consistent `page`/`limit` params. |

---

## 9. Code Quality Issues

### Dead Code

| File | Issue |
|------|-------|
| `product.validation.js` | Empty file (0 bytes) |
| `supplier.validation.js` | Empty file (0 bytes) |
| `device.routes.js` `userDeviceRouter` | Exported but never imported |
| `socket.events.js` `emitDashboardUpdated`, `emitInventoryUpdated` | Defined but never called |

### Duplicate Logic (7 patterns, 12+ sites)

| Pattern | Locations |
|---------|-----------|
| `toNumber` utility | `chat.tools.js`, `dashboard.service.js` |
| CORS origin parsing | `app.js`, `socket.server.js` |
| Low-stock calculation | `warning.service.js`, `dashboard.service.js`, `chat.tools.js` |
| "Invalid user ID" validation | 12+ locations across controllers |
| Payment method validation | `order.validation.js`, `sale.validation.js`, `order.service.js` |
| Positive integer ID validation | All validation files |
| "Today midnight" computation | `attendance.service.js`, `chat.tools.js`, `dashboard.service.js` |

### Inconsistent Architecture

| Issue | Details |
|-------|---------|
| User module has no service layer | `user.controller.js` is 475 lines with all business logic inline |
| Table-sessions has no controller/service | Logic inline in routes file with placeholder endpoint |
| Empty validation files | `product.validation.js`, `supplier.validation.js` |
| No validation on many endpoints | Products, raw-materials, suppliers have no input validation |

---

## 10. Production Readiness

| Aspect | Status | Notes |
|--------|--------|-------|
| Environment config | ⚠️ | `.env` works but secrets are weak/placeholder |
| Database | ⚠️ | PostgreSQL configured, schema exists, but orphaned tables |
| Startup | ✅ | `npm run dev` works, server starts on port 5000 |
| Error handling | ⚠️ | Centralized handler exists but leaks 4xx messages |
| Logging | ✅ | Pino logger with structured output |
| Rate limiting | ⚠️ | Exists but too generous, missing on refresh |
| Security headers | ✅ | Helmet enabled with defaults |
| CORS | ✅ | Configurable via env var |
| Dependencies | ✅ | No known vulnerable packages |
| Docker | ❌ | No Dockerfile or docker-compose |
| Tests | ✅ | 61/61 passing (node:test + supertest, PostgreSQL test DB) |

---

## 11. DELIVERY CHECKLIST

### 🔴 MUST FIX BEFORE DELIVERY

1. **Fix JWT secret** — Generate strong random secret, remove hardcoded value
2. **Fix token expiration** — Change from 7d to 1h/8h, fix `expires_in` response
3. **Add refresh token rate limiting** — Protect `/api/auth/refresh`
4. **Fix table order inventory deduction** — `closeTableOrder` and `checkoutTable` must deduct inventory
5. **Fix delivery double-deduction** — `completeDelivery` should not re-deduct inventory
6. **Fix `deductInventoryForOrder` silent failure** — Throw error when stock insufficient
7. **Fix `updateOrder` status bypass** — Status changes must go through `updateOrderStatus`
8. **Fix `deleteOrder` — Add status guard** — Prevent deleting COMPLETED/PREPARING orders
9. **Fix negative inventory** — Add DB constraint or application-level guard
10. **Add missing product categories CRUD** — 3 endpoints missing
11. **Add missing raw materials options/withdrawals** — 5 endpoints missing

### 🟠 SHOULD FIX BEFORE DELIVERY

1. **Fix `startPreparation` inventory deduction** — Must call `deductInventoryForOrder`
2. **Fix `checkoutTable` double-discount** — Remove per-order discount from Sale calculation
3. **Fix `closeTableOrder` hardcoded discount** — Pass actual discount to Sale
4. **Add `startPreparation` transaction** — Wrap in `$transaction`
5. **Fix `addTableItems` race condition** — Add transaction or locking
6. **Store cancellation reason** — Save to OrderEvent or notes field
7. **Set `Order.saleId`** — Link Sale to Order via foreign key
8. **Reduce login rate limit** — From 60 to 5-10 per 15min
9. **Sanitize error messages in production** — Don't leak 4xx error details
10. **Add JWT algorithm specification** — `{ algorithms: ["HS256"] }`
11. **Fix session info** — Read actual user-agent and IP from request
12. **Remove dead WebSocket events** — Clean up `emitDashboardUpdated`, `emitInventoryUpdated`

### 🟡 CAN BE FIXED AFTER DELIVERY

1. Extract shared utilities (toNumber, ID validation, date computation)
2. Create service layer for User module
3. Clean up empty validation files
4. Add missing database indexes
5. Fix orphaned models (ProductCategory, Review, RawMaterial.supplier)
6. Add WebSocket client-to-server events
7. Add role-based room filtering for WebSocket
8. Increase bcrypt rounds from 10 to 12
9. Add XSS sanitization on user inputs
10. Add Docker configuration
11. Add automated tests
12. Consolidate duplicate logic patterns

---

## 12. Recommended Fix Order

### Phase 1: Security (Day 1 — 2-3 hours)
1. Rotate JWT secret (generate strong random)
2. Fix token expiration (7d → 1h/8h)
3. Fix `expires_in` response to match actual expiry
4. Add refresh endpoint rate limiting
5. Add JWT algorithm specification
6. Reduce login rate limit
7. Fix session info (read actual IP/UA)

### Phase 2: Critical Business Logic (Day 1-2 — 4-6 hours)
8. Fix `closeTableOrder` — add inventory deduction
9. Fix `checkoutTable` — add inventory deduction
10. Fix `completeDelivery` — remove double deduction
11. Fix `deductInventoryForOrder` — throw error on insufficient stock
12. Fix `updateOrder` — route status changes through `updateOrderStatus`
13. Fix `deleteOrder` — add status guard
14. Add negative inventory prevention
15. Fix `startPreparation` — add inventory deduction

### Phase 3: Missing Features (Day 2-3 — 4-6 hours)
16. Add product categories CRUD (3 endpoints)
17. Add raw materials options/withdrawals endpoints (5 endpoints)
18. Add product upload-image endpoint
19. Add product configuration endpoints

### Phase 4: Medium Fixes (Day 3 — 2-3 hours)
20. Fix `checkoutTable` discount logic
21. Fix `closeTableOrder` discount passthrough
22. Add `startPreparation` transaction
23. Fix `addTableItems` race condition
24. Store cancellation reason
25. Set `Order.saleId` linkage
26. Sanitize production error messages

### Phase 5: Polish (Day 4 — 2-3 hours)
27. Remove dead code
28. Fix code quality issues
29. Add missing indexes
30. Clean up schema issues
31. Final smoke test

---

## 13. FINAL VERDICT

### 🔴 NO — BLOCKERS EXIST

### "If I had only 1–2 days before delivery, I would fix these exact things first:"

1. **Rotate JWT secret** — The current one is a dictionary phrase. Any attacker can forge tokens.
2. **Fix 7-day token → 1 hour** — A week-long token on a POS system is a critical vulnerability.
3. **Add refresh rate limit** — Without it, brute-force attacks on refresh tokens are trivial.
4. **Fix table order inventory** — Tables never deduct stock. The inventory system is fundamentally broken for the primary use case (restaurant dine-in).
5. **Fix delivery double-deduction** — Delivery orders lose double inventory.
6. **Fix `deductInventoryForOrder` silent failure** — Stock appears deducted when it isn't.
7. **Fix `updateOrder` status bypass** — Admins can mark orders complete without financial records.
8. **Add missing product categories** — Frontend will break without category CRUD.

**These 8 fixes cover ~80% of the critical issues.** Everything else can follow.

---

*End of FINAL PROJECT DELIVERY AUDIT*
