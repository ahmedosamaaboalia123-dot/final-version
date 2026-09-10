# 404 Coffee Backend — Report: Areas Needing Improvement

**Project:** 404 Coffee Backend — v2.0 (Node 22 / Express 5 / Prisma 7 / SQLite WAL / RBAC)  
**Reviewed:** August 16, 2026 — after manual verification of 82 checkpoints + 61 automated tests  
**Executive summary:** The functional logic and core security are mature and well-tested. The
improvements required focus on the **operations, deployment, and observability layer** — not on
business logic.

---

## 0) Architectural Note: SQLite WAL — A Deliberate and Appropriate Choice ✅

> This is an **explicit, intentional decision** for this project and is not contested by this report.

- The project targets a **single café, single location, limited staff** — exactly SQLite's sweet spot.
- **WAL is explicitly enabled** in `src/lib/prisma.js:18` (`PRAGMA journal_mode=WAL` + `busy_timeout=10000`),
  which provides:
  - **Excellent concurrent reads** (reports/dashboard/search keep working while sales are being written).
  - Low latency with no external DB server — **zero DBA operational footprint**.
- Backup produces a **single consistent file** via the Online Backup API
  (`src/modules/backup/backup.service.js`) — simpler and faster to restore than an over-provisioned Postgres.
- Its real limits are known and have practical mitigations (see P1.5 and P2.1) — not a reason to
  migrate to Postgres at this stage.

---

## 1) P0 — Critical: Blockers for production

### 1.1 Default secrets = open door
| Risk | Location | Action |
|---|---|---|
| `JWT_SECRET="CHANGE_THIS_SECRET"` | `.env.example` | Generate a random secret at deploy time + refuse startup if it starts with `"CHANGE_THIS_"` in `env.js` |
| Default `Admin/root123` | `prisma/seed.js:20` | **Force a password change on first login**, or generate a random root password logged once |
| `OPENAI_API_KEY="sk-..."` placeholder | `.env.example` | Must be empty/valid before production (currently sent to the provider on every request) |

### 1.2 No HTTPS / no reverse proxy
- Server runs plain `http` (`server.js`) — tokens are transmitted in cleartext.
- **Action:** Put behind Nginx/Caddy (Caddy = free automatic TLS); force HTTPS; restrict or network-gate the Swagger UI.

### 1.3 No process management
- No PM2/systemd; no auto-restart, no graceful shutdown (WAL checkpoint, open connections).
- **Action:** PM2 (cluster, restart policy, `max_memory_restart`) or a systemd unit.

### 1.4 Health check measures "liveness", not "readiness"
- `GET /api/health` returns `200` even if the database is down (it never touches the DB).
- **Action:** Add a `SELECT 1` DB probe (+ WAL state) so load balancers/monitoring can rely on it.

### 1.5 CORS wide open
- `src/app.js:45` → `app.use(cors())` allows any origin. Fine while staff-only; unsafe once public.
- **Action:** Explicit allow-list of the actual frontend domain(s).

---

## 2) P1 — High: Operational hardening before go-live

### 2.1 No deployment packaging / CI
- No `Dockerfile`, no `docker-compose`, no CI (`.github/workflows` absent).
- **Action:** Multi-stage `Dockerfile` (slim Node 22 image, non-root user), `docker-compose`
  (app + backup cron + optional Caddy), and a CI gate running `npm ci && npm test`.

### 2.2 Backup strategy is incomplete (restore is untested)
- The manual backup endpoint works and was verified to produce a valid SQLite file.
- **Missing:** **scheduled** backups (cron), **retention** policy, and above all a **tested restore
  procedure** (download → restore → verify data).
- **Action:** Daily cron to external storage (S3/Drive/object store) + a restore **runbook** +
  an automated restore test against the test database.

### 2.3 Inconsistent response shape on create/update
- `customers`, `suppliers`, `products`, `product sizes`, and `purchases` return `data` without the
  new record's `id`/`status` even on success — functional, but clients must re-fetch to get IDs.
