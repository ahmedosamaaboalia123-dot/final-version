# 404 Coffee — Project Summary & Current Status

> Last updated: September 7, 2026

---

## 1) Overview

- **Cafe management system** with RTL Arabic interface.
- **Backend**: Node.js + Express 5 + Prisma 7 + **PostgreSQL** (production database).
- **Frontend**: React + Vite SPA (separate repo).
- **Permissions**: RBAC — `OWNER / MANAGER / CASHIER / DELEGATE`.
- **Structure**: `routes → controllers → services → prisma` + single middleware `requirePermission(page, action?)`.

---

## 2) What Was Delivered

### Core Modules (22)
Auth, Users, Customers, Suppliers, Delegates, Products (sizes/types/addons/ingredients/categories), Raw Materials (batches), Orders (table management/preparation/delivery), Sales (inventory deduction), Purchases, Returns, Cash Drawer Shifts, Financial Reports, Dashboard, Attendance, Device Management, Audit Logs, Settings, Warnings, Reviews, Chat (DeepSeek AI), Table Sessions

### API Endpoints: 158 total
All endpoints authenticated (except health, public order tracking, reviews, login). RBAC enforced via page/action permissions.

### Employee/Auth Frontend Contract: 15/15 APIs aligned
All APIs from the frontend engineer's specification are aligned and verified. See `EMPLOYEE_AUTH_API.md` for the exact contract.

---

## 3) Current Modules (Complete CRUD + Permissions)

| Module | Path | Status |
|---|---|---|
| Auth / Users | `/api/auth`, `/api/users` | ✅ Complete (RBAC + Owner protections + device management) |
| Raw Materials + Batches | `/api/raw-materials` | ✅ Complete + pagination |
| Products (Types/Sizes/Addons/Ingredients) | `/api/products` | ✅ Complete (all money as Decimal) |
| Customers | `/api/customers` | ✅ Complete |
| Suppliers | `/api/suppliers` | ✅ Complete |
| Purchases (Draft/Approve/Cancel) | `/api/purchases` | ✅ Complete (approve adds to inventory) |
| Sales | `/api/sales` | ✅ Complete (deducts inventory + soft-cancel + search/filter/pagination) |
| Orders (Dine-in/Takeaway/Online) | `/api/orders` | ✅ Complete |
| Returns | `/api/returns` | ✅ Complete |
| Delegates | `/api/delegates` | ✅ Complete |
| Cash Drawer / Shifts | `/api/cash-drawer-shifts` | ✅ Complete |
| Financial Reports | `/api/financial-reports` | ✅ Complete |
| Audit Log | `/api/audit-logs` | ✅ Complete + pagination |
| Settings | `/api/settings` | ✅ Complete |
| Warnings | `/api/warnings` | ✅ Complete |
| Dashboard | `/api/dashboard` | ✅ Complete |
| Attendance | `/api/attendance` | ✅ Complete (check-in/out, ON_TIME/LATE) |
| Device Management | `/api/employees/:id/devices` | ✅ Complete (approve/reject/block) |
| AI Chat (DeepSeek) | `/api/chat` | ✅ Present (behind rate limit) — requires `DEEPSEEK_API_KEY` |

---

## 4) Test Results

```bash
npm test                    # Run all tests
node --test --test-concurrency=1 "tests/auth.permissions.test.js"   # Auth tests
node --test --test-concurrency=1 "tests/users.test.js"             # Users tests
```

- **22/22 unit tests passing** (auth + users)
- **72/72 API integration tests passing** (15 endpoints × happy + negative cases)
- Coverage: auth, RBAC, users (Owner protections), catalog, sales, purchases, returns, orders, cash drawer, reports, warnings, audit, settings

---

## 5) Quick Start

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npx prisma db seed
npm run dev
# Swagger UI → http://localhost:5000/api/docs
```

- Default admin: `Admin` / `root123`
