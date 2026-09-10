# 404 Coffee Backend

Cafe management system — Full-featured backend built with Node.js + Express 5 + Prisma 7 + **PostgreSQL** + **RBAC** + **WebSocket**.

## Requirements

- Node.js 18+
- PostgreSQL 14+
- npm

## Quick Start

```bash
npm install
cp .env.example .env        # Edit DATABASE_URL + JWT_SECRET + JWT_REFRESH_SECRET
npx prisma migrate deploy   # Apply database migrations
npx prisma db seed          # Seed default data (Admin / root123)
npm run dev                 # http://localhost:5000
```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development with nodemon |
| `npm start` | Production |
| `npm test` | Run all tests (node:test + supertest) |
| `npx prisma migrate deploy` | Apply migrations |
| `npx prisma db seed` | Seed default data |
| `npx prisma studio` | Browse database in browser |
| `npx prisma generate` | Regenerate Prisma Client |

## API Endpoints

- **API Base**: `http://localhost:5000/api`
- **Swagger UI**: `http://localhost:5000/api/docs`
- **Health Check**: `http://localhost:5000/api/health`
- **WebSocket**: `ws://localhost:5000` (Socket.IO)

**Total: 158 API endpoints** across 22 modules.

## Documentation

- [API Reference](docs/API.md)
- [Employee/Auth API Contract](EMPLOYEE_AUTH_API.md) — Aligned against frontend engineer specification
- [Curl Guide](docs/CURL_GUIDE.md)
- [Postman Collection](docs/404-coffee.postman_collection.json)
- [API Reconciliation](FINAL_API_RECONCILIATION.md)
- [Handover Report](FINAL_HANDOVER_REPORT.md)
- [Railway Deployment Guide](RAILWAY_DEPLOYMENT_GUIDE.md) (primary)
- [Render Deployment Guide](RENDER_DEPLOYMENT_GUIDE.md) (alternative)

## Employee/Auth Frontend Contract

The Employee Management + Authentication APIs have been fully aligned against the frontend engineer's specification. See [EMPLOYEE_AUTH_API.md](EMPLOYEE_AUTH_API.md) for the exact contract.

**15/15 engineer-required APIs verified and working:**
- Auth: login (with device fingerprint), me, refresh, logout, logout-all
- Employees: list, create, get, update, page-access, delete
- Devices: list, approve, reject, block

## Project Structure

```
src/
├── app.js                     # Express app (security -> logging -> routes -> errors)
├── server.js                  # Entry point
├── config/
│   ├── env.js                 # Environment variables + JWT config
│   └── roles.config.js        # RBAC: roles + pages + actions
├── lib/
│   ├── prisma.js              # Prisma + PostgreSQL adapter
│   └── logger.js              # pino logger
├── middlewares/
│   ├── auth.middleware.js     # JWT (HS256) + user status check
│   ├── permission.middleware.js # requirePermission(page, action?)
│   └── error.middleware.js    # Production error sanitization
├── websocket/
│   ├── socket.server.js       # Socket.IO server
│   ├── socket.auth.js         # WebSocket JWT authentication
│   └── socket.events.js       # Event emitters
├── utils/
│   ├── audit.js               # Audit logging
│   ├── barcode.js             # CODE128 barcode generation
│   └── pagination.js          # parsePagination (page/pageSize)
├── docs/
│   └── swagger.js             # OpenAPI 3.0
└── modules/                   # 22 modules (routes + controller + service)
    ├── auth/                  # Login, logout, refresh, me, logout-all
    ├── users/                 # User CRUD, page access, permissions
    ├── customers/             # Customer CRUD, lookup, merge
    ├── suppliers/             # Supplier CRUD, transactions
    ├── delegates/             # Delegate CRUD, orders, collections
    ├── products/              # Product CRUD, sizes, types, addons, ingredients, categories
    ├── raw-materials/         # Material CRUD, batches
    ├── orders/                # Order CRUD, table management, preparation, delivery
    ├── sales/                 # Sale CRUD, inventory deduction, summary
    ├── purchases/             # Purchase invoice lifecycle
    ├── returns/               # Return invoice lifecycle
    ├── cash-drawer-shifts/    # Shift open/close, cash-in/out, reconciliation
    ├── financial-reports/     # Sales, profit, treasury, inventory reports
    ├── dashboard/             # Dashboard summary
    ├── attendance/            # Check-in/out, ON_TIME/LATE
    ├── devices/               # Device registration, approval, rejection, blocking
    ├── audit-logs/            # Audit log viewer
    ├── settings/              # Key-value settings
    ├── warnings/              # Low stock, expiry warnings
    ├── reviews/               # Public reviews
    ├── chat/                  # DeepSeek AI chat
    └── table-sessions/        # Table active order, service requests
```

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 5.2.1 |
| ORM | Prisma 7.9.1 |
| Database | PostgreSQL (driver adapter via `pg`) |
| Auth | JWT (HS256) with dual-token (access + refresh) |
| WebSocket | Socket.IO 4.8 |
| Security | Helmet, CORS, rate limiting |
| Logging | Pino |
| AI | DeepSeek API |
| Barcode | bwip-js (CODE128) |
| Tests | Node.js built-in test runner + supertest |

