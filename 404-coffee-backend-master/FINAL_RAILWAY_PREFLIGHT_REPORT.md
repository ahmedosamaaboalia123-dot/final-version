# FINAL RAILWAY PREFLIGHT VERIFICATION REPORT

## 404 Coffee Backend — Commit `a3297d2` → `bed46ab`

**Date:** September 7, 2026
**Status:** 🟡 PREPARED — DEPLOYMENT PENDING

---

## Preflight Findings

### Critical Issues Found & Fixed

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | `railway.toml` had `startCommand = "node src/server.js"` which **overrides Dockerfile CMD** — Railway would skip `npx prisma migrate deploy`, meaning **migrations would never run on deploy** | **CRITICAL** | Removed `startCommand` from `railway.toml`. Dockerfile CMD now controls startup: `npx prisma migrate deploy && node src/server.js` |
| 2 | `Dockerfile` used `npm ci --only=production` (deprecated in npm 11+) — generates warnings, may be removed in future npm | Medium | Changed to `npm ci --omit=dev` |
| 3 | `.env.example` missing `CORS_ORIGINS` — used in `src/app.js:49` and `src/websocket/socket.server.js:11` | Low | Added commented `CORS_ORIGINS` entry |
| 4 | `RAILWAY_DEPLOYMENT_GUIDE.md` referenced old `npm ci` in build step description | Low | Updated to `npm ci --omit=dev` |

---

## Verification Results

### 1. Railway Configuration — PASS

- `railway.toml`: `builder = "dockerfile"`, no conflicting `startCommand`, restart on failure with max 10 retries
- `Dockerfile`: Correct layer ordering (deps → prisma → app), proper CMD for migrations + server start
- `package.json`: `"start": "node src/server.js"` (consistent), Prisma + pg + adapter-pg in dependencies
- `prisma.config.ts`: Reads `DATABASE_URL` from env, points to `prisma/migrations` — correct

### 2. Dockerfile — PASS (after fix)

| Instruction | Status | Notes |
|-------------|--------|-------|
| `FROM node:20-alpine` | ✅ | Current LTS, minimal image |
| `WORKDIR /app` | ✅ | Correct |
| `COPY package*.json ./` | ✅ | Enables Docker layer caching |
| `RUN npm ci --omit=dev` | ✅ | Production deps only (fixed from deprecated `--only=production`) |
| `COPY prisma ./prisma/` + `RUN npx prisma generate` | ✅ | Prisma client generated before full copy |
| `COPY . .` | ✅ | Full app copy |
| `EXPOSE 5000` | ✅ | Documents port (Railway uses `PORT` env) |
| `CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]` | ✅ | Migrations run on every container start |

### 3. Prisma — PASS

- Schema: 30 models, 12 enums, PostgreSQL provider
- 7 migrations present in `prisma/migrations/`
- `prisma generate` succeeds in 7.27s
- `prisma migrate deploy` compatible — uses `DATABASE_URL` from env
- `prisma.config.ts` auto-generated, reads `env("DATABASE_URL")`
- `src/lib/prisma.js` uses `@prisma/adapter-pg` with connection pool — correct for PostgreSQL

### 4. Database — PASS

- Production requires PostgreSQL (schema provider: `"postgresql"`)
- `src/lib/prisma.js:5`: reads `process.env.DATABASE_URL`, throws if missing
- Railway PostgreSQL plugin auto-injects `DATABASE_URL` — no manual config needed
- `npx prisma migrate deploy` reads `DATABASE_URL` from env at runtime — compatible

### 5. Seed — PASS

- `prisma/seed.js` exists, 59 lines, idempotent
- Creates: 1 admin user (`Admin` / `root123`, role `OWNER`) + 3 default settings (`shop_name`, `currency`, `tax_rate`)
- Checks for existing data before creating (safe for re-runs)
- Uses `require("../src/lib/prisma")` — needs `DATABASE_URL` at runtime
- No SQLite dependency, no local file dependency, no hardcoded paths
- Safe for fresh Railway PostgreSQL database

### 6. Environment Variables — PASS

| Variable | Code Location | `.env.example` | Railway Guide | Required |
|----------|--------------|----------------|---------------|----------|
| `DATABASE_URL` | `src/lib/prisma.js:5` | ✅ | ✅ (auto-injected) | Yes |
| `PORT` | `src/config/env.js:9` | ✅ | ✅ (auto-injected) | Yes (auto) |
| `JWT_SECRET` | `src/config/env.js:11` | ✅ | ✅ | Yes |
| `JWT_REFRESH_SECRET` | `src/config/env.js:3` | ✅ | ✅ | Yes |
| `JWT_EXPIRES_IN` | `src/config/env.js:13` | ✅ | ✅ | No (default: 1h) |
| `JWT_REFRESH_EXPIRES_IN` | `src/config/env.js:14` | ✅ | ✅ | No (default: 7d) |
| `NODE_ENV` | `src/config/env.js:10` | ✅ | ✅ | No (default: development) |
| `CORS_ORIGINS` | `src/app.js:49`, `src/websocket/socket.server.js:11` | ✅ (added) | ✅ | No (default: localhost) |
| `DEEPSEEK_API_KEY` | `src/config/env.js:15` | ✅ | ✅ | No |
| `DEEPSEEK_MODEL` | `src/config/env.js:16` | ✅ | ✅ | No (default: deepseek-chat) |
| `AI_RATE_LIMIT_WINDOW_MS` | `src/modules/chat/chat.routes.js:12` | ✅ | ❌ not listed | No (default: 900000) |
| `AI_RATE_LIMIT_MAX_REQUESTS` | `src/modules/chat/chat.routes.js:13` | ✅ | ❌ not listed | No (default: 30) |

`AI_RATE_LIMIT_*` are optional with defaults — omission from Railway guide is acceptable.

### 7. PORT — PASS

- `src/config/env.js:9`: `port: process.env.PORT || 5000`
- `src/server.js:11`: `server.listen(port, ...)`
- No hardcoded port in production code
- Railway injects `PORT` automatically — server will bind to it

### 8. Health Endpoint — PASS (verified locally)

| Endpoint | Response | Status |
|----------|----------|--------|
| `GET /api/health` | `{"success":true,"message":"404 Coffee API is running"}` | 200 ✅ |
| `GET /api/health/live` | `{"success":true,"data":{"status":"ok","uptime":...}}` | 200 ✅ |
| `GET /api/health/ready` | Checks DB connection | 200/503 ✅ |

Health endpoint returned HTTP 200 in local test. Suitable for Railway health checks.

### 9. Security — PASS

- `.env` not tracked in git ✅
- `.env.*` excluded (except `.env.example`) in `.gitignore` ✅
- No JWT secrets committed ✅
- No database passwords committed ✅
- No Railway tokens committed ✅
- No API keys committed ✅
- No force push performed ✅

### 10. Documentation — PASS (after fixes)

| Document | Status | Notes |
|----------|--------|-------|
| `README.md` | ✅ | Lists Railway as primary, Render as alternative |
| `RAILWAY_DEPLOYMENT_GUIDE.md` | ✅ | Complete guide, correct build command, verified pricing |
| `FINAL_HANDOVER_REPORT.md` | ✅ | References Railway deployment |
| `.env.example` | ✅ | All vars documented (added `CORS_ORIGINS`) |

None of these documents claim Railway deployment was completed. Status is clearly "PREPARED — DEPLOYMENT PENDING".

### 11. Local Build — PASS

- `npm ci --omit=dev`: Succeeds (production deps only)
- `npx prisma generate`: Succeeds (7.27s)
- Health endpoint test: HTTP 200 ✅
- All 61 tests: Pass ✅
- Docker build: Not available (Docker not installed) — Dockerfile syntax verified manually

---

## Deployment Status

**🟡 PREPARED — DEPLOYMENT PENDING**

No Railway project exists. No Railway credentials available. Repository is ready to be connected to Railway.

---

## Required Manual Steps

### From Railway Dashboard (5 minutes):

1. **Sign up:** Go to [railway.com](https://railway.com) → Sign up with GitHub (Free Trial, no credit card)

2. **Create project:** Click **New Project** → **Deploy from GitHub repo** → Select `ahmrf125ertg/404-coffee-backend`

3. **Add database:** In project dashboard → **New** → **Database** → **PostgreSQL** (auto-wires `DATABASE_URL`)

4. **Set variables:** Go to service → **Variables** → add:
   ```
   JWT_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
   JWT_REFRESH_SECRET=<generate: separate random hex>
   JWT_EXPIRES_IN=1h
   JWT_REFRESH_EXPIRES_IN=7d
   NODE_ENV=production
   CORS_ORIGINS=https://your-frontend.up.railway.app
   ```

5. **Wait for deploy:** Railway auto-deploys on push. First deploy takes ~2-3 minutes.

6. **Seed data:** Run `node prisma/seed.js` via Railway shell or one-off command.

7. **Verify:**
   ```
   curl https://<your-service>.up.railway.app/api/health
   # Expected: {"success":true,"message":"404 Coffee API is running"}
   ```

---

## Git Status

```
On branch master
nothing to commit, working tree clean

Latest commits:
  bed46ab feat: full employee auth & management API contract alignment
  c23e97b fix: use accurate audit action names for service requests
  827d2d5 feat: implement 5 API gap fixes — customer stats, soft-delete, table path, checkout response, service requests
  f898782 fix: resolve PrismaConfigEnvError blocking Railway deployment
  a3297d2 fix: preflight corrections before Railway deployment
```

All preflight corrections have been committed and pushed.
