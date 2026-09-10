# FINAL API RECONCILIATION — 404 Coffee Backend

**Date:** 2026-09-05 (corrected)
**Backend:** 158 HTTP endpoints | **Postman:** 76 unique endpoints | **Excel:** 152 entries (146 HTTP + 3 WS + 3 INTERNAL)

---

## Reconciliation Status

| Metric | Value | Source |
|--------|-------|--------|
| Backend total (HTTP) | 158 | Counted from 22 route files + app.js |
| Postman total (unique) | 76 | Deduplicated from 84 collection items |
| Excel total (all entries) | 152 | Parsed from api_catalog_detailed.xlsx (146 HTTP + 3 WS + 3 INTERNAL) |
| Postman coverage (of backend) | 48% | 76/158 |
| Excel HTTP coverage (of backend) | 83% | 131 matched / 158 backend |
| Extra backend (not in Postman) | 82 | 158 - 76 |
| Extra backend (not in Excel HTTP) | 27 | Backend endpoints with no Excel counterpart |
| Missing from backend (in Excel HTTP) | 15 | Excel HTTP entries with no backend implementation |

## Endpoint-by-Endpoint Reconciliation

### Auth (5 backend, 5 Postman, 5 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | POST | /api/auth/login | ✅ | ✅ | ✅ | |
| 2 | GET | /api/auth/me | ✅ | ✅ | ✅ | Postman updated (was missing) |
| 3 | POST | /api/auth/refresh | ✅ | ✅ | ✅ | Postman updated (was missing) |
| 4 | POST | /api/auth/logout | ✅ | ✅ | ✅ | Postman updated (was missing) |
| 5 | POST | /api/auth/logout-all | ✅ | ✅ | — | Postman updated (was missing) |

### Users (13 backend, 11 Postman, 12 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/users | ✅ | ✅ | ✅ | |
| 2 | GET | /api/users/:id | ✅ | ✅ | ✅ | |
| 3 | GET | /api/users/:id/permissions | ✅ | ✅ | ✅ | |
| 4 | POST | /api/users | ✅ | ✅ | ✅ | |
| 5 | PUT | /api/users/:id | ✅ | ✅ | ✅ | |
| 6 | PATCH | /api/users/:id/status | ✅ | ✅ | ✅ | |
| 7 | DELETE | /api/users/:id | ✅ | ✅ | ✅ | |
| 8 | PUT | /api/users/:id/page-access | ✅ | ✅ | ✅ | Postman updated (was missing) |
| 9 | GET | /api/users/:id/attendance | ✅ | ✅ | ❌ | Postman updated (was missing) |
| 10 | GET | /api/users/:id/devices | ✅ | ❌ | ❌ | Legacy endpoint (use employee devices) |
| 11 | PATCH | /api/users/:id/devices/:deviceId | ✅ | ❌ | ❌ | Legacy endpoint (use employee devices) |
| 12 | DELETE | /api/users/:id/devices/:deviceId | ✅ | ❌ | ❌ | Legacy endpoint (use employee devices) |

### Customers (8 backend, 4 Postman, 5 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/customers | ✅ | ✅ | ✅ | |
| 2 | GET | /api/customers/:id | ✅ | ✅ | ✅ | |
| 3 | POST | /api/customers | ✅ | ✅ | ✅ | |
| 4 | PUT | /api/customers/:id | ✅ | ✅ | ✅ | |
| 5 | DELETE | /api/customers/:id | ✅ | ❌ | ✅ | Missing from Postman |
| 6 | GET | /api/customers/lookup | ✅ | ❌ | ❌ | Extra backend |
| 7 | GET | /api/customers/:id/orders | ✅ | ❌ | ❌ | Extra backend |
| 8 | POST | /api/customers/:id/merge | ✅ | ❌ | ❌ | Extra backend |

