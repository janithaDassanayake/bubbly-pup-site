# Tech Stack — Bubbly Pup Pet Grooming

One Next.js app doing two jobs: a **customer website** with an online booking form,
and a password-protected **Appointment Management System** for the salon.

- **Live:** https://bubbly-pup-app.vercel.app · admin at `/admin`
- **Local:** http://localhost:3000

---

## At a glance

| Layer | Choice |
|---|---|
| Framework | Next.js 15.5 (App Router) |
| Language | TypeScript 5.7 |
| UI | React 19.1 |
| Styling | Plain CSS Modules — no Tailwind/Bootstrap |
| Animation | GSAP 3.15 + Lenis 1.3 (smooth scroll) |
| Backend | Next.js Route Handlers + Server Actions (same app) |
| ORM | Prisma 6.19 |
| Database | PostgreSQL 18.4 — same version locally and on Neon |
| Auth | `jose` JWT in an HTTP-only cookie + `bcryptjs` |
| Validation | Zod 4.4 |
| File storage | AWS S3 (private bucket, presigned links) |
| Messaging | WhatsApp via free `wa.me` links |
| Hosting | Vercel (app) + Neon (database) |
| Runtime | Node.js 24 |

Everything runs in **one deployable unit** — there is no separate backend service.

---

## Frontend

**Next.js App Router** with React Server Components by default; `"use client"`
only where interaction demands it (booking form, admin action buttons, filters).

- **Styling** — CSS Modules per component (`Booking.module.css`, etc.) plus one
  global admin stylesheet, `app/admin/admin.css`, entirely namespaced `.adm-`.
  No CSS framework: the design is bespoke, so a utility library would have been
  weight without benefit.
- **Fonts** — Poppins from Google Fonts, preconnected in the root layout.
- **Motion** — GSAP for scroll-triggered reveals, Lenis for smooth scrolling.
- **Images** — `next/image` over assets in `public/media`.
- **Mobile-first** — the salon works phone-in-hand. Admin tables collapse into
  cards below 767px (`adm-cards` + `data-label` on every cell).

**Customer components** (`components/`): `Hero`, `Packages`, `PriceList`,
`HowWeGroom`, `ValueProps`, `Explainers`, `Testimonials`, `StorePromo`,
`Footer`, `Navbar`, `FloatingWhatsApp`, and `Booking` — the reservation form.

### Reservation form rules

- **Order is date → slots → time.** The slot dropdown stays disabled until a date
  is chosen ("Pick a date first"), because availability is per-date. Slots come
  live from `/api/availability`, so booked times are never offered.
- **Aggressive-dog consent gate.** Answering *Yes* opens a notice about the risks
  of grooming an aggressive or anxious dog, with a **required checkbox**;
  *Agree & continue* stays disabled until it's ticked, and dismissing the notice
  leaves the answer unset. `"Yes"` therefore can never be recorded without
  consent, and the saved pet notes read
  `Aggressive: Yes (owner accepted grooming conditions)` so the salon has a record
  rather than just a UI gate. A submit-time backstop re-opens the notice if the
  value is somehow set without acceptance.

---

## Admin portal

| Page | Purpose |
|---|---|
| `/admin` | Dashboard — today at a glance |
| `/admin/appointments` | All bookings, live filters, status actions |
| `/admin/appointments/new` | **Manual booking** — walk-ins and phone bookings |
| `/admin/pending` | Bookings awaiting confirmation |
| `/admin/customers` · `/[id]` | Customer directory and history |
| `/admin/payments` | Record and review payments |
| `/admin/reports` | Revenue and activity |
| `/admin/whatsapp` | Every composed message, ready to send |
| `/admin/settings` | Hours, working days, holidays, prices |

**Manual booking** mirrors the customer flow deliberately — service → date →
slots free on that date → customer → pet — so the salon sees exactly the
availability a customer would. It re-checks availability *inside the
transaction* using the same `validateBooking`, so a phone booking cannot collide
with a website booking made a second earlier. Typing a known phone number pulls
back the customer and their pets, so repeat clients are never duplicated; an
existing pet is only reused after confirming it belongs to that customer.

Status can be set at creation — *Confirmed* (booked by phone), *Pending
confirmation*, or *Arrived* (walk-in standing there now) — and the
confirmation WhatsApp is queued to match, so a phone booking is never told it's
"pending confirmation".

