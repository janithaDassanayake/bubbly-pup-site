# Bexelon Booking Time Slot Update

## Task Title
**Update Booking System to Allow One Client per Exact Time Slot**

## Final Booking Time Slots

| Time Slot | Maximum Clients |
|---|---:|
| 9:00 AM | 1 |
| 9:30 AM | 1 |
| 12:00 PM | 1 |
| 12:30 PM | 1 |
| 3:00 PM | 1 |
| 3:30 PM | 1 |

**3:30 PM is the final booking time of the day.**

## Remove Previous Group Logic

Remove the old shared-capacity rule such as:

```text
9:00 / 9:30 -> shared capacity
12:00 / 12:30 -> shared capacity
3:00 / 3:30 -> shared capacity
```

Each exact time slot now has its own capacity of **1 client**.

## Expected Behaviour

If one client books:

```text
9:00 AM
```

Then:

```text
9:00 AM -> unavailable
9:30 AM -> available
```

If another client books:

```text
9:30 AM
```

Then:

```text
9:00 AM -> unavailable
9:30 AM -> unavailable
```

The same rule applies independently to:

```text
12:00 PM
12:30 PM
3:00 PM
3:30 PM
```

No two clients can book the same exact date and time slot.

## Same-Day Past Time Validation

Keep the existing past-time rule.

If today is selected and the current time is 11:00 AM:

```text
9:00 AM -> unavailable because time has passed
9:30 AM -> unavailable because time has passed
12:00 PM -> available if not booked
12:30 PM -> available if not booked
3:00 PM -> available if not booked
3:30 PM -> available if not booked
```

For future dates, do not disable slots based on today's current clock time.

Use the configured Bexelon shop/business timezone.

## Availability Rule

```text
AVAILABLE =
    slot_is_not_already_booked
    AND
    slot_is_not_in_the_past
```

## Backend Validation

Before creating a booking:

```text
1. Validate that the selected time is one of:
   09:00
   09:30
   12:00
   12:30
   15:00
   15:30

2. Get the current date/time using the shop timezone.

3. If the selected booking date/time has already passed:
      Reject the booking.

4. Check whether an active/confirmed booking already exists
   for the exact selected date and exact selected time.

5. If a booking already exists:
      Reject the booking.

6. Otherwise:
      Create the booking.
```

Example booked-slot error:

```json
{
  "success": false,
  "message": "This time slot has already been booked. Please select another available time."
}
```

Example past-time error:

```json
{
  "success": false,
  "message": "This booking time has already passed. Please select another available time."
}
```

## Concurrency Protection

The backend must prevent two clients from booking the same exact slot at nearly the same time.

Example:

```text
Client A selects 9:00 AM
Client B selects 9:00 AM at the same time
```

Expected:

```text
Only one booking is created.
The second booking request is rejected.
```

Use a database uniqueness rule, transaction, locking strategy, or the existing project mechanism.

Recommended uniqueness concept:

```text
booking_date + booking_time
```

for active/confirmed reservations.

## Booking Status Rules

Only statuses that actually reserve the slot should block it, for example:

```text
ACTIVE
CONFIRMED
```

Cancelled or rejected bookings should release the slot again.

Example:

```text
12:30 PM -> CONFIRMED -> unavailable
12:30 PM -> CANCELLED -> available again
```

Use the actual Bexelon booking status names.

## Frontend Update

Display only:

```text
9:00 AM
9:30 AM
12:00 PM
12:30 PM
3:00 PM
3:30 PM
```

For each exact slot:

```text
If already booked:
    Disable and show Booked/Unavailable

Else if the time has already passed today:
    Disable and show Time Passed

Else:
    Allow booking
```

Booking one slot must not automatically block another slot.

Example:

```text
9:00 AM -> Booked
9:30 AM -> Available
12:00 PM -> Available
12:30 PM -> Available
3:00 PM -> Available
3:30 PM -> Available
```

## Final Booking Time Rule

The final booking time is:

```text
3:30 PM
```

Do not display any booking slot after 3:30 PM.

## Acceptance Criteria

- [ ] Only 9:00 AM, 9:30 AM, 12:00 PM, 12:30 PM, 3:00 PM, and 3:30 PM are displayed.
- [ ] 3:30 PM is the final booking time.
- [ ] Each exact time slot supports only 1 client.
- [ ] The same exact time cannot be booked by two clients.
- [ ] Booking 9:00 AM does not block 9:30 AM.
- [ ] Booking 12:00 PM does not block 12:30 PM.
- [ ] Booking 3:00 PM does not block 3:30 PM.
- [ ] Once a slot is booked, only that exact slot becomes unavailable.
- [ ] Past same-day slots cannot be booked.
- [ ] Future-date slots are not incorrectly disabled based on the current time.
- [ ] Backend validation runs before creating the booking.
- [ ] Concurrent requests cannot create two bookings for the same exact slot.
- [ ] Cancelled/rejected bookings do not permanently block the slot.

## Test Cases

### Test 1
```text
Client A -> 9:00 AM
```

Expected:

```text
9:00 AM -> unavailable
9:30 AM -> available
```

### Test 2
```text
Client A -> 9:00 AM
Client B -> 9:30 AM
```

Expected:

```text
9:00 AM -> unavailable
9:30 AM -> unavailable
```

### Test 3
```text
Client A -> 12:00 PM
Client B -> 12:00 PM
```

Expected:

```text
Client A -> success
Client B -> rejected
```

### Test 4
```text
Client A -> 12:00 PM
```

Expected:

```text
12:00 PM -> unavailable
12:30 PM -> available
```

### Test 5
```text
Client A -> 3:00 PM
```

Expected:

```text
3:00 PM -> unavailable
3:30 PM -> available
```

### Test 6 - Past Time
```text
Current time: 11:00 AM
Selected date: Today
```

Expected:

```text
9:00 AM -> unavailable
9:30 AM -> unavailable
12:00 PM -> available if not booked
12:30 PM -> available if not booked
3:00 PM -> available if not booked
3:30 PM -> available if not booked
```

## Final Business Rule

> Bexelon has six individual booking slots per day: 9:00 AM, 9:30 AM, 12:00 PM, 12:30 PM, 3:00 PM, and 3:30 PM. Each exact slot can be booked by only one active/confirmed client. Once a slot is booked, only that slot becomes unavailable. The previous shared-group capacity rule must be removed. Same-day slots that have already passed must also be unavailable. The final booking time of the day is 3:30 PM.