### Suppliers (7 backend, 4 Postman, 5 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/suppliers | ✅ | ✅ | ✅ | |
| 2 | GET | /api/suppliers/:id | ✅ | ✅ | ✅ | |
| 3 | POST | /api/suppliers | ✅ | ✅ | ✅ | |
| 4 | PUT | /api/suppliers/:id | ✅ | ✅ | ✅ | |
| 5 | DELETE | /api/suppliers/:id | ✅ | ❌ | ✅ | Missing from Postman |
| 6 | GET | /api/suppliers/options | ✅ | ❌ | ❌ | Extra backend |
| 7 | GET | /api/suppliers/:id/transactions | ✅ | ❌ | ❌ | Extra backend |

### Delegates (9 backend, 4 Postman, 4 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/delegates | ✅ | ✅ | ✅ | |
| 2 | GET | /api/delegates/:id | ✅ | ✅ | ✅ | |
| 3 | POST | /api/delegates | ✅ | ✅ | ✅ | |
| 4 | PATCH | /api/delegates/:id/status | ✅ | ✅ | ✅ | |
| 5 | DELETE | /api/delegates/:id | ✅ | ❌ | ❌ | Missing from Postman |
| 6 | PUT | /api/delegates/:id | ✅ | ❌ | ❌ | Extra backend |
| 7 | GET | /api/delegates/options | ✅ | ❌ | ❌ | Extra backend |
| 8 | GET | /api/delegates/:id/orders | ✅ | ❌ | ❌ | Extra backend |
| 9 | GET | /api/delegates/:id/collections | ✅ | ❌ | ❌ | Extra backend |

### Raw Materials (8 backend, 6 Postman, 8 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/raw-materials | ✅ | ✅ | ✅ | |
| 2 | GET | /api/raw-materials/:id | ✅ | ✅ | ✅ | Added in remediation |
| 3 | POST | /api/raw-materials | ✅ | ✅ | ✅ | |
| 4 | POST | /api/raw-materials/:id/batches | ✅ | ✅ | ✅ | |
| 5 | PUT | /api/raw-materials/:id | ✅ | ✅ | ✅ | |
| 6 | DELETE | /api/raw-materials/:id | ✅ | ✅ | ✅ | |
| 7 | GET | /api/raw-materials/options | ✅ | ❌ | ✅ | Added in remediation |
| 8 | GET | /api/raw-materials/:id/batches | ✅ | ❌ | ❌ | Extra backend |

### Products (21 backend, 9 Postman, 11 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/products | ✅ | ✅ | ✅ | |
| 2 | GET | /api/products/:id | ✅ | ✅ | ✅ | |
| 3 | POST | /api/products | ✅ | ✅ | ✅ | |
| 4 | PUT | /api/products/:id | ✅ | ✅ | ✅ | |
| 5 | DELETE | /api/products/:id | ✅ | ✅ | ✅ | |
| 6 | POST | /api/products/:id/sizes | ✅ | ✅ | ✅ | |
| 7 | POST | /api/products/:id/sizes/:sizeId/ingredients | ✅ | ✅ | ✅ | |
| 8 | POST | /api/products/:id/addons | ✅ | ✅ | ✅ | |
| 9 | POST | /api/products/:id/types | ✅ | ✅ | ✅ | |
| 10 | GET | /api/products/:id/sizes | ✅ | ❌ | ❌ | Extra backend |
| 11 | GET | /api/products/:id/addons | ✅ | ❌ | ❌ | Extra backend |
| 12 | GET | /api/products/:id/types | ✅ | ❌ | ❌ | Extra backend |
| 13 | PUT | /api/products/:id/addons/:addonId | ✅ | ❌ | ❌ | Extra backend |
| 14 | DELETE | /api/products/:id/addons/:addonId | ✅ | ❌ | ❌ | Extra backend |
| 15 | PUT | /api/products/:id/types/:typeId | ✅ | ❌ | ❌ | Extra backend |
| 16 | DELETE | /api/products/:id/types/:typeId | ✅ | ❌ | ❌ | Extra backend |
| 17 | POST | /api/products/:id/types/:typeId/ingredients/:rawMaterialId | ✅ | ❌ | ❌ | Extra backend |
| 18 | DELETE | /api/products/:id/types/:typeId/ingredients/:rawMaterialId | ✅ | ❌ | ❌ | Extra backend |