---

## Backend

No separate server. Two mechanisms, chosen by who is calling:

**Route Handlers** — public/JSON endpoints:

| Route | Purpose |
|---|---|
| `GET /api/availability` | Free time slots for a date + package |
| `POST /api/bookings` | Create a booking (overlap-checked, transactional) |
| `POST /api/admin/login` · `/logout` | Admin auth |
| `POST /api/admin/photos` | Grooming photo upload → S3 |
| `GET /p/[id]` | Public photo link → redirects to a signed S3 URL |

**Server Actions** (`app/admin/actions.ts`) — admin mutations. Each re-checks
auth and writes an `AuditLog` row, so every change is attributable.

| Action | Does |
|---|---|
| `changeStatus` | Move along the lifecycle; queues the confirmation / thank-you WhatsApp |
| `createAppointment` | Manual booking (walk-in / phone), same overlap rules as the public API |
| `findCustomerByPhone` | Look up a repeat customer + their pets so nothing is retyped |
| `recordPayment` | Settle a payment and advance to PAID |
| `markNotificationSent` | Record that a WhatsApp message was sent |
| `updateSettings` · `updatePackage` | Business hours, prices, durations |
| `completionMessage` | Rebuild the before/after message for a re-send |

### Business logic (`lib/`)

Kept out of components so it stays testable and reusable:

| Module | Responsibility |
|---|---|
| `booking-engine.ts` | Pure duration/overlap/slot maths — the core rules |
| `status.ts` | Appointment lifecycle: labels, colours, allowed transitions |
| `whatsapp.ts` | Message composition + `wa.me` link building |
| `whatsapp-send.ts` | Optional Meta Cloud API auto-send |
| `auth.ts` / `session.ts` | JWT sign/verify, `requireAdmin()` |
| `s3.ts` | S3 client, key naming, presigned URLs |
| `settings.ts`, `catalog.ts`, `admin-data.ts`, `booking-map.ts` | Config, catalog, queries, mapping |
| `time.ts`, `format.ts` | Salon-timezone dates, LKR formatting |
| `image-client.ts`, `collage-client.ts`, `share-client.ts` | Browser-only: compress, composite, share |

**Overlap prevention is the central rule.** Intervals are half-open, so a
10:00–12:00 booking leaves 12:00 free. It is enforced server-side inside a
transaction — never trusted to the UI. Booking the same slot twice returns
**409 "That time slot is already booked"**, whether it came from the website or
the admin portal.

**Past dates are refused** by `validateBooking` and `generateSlots` via a
`todayISO` check. This is easy to get wrong: the lead-time rule only receives
`nowMin` when the date *is* today, so an earlier date used to skip validation
entirely and book successfully. The date picker's `min` attribute hid it in the
UI, but a direct API call got through.

---

## Database

**PostgreSQL** via **Prisma**. Schema in `prisma/schema.prisma`, seeded by
`prisma/seed.ts`.

| Model | Holds |
|---|---|
| `Package` | Packages and standalone services, each with its own duration/price |
| `AddOn` | À-la-carte extras |
| `Customer` / `Pet` | Owners and their dogs |
| `Appointment` | The booking: date, start/end minutes, status, price estimate |
| `AppointmentPhoto` | Before/after photo metadata — S3 key only, not the image |
| `Payment` | Amount, method, paid date |
| `Notification` | Every WhatsApp message composed, sent or pending (audit trail) |
| `Settings` | Opening hours, working days, holidays, slot step, lead time |
| `AdminUser` | Single salon admin, bcrypt hash |
| `AuditLog` | Who changed what, when |

**Enums:** `AppointmentStatus`, `PhotoKind`, `PaymentMethod`, `PaymentStatus`,
`NotificationType`, `NotificationStatus`, `PetGender`.

**Appointment lifecycle**

```
PENDING_CONFIRMATION ─┬─> CONFIRMED ─┬─> ARRIVED ─┬─> GROOMING_STARTED ──> COMPLETED
                      ├─> NOT_SURE   │            └─> COMPLETED
                      ├─> CANCELLED  ├─> GROOMING_STARTED
                      └─> NO_SHOW    └─> COMPLETED

CANCELLED / NO_SHOW release the slot back to availability.
PAID ──> COMPLETED.  GROOM_FINISHED exists for the parked photo flow.
```

