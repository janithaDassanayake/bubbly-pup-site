# Two pets at a time — the plan

My reading of `BOOKING_SCHEDULING_LOGIC_UPDATE.md`, checked against the code as it
stands today. **Nothing has been changed yet.**

**Agreed approach: two dogs at a time, but no two bookings may start together.**
Second booking at the same hour goes to 9:30 rather than 9:00. Details in §3.

---

## 1. How booking works today

Every booking is a time range: a start plus the package's duration. A 2-hour
package at 9:00 AM is **9:00 → 11:00**.

The rule today is:

> If the new booking touches ANY existing booking, refuse it.

One line in `lib/booking-engine.ts`:

```
hasConflict(candidate, existing)   // true if it overlaps anything at all
```

So one dog booked 9:00–11:00 closes the whole morning. That's the lost business.

Already correct and must stay: bookings are **half-open**, so a groom ending at
11:00 doesn't clash with one starting at 11:00.

---

## 2. Why we can't just say "any 2 bookings may overlap"

You have **one bath tub** and **one table** — not two interchangeable places.

If any two bookings could overlap freely, the website would sell **two wash
packages both starting at 9:00**. Both dogs need the bath first. One customer
ends up waiting in the salon holding a 9:00 confirmation.

That's the trap. The fix is your idea, and it's a good one.

---

## 3. The rule we're building

Two parts:

**Rule 1 — at most 2 grooms running at once.**
Checked across the *whole* length of the new booking, not just its start time.

**Rule 2 — the next dog can't start until the first one is out of the bath.**
Each package says how long that takes. If a 9:00 booking needs the tub for 25
minutes, the next customer is offered 9:30 (the next slot after 9:25).

### Why Rule 2 fixes the bath

Bathing always happens first. If nobody starts while another dog is still in the
tub, two dogs are never in the bath at the same moment — the first is out and on
the table by the time the second arrives:

```
Dog A (booked 9:00):  [ bath ][ dry, brush, nails, trim … ]
Dog B (booked 9:30):         [ bath ][ dry, brush, trim … ]
                              ↑ A is on the table by now
```

### The gap belongs to the PACKAGE, not the salon