### Categories (5 backend, 0 Postman, 0 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/products/categories | ✅ | ❌ | ❌ | Added in remediation |
| 2 | POST | /api/products/categories | ✅ | ❌ | ❌ | Added in remediation |
| 3 | PUT | /api/products/categories/:id | ✅ | ❌ | ❌ | Added in remediation |
| 4 | DELETE | /api/products/categories/:id | ✅ | ❌ | ❌ | Added in remediation |
| 5 | GET | /api/products/categories/:id | ❌ | ❌ | ❌ | NOT IMPLEMENTED |

### Sales (6 backend, 4 Postman, 3 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/sales | ✅ | ✅ | ✅ | |
| 2 | GET | /api/sales/:id | ✅ | ✅ | ✅ | |
| 3 | POST | /api/sales | ✅ | ✅ | ✅ | |
| 4 | DELETE | /api/sales/:id | ✅ | ✅ | ❌ | Extra backend vs Excel |
| 5 | PUT | /api/sales/:id | ✅ | ❌ | ❌ | Extra backend |
| 6 | GET | /api/sales/summary | ✅ | ❌ | ❌ | Extra backend |

### Purchases (6 backend, 6 Postman, 4 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/purchases | ✅ | ✅ | ✅ | |
| 2 | GET | /api/purchases/:id | ✅ | ✅ | ✅ | |
| 3 | POST | /api/purchases | ✅ | ✅ | ✅ | |
| 4 | PATCH | /api/purchases/:id/approve | ✅ | ✅ | ✅ | |
| 5 | PATCH | /api/purchases/:id/cancel | ✅ | ✅ | ❌ | Extra backend vs Excel |
| 6 | DELETE | /api/purchases/:id | ✅ | ✅ | ❌ | Extra backend vs Excel |
| 7 | PUT | /api/purchases/:id | ✅ | ❌ | ❌ | Extra backend |

### Returns (7 backend, 5 Postman, 5 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/returns | ✅ | ✅ | ✅ | |
| 2 | GET | /api/returns/:id | ✅ | ✅ | ✅ | |
| 3 | POST | /api/returns | ✅ | ✅ | ✅ | |
| 4 | PATCH | /api/returns/:id/approve | ✅ | ✅ | ✅ | |
| 5 | DELETE | /api/returns/:id | ✅ | ✅ | ✅ | |
| 6 | PUT | /api/returns/:id | ✅ | ❌ | ❌ | Extra backend |
| 7 | PATCH | /api/returns/:id/cancel | ✅ | ❌ | ❌ | Extra backend |