A confirmed booking can jump straight to **Grooming Started** or **Paid &
Completed** — on a busy day the salon shouldn't have to tap through *Arrived*
just to record what already happened.

Transitions are validated server-side — a stale browser tab cannot skip a step.
**Paid & Completed** is one action: it settles the payment at the price estimate
and completes the visit.

---

## Authentication

Single admin account. Login verifies a **bcrypt** hash, then issues a **`jose`**
JWT stored in the `bp_admin` **HTTP-only** cookie (12h).

- `middleware.ts` guards `/admin/:path*` on the Edge runtime and redirects
  unauthenticated visitors to the login page.
- Every page and action additionally calls `requireAdmin()` — defence in depth,
  so a middleware misconfiguration alone can't expose data.

---

## File storage — AWS S3

Grooming photos live in a **private** S3 bucket (`ap-southeast-1`). Nothing is
publicly readable.

- **Upload** — the browser compresses the photo (~1280px JPEG, ~200 KB), posts it
  to `/api/admin/photos`, and the server forwards it to S3. Same-origin, so no
  bucket CORS rule is needed.
- **Viewing** — `/p/<photoId>` mints a fresh presigned URL on each visit and
  redirects. Links shared with customers keep working while the bucket stays shut.
- **Access** — an IAM user scoped to `PutObject`/`GetObject`/`DeleteObject` on
  this one bucket, nothing else in the account.
- The database stores only the object key, never image bytes.

> **Status:** the before/after photo flow is **built but parked** — the admin
> Appointments page currently uses the standard status buttons. Re-enable by
> swapping `StatusActions` for `GroomFlow` in
> `app/admin/(dash)/appointments/page.tsx`.

---

## WhatsApp integration

**Free by design — no Meta fees, no business verification.**

Every message is composed and logged to the `Notification` table, then opened for
one-tap sending. Four kinds:

| Type | Fired when |
|---|---|
| `BOOKING_CONFIRMATION` | Customer submits the online form — "we've received your booking" |
| `APPOINTMENT_CONFIRMED` | Admin clicks **Confirmed** — "your appointment is confirmed ✅" with date, time and package |
| `REMINDER` | Ahead of the visit |
| `THANK_YOU` | Admin marks the visit complete — thank-you + feedback request |

The first two are deliberately separate: "we got your request" and "your slot is
secured" are different promises, and conflating them confuses customers.

Opening behaviour:

- **Mobile** → `whatsapp://send?...` — opens the app, leaves no blank tab
- **Desktop** → `web.whatsapp.com/send?...` — the chat directly, skipping the
  `wa.me` interstitial

At booking, WhatsApp is opened **synchronously inside the click** and the
appointment is saved in the background — mobile browsers block a popup that
waits on a network call first. The server still enforces overlap.

The **Meta Cloud API** path exists in `lib/whatsapp-send.ts` and activates only
when `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` are set. It is the only
way to attach images automatically, but costs per message outside WhatsApp's 24h
window.

---

## Local development

No Docker required — a real Postgres is embedded.

```bash
npm run db:local     # terminal 1: Postgres on :5432, data in ./.devdb
npm run db:migrate   # terminal 2
npm run db:seed      # catalog, settings, admin user
npm run dev          # http://localhost:3000
```

| Script | Does |
|---|---|
| `dev` / `build` / `start` | Next.js dev, production build, production server |
| `db:local` | Embedded Postgres (`scripts/dev-db.mjs`) |
| `db:up` | Docker Postgres instead |
| `db:migrate` / `db:deploy` / `db:reset` | Prisma migrations |
| `db:seed` / `db:generate` | Seed data · Prisma client |

**Verify changes with `npx tsc --noEmit`, then `npx next build`.** There is no
test suite; for DB/flow checks write a throwaway `tsx` script and delete it after.

> ⚠️ Stop the dev server before running `next build` — both write to `.next`, and
> running them together leaves the dev server serving 404s for its own chunks.

---

## Deployment

**Vercel + Neon**, both free tier.