**Packages aren't the same length — 30, 60 and 120 minutes — and the time in the
tub differs with them.** One salon-wide gap would be wrong in both directions: too
generous for a 30-minute cat groom (you'd lose bookings you could take), possibly
too tight for a big matted dog (the collision we're trying to avoid).

So each package carries its own gap, editable in Settings next to its duration:

| Package | Duration | Suggested gap | Meaning |
|---|---|---|---|
| Basic Grooming Package for Wash | 30 min | **15 min** | quick bath, out fast |
| Grooming Package for Cat | 30 min | **15 min** | small, quick |
| Grooming Package for Wash | 60 min | **30 min** | full bath |
| Grooming Package with Trim | 120 min | **30 min** | same bath, the extra time is trimming |
| Trim Only | 60 min | **30 min** | no bath — see the trade-off below |
| Colouring Only | 30 min | **30 min** | no bath |
| Spa Treatment | 30 min | **30 min** | no bath (unless conditioner is done in the tub) |

**Please correct these numbers** — they're my estimates of how long a dog is in
your tub. Everything else I can work out.

Which gap applies: the one belonging to the booking that starts **first**, since
that's the dog occupying the tub. A 9:00 cat groom (15) lets the next dog start
at 9:15; a 9:00 wash (30) pushes it to 9:30.

### The two settings

| Setting | Where | Default | What it does |
|---|---|---|---|
| Pets at the same time | Business & scheduling | **2** | Never more than this many grooms at once |
| Gap after this package starts | Each package row | **15–30 min** | How long before the next dog can start |

Hire a third groomer → change the first. Notice big dogs take longer in the tub →
raise the gap on that one package. Neither needs a developer.

### What it costs you

One case stays stricter than your salon physically is: **Trim Only** and
**Colouring** don't use the bath at all, so in theory they could start at 9:00
alongside a wash. They still get a gap.

That's deliberate. Even with a free tub, the second dog needs the table shortly
after — and there's only one table. Giving the no-bath services a gap keeps the
diary honest without me having to track both stations separately. If you find
you're turning away trim-only work because of it, drop that package's gap to 15
and see how the floor copes; it's one field.

---

## 4. One place, used by everything

The check goes in `lib/booking-engine.ts`, the pure file both portals already
share. Everything downstream follows automatically:

| Path | Today | After |
|---|---|---|
| Customer availability (`/api/availability`) | `generateSlotGrid` | same call, new rules |
| Customer save (`/api/bookings`) | `validateBooking` | same call, new rules |
| Admin manual booking | `validateBooking` | same call, new rules |
| Admin slot map (`/admin/slots`) | `buildDayTimeline` | display change, §5 |
| Admin "does this service fit?" | `generateSlotGrid` | automatic |
| Admin 14-day strip | `rangeSlotSummary` | display change |

This is the "single source of truth" your document asks for. It already exists —
it just has to count instead of hunting for clashes.

---

## 5. The admin screens need three states, not two

Today a slot is **Free** or **Booked**. With two places, "Booked" becomes
ambiguous — one dog in, or two? The admin needs:

- **Free** — nobody booked
- **1 of 2** — one groom running, one place still sellable
- **Full** — two grooms running

Same for the 14-day strip, otherwise a half-full day looks identical to a full
one and you'll turn away work you could take. Green / amber / pink.

The customer side needs no new wording — still just available or unavailable, as
your document requires.

---

## 6. Fix the double-booking race while we're here

Both booking paths re-check availability inside a database transaction — good —
but two customers clicking Book in the same second can both read "one place
free" and both save. Rare today because any overlap is refused outright; once
overlapping is normal traffic, the odds go up.

Fix: a short **per-day lock** at the start of the booking transaction. Bookings
for the same date queue for a few milliseconds; different dates never wait.

---

## 7. Every combination I checked

Capacity 2. Wash = 60 min (gap 30), With-Trim = 120 min (gap 30), Cat = 30 min
(gap 15), Trim-only = 60 min (gap 30).

| # | Situation | Existing | New booking | Expected |
|---|---|---|---|---|
| 1 | Empty day | — | any | ✅ |
| 2 | Same start time | Wash 9:00 | Wash 9:00 | ❌ Rule 2 — offered 9:30 |
| 3 | Too close together | Wash 9:00 | Wash 9:15 | ❌ Rule 2 |
| 4 | Exactly one gap apart | Wash 9:00 | Wash 9:30 | ✅ 2 dogs, bath free |
| 5 | Any package, same time | Wash 9:00 | Trim-only 9:00 | ❌ Rule 2 (see §3 trade-off) |
| 5a | **Short package, shorter gap** | Cat 9:00 (gap 15) | Cat 9:15 | ✅ tub already free |
| 5b | **Short then long** | Cat 9:00 (gap 15) | With-Trim 9:15 | ✅ cat is out of the tub |
| 5c | **Long then short** | Wash 9:00 (gap 30) | Cat 9:15 | ❌ tub busy until 9:30 |
| 6 | Third dog while two run | Wash 9:00, Wash 9:30 | Wash 10:00 | ❌ Rule 1 — 2 already running |
| 7 | Third dog after one ends | Wash 9:00–10:00, Wash 9:30–10:30 | Wash 10:00 | ✅ first has ended |
| 8 | Long booking across a busy window | Wash 9:00, Wash 9:30 | With-Trim 9:00–11:00 | ❌ Rule 1 |
| 9 | Ends exactly when another starts | Wash 9:00–10:00 | Wash 10:00 | ✅ half-open |
| 10 | Short groom inside a long one | With-Trim 9:00–11:00 | Wash 9:30–10:30 | ✅ 2 dogs |
| 11 | Third inside two long ones | With-Trim 9:00–11:00, Wash 9:30–10:30 | Wash 10:00 | ❌ Rule 1 |
| 12 | Cancelled booking | Wash 9:00 cancelled | Wash 9:00 | ✅ released, both rules |
| 13 | No-show | Wash 9:00 no-show | Wash 9:00 | ✅ released |
| 14 | Pending confirmation | Wash 9:00 pending | Wash 9:00 | ❌ still holds the place |
| 15 | Runs past closing | — | 17:00 + 2h (closes 18:00) | ❌ unchanged rule |
| 16 | Closed day / holiday | — | any | ❌ unchanged rule |
| 17 | Too soon today (lead time) | — | in 20 min | ❌ unchanged rule |
| 18 | Date in the past | — | any | ❌ unchanged rule |
| 19 | Two customers take the last place at once | 1 running | both | first ✅, second ❌ (needs §6) |
| 20 | Settings changed to 3 pets | Wash 9:00, Wash 9:30 | Wash 10:00 | ✅ immediately |
| 21 | Settings gap changed to 15 min | Wash 9:00 | Wash 9:15 | ✅ immediately |
| 22 | Capacity lowered 2 → 1 | two overlapping bookings exist | — | kept; no NEW overlap allowed |

Cases 15–18 are today's rules and must keep working — most likely to break by
accident during the rewrite, so they get tested too.

Case 22: lowering capacity never cancels anything. It only stops new overlaps.
The diary can sit above capacity for a while and the admin screens must show that
honestly rather than hide a booking.

---

## 8. What I would NOT do

**Don't show capacity to customers.** No "1 place left". Your document is
explicit, and it invites pressure-selling complaints. Admin sees it; customers
see available or not.

**Don't add an admin "force book anyway" button in this change.** It quietly
destroys the guarantee — every later complaint starts with "but the system let
me". If you want one, it should be separate and visibly mark the appointment as
over capacity.

**Don't model staff, breaks or lunch.** That's a rostering system, not a booking
system.

---

## 9. How I'd roll it out

1. **Add the two settings** (pets at once, gap between starts), defaulting to
   1 and 0 — which is exactly today's behaviour.
2. **Rewrite the check** in the shared engine, and prove it gives *exactly
   today's answers* at those defaults. This shows the rewrite is faithful before
   anything customers see changes.
3. **Run all 22 cases** at 2 pets / 30-minute gap.
4. **Update the admin views** to Free / 1 of 2 / Full.
5. **Add the per-day lock**, and test two bookings sent at the same instant.
6. **Switch the settings to 2 and 30** and watch a real day.

Steps 1–5 change nothing a customer experiences. Only step 6 does, and it's two
fields you can put back in seconds if the salon floor disagrees with the diary.

No data migration, no change to existing appointments. If it all has to come out,
it's a code rollback and nothing is lost.

---

## 10. What I need from you

**The gap for each package** — the table in §3. It's one number per package:
*how many minutes is the dog in the tub before the next one can go in?*

My estimates are 15 minutes for the 30-minute packages (Basic Wash, Cat) and 30
for everything else. Rough is fine — they're editable in Settings afterwards, and
watching one busy day will tell you more than guessing now.

Two smaller ones:

- **Is the Conditioner Treatment done in the bath?** If so it needs a real gap,
  not the no-bath default.
- **Does a matted dog on the With-Trim package sit in the tub longer than 30
  minutes?** If yes, that package's gap should be 40–45.
