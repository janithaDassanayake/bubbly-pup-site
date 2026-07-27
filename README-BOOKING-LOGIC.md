# How booking availability works

> **The salon can groom 2 pets at the same time. However, each pet must start at
> a different time depending on the availability of the bath and grooming table.
> The Customer Portal and Admin Portal use the same booking logic, so all
> available time slots are automatically synced.**

Plain-English guide to the scheduling rules, written for whoever runs the salon
and whoever maintains the code. **Built and tested — this describes what the
system does today**, not a proposal.

The plan and the reasoning behind it are in `appontnet_logic_new_suggention.md`.

---

## How that summary maps to the system

| The statement says | What the system actually does |
|---|---|
| 2 pets at the same time | Settings → *Pets groomed at the same time* = 2, enforced at **every moment** of a booking, not just its start |
| Each pet starts at a different time | Every package carries a *Next pet after* value — 15 min for the 30-minute packages, 30 min for the rest |
| Depending on bath and table availability | **One number per package** stands in for how long the tub is held; for the no-bath services (trim, colour, spa) it stands in for the table |
| Both portals, same logic, synced | Both call the same functions in `lib/booking-engine.ts` — there is no second copy of the rules |

**One nuance worth knowing.** The system does not track the bath and the table as
two separate resources. It uses a single "next pet after" figure per package,
which in practice produces the behaviour the summary describes — and it's why the
2-hour trim package holds the queue no longer than the 1-hour wash: the extra
hour is table time, not tub time.

If two pets ever collide at the **table** specifically, the fix is to raise that
package's gap. Don't expect the system to have reasoned about the table on its
own.

The sync is structural rather than a promise: `/api/availability`, the customer
save, the admin manual booking and the admin slot map all call the same pure
functions, and both booking paths take the same per-date lock before saving. The
admin cannot be shown a time the website refuses.

---

## The short version

The salon has **one bath and one table**. So two pets can be here at once — one
washing while the other is dried and trimmed — but they can't both *start*
together, because bathing comes first and there's only one tub.

That's the whole logic, in two rules:

| | Rule | Why |
|---|---|---|
| **1** | Never more than **2 pets** being groomed at the same moment | Two places, two pets |
| **2** | The next pet can't **start** until the one before is out of the bath | One bath |

Everything else — closing time, holidays, lead time, cancellations — works
exactly as it did before.

---

## Rule 1: two pets at a time

A booking is a stretch of time: the start, plus the package's length. A 2-hour
package at 9:00 runs 9:00 → 11:00.

A new booking is allowed only if, at **every moment** it's running, fewer than 2
grooms are already going.

"Every moment" matters. It's not enough to check the start time:

```
Already booked:   A  9:00 ──────── 11:00
                  B  9:30 ──── 10:30

New 2-hour groom at 10:30?
   at 10:30 → only A is running (1 pet) … looks fine
   at 10:30–11:00 → A is still running, so 2 pets … still fine
   ✅ allowed — never 3 at once
```

but

```
Already booked:   A  9:00 ──────── 11:00
                  B  9:30 ──── 10:30

New groom at 10:00?
   at 10:00 → A and B are both running = 2 pets → this would be the 3rd
   ❌ refused
```

**Bookings that just touch don't clash.** A groom ending at 11:00 and another
starting at 11:00 are fine — the first dog has left.

### Where "2" comes from

**Settings → Business & scheduling → "Pets groomed at the same time"**.

Change it to 3 the day you hire a third groomer, and every screen updates. Set it
to 1 and the system behaves exactly as it did before this change.

---

## Rule 2: the bath — one start at a time

Every package has a second number: **"Next pet after"** — how many minutes must
pass before the next pet can start.

It tracks **time in the bath**, not the length of the appointment. That's why the
2-hour trim package has the same 30-minute gap as the 1-hour wash: the extra hour
is spent trimming on the table, not in the tub.

```
Dog A booked 9:00 (wash, gap 30):  [ bath ][ dry, brush, nails, trim … ]
Dog B booked 9:30:                        [ bath ][ dry, brush … ]
                                           ↑ A is on the table by now, tub is free
```

Booking 9:15 would be refused — both dogs would want the bath at once.