- Vercel project `bubbly-pup-app` (a separate `bubbly_pet_grooming` project hosts
  the marketing-only site — don't overwrite it)
- Neon Postgres, AWS Singapore
- Deploy: `npx vercel --prod --yes --scope janithas-projects-dbf5b4aa`
- Build runs `prisma generate && next build`

**Migrations do not run on deploy.** After a schema change, run migrations against
Neon *first*, then redeploy — deploying schema-dependent code against an
un-migrated database takes the live admin portal down.

```bash
DATABASE_URL="<neon-url>" npx prisma migrate deploy   # then:
npx vercel --prod --yes --scope janithas-projects-dbf5b4aa
```

Two gotchas learned the hard way:

- **`vercel env pull` returns empty values** for variables marked *Sensitive*
  (`DATABASE_URL`, `AUTH_SECRET`). They can be overwritten but never read back,
  so the Neon connection string has to come from the Neon console.
- **Neon's newer host format doesn't split into pooled/direct** by removing
  `-pooler` — that host does not resolve. `migrate deploy` runs fine through the
  pooled host for a database this size.

A **self-hosted VPS** path also exists — `Dockerfile`, `docker-compose.prod.yml`,
`Caddyfile` (app + Postgres + Caddy TLS + backups), documented in `BACKEND.md`
and `DEPLOY-VERCEL.md`. `next.config.mjs` switches to `output: "standalone"`
automatically when not on Vercel.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `AUTH_SECRET` | ✅ | Signs admin JWTs |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | ✅ | First admin account |
| `S3_BUCKET` / `S3_REGION` | photos | Bucket name and region |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | photos | Scoped IAM credentials |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | optional | Cloud API auto-send |
| `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG` | optional | Approved template |
| `ALLOWED_ORIGINS` | proxy only | Server Actions behind a custom domain |
| `SITE_URL` | optional | Absolute URLs for OG tags and photo links |

Secrets live in `.env` locally (gitignored) and in Vercel env vars in production —
never in the repo. Note `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are **reserved
on Vercel** (its functions run on Lambda), which is why the S3 credentials use
`S3_`-prefixed names.

---

## Design decisions worth knowing

1. **One app, not a split frontend/backend.** A single salon's booking system
   doesn't justify two deployables, two CI pipelines and a network hop.
2. **WhatsApp over email/SMS.** It's how customers in Sri Lanka actually
   communicate, and `wa.me` links make it free.
3. **No CSS framework.** The site is a bespoke brand design; utility classes
   would have added weight without saving work.
4. **Business rules server-side, always.** Overlap checks and status transitions
   are enforced in the database layer, not the UI.
5. **Photos in S3, keys in Postgres.** Keeps the database small and cheap, and
   image serving off the app server.
6. **Everything auditable.** Status changes, payments and messages all leave rows
   behind — a salon needs to answer "what happened to this booking?"
7. **Consent is data, not just a dialog.** The aggressive-dog acceptance is
   written into the pet notes, so it survives outside the browser session.

---

## Migration history

| Migration | Adds |
|---|---|
| `0001_init` | The original schema |
| `20260724201402_grooming_photos` | `AppointmentPhoto`, `PhotoKind`, `GROOM_FINISHED` status |
| `20260724214413_appointment_confirmed_notification` | `APPOINTMENT_CONFIRMED` notification type |

All three are applied to both the local database and Neon.

---

## Known gaps

- **No automated tests.** Verification is `tsc --noEmit`, `next build`, and
  throwaway `tsx` scripts run against a real database. The booking engine is pure
  and would be the obvious place to start.
- **The photo flow is parked** — built, deployed and working, but not wired into
  the UI. One line re-enables it.
- **Sending real photos on WhatsApp needs HTTPS.** `navigator.share` and the
  clipboard API require a secure context, so photo sharing cannot be tested over
  `http://<lan-ip>:3000` — only on `localhost` or the deployed site.
- **`next build` and `next dev` fight over `.next`.** Running the build while the
  dev server is live makes it serve 404s for its own chunks; the fix is to delete
  `.next` and restart. Stop the dev server first.
- **Dependency advisories.** `npm audit` reports 3 high-severity issues in
  Next.js 15.5.19 and its `postcss` / `sharp` dependencies. Unaddressed — an
  upgrade should be its own piece of work.
