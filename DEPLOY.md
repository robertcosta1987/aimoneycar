# Moneycar AI — Deployment Guide

This document explains how to deploy the full stack to a public URL. Every piece runs on a managed service — no servers to maintain.

---

## Architecture Overview

```
Browser
  └── Vercel (Next.js app + API routes + Cron)
        ├── Supabase (Postgres + Auth + Storage)
        ├── Anthropic API (Claude AI)
        └── Evolution API server (WhatsApp, self-hosted)
```

| Layer | Service | Where it runs |
|---|---|---|
| Frontend + API | Next.js 14 | Vercel |
| Database + Auth + Storage | Supabase | Supabase Cloud |
| AI chat + alert generation | Claude API | Anthropic API |
| WhatsApp messages | Evolution API | Railway / VPS |
| Daily alert cron | Vercel Cron | Vercel (built-in) |

---

## Step 1 — Set Up Supabase

### 1.1 Create a project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose a name (e.g. `moneycar-prod`), set a database password, pick the region closest to Brazil (e.g. **South America (São Paulo)**)
3. Wait ~2 min for provisioning

### 1.2 Run the database migration

1. In your Supabase dashboard, open **SQL Editor**
2. Copy the entire contents of [`packages/database/migrations/001_initial.sql`](packages/database/migrations/001_initial.sql)
3. Paste and click **Run**

This creates all tables, RLS policies, the `get_dashboard_stats` function, and the `uploads` storage bucket.

### 1.3 Collect your keys

In your Supabase dashboard → **Settings → API**:

| Key | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (keep secret) |

### 1.4 Enable email auth

**Authentication → Providers → Email** — enable it. For production:
- Turn off **Confirm email** during initial testing, re-enable before launch
- Set **Site URL** to your Vercel domain (e.g. `https://moneycar.vercel.app`) once you have it

---

## Step 2 — Get an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. **API Keys → Create Key**
3. Copy the key — it starts with `sk-ant-`
4. Add billing. The app uses:
   - **Claude Sonnet** (`claude-sonnet-4-20250514`) for AI chat
   - **Claude Haiku** (`claude-haiku-4-5-20251001`) for daily alert generation (much cheaper)

Estimated cost for a single dealership: ~$2–5/month at normal usage.

---

## Step 3 — Deploy Evolution API for WhatsApp (Optional)

Skip this step if you don't need WhatsApp alerts. The app works fully without it.

Evolution API is an open-source WhatsApp gateway that runs as a Docker container. Each dealership connects their own WhatsApp number by scanning a QR code.

### 3.1 Deploy on Railway (recommended)

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from image**
2. Image: `atendai/evolution-api:latest`
3. Set environment variables:

```
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=your-strong-random-key-here
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
DATABASE_ENABLED=false
REDIS_ENABLED=false
LOG_LEVEL=ERROR
DEL_INSTANCE=false
```

4. Railway will assign a public URL like `https://evolution-api-production-xxxx.up.railway.app`
5. Set **Generate Domain** → copy the URL

### 3.2 Test it

```bash
curl https://your-evolution-url.railway.app/instance/fetchInstances \
  -H "apikey: your-strong-random-key-here"
```

Should return `[]` (empty array — no instances yet).

### 3.3 Connect a dealership's WhatsApp

Each dealership owner connects their number once, from the **Configurações** page in the dashboard (or via the API):

```bash
# Create instance
curl -X POST https://your-evolution-url/instance/create \
  -H "apikey: your-key" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "tenant-revenda-demo", "qrcode": true}'

# Get QR code to scan
curl https://your-evolution-url/instance/connect/tenant-revenda-demo \
  -H "apikey: your-key"
```

The `instanceName` must match the value stored in the dealership's `settings.evolution_instance_name` field in the database.

---

## Step 4 — Deploy to Vercel

### 4.1 Push to GitHub

```bash
cd /Users/robertcosta/claude/projects/moneycar
git init
git add .
git commit -m "Initial Moneycar AI"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USER/moneycar-ai.git
git push -u origin main
```

### 4.2 Import into Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project → Import Git Repository**
2. Select your `moneycar-ai` repo
3. Vercel will detect it as a monorepo