- **Action:** Unify all create/update responses to return the persisted record (same pattern as
  `sales`/`orders`/`returns`), plus regression tests (see P3.2).

### 2.4 Raw error details can leak
- The error middleware hides internals in production, but verify two leaks: Prisma errors
  (`P2025`, etc.) and raw OpenAI messages that surfaced to the client during verification (401).
- **Action:** Generic public messages + full logging server-side; cap chat error exposure.

### 2.5 SQLite: explicit handling of concurrent writes
- WAL handles reads well; simultaneous writes (multiple cashiers) can hit `database is locked`.
- **Deliberate mitigations (instead of migrating to Postgres):**
  - Keep `busy_timeout` high (currently `10000ms` — good) and enable `PRAGMA wal_autocheckpoint`.
  - Keep every write path inside a `$transaction` (already true for all money flows) so partial
    locks never leave inconsistent state.
  - Put the DB file + backups on **fast local NVMe storage** — network filesystems (NFS/EFS) kill SQLite.

### 2.6 Chat needs a feature flag + cost guardrails
- With a placeholder key; with a real key, every public message costs OpenAI money and exposes context.
- **Action:** Env-based gating, a daily per-IP message cap, per-role tool scoping (already present),
  and a small retry budget.

### 2.7 Logs can leak secrets
- `pino-http` to stdout; a logged error may include sensitive query params (connection strings/tokens).
- **Action:** Redact `req.headers.authorization` and `DATABASE_URL` params in the logger serializer.

---

## 3) P2 — Medium: Quality after stability

### 3.1 No observability
- Logs go to stdout only; no metrics, no alerting.
- **Action (lightweight):** log rotation (PM2 built-in), optional `/api/metrics` (prom-client if desired),
  and a simple ping/alert on health. No need for ELK at this stage.

### 3.2 Dependency hygiene
- `package-lock.json` is consistent, but run `npm audit` periodically and pin versions with `~`
  in `package.json` to avoid silent breaking upgrades.

### 3.3 Pin the runtime
- The project requires `node:sqlite` (Node 22.5+). Declare `engines` in `package.json` and use a
  fixed Docker image tag.

### 3.4 Pagination coverage
- The `pagination` util (`src/utils/pagination.js`) is correct and verified (page/pageSize/`total`/
  `totalPages`, max 100). Confirm every list endpoint actually applies it.

---

## 4) P3 — Roadmap: Next iterations

### 4.1 Frontend
- The SPA is still a Vercel prototype — the biggest gap in the "end product": JWT wiring, flows, final RTL/i18n.

### 4.2 Additional tests to lock behavior
- cURL/regression tests asserting create/update responses include `id` (P1.3); **backup restore**;
  a simulated `database is locked` behavior; a concurrent-cashier write storm.

### 4.3 Operational runbooks
- Three documents: **Deployment** (install → TLS → env), **Restore** (backup ↔ restore), **Maintenance**
  (WAL checkpoints, DB file placement).

### 4.4 Migrate to Postgres — only if operational constraints change
- **Not part of the current quality plan.** Revisit only if: multi-branch deployment, sustained
  concurrent write pressure, or heavy analytics. Until then, SQLite WAL is the winning choice.

---

## 5) Suggested execution roadmap

| Phase | Items | Effort |
|---|---|---|
| **Phase 1 — Security** | P0.1, P0.2, P0.4, P0.5 | A few days |
| **Phase 2 — Operations** | P0.3, P2.1, P1.1, P1.2 | 1–2 days |
| **Phase 3 — Quality** | P1.3, P1.4, P1.5, P1.6, P2.x | 3–5 days |
| **Phase 4 — Product** | P3 frontend + tests + runbooks | Depends on business priority |

---

## 6) What needs no improvement right now (already solid)

- **Business logic** (invoice math / inventory / cash drawer) ✅
- **RBAC + ownership protections** (last OWNER, changing your own role) ✅
- **Transactions across all money flows** ✅
- **Generous rate limiting** (general / login / chat) ✅
- **Documentation** (Swagger + API.md + CURL_GUIDE + VERIFICATION_REPORT) ✅