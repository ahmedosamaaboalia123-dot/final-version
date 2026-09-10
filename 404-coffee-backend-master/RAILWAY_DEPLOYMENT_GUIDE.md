# RAILWAY DEPLOYMENT GUIDE — 404 Coffee Backend

## Railway Pricing (Verified September 2026)

| Plan | Monthly Fee | Included Usage | No Credit Card? |
|------|-------------|----------------|-----------------|
| **Free Trial** | $0 | $5 one-time credit (30 days) | ✅ Yes |
| **Free** | $0 | $1/month ongoing | Yes (after trial) |
| **Hobby** | $5 | $5/month included | Requires card |

**Free Trial** is the practical starting point: $5 in credits lasting 30 days, no card required. A small Express + PostgreSQL app typically costs ~$2-4/month, so the trial covers 1-2 months of continuous running. After the trial, the **Free** plan gives $1/month — enough for a minimal always-on service without a database, or a few hours/day with one.

**PostgreSQL** on Railway is a usage-based service (not a separate paid add-on). It consumes from your plan's included credits. A small 256 MB database costs ~$1-2/month.

**WebSocket support:** Full — no special config needed. Railway does not sleep or cold-start services on the Hobby plan. On the Free plan, services can be paused after inactivity.

## Prerequisites

1. GitHub repo: `https://github.com/ahmrf125ertg/404-coffee-backend`
2. Railway account: [railway.com](https://railway.com) (sign up for free Trial)

## Step 1: Create Railway Project

1. Go to [railway.com](https://railway.com) → **Login** → sign up with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select `ahmrf125ertg/404-coffee-backend`
4. Railway detects the `Dockerfile` and `railway.toml` automatically

## Step 2: Add PostgreSQL Database

1. In your project dashboard → **New** → **Database** → **PostgreSQL**
2. Railway provisions a PostgreSQL instance with a service name (e.g. `coffee-404-db`)
3. The PostgreSQL service automatically creates these variables: `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

## Step 3: Link DATABASE_URL to Your Backend Service (CRITICAL)

This is the step that caused the previous deployment failure. The PostgreSQL service creates its own `DATABASE_URL`, but your backend service needs to **reference** it — do NOT copy/paste the value.

### How to link variables between services:

1. Open your **backend service** (`404-coffee-backend`) in the project canvas
2. Go to the **Variables** tab
3. Add a new variable with this exact format:

```
DATABASE_URL=${{coffee-404-db.DATABASE_URL}}
```

**Important:**
- The service name (`coffee-404-db`) must match the **exact name** shown on your project canvas — case-sensitive
- If your PostgreSQL service has a different name (like `Postgres` or `postgres`), use that instead: `${{Postgres.DATABASE_URL}}`
- The `${{ }}` syntax is Railway's **variable reference** — it creates a live link, not a copy
- The PostgreSQL plugin auto-injects `DATABASE_URL` into the database service; your backend references it

### Verify the variable is linked:

1. In the backend service's **Variables** tab, you should see `DATABASE_URL` with a value that looks like a resolved PostgreSQL connection string (e.g. `postgresql://postgres:xxxxx@containers-us-west-xxx.railway.app:5432/railway`)
2. If it shows `${{coffee-404-db.DATABASE_URL}}` literally (unresolved), the service name is wrong — check the exact name on the project canvas

## Step 4: Set Other Environment Variables

Still in the backend service's **Variables** tab, add:

```
JWT_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_REFRESH_SECRET=<generate a separate random hex>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
NODE_ENV=production
CORS_ORIGINS=https://your-frontend.up.railway.app
```

**Do NOT set `PORT` manually** — Railway handles this automatically.

**Do NOT set `DATABASE_URL` as a plain value** — use the reference syntax from Step 3.

## Step 5: Trigger Redeploy

After setting variables:
1. Railway should auto-redeploy when variables change
2. If not, go to the **Deployments** tab → click **Redeploy**
3. Watch the build log — you should see:
   - `npm ci --omit=dev` ✓
   - `npx prisma generate` ✓
   - `npx prisma migrate deploy` ✓ (at container start)
   - `node src/server.js` ✓

### If you see this error again:
```
PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL
```
It means `DATABASE_URL` is still not available during the Docker build. This was a **code bug** (fixed in commit `a3297d2` and the upcoming fix) where `prisma.config.ts` tried to resolve `DATABASE_URL` at build time. After pulling the latest code with the fix, this error should not occur.

## Step 6: Seed Default Data

After the service is running (green status):

### Option A: Use the Railway Shell (Recommended)

1. Open your backend service → go to the **Settings** tab
2. Scroll to **Deploy** section → find **Shell** or **Console** button
3. In the shell, run:
   ```bash
   npx prisma migrate deploy
   node prisma/seed.js
   ```
4. You should see: `Seed user created: Admin (OWNER)` and `Default settings created`

### Option B: Use Railway CLI

```bash
# Install Railway CLI first
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run seed
railway run node prisma/seed.js
```

## Step 7: Verify

```bash
# Health check (replace with your actual service URL from Railway dashboard)
curl https://<your-service>.up.railway.app/api/health
# Expected: {"success":true,"message":"404 Coffee API is running"}

# Login test
curl -X POST https://<your-service>.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","password":"root123"}'
# Expected: {"success":true,"data":{"auth":{"access_token":"..."},...}}

# Swagger docs (open in browser)
# https://<your-service>.up.railway.app/api/docs
```

## Required Environment Variables

| Variable | Required | Source | Description |
|----------|----------|--------|-------------|
| `DATABASE_URL` | Yes | **Reference** `${{coffee-404-db.DATABASE_URL}}` | PostgreSQL connection string |
| `PORT` | Yes | Auto by Railway | Container port (do not set manually) |
| `JWT_SECRET` | Yes | Manual | 64-char random hex for access tokens |
| `JWT_REFRESH_SECRET` | Yes | Manual | 64-char random hex for refresh tokens |
| `JWT_EXPIRES_IN` | No | Manual (default: `1h`) | Access token expiry |
| `JWT_REFRESH_EXPIRES_IN` | No | Manual (default: `7d`) | Refresh token expiry |
| `NODE_ENV` | No | Manual (default: `development`) | Set to `production` |
| `CORS_ORIGINS` | No | Manual (default: `*`) | Comma-separated allowed origins |
| `DEEPSEEK_API_KEY` | No | Manual | For AI chat feature |
| `DEEPSEEK_MODEL` | No | Manual (default: `deepseek-chat`) | AI model name |

## Troubleshooting

### "Cannot resolve environment variable: DATABASE_URL" during build
This was the original crash. It was caused by `prisma.config.ts` using Prisma's `env("DATABASE_URL")` helper which throws when the variable isn't available at Docker build time. Fixed in the latest commit by using `process.env.DATABASE_URL || ""` instead. Pull the latest `master` and redeploy.

### Build succeeds but app crashes on start
- Check that `DATABASE_URL` is linked (Step 3), not just set as a static value
- Verify the PostgreSQL service is running (green status in the canvas)

### "P1000: Authentication failed against database server"
- The `DATABASE_URL` reference is resolving but the database isn't ready yet
- Wait 30 seconds and redeploy — PostgreSQL takes time to initialize on first provision

### Service name mismatch
- The `${{SERVICE_NAME.DATABASE_URL}}` reference uses the **exact service name** from the project canvas
- If you named the database "Postgres" (default), use `${{Postgres.DATABASE_URL}}`
- If you renamed it to "coffee-404-db", use `${{coffee-404-db.DATABASE_URL}}`

## Railway-Specific Notes

### No Sleep/Cold-Start on Hobby
Railway's Hobby plan ($5/mo) keeps services always-on. No spin-down, no cold starts. This is a significant advantage over Render's free tier (15-min spin-down).

### WebSocket Support
Railway supports WebSocket connections natively. No special configuration needed — Socket.IO works out of the box.

### Database Persistence
Railway PostgreSQL databases persist as long as the project exists. No 30-day expiry like Render's free tier.

### Auto-Deploy from Git
Railway re-deploys on every push to `master`. The Dockerfile runs `prisma migrate deploy` before starting the server, so schema changes are applied automatically.

### Free Plan Limitations
- $1/month included usage — a small app with PostgreSQL may exceed this
- Services can be paused after inactivity on the Free plan
- No custom domains on Free plan
- 1 project, 3 services max

### Cost Estimate
A typical Express + PostgreSQL app on Railway:
- **Hobby plan ($5/mo):** ~$2-4/month total (app + database) — fits within $5 included credits
- **Free plan ($0):** May work if usage stays under $1/month — tight with a database

## Production Checklist

- [ ] Generate strong JWT secrets (not defaults)
- [ ] Set `NODE_ENV=production`
- [ ] Link `DATABASE_URL` using `${{coffee-404-db.DATABASE_URL}}` reference syntax
- [ ] Configure `CORS_ORIGINS` for your frontend domain
- [ ] Seed default data: `node prisma/seed.js`
- [ ] Test health endpoint
- [ ] Test login with Admin/root123
- [ ] Verify WebSocket connection

## Alternative: Render

If you prefer Render (free tier, no credit card), see [RENDER_DEPLOYMENT_GUIDE.md](RENDER_DEPLOYMENT_GUIDE.md). The repo includes `render.yaml` for one-click Render Blueprint deploy. Note Render's free tier has a 15-min spin-down and 30-day database expiry.

## Backend URL

After deployment:
```
https://<your-service>.up.railway.app
```

API base: `https://<your-service>.up.railway.app/api`
Swagger docs: `https://<your-service>.up.railway.app/api/docs`