## Prisma Models (30)

User, RawMaterial, RawMaterialBatch, Product, ProductType, ProductTypeIngredient,
ProductSize, ProductSizeIngredient, ProductAddon, ProductCategory, Customer,
Supplier, Purchase, PurchaseItem, Sale, SaleItem, Order, OrderItem, Return,
ReturnItem, Delegate, CashDrawerShift, CashDrawerTransaction, AuditLog,
Review, Setting, Attendance, EmployeeDevice, OrderEvent, UserPageAccess

## Key Features

- **JWT Dual-token Auth**: Access (1h) + Refresh (7d) with HS256
- **RBAC**: Page-level permissions for 4 roles (OWNER, MANAGER, CASHIER, DELEGATE)
- **FIFO Inventory**: Deducts stock from oldest batch first
- **Order State Machine**: PENDING → PREPARING → READY → COMPLETED (any → CANCELLED) with optimistic locking
- **Transaction Safety**: All financial operations wrapped in `prisma.$transaction`
- **Decimal Precision**: All monetary values use Prisma `Decimal`
- **Audit Logging**: All write operations recorded
- **Device Management**: Fingerprint-based device tracking with approve/reject/block workflow
- **WebSocket Events**: Real-time order updates (`order:created`, `order:updated`, `order:item:updated`)
- **Production Error Sanitization**: Internal/DB error patterns hidden in production

## Environment Variables

```env
PORT=5000
DATABASE_URL="postgresql://USER:PASS@localhost:5432/coffee_404"
JWT_SECRET="<64-char random string>"
JWT_REFRESH_SECRET="<separate 64-char random string>"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"
NODE_ENV="development"
DEEPSEEK_API_KEY="sk-..."
DEEPSEEK_MODEL="deepseek-chat"
CORS_ORIGINS="http://localhost:3000,http://localhost:5173"
```

## Testing

```bash
npm test                    # Run all tests
node --test --test-concurrency=1 "tests/auth.permissions.test.js"   # Auth tests only
node --test --test-concurrency=1 "tests/users.test.js"             # Users tests only
```

### Current Test Results

| Category | Pass | Fail |
|----------|------|------|
| Auth (login, RBAC, permissions) | 11 | 0 |
| Users (CRUD, RBAC, owner protections) | 11 | 0 |
| Catalog (customers, suppliers, delegates, inventory, products) | 13 | 0 |
| Money Flows (sales, purchases, returns, orders) | 14 | 0 |
| Shifts & Reports (cash drawer, dashboard, reports, warnings, settings, health) | 12 | 0 |
| **Unit Test Total** | **61** | **0** |

API integration tests: **87/87 pass** (15 Employee/Auth endpoints × happy + negative cases + device lifecycle).

## Deployment

**Primary:** [Railway](RAILWAY_DEPLOYMENT_GUIDE.md) — no sleep, WebSocket support, PostgreSQL included.

**Status:** Prepared for Railway deployment. No live Railway URL exists yet.

**Alternative:** [Render](RENDER_DEPLOYMENT_GUIDE.md) — free tier, no credit card required (has 15-min spin-down).

## Delivery Reports

| Report | Description |
|---|---|
| [FINAL_HANDOVER_REPORT.md](FINAL_HANDOVER_REPORT.md) | Final delivery status and handover |
| [EMPLOYEE_AUTH_FINAL_VERIFICATION.md](EMPLOYEE_AUTH_FINAL_VERIFICATION.md) | Employee/Auth contract verification |
| [FINAL_API_RECONCILIATION.md](FINAL_API_RECONCILIATION.md) | Endpoint-by-endpoint reconciliation |
| [FINAL_PROJECT_DELIVERY_AUDIT.md](FINAL_PROJECT_DELIVERY_AUDIT.md) | Full project audit (historical) |
| [FINAL_PROJECT_DELIVERY_REMEDIATION.md](FINAL_PROJECT_DELIVERY_REMEDIATION.md) | Fixes applied (historical) |
| [FINAL_PROJECT_DELIVERY_VERIFICATION.md](FINAL_PROJECT_DELIVERY_VERIFICATION.md) | Verification results (historical) |
| [FINAL_RAILWAY_PREFLIGHT_REPORT.md](FINAL_RAILWAY_PREFLIGHT_REPORT.md) | Railway preflight check |
