# Booking Time Period Update

## Task Title

**Update Booking Time Slots to Support Two Clients per 2-Hour Booking Period**

## Issue

In the current booking system, clients may sometimes need to wait because booking times are not grouped according to the actual service capacity.

The shop can manage **2 clients within each 2-hour service period**. Therefore, the booking system should allow a maximum of **2 bookings per booking period**, regardless of which of the two available start times the clients choose.

The booking availability must be updated so that once two clients have booked within the same booking period, both start-time options for that period become unavailable.

---

## New Booking Time Structure

The shop starts at **9:00 AM**.

Each booking period contains two possible start times and supports a maximum of two clients.

| Booking Period | Available Start Times | Maximum Clients |
|---|---|---:|
| 9:00 AM – 11:00 AM | 9:00 AM, 9:30 AM | 2 |
| 11:00 AM – 1:00 PM | 11:00 AM, 11:30 AM | 2 |
| 1:00 PM – 3:00 PM | 1:00 PM, 1:30 PM | 2 |
| 3:00 PM – 5:00 PM | 3:00 PM, 3:30 PM | 2 |
| 5:00 PM – 7:00 PM | 5:00 PM, 5:30 PM | 2 |

---

## Required Booking Logic

The booking limit must be calculated based on the **booking period/group**, not only on the exact selected time.

Example booking groups:

```text
09:00 / 09:30 -> GROUP_09
11:00 / 11:30 -> GROUP_11
13:00 / 13:30 -> GROUP_13
15:00 / 15:30 -> GROUP_15
17:00 / 17:30 -> GROUP_17
```

Each group has:

```text
MAX_CAPACITY = 2
```

---

## Expected Behaviour

### Scenario 1 - One Client Books 9:00 AM

If one client books:

```text
Client A -> 9:00 AM
```

The booking period occupancy becomes:

```text
9:00 AM - 11:00 AM = 1 / 2
```

Both **9:00 AM and 9:30 AM must remain available** because one more client can still be accepted.

---

### Scenario 2 - Two Clients Book 9:00 AM

If:

```text
Client A -> 9:00 AM
Client B -> 9:00 AM
```

The booking period occupancy becomes:

```text
9:00 AM - 11:00 AM = 2 / 2
```

The system must make both of these unavailable:

```text
9:00 AM   -> unavailable
9:30 AM   -> unavailable
```

No third client should be allowed to book this period.

---

### Scenario 3 - One Client Books 9:00 AM and Another Books 9:30 AM

If:

```text
Client A -> 9:00 AM
Client B -> 9:30 AM
```

The booking period occupancy becomes:

```text
9:00 AM - 11:00 AM = 2 / 2
```

Both times must become unavailable:

```text
9:00 AM   -> unavailable
9:30 AM   -> unavailable
```

---

### Scenario 4 - First Client Books 9:30 AM

If:

```text
Client A -> 9:30 AM
```

The whole 9:00 AM - 11:00 AM period contains only one booking.

Therefore:

```text
9:00 AM   -> available
9:30 AM   -> available
```

One more client may choose either time.

Once the second client books either option, both times become unavailable.

---

## Backend Implementation

### 1. Map Each Time to a Booking Group

The backend should map the selected booking time to its corresponding group.

Example:

```javascript
const bookingGroups = {
  "09:00": "GROUP_09",
  "09:30": "GROUP_09",

  "11:00": "GROUP_11",
  "11:30": "GROUP_11",

  "13:00": "GROUP_13",
  "13:30": "GROUP_13",

  "15:00": "GROUP_15",
  "15:30": "GROUP_15",

  "17:00": "GROUP_17",
  "17:30": "GROUP_17",
};
```

---

### 2. Check Total Bookings for the Group

When checking availability, do not only count bookings for the exact selected time.

For example, this is incorrect:

```text
Count bookings where booking_time = 11:00
```

Instead, check all bookings belonging to the same group:

```text
Count bookings for GROUP_11
```

This means both:

```text
11:00
11:30
```

