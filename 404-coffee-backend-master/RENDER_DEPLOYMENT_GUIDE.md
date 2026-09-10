# RENDER DEPLOYMENT GUIDE — 404 Coffee Backend

## Prerequisites

1. GitHub repo: `https://github.com/ahmrf125ertg/404-coffee-backend`
2. Render account (free tier OK, no credit card required)

## Option A: One-Click Deploy (render.yaml)

The repo includes a `render.yaml` that provisions everything automatically:

1. Go to [render.com/new](https://render.com/new)
2. Select **Blueprint** → connect your GitHub repo
3. Render detects `render.yaml` and provisions:
   - Web Service (Node.js, free tier)
   - PostgreSQL database (free tier, 30-day expiry)
   - Environment variables (auto-generated JWT secrets)
4. Click **Apply** → deployment starts (~2-3 min)

After deploy, seed the database:
1. Go to your Web Service → **Shell** tab
2. Run: `node prisma/seed.js`

## Option B: Manual Setup

### Step 1: Create PostgreSQL Database

1. Render Dashboard → **New** → **PostgreSQL**
2. Name: `coffee-404-db`
3. Plan: **Free** (256 MB RAM, expires after 30 days)
4. Copy the **Internal Database URL**

### Step 2: Create Web Service

1. Render Dashboard → **New** → **Web Service**
2. Connect GitHub: `ahmrf125ertg/404-coffee-backend`
3. Settings:
   - **Name:** `404-coffee-backend`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy`
   - **Start Command:** `node src/server.js`
   - **Plan:** Free

### Step 3: Environment Variables

Add in the **Environment** tab:

```bash
# Database (use Internal URL from Step 1)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# JWT — Generate strong secrets:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<64-char-random-hex>
JWT_REFRESH_SECRET=<64-char-random-hex>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=5000
NODE_ENV=production

# CORS (your frontend URL, comma-separated for multiple)
CORS_ORIGINS=https://your-frontend.onrender.com

# AI Chat (optional)
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_MODEL=deepseek-chat
```

### Step 4: Deploy & Seed

1. Click **Create Web Service** → auto-deploys from `master`
2. After deploy, go to **Shell** tab → run: `node prisma/seed.js`

## Step 5: Verify

```bash
# Health check
curl https://404-coffee-backend.onrender.com/api/health
# Expected: {"success":true,"message":"404 Coffee API is running"}

# Login
curl -X POST https://404-coffee-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","password":"root123"}'
# Expected: {"success":true,"data":{"auth":{"access_token":"..."},...}}
```

## Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | 64-char random hex for access tokens |
| `JWT_REFRESH_SECRET` | Yes | — | 64-char random hex for refresh tokens |
| `JWT_EXPIRES_IN` | No | `1h` | Access token expiry |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token expiry |
| `PORT` | No | `5000` | Server port (Render sets this automatically) |
| `NODE_ENV` | No | `development` | Set to `production` |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `DEEPSEEK_API_KEY` | No | — | For AI chat feature |
| `DEEPSEEK_MODEL` | No | `deepseek-chat` | AI model name |

## Free Tier Limitations

- **Spin-down:** Service sleeps after 15 min inactivity (~30s cold start)
- **Database expiry:** Free PostgreSQL expires after 30 days (14-day grace period)
- **Hours:** 750 free instance hours/month
- **WebSocket:** Connections drop when service sleeps

## Production Checklist

- [ ] Generate strong JWT secrets (not defaults)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ORIGINS` for your frontend domain
- [ ] Run `prisma migrate deploy` after schema changes
- [ ] Seed default data: `node prisma/seed.js`
- [ ] Test health endpoint
- [ ] Test login with Admin/root123

## Backend URL

After deployment:
```
https://404-coffee-backend.onrender.com
```

API base: `https://404-coffee-backend.onrender.com/api`
Swagger docs: `https://404-coffee-backend.onrender.com/api/docs`