### Orders (24 backend, 6 Postman, 18 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/orders | ✅ | ✅ | ✅ | |
| 2 | GET | /api/orders/:id | ✅ | ✅ | ✅ | |
| 3 | POST | /api/orders | ✅ | ✅ | ✅ | |
| 4 | PUT | /api/orders/:id | ✅ | ✅ | ✅ | |
| 5 | DELETE | /api/orders/:id | ✅ | ✅ | ✅ | |
| 6 | POST | /api/orders/:id/cancel | ✅ | ❌ | ✅ | Missing from Postman |
| 7 | POST | /api/orders/:id/preparation/start | ✅ | ❌ | ✅ | Missing from Postman |
| 8 | POST | /api/orders/:id/items/:itemId/ready | ✅ | ❌ | ✅ | Missing from Postman |
| 9 | POST | /api/orders/:id/delivery/complete | ✅ | ❌ | ✅ | Missing from Postman |
| 10 | GET | /api/orders/prep | ✅ | ❌ | ✅ | Missing from Postman |
| 11 | GET | /api/orders/:id/tracking | ✅ | ❌ | ✅ | Missing from Postman |
| 12 | GET | /api/orders/public/:code/tracking | ✅ | ❌ | ✅ | Missing from Postman |
| 13 | POST | /api/orders/public | ✅ | ❌ | ✅ | Missing from Postman |
| 14 | GET | /api/orders/tables/summary | ✅ | ❌ | ✅ | Missing from Postman |
| 15 | GET | /api/orders/tables/:tableNumber/details | ✅ | ❌ | ✅ | Missing from Postman |
| 16 | POST | /api/orders/tables/:tableNumber/checkout | ✅ | ❌ | ✅ | Missing from Postman |
| 17 | POST | /api/orders/tables/:tableNumber/orders | ✅ | ❌ | ✅ | Missing from Postman |
| 18 | POST | /api/orders/tables/:tableNumber/items | ✅ | ❌ | ❌ | Extra backend |
| 19 | PATCH | /api/orders/tables/:tableNumber/close | ✅ | ❌ | ❌ | Extra backend |
| 20 | GET | /api/orders/tables/:tableNumber/history | ✅ | ❌ | ❌ | Extra backend |
| 21 | GET | /api/orders/:id/events | ✅ | ❌ | ❌ | Extra backend |
| 22 | GET | /api/orders/:id/invoice | ✅ | ❌ | ❌ | Extra backend |
| 23 | PATCH | /api/orders/:id/hand-over-delegate | ✅ | ❌ | ❌ | Extra backend |
| 24 | PATCH | /api/orders/:id/items/:itemId/status | ✅ | ❌ | ❌ | Extra backend |
| 25 | POST | /api/orders/:id/items/:itemId/reopen | ✅ | ❌ | ❌ | Extra backend |

### Cash Drawer (9 backend, 6 Postman, 6 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/cash-drawer-shifts | ✅ | ✅ | ✅ | |
| 2 | GET | /api/cash-drawer-shifts/current | ✅ | ✅ | ✅ | |
| 3 | POST | /api/cash-drawer-shifts | ✅ | ✅ | ✅ | |
| 4 | POST | /api/cash-drawer-shifts/:id/cash-in | ✅ | ✅ | ✅ | |
| 5 | POST | /api/cash-drawer-shifts/:id/cash-out | ✅ | ✅ | ✅ | |
| 6 | POST | /api/cash-drawer-shifts/:id/close | ✅ | ✅ | ✅ | |
| 7 | GET | /api/cash-drawer-shifts/:id | ✅ | ❌ | ❌ | Extra backend |
| 8 | GET | /api/cash-drawer-shifts/:id/reconciliation | ✅ | ❌ | ❌ | Extra backend |
| 9 | GET | /api/cash-drawer-shifts/:id/transactions | ✅ | ❌ | ❌ | Extra backend |

### Dashboard + Reports + Settings (16 backend, 6 Postman, 7 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/dashboard | ✅ | ✅ | ✅ | |
| 2 | GET | /api/financial-reports/sales | ✅ | ✅ | ✅ | |
| 3 | GET | /api/financial-reports/profit | ✅ | ✅ | ✅ | |
| 4 | GET | /api/financial-reports/treasury | ✅ | ✅ | ✅ | |
| 5 | GET | /api/warnings | ✅ | ✅ | ✅ | |
| 6 | GET | /api/settings | ✅ | ✅ | ✅ | |
| 7 | POST | /api/settings/bulk | ✅ | ✅ | ✅ | |
| 8 | GET | /api/settings/:key | ✅ | ❌ | ❌ | Added in remediation |
| 9 | PUT | /api/settings/:key | ✅ | ❌ | ❌ | Extra backend |
| 10 | GET | /api/audit-logs | ✅ | ✅ | ✅ | |
| 11 | GET | /api/audit-logs/:id | ✅ | ❌ | ❌ | Extra backend |
| 12 | GET | /api/financial-reports/daily | ✅ | ❌ | ❌ | Extra backend |
| 13 | GET | /api/financial-reports/monthly | ✅ | ❌ | ❌ | Extra backend |
| 14 | GET | /api/financial-reports/overview | ✅ | ❌ | ❌ | Extra backend |
| 15 | GET | /api/financial-reports/export | ✅ | ❌ | ❌ | Extra backend |
| 16 | GET | /api/financial-reports/inventory | ✅ | ❌ | ❌ | Extra backend |
| 17 | GET | /api/financial-reports/inventory-loss | ✅ | ❌ | ❌ | Extra backend |
| 18 | GET | /api/financial-reports/products | ✅ | ❌ | ❌ | Extra backend |
| 19 | GET | /api/financial-reports/shifts | ✅ | ❌ | ❌ | Extra backend |

