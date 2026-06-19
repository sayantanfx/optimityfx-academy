# Deploying academy.optimityfx.com

This is the **NextGen Academy** site — a single-vertical (Educational Courses) site,
split out of `digital.optimityfx.com` so payment-gateway approval covers one
business category only. Static HTML + serverless functions in `/api` (Vercel).

---

## 1. Create the GitHub repo & push

The folder is already git-initialized and committed locally (branch `main`).

```bash
cd "academy"
# Create an EMPTY repo on github.com named: optimityfx-academy  (no README)
git remote add origin https://github.com/sayantanfx/optimityfx-academy.git
git push -u origin main
```

> Do **not** embed a personal access token in the remote URL. Use SSH
> (`git@github.com:sayantanfx/optimityfx-academy.git`) or `gh auth login`.

## 2. Connect to Vercel

- Vercel dashboard → **Add New → Project → Import** `sayantanfx/optimityfx-academy`
- Framework preset: **Other** (static HTML + `/api` functions)
- Build command: none · Output dir: default (root)

## 3. Environment variables

Set these in Vercel → Project → Settings → Environment Variables. The
functions in `/api` read them from `process.env`.

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://odcqkutaindtzbjrncdl.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (server-only secret) |
| `RAZORPAY_KEY_ID` | `rzp_test_…` for now · swap to `rzp_live_…` after approval |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard → API Keys (server-only secret) |

(Same variables as the `digital` project — copy them across. Swap the
gateway env vars if/when you move off Razorpay, e.g. to Cashfree.)

## 4. Add the custom domain

- Vercel → Project → **Settings → Domains → Add** `academy.optimityfx.com`
- At your DNS provider add the record Vercel shows:
  - **Type:** CNAME · **Name:** `academy` · **Value:** `cname.vercel-dns.com`
- Wait for verification (usually minutes).

## 5. Submit to the payment gateway

Submit **academy.optimityfx.com** as a single vertical: **Educational Courses**.
Keep **digital.optimityfx.com** as a separate submission: **Digital Products**.
Never list multiple verticals on either site — that's what triggers rejection.

---

## Client config

`js/config.js` holds the public (safe-to-expose) values:
- `supabaseUrl`, `supabaseKey` (anon key)
- `razorpayKey` — public test/live key id
- `siteUrl` — `https://academy.optimityfx.com`

The **secret** keys (service role, Razorpay secret) live only in Vercel env vars,
never in the repo.
