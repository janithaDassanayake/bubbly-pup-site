# CLAUDE.md — Bubbly Pup Pet Grooming

Guidance for AI agents working in this repo. Keep it current when architecture changes.

## What this is
Two things in one Next.js app:
1. **Customer website** (`/`) — marketing single-page site + a booking form.
2. **Appointment Management System** — public booking APIs + a password-protected
   **admin portal** (`/admin`) implementing the full `new_advance_task.md` spec.

Live (test): **https://bubbly-pup-app.vercel.app** (Vercel project `bubbly-pup-app`,
Postgres on Neon). A separate marketing-only Vercel project (`bubbly_pet_grooming`)
also exists — don't overwrite it.

## Stack
Next.js 15 (App Router) · React 19 · TypeScript · Prisma 6 + PostgreSQL ·
`jose` (JWT) · `bcryptjs`. No CSS framework — plain CSS modules + `app/admin/admin.css`.

## Run locally (no Docker needed)
```bash
npm run db:local     # terminal 1: real Postgres via embedded-postgres → :5432, data in ./.devdb
npm run db:migrate   # terminal 2
npm run db:seed      # packages, add-ons, settings, admin (admin@bubblypup.lk / ChangeMe123!)
npm run dev          # http://localhost:3000  →  /admin
```
Alternatives: `npm run db:up` (Docker Postgres) or point `DATABASE_URL` at Neon.

**If `db:local` fails with `lock file "postmaster.pid" already exists`, or Prisma says
"Can't reach database server" while port 5432 *is* listening:** the embedded Postgres
runs `persistent: true`, so killing the `db:local` wrapper leaves a half-dead postmaster
that accepts TCP then resets every connection. Don't delete `postmaster.pid` — stop it
properly, then start again (`.devdb` data is untouched):
```bash
./node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe -D "$PWD/.devdb" -m fast stop
npm run db:local
```

## Verify changes
`npx tsc --noEmit` then `npx next build` — **stop `npm run dev` first**, since a build
against a live dev server leaves `.next` half dev / half prod and every route 404s or
500s until you `rm -rf .next`. No test suite — the booking engine is pure
and unit-testable (`lib/booking-engine.ts`); for DB/flow checks write a throwaway
`tsx` script against `npm run db:local` and delete it after. Prefer real end-to-end
checks over assumptions.

## Deploy (test link)
```bash
npx vercel --prod --yes --scope janithas-projects-dbf5b4aa
```
Build runs `prisma migrate deploy && prisma generate && next build`, so **pending
migrations are applied by the build itself** using Vercel's `DATABASE_URL`. A failing
migration fails the build and leaves the previous deployment serving — safer than
shipping code whose columns don't exist yet. (It used to be a manual
`npm run db:deploy`; that was changed because Vercel stores `DATABASE_URL` encrypted,
so it can't be pulled locally. `npm run db:deploy` still works if you have the direct
string.) `migrate deploy` is a no-op when nothing is pending. Secrets live in Vercel
env vars, never in the repo.

A self-hosted path also exists (`Dockerfile`, `docker-compose.prod.yml`, `Caddyfile`,
`DEPLOY-VERCEL.md`, `BACKEND.md`) for a single VPS (app + Postgres + Caddy + backup).