**Configure the project:**
- **Framework Preset**: Next.js
- **Root Directory**: `apps/web` ← critical, change this
- **Build Command**: leave as default (`next build`)
- **Output Directory**: leave as default (`.next`)
- **Install Command**: `pnpm install`

### 4.3 Set environment variables in Vercel

Go to **Settings → Environment Variables** and add all of these:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | From Step 1.3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | From Step 1.3 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | From Step 1.3, mark as **Secret** |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | From Step 2, mark as **Secret** |
| `EVOLUTION_API_URL` | `https://your-evolution.railway.app` | From Step 3.1, omit if skipping WhatsApp |
| `EVOLUTION_API_KEY` | your key | From Step 3.1, mark as **Secret** |
| `CRON_SECRET` | any random string | Generate with `openssl rand -hex 32` |

Set all variables for **Production**, **Preview**, and **Development** environments.

### 4.4 Deploy

Click **Deploy**. First build takes ~2 min.

Once deployed, Vercel gives you a URL like `https://moneycar-ai.vercel.app`. This is your public app.

### 4.5 Update Supabase with your Vercel URL

Back in Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://moneycar-ai.vercel.app`
- **Redirect URLs**: `https://moneycar-ai.vercel.app/**`

---

## Step 5 — Seed Demo Data (Optional)

To create a demo dealership and test vehicles:

```bash
cd /Users/robertcosta/claude/projects/moneycar/packages/database

# Install ts-node if needed
pnpm add -D ts-node

# Set env vars and run
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npx ts-node --esm seed.ts
```

This creates:
- 1 dealership: "Revenda Demo"
- 6 vehicles (various states)
- 5 expenses
- 1 sample sale

---

## Step 6 — Create the First Real User

The register page at `/register` creates both a Supabase Auth user and a dealership in one step.

1. Visit `https://your-app.vercel.app/register`
2. Fill in name, email, password, and dealership name
3. You'll be redirected to `/dashboard`

---

## Step 7 — Verify the Cron Job

The daily alert cron runs at 11:00 UTC (08:00 São Paulo time) every day via `vercel.json`.

**Test it manually:**

```bash
curl -X GET https://your-app.vercel.app/api/cron/daily-alerts \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{"processed": 1, "results": [{"dealership": "Revenda Demo", "alerts": 3, "whatsapp": false}]}
```

In the Vercel dashboard → **Settings → Cron Jobs** you can see the schedule and trigger it manually.

---

## Custom Domain

1. In Vercel → **Settings → Domains** → add your domain (e.g. `app.moneycar.ai`)
2. Add the DNS records Vercel shows you at your domain registrar
3. Update the Supabase **Site URL** and **Redirect URLs** to use the new domain

---

## Environment Summary

| What | Where | URL pattern |
|---|---|---|
| App (frontend + API) | Vercel | `https://your-app.vercel.app` |
| Database / Auth | Supabase | `https://xxxx.supabase.co` |
| File uploads | Supabase Storage | Auto, via SDK |
| AI (Claude) | Anthropic API | API calls from server |
| WhatsApp gateway | Railway | `https://xxxx.up.railway.app` |
| Cron (daily alerts) | Vercel built-in | Triggers `/api/cron/daily-alerts` |

---

## Troubleshooting

**Build fails on Vercel**
- Confirm **Root Directory** is set to `apps/web` in project settings
- Check that all `NEXT_PUBLIC_*` env vars are set (they're embedded at build time)

**Login redirects loop**
- Supabase **Site URL** must match your Vercel domain exactly (no trailing slash)
- Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct

**Dashboard shows no data**
- Run the migration from Step 1.2 — tables must exist before the app runs
- Check the browser console for Supabase errors (usually a missing RLS policy or wrong key)

**WhatsApp messages not sending**
- Verify `EVOLUTION_API_URL` has no trailing slash
- Check that the instance is connected (state = `open`) by calling `/instance/connectionState/{instanceName}`
- The phone number in the dealership record must include the area code (e.g. `11999999999`)

**Cron job not running**
- Vercel Cron requires a **Pro plan** or higher for cron jobs on custom schedules; the Hobby plan only runs crons at hourly intervals
- Verify `CRON_SECRET` in Vercel env vars matches what you use to test manually