must contribute to the same capacity count.

---

### 3. Capacity Rule

Use the following rule:

```text
if bookingGroupCount >= 2:
    group is FULL
else:
    group is AVAILABLE
```

When the group becomes full, return both start times as unavailable.

---

## Frontend Update

When displaying available booking times:

1. Fetch booking availability for the selected date.
2. Determine the booking count for each booking group.
3. If a group has fewer than 2 bookings, show both start-time options.
4. If a group already has 2 bookings, disable or hide both start-time options.

Example:

```text
GROUP_11 bookings = 2

11:00 AM  -> disabled/hidden
11:30 AM  -> disabled/hidden
```

Recommended behaviour is to **disable the slots and show them as "Fully Booked"** instead of completely removing them. This makes it clearer to the client that the time existed but is no longer available.

---

## Important Backend Validation

Frontend availability alone is not enough.

The backend must check the booking-period capacity again when the user confirms the booking.

This prevents situations where multiple clients open the booking page at the same time and attempt to reserve the final available position.

Before creating a booking:

```text
1. Identify booking group.
2. Count current confirmed/active bookings in that group for the selected date.
3. If count >= 2:
      Reject booking.
4. If count < 2:
      Create booking.
```

Example error response:

```json
{
  "success": false,
  "message": "This booking period is already fully booked. Please select another time."
}
```

---

## Concurrency Protection

The final capacity check and booking creation should be handled safely at database/backend level.

Two users must not be able to create bookings at exactly the same moment and increase the booking-period capacity above 2.

Expected maximum:

```text
2 clients
```

Never:

```text
3 clients
```

Use the existing project's transaction/locking strategy where appropriate.

---

## Booking Statuses

Only bookings that actually reserve capacity should be counted.

For example:

```text
CONFIRMED
ACTIVE
```

Cancelled or rejected bookings should not consume the booking-period capacity.

Example:

```text
Client A -> 11:00 -> CONFIRMED
Client B -> 11:30 -> CANCELLED
```

Available capacity should be:

```text
1 / 2
```

Therefore the 11:00/11:30 booking group should become available for one additional client.

Adapt the exact status names to the statuses already used in the Bexelon system.

---

## Acceptance Criteria

- [ ] Booking slots are changed to 9:00, 9:30, 11:00, 11:30, 1:00, 1:30, 3:00, 3:30, 5:00, and 5:30.
- [ ] 9:00 and 9:30 belong to the same booking-capacity group.
- [ ] 11:00 and 11:30 belong to the same booking-capacity group.
- [ ] 1:00 and 1:30 belong to the same booking-capacity group.
- [ ] 3:00 and 3:30 belong to the same booking-capacity group.
- [ ] 5:00 and 5:30 belong to the same booking-capacity group.
- [ ] Each booking group supports a maximum of 2 clients.
- [ ] Two clients can select the same start time.
- [ ] Two clients can select different start times within the same group.
- [ ] After the second booking, both time options in that group become unavailable.
- [ ] A third booking cannot be created for a full booking group.
- [ ] Cancelled/rejected bookings do not consume capacity.
- [ ] Availability is validated again by the backend before booking creation.
- [ ] Concurrent booking attempts cannot increase capacity above 2.
- [ ] Other booking periods remain unaffected when one period becomes full.

---

## Test Cases

### Test Case 1

```text
Booking 1 -> 11:00 AM
```

Expected:

```text
11:00 AM  -> available
11:30 AM  -> available

Remaining capacity: 1
```

### Test Case 2

```text
Booking 1 -> 11:00 AM
Booking 2 -> 11:30 AM
```

Expected:

```text
11:00 AM  -> unavailable
11:30 AM  -> unavailable

Remaining capacity: 0
```

### Test Case 3

```text
Booking 1 -> 11:00 AM
Booking 2 -> 11:00 AM
```

Expected:

```text
11:00 AM  -> unavailable
11:30 AM  -> unavailable

Remaining capacity: 0
```