**Which gap applies** when two different packages meet: the one belonging to the
booking that starts **first**, because that's the dog in the tub. A 9:00 cat groom
(15) lets the next pet start at 9:15; a 9:00 wash (30) pushes it to 9:30.

### The gaps as set today

| Package | Length | Next pet after |
|---|---|---|
| Basic Grooming Package for Wash | 30 min | 15 min |
| Grooming Package for Cat | 30 min | 15 min |
| Grooming Package for Wash | 60 min | 30 min |
| Grooming Package with Trim (either) | 120 min | 30 min |
| Trim Only | 60 min | 30 min |
| Colouring Only | 30 min | 30 min |
| Spa Treatment | 30 min | 30 min |

Edit any of them in **Settings → Packages & prices**, next to the duration.

Trim, colour and spa don't use the bath at all, but they still carry a gap —
because the second dog needs the **table** shortly after, and there's only one
table. If you find you're turning away trim work because of it, lower that one
package's gap and watch how the floor copes.

> **Note on the 15-minute gaps.** Booking start times currently step every 30
> minutes (Settings → Slot step), so a 15-minute gap has no visible effect yet.
> It becomes real the day you set the slot step to 15. The numbers are honest
> either way.

---

## What the customer sees

Nothing about any of this. They pick a package, pick a date, and see the times
that are available. No places, no bath, no capacity.

If a time is unavailable it's shown crossed out rather than hidden, so the salon
reads as busy rather than closed.

---

## What the admin sees

The slot bar has **three** colours now, because "has a booking" no longer means
"unavailable":

| Colour | Meaning |
|---|---|
| 🟩 Green | Empty — both places free |
| 🟧 Amber | One pet in, **room for one more** |
| 🟥 Pink | Full |
| ⬜ Grey | Time has passed |

The amber state is the point of the whole change. If a half-full slot looked the
same as a full one, you'd turn away work you could take.

**Free slots** counts anything still sellable (empty *or* half-taken).
**Occupancy** counts places sold, not slots touched — one pet in a two-pet slot
is 50%, not 100%.

---

## What hasn't changed

- Closing time — a booking must finish before you close
- Closed days and holidays
- Minimum lead time for same-day bookings
- Past dates and times
- **Cancelled** and **no-show** free their place immediately
- **Pending confirmation** still holds its place — it's a real request

---

## Two customers booking at once

Both booking paths take a short **lock on that date** before checking
availability. Two people clicking Book in the same second are handled one after
the other, so the second sees the first's booking and is refused properly.

Without it both could read "one place free" at the same instant and both save,
putting three dogs in a two-dog salon. Different dates never wait on each other,
and the lock lasts milliseconds.

Tested: four identical bookings fired simultaneously → exactly one succeeded.

---

## Where this lives in the code

| File | What it does |
|---|---|
| `lib/booking-engine.ts` | The rules. Pure functions, no database — `maxConcurrent`, `startGapOk`, `canBook`, `validateBooking`, `generateSlotGrid` |
| `lib/settings.ts` | Reads capacity and the day's bookings (each with its package's gap) |
| `app/api/availability/route.ts` | The times the customer is offered |
| `app/api/bookings/route.ts` | Saves a customer booking — re-checks under the date lock |
| `app/admin/actions.ts` | Admin manual booking — same engine, same lock |
| `lib/slot-map.ts` | The admin day view and the 14-day strip |

**Both portals call the same functions.** There is no second copy of the rules,
which is why the admin can never offer a time the website refuses.

---

## If something looks wrong

**"A time I expect to be free is crossed out."**
Either both places are busy at some point during that groom (Rule 1 — check the
slot bar for pink), or another pet starts too close to it (Rule 2 — check the
"Next pet after" value on the package that's already booked).

**"The system let me book three pets at once."**
It shouldn't. But note that lowering capacity in Settings never cancels existing
bookings — if you go from 2 to 1, already-booked overlaps stay and the slot list
flags them in red. Only *new* bookings follow the lower number.

**"I want two pets to be able to start at the same time."**
Set that package's "Next pet after" to 0. The system will allow it. Whether the
bath allows it is your call.