## Layout
- `components/*` + `app/page.tsx` — marketing site; `components/Booking.tsx` is the booking form.
- `app/api/availability` · `app/api/bookings` — public booking APIs (overlap-safe, transactional).
- `app/api/admin/login|logout` — auth (not behind middleware).
- `middleware.ts` — guards `/admin/*` (jose, Edge runtime).
- `app/admin/login/page.tsx` — login (root layout only); `forgot/`, `reset/[token]/`
  (public) and `new-password/` (session required, outside `(dash)` so the layout
  redirect can't loop) share `app/admin/AuthShell.tsx`.
- `app/admin/auth-actions.ts` — the only UNAUTHENTICATED server actions (forgot/reset).
- `app/admin/(dash)/*` — authed shell + pages: dashboard, appointments, slots,
  pending, customers[/id], payments, reports, whatsapp, settings.
- `app/admin/actions.ts` — server actions (status changes, payments, settings); each re-checks auth + writes an AuditLog.
- `app/admin/(dash)/Filters.tsx` — live (debounced, button-less) search/filter client components.
- `app/admin/(dash)/ActionButtons.tsx` — client status/payment/WhatsApp buttons.
- `app/admin/(dash)/SlotStrip.tsx` — the day-as-one-bar strip + its Free/Booked legend.
- `lib/` — `booking-engine` (pure duration/overlap/slots/day timeline), `status` (lifecycle),
  `slot-map` (admin slot occupancy), `whatsapp` (message + wa.me), `whatsapp-send`
  (optional Cloud API), `auth`/`session`, `password`/`password-policy`, `reset`
  (reset tokens), `mailer` (optional Resend), `site` (absolute URLs), `settings`,
  `catalog`, `admin-data`, `booking-map`, `time`, `format`, `roles` (owner/staff).
- `prisma/schema.prisma` — data model; `prisma/seed.ts` — catalog + settings + admin.

## Conventions & key decisions (don't break these)
- **WhatsApp is FREE by design.** No Meta Cloud API cost. Messages are composed +
  logged (Notification table) and opened for one-tap send. Opening rules:
  **mobile → `whatsapp://send?...`** (opens the app, no blank tab, page stays);
  **desktop → `https://web.whatsapp.com/send?...`** (chat directly, skips the wa.me
  landing page). Cloud API auto-send IS wired (`lib/whatsapp-send.ts`) but only
  activates when `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (+ approved
  `WHATSAPP_TEMPLATE_NAME`) are set. Business number: `SITE.whatsapp` in `lib/data.ts`.
- **Client booking flow:** open WhatsApp *synchronously* in the click gesture (mobile
  reliability — never `await` before opening), then persist the booking in the
  background (fire-and-forget; server still enforces overlap). Reset the form + show
  success afterwards. The **booking code (`BP-XXXXXX`) is generated client-side**, sent
  to the API, and embedded as an `…/admin/appointments?q=CODE` deep link in the message.
- **Phone numbers are stored canonically.** `lib/phone.ts` → `toStoredPhone()` is
  the ONE storage format: digits only, country code applied, no `+`/spaces
  (`94766684586`) — what `wa.me` wants. Every write goes through it
  (`/api/bookings` normalises in the Zod schema via `.transform()`, so everything
  downstream gets the canonical value; `actions.ts` does it explicitly for
  `createAppointment`, `updateCustomerContact` and the `findCustomerByPhone`
  lookup). This is not cosmetic: `Customer.phone` is UNIQUE, so raw text was the
  identity key — the same person typing `076 668 4586` then `+94766684586`
  became two customers with split history, and the admin's repeat-client lookup
  missed the row that already existed. Validate what was typed, store the
  canonical form, display with `formatPhone()`. Backfill for old rows:
  `npm run phones:normalise` (dry run) / `-- --apply`; it merges the duplicates,
  repointing pets and appointments BEFORE deleting a row (Pet cascades from
  Customer), and is idempotent.
- **Overlap prevention** is the core business rule (`overlaps`/`validateBooking`);
  half-open intervals so a 10:00–12:00 booking leaves 12:00 free.
- **Slot Management (`/admin/slots`)** is a *view*, never a second source of truth:
  `lib/slot-map.ts` reads the same Settings rules and the same `RELEASED_STATUSES`
  as the booking APIs, and the "does this service fit?" overlay calls the very same
  `generateSlotGrid` the booking form uses. `buildDayTimeline` (pure, in
  `booking-engine`) steps the day at `slotStepMin` and says which booking sits in
  each step. Anything already gone — a past date, or an earlier slot today — is
  `past`, not free, so nothing invites a booking into the past.
- **Status lifecycle** is in `lib/status.ts`. Final step is a single **"Paid & Completed"**
  action: settles payment (defaults to price estimate) + completes + fires thank-you.
- **Admin tables go to cards on mobile:** add `adm-cards` to the `<table>` and
  `data-label="…"` to every `<td>` (long text uses `Message`/`Notes` labels; button/
  form cells use `data-label="Do"`). Breakpoint 767px. Styles in `app/admin/admin.css`
  (all namespaced `.adm-`).
- **Filters are live** — no submit buttons; they update the URL (`router.replace`,
  debounced text) and the server component re-renders.
- **Auth:** multiple admins, `bp_admin` HTTP-only JWT cookie, bcrypt hash. Middleware
  redirects unauth `/admin/*` to login; actions/pages call `requireAdmin()`.
- **Three roles, two power levels** (`lib/roles.ts`):
  **owner** (seeded, PROTECTED — can't be removed or demoted by anyone, so the salon
  can never lock itself out), **admin** (same rights: business settings + creating,
  re-passwording and removing logins), **staff** (day-to-day portal only).
  `isAdmin()` = owner|admin; `isSuperUser()` = owner. `role` defaults to `staff`, and
  `owner` is deliberately **not** in `ASSIGNABLE`, so the protected account can't be
  duplicated through the UI.
- **There is NO registration page.** A login exists only because an owner/admin
  created it in Settings → Staff & admin logins. Those actions go through
  `guardAdminRole()` and pages through `requireAdminRole()`, both of which
  **re-read the role from the database** rather than trusting the session claim;
  hiding the UI is not a check. Verified by replaying the captured Server Action
  requests as a staff member — refused, nothing created, no link leaked.
  (`requireAdmin()` still just means "signed in" — don't confuse the two.)
- **Account management** lives in two places: `/admin/account` (**My Account** — every
  role, changes your own password, needs the current one) and Settings → Staff & admin
  logins (owner/admin — add a login with a chosen password and role, set a password,
  promote/demote, remove, issue reset links). Rules that must not be softened: the
  owner can't be removed/demoted/re-passworded from that table, you can't remove,
  demote or re-password **yourself** there (your own password goes through My Account
  where the current one is required), and with `mustChangePassword` set the `(dash)`
  layout redirects to `/admin/new-password` until it's replaced. The password rule
  lives in `lib/password-policy.ts` (no Node imports, so browser forms share it) and
  is **re-checked server-side** — `minLength` is only a courtesy.
- **Logout returns 303, not 307.** `NextResponse.redirect` defaults to 307, which
  preserves the method — the browser re-POSTed to `/admin/login` and logging out
  dumped the user on **405 Method Not Allowed** with their session already cleared.
  303 See Other makes the browser switch to GET. Don't "simplify" that status away.
- **Locked-out owner:** only an owner/admin can hand out links, so if the last one
  forgets their password and no mail provider is set, there is no in-app way back.
  `npm run admin:password -- <email> "<new password>"` is the escape hatch (needs
  DB access; point `DATABASE_URL` at Neon's direct string for production).
- **Password reset:** `/admin/forgot` → `/admin/reset/[token]`, both listed in
  middleware's `PUBLIC` array because you can't log in to recover a login.
  `lib/reset.ts` owns the lifecycle: single-use tokens, **only the SHA-256 is
  stored**, 30-min expiry, spent inside a transaction whose `usedAt: null` guard
  makes double-use impossible. Superseded tokens are **expired, never deleted** —
  the rows are what `tooManyResets` counts, so deleting them silently disables the
  rate limit (it did once). `/admin/forgot` never reveals whether an address has an
  account; the authenticated `issueResetLink` may return the link because that
  caller already holds the whole portal.
- **Email is optional** (`lib/mailer.ts`, Resend over `fetch` — no dependency).
  Without `RESEND_API_KEY` + `MAIL_FROM` every flow still works: reset links are
  shown once to the signed-in admin to pass on by hand.
- **Domain-safe:** all internal URLs relative; `ALLOWED_ORIGINS` (Server Actions behind
  a proxy) and `SITE_URL` (OG) are env-driven — mapping a custom domain needs no code changes.

## Env vars
`DATABASE_URL`, `AUTH_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (required);
optional `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_TEMPLATE_NAME`/
`WHATSAPP_TEMPLATE_LANG`, `ALLOWED_ORIGINS`, `SITE_URL`. See `.env.example` /
`.env.production.example`.