### Test Case 4

```text
Booking 1 -> 11:30 AM
```

Expected:

```text
11:00 AM  -> available
11:30 AM  -> available

Remaining capacity: 1
```

### Test Case 5

```text
Booking 1 -> 11:00 AM
Booking 2 -> 11:30 AM
Booking 3 -> 11:00 AM
```

Expected:

```text
Booking 3 must be rejected.
```

### Test Case 6

```text
Booking 1 -> 11:00 AM -> CONFIRMED
Booking 2 -> 11:30 AM -> CANCELLED
```

Expected:

```text
GROUP_11 occupancy = 1 / 2
One additional booking must be allowed.
```

---


---

## Same-Day Past Time Slot Validation

The booking system must also validate the **current local date and time**.

A customer must never be able to book a time slot that has already passed on the selected date.

### Example

If today is the selected booking date and the current time is:

```text
11:00 AM
```

The following earlier start times must not be bookable:

```text
9:00 AM  -> unavailable
9:30 AM  -> unavailable
```

The customer should only be able to select valid upcoming booking times, subject to the normal booking-group capacity rules.

For example:

```text
Current time: 11:00 AM

9:00 AM   -> unavailable because time has passed
9:30 AM   -> unavailable because time has passed

11:00 AM  -> apply current booking/cut-off rules
11:30 AM  -> available if GROUP_11 has remaining capacity

1:00 PM   -> available if GROUP_13 has remaining capacity
1:30 PM   -> available if GROUP_13 has remaining capacity
3:00 PM   -> available if GROUP_15 has remaining capacity
3:30 PM   -> available if GROUP_15 has remaining capacity
5:00 PM   -> available if GROUP_17 has remaining capacity
5:30 PM   -> available if GROUP_17 has remaining capacity
```

### Past-Time Rule

For a booking on **today's date**:

```text
if slotStartTime < currentLocalTime:
    slot = UNAVAILABLE
```

For a future date:

```text
Do not disable the slot based on the current clock time.
Apply only the normal capacity/availability rules.
```

This validation must be performed using the business/shop timezone configured for Bexelon, not the customer's device timezone.

### Important

Past-time validation and capacity validation are separate rules.

A slot is unavailable when either:

```text
1. The slot time has already passed for today's date
OR
2. The corresponding 2-hour booking group already has 2 active/confirmed bookings
```

Therefore, availability should effectively follow:

```text
AVAILABLE =
    slot_is_not_in_the_past
    AND
    booking_group_count < 2
```

### Backend Validation

The backend must perform the same time validation when the booking is submitted.

Do not rely only on the frontend, because a user may leave the booking screen open while time passes.

Before creating the booking:

```text
1. Get the current date/time in the configured shop timezone.
2. Compare the selected booking date and start time with the current date/time.
3. If the selected date/time is already in the past:
      Reject the booking.
4. Determine the booking group.
5. Check the booking group's active/confirmed booking count.
6. If the group count >= 2:
      Reject the booking.
7. Otherwise:
      Create the booking.
```

Example error:

```json
{
  "success": false,
  "message": "This booking time has already passed. Please select another available time."
}
```

### Additional Acceptance Criteria

- [ ] Customers cannot select a booking start time that has already passed on the current date.
- [ ] If the current time is 11:00 AM, 9:00 AM and 9:30 AM are unavailable for the same day.
- [ ] Past-time validation does not incorrectly remove slots from future dates.
- [ ] The shop/business timezone is used for past-time validation.
- [ ] Backend validation prevents creation of bookings for times that have passed.
- [ ] Past-time validation works together with the 2-client booking-group capacity rule.

## Final Business Rule

> Every 2-hour booking period can accommodate a maximum of two clients. Clients may select either of the two available start times within that period. Once two active/confirmed bookings exist in the period, both start-time options must become unavailable. In addition, for same-day bookings, any start time that has already passed in the configured shop timezone must be unavailable. A booking can only be created when its start time has not passed and its booking group still has remaining capacity.
