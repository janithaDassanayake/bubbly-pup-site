# Bubbly Pup — Appointment Management System (backend + admin)

Full-stack **Next.js (App Router) + PostgreSQL + Prisma**. Implements the complete
`new_advance_task.md` spec, **cost-optimized** to run on a single small VPS
(app + Postgres + Caddy + daily backup, all in Docker). No separate Java service,
no paid WhatsApp API, no managed database — one ~$5/mo box runs everything.

## Build phases — all complete ✅

| Phase | Scope | Status |
|------|-------|--------|
| 1 | Data model, booking engine (durations/overlap), seed, booking APIs | ✅ |
| 2 | Customer form wired to real availability + booking API (persists + prevents double-booking) | ✅ |
| 3 | Admin portal: JWT auth, dashboard, appointments, pending-confirmation, customers/pets, payments, reports, settings, WhatsApp | ✅ |
| 4 | WhatsApp notifications (free wa.me) + audit log + auto thank-you on completion | ✅ |
| 5 | Dockerized VPS deploy (Caddy auto-HTTPS + migrate-on-boot + daily backup) | ✅ |

## What the system does

**Customer site** (`/`) — the marketing page's booking form now talks to the
backend: picking a package + date fetches **real, conflict-free time slots**, and
submitting **persists the appointment** (status `Pending Confirmation`), queues a
WhatsApp confirmation, then hands off to WhatsApp. If the backend is unreachable it
still falls back to the WhatsApp message so a booking is never lost.

**Admin portal** (`/admin`, login required):

| Page | Purpose |
|---|---|
| Dashboard | Today's counts, revenue, today's schedule, upcoming |
| Appointments | Filter by date/status/search; drive the full status lifecycle inline |
| Pending Confirmation | Today / Tomorrow / Next 2 Days / custom range; Call + WhatsApp buttons; Confirm / Not Sure / Cancel (cancel frees the slot instantly) |
| Customers & Pets | Search; per-customer visit history, pets, totals |
| Payments | Record cash/card/bank payment for in-salon visits; recent payments |
| Reports | Revenue, popular packages, frequent customers, payment summary, over any range |
| WhatsApp | Message queue + audit log; one-tap send; sent/pending/failed |
| Settings | Business hours, opening days, holidays, slot step, lead time, package prices |

## Local development

### Option A — no Docker, no install (recommended for a quick local test)

`npm run db:local` starts a **real PostgreSQL** on `localhost:5432` using a bundled
binary — no Docker, no system install. Data persists in `./.devdb`.

```bash
cp .env.example .env          # already points at localhost:5432/bubbly
npm install
npm run db:local              # ── terminal 1: leave this running
# then in a SECOND terminal:
npm run db:migrate            # create the tables
npm run db:seed               # packages, add-ons, settings, first admin
npm run dev                   # http://localhost:3000   → /admin for the portal
```

Log in at `/admin` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`
(default `admin@bubblypup.lk` / `ChangeMe123!`). Stop the DB with Ctrl+C in terminal 1.

### Option B — Docker or a hosted DB

```bash
cp .env.example .env
npm install
npm run db:up                 # local Postgres in Docker (or point DATABASE_URL at Neon)
npm run db:migrate && npm run db:seed && npm run dev
```

## Key modules

- `lib/booking-engine.ts` — pure duration/overlap/slot logic (unit-testable, no DB).
- `lib/status.ts` — appointment lifecycle: labels, colours, allowed transitions.
- `lib/whatsapp.ts` — free wa.me link + message composers (booking + thank-you).
- `lib/auth.ts` / `middleware.ts` — jose JWT cookie; Edge middleware guards `/admin/*`.
- `app/admin/actions.ts` — server actions: status changes, payments, settings (all audited).
- `app/api/availability` · `app/api/bookings` — public booking APIs (overlap-safe, transactional).

## WhatsApp = $0 (design choice)

For ~10 customers/day the **Meta Cloud API's per-conversation billing and Business
verification aren't worth it**. Instead the system **composes and logs every
message** (Notification table = audit trail, per the spec) and the owner **sends it
with one tap** via a `wa.me` link. Fully free, no approval, swappable for the Cloud
API later without touching callers.

---

# Production deploy (single VPS)

One command brings up **Caddy (auto-HTTPS) → Next.js app → Postgres**, plus a
migrate-on-boot step and a daily backup loop.

```bash
# On any Ubuntu VPS with Docker + Docker Compose installed:
git clone <repo> && cd bubbly_pet_grooming
cp .env.production.example .env.production      # fill in real secrets + DOMAIN
#   point DOMAIN's DNS A-record at the VPS IP FIRST (Caddy needs it for the cert)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

That's it — Caddy fetches a free Let's Encrypt cert for `DOMAIN`, migrations run,
the seed creates the first admin, and the site is live on HTTPS.

**Stack pieces**
- `Dockerfile` — 3-stage build → small `output: "standalone"` runtime image.
- `docker-compose.prod.yml` — `db`, one-shot `migrate`, `app`, `caddy`, `backup`.
- `Caddyfile` — auto-HTTPS reverse proxy.
- `backup` service — daily `pg_dump | gzip` into `./backups`, keeps 14 days.

**Restore a backup**
```bash
gunzip -c backups/bubbly-YYYY-MM-DD_HHMM.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U bubbly -d bubbly
```

**Updates** — `git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` (migrations re-run automatically; seed is idempotent).

---

# Cost breakdown (why this is the cheap path)

| Item | This solution | Spec's original stack | Saving |
|---|---|---|---|
| Compute | 1× small VPS, 2 vCPU / 2 GB (Hetzner CX22 ~€4.5, Lightsail $5, DigitalOcean $6) | Same VPS **+** separate Java runtime footprint | Runs the whole app in one Node process |
| Backend runtime | Next.js API routes (same process as frontend) | Separate Java Spring Boot service | No second service to host/maintain |
| Database | Postgres container on the same box | Same, or managed ($15–50/mo) | $0 extra vs. managed DB |
| Reverse proxy / TLS | Caddy (auto Let's Encrypt) | Nginx + manual certbot | Less setup, same $0 |
| WhatsApp | Free wa.me click-to-chat | Meta Cloud API (per-conversation fees) | $0 recurring messaging |
| Backups | pg_dump cron in a container | External backup service | $0 |
| **Typical total** | **≈ $5–6 / month** | $20–70+ / month | — |

Sized for the spec's ~10 (up to ~30) appointments/day. If the salon grows, the same
image lifts to a managed Postgres (Neon/RDS) or a bigger VPS by changing only
`DATABASE_URL` — no code changes.