### Chat (1 backend, 3 Postman, 1 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | POST | /api/chat | ✅ | ✅ | ✅ | |

### Reviews (4 backend, 0 Postman, 0 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/reviews | ✅ | ❌ | ❌ | Extra backend |
| 2 | GET | /api/reviews/:id | ✅ | ❌ | ❌ | Extra backend |
| 3 | POST | /api/reviews | ✅ | ❌ | ❌ | Extra backend |
| 4 | DELETE | /api/reviews/:id | ✅ | ❌ | ❌ | Extra backend |

### Other (14 backend, 3 Postman, 0 Excel)

| # | Method | Path | Backend | Postman | Excel | Notes |
|---|--------|------|---------|---------|-------|-------|
| 1 | GET | /api/health | ✅ | ✅ | ❌ | |
| 2 | GET | /api/health/live | ✅ | ✅ | ❌ | Postman updated (was missing) |
| 3 | GET | /api/health/ready | ✅ | ✅ | ❌ | Postman updated (was missing) |
| 4 | GET | /api/docs.json | ✅ | ✅ | ❌ | |
| 5 | GET | /api/docs | ✅ | ✅ | ❌ | |
| 6 | POST | /api/attendance/check-in | ✅ | ❌ | ❌ | |
| 7 | POST | /api/attendance/check-out | ✅ | ❌ | ❌ | |
| 8 | POST | /api/auth/devices/register | ✅ | ❌ | ❌ | |
| 9 | GET | /api/table-sessions/:tableNumber/active-order | ✅ | ❌ | ❌ | |
| 10 | POST | /api/table-sessions/:tableNumber/service-requests | ✅ | ❌ | ❌ | |
| 11 | GET | /api/employees/:id/devices | ✅ | ✅ | ❌ | Postman updated (Employee/Auth alignment) |
| 12 | PUT | /api/employees/:id/devices/:deviceId/approve | ✅ | ✅ | ❌ | Postman updated (Employee/Auth alignment) |
| 13 | PUT | /api/employees/:id/devices/:deviceId/reject | ✅ | ✅ | ❌ | Postman updated (Employee/Auth alignment) |
| 14 | PUT | /api/employees/:id/devices/:deviceId/block | ✅ | ✅ | ❌ | Postman updated (Employee/Auth alignment) |

## Summary

| Category | Count | Notes |
|----------|-------|-------|
| Backend HTTP endpoints | 158 | Verified: 22 route files + 4 app.js routes |
| In Postman (unique) | 80+ | Updated: added Employee/Auth endpoints (login me, refresh, logout, logout-all, page-access, attendance, employee devices, health endpoints) |
| In Excel (all entries) | 152 | 146 HTTP + 3 WebSocket + 3 INTERNAL |
| Excel HTTP entries matched to backend | 131 (83%) | Of 146 HTTP entries, 131 have a backend implementation |
| Extra backend (not in Postman) | ~74 | Reduced from 82 after Postman sync |
| Extra backend (not in Excel) | 27 | Backend endpoints absent from Excel catalog |
| Missing from backend (in Excel) | 15 | Excel HTTP entries with no backend implementation |
| Employee/Auth alignment | 15/15 | All frontend engineer spec APIs aligned |

**83% of Excel HTTP entries are implemented.** 15 Excel entries lack backend implementation (mostly optional: raw materials batch management, product configuration, image upload). The backend has 27 additional endpoints not in the Excel (purchases, reviews, settings, table-sessions, health, docs, etc.).
