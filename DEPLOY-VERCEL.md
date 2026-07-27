# Deploy a shareable test link — Vercel + Neon (free)

Goal: a public `https://…vercel.app` link you can send someone to test. ~5 minutes.
The app is already Vercel-ready (`build` runs `prisma generate`, config drops
`output: standalone` on Vercel automatically).

You're already logged into the Vercel CLI as **janithaprathapa96-5292**.

> ⚠️ The linked project `bubbly_pet_grooming` currently serves your **marketing
> site**. Deploying this full app there **overwrites that URL**. Recommended:
> deploy this as a **new project** (step 3) so the marketing site stays untouched.

---

## 1) Create a free Postgres (Neon)

**Easiest — via Vercel Marketplace (auto-wires the env var):**
1. https://vercel.com/dashboard → **Storage** → **Create Database** → **Neon** (Postgres)
2. Pick the free plan, create it, and **connect it to the project** you'll deploy.
   Vercel adds `DATABASE_URL` to the project automatically.

**Or manual — neon.tech:**
1. Sign up at https://neon.tech → create a project → copy the **connection string**.
   Use the **direct** (non-pooled) string for a test — simplest, no pgbouncer flags.
   It looks like: `postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require`

---

## 2) Set the environment variables

If you used the Marketplace, `DATABASE_URL` is already set — add the other three.
Run each and paste the value when prompted (choose **Production**):

```bash
vercel env add DATABASE_URL production        # only if not auto-added by Neon
vercel env add AUTH_SECRET production          # paste: 3ic7QreBn2o5aFPL7Tn6mMMmqm86B1ZuNmbNbMYBuKw=
vercel env add SEED_ADMIN_EMAIL production      # e.g. admin@bubblypup.lk
vercel env add SEED_ADMIN_PASSWORD production   # a password you'll remember
```

---

## 3) Deploy

**As a NEW project (keeps your marketing site safe) — recommended:**
```bash
# temporarily unlink the marketing-site project, then deploy fresh:
rm -rf .vercel
vercel --prod        # answer: set up & deploy? Y → new project name e.g. bubbly-pup-app
```
(Re-add the env vars from step 2 if you made a brand-new project, then
`vercel --prod` again.)

**Or overwrite the existing project:**
```bash
vercel --prod
```

Vercel prints the live URL, e.g. `https://bubbly-pup-app.vercel.app`.

---

## 4) One-time: create tables + seed the admin login

The Vercel build doesn't run migrations. Do it once from your machine, pointed at
the hosted DB (use the Neon **direct** connection string):

```bash
# Windows PowerShell:
$env:DATABASE_URL="postgresql://…neon…/neondb?sslmode=require"
npm run db:deploy      # create all tables
npm run db:seed        # packages, add-ons, settings, admin user
```
(Use the same `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` you set on Vercel, or set
them in this shell before seeding.)

---

## 5) Share it

- Send the `…vercel.app` link.
- Admin: `…vercel.app/admin` → log in with the seed email/password.
- The tester can book on the home page; you manage it in `/admin`.

---

---

## Later: mapping a custom domain (no code changes)

The app uses only relative URLs + env config, so a domain is DNS + settings only.

**On Vercel:** Project → **Settings → Domains** → add `bubblypup.lk` → follow the
DNS instructions (A/CNAME) at your registrar. Vercel issues HTTPS automatically and
admin actions keep working (same-origin) — nothing else to change. Optionally set
`SITE_URL=https://bubblypup.lk` for polished social-share previews.

**On the VPS/Docker path:** in `.env.production` set `DOMAIN`, plus
`ALLOWED_ORIGINS=bubblypup.lk,www.bubblypup.lk` (required behind the Caddy proxy so
admin Server Actions aren't rejected) and `SITE_URL=https://bubblypup.lk`, then
redeploy. Caddy fetches the cert automatically.

Either way: **your data and app don't change** — same database, same code, just a
nicer address in front. Nothing here breaks when you go to production.

### Notes
- **Free tier is fine for testing.** Neon free auto-suspends when idle (first
  request after a pause is a bit slow) and Vercel has serverless cold starts —
  both harmless for a demo.
- **WhatsApp** still uses free wa.me one-tap send (works the same on the live URL).
- For always-on **production**, use the VPS + Docker path in `BACKEND.md` instead.
