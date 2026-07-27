# Pet Grooming Booking Platform -- Scheduling & Capacity Logic Update

## Overview

This update improves the appointment scheduling logic for both the
**Customer Booking Portal** and the **Admin Portal**. The salon can
handle **up to two pets at the same time**, but customers should never
see internal concepts such as tables, resources, or capacity allocation.
Customers should simply select a package, choose a date, see the
available time slots, and make a booking. All capacity and overlap
calculations must happen automatically in the backend.

## Current Problem

Currently, when a customer books a package, the system blocks the
complete time period based on that package's duration. For example, if a
customer books a 2-hour package at 9:00 AM, the system blocks 9:00 AM to
11:00 AM completely.

This does not correctly represent the salon's actual operating capacity
because the salon can handle **two pets simultaneously**. If only one
pet is booked from 9:00 AM to 11:00 AM, another suitable appointment
should still be allowed during that period. Blocking the entire period
after only one booking can result in unnecessary loss of available
appointments and business.

## Core Scheduling Rule

The salon has a maximum capacity of:

**2 simultaneous appointments**

The booking system must allow appointments to overlap as long as there
are never more than **two active appointments at any point in time**.

A time slot must not be marked unavailable simply because another
appointment overlaps with it. It should only be unavailable when adding
the selected appointment would cause the salon to exceed its maximum
capacity at any point during the **full duration of the selected
package**.

## Package Duration Logic

Each grooming package has its own duration. Availability must therefore
be calculated using the selected package's complete duration, not only
its starting time.

For example, if a customer selects a **2-hour package** and chooses
**9:00 AM**, the system must check capacity continuously from:

**9:00 AM → 11:00 AM**

The 9:00 AM starting time can be offered only if the salon has enough
capacity throughout that entire period.

If there is any point between 9:00 AM and 11:00 AM where adding the new
appointment would create a third simultaneous appointment, the 9:00 AM
option must be shown as unavailable.

This rule must also work correctly for packages of different durations.

## Example

Assume these appointments already exist:

-   Appointment A: **9:00 AM -- 11:00 AM**
-   Appointment B: **9:00 AM -- 10:00 AM**

From **9:00 AM to 10:00 AM**, the salon is at maximum capacity because
two pets are already being handled.

Therefore, no third appointment may overlap that period.

At **10:00 AM**, Appointment B finishes. One booking space becomes
available again while Appointment A continues until 11:00 AM.

A new appointment may therefore start at 10:00 AM if its complete
duration can be accommodated without creating a capacity conflict later.

For example, if the new package runs from **10:00 AM to 12:00 PM**, the
system must check the whole 10:00 AM--12:00 PM period before confirming
that 10:00 AM is available.

## Customer Booking Portal

The customer experience should remain simple:

**Select Package → Select Date → View Available Times → Book**

Customers must **not** see:

-   Table numbers
-   Grooming stations
-   Resource allocation
-   Internal capacity calculations

The customer only needs to know whether a particular starting time is
available.

The system should calculate the availability automatically in the
background using:

-   Selected package duration
-   Existing appointment start times
-   Existing appointment end times
-   Maximum simultaneous appointment capacity
-   Relevant appointment statuses
-   The complete duration of the proposed appointment

If only one appointment is running during a period, another appointment
can still be accepted.

If two appointments are already running at the same time, that period
has reached full capacity.

## Admin Portal

The Admin Portal must follow **exactly the same scheduling and
availability rules** as the Customer Booking Portal.

The admin's time-slot availability must be calculated using the same
backend logic.

Availability must be recalculated whenever an admin action can affect
scheduling, including when the admin:

-   Creates an appointment
-   Changes an appointment date
-   Changes an appointment start time
-   Changes the selected package
-   Changes anything that affects the appointment duration
-   Reschedules an appointment
-   Cancels an appointment

The Admin Portal must not show a time as available when the Customer
Booking Portal considers it unavailable, or vice versa.

## Synchronisation Between Customer and Admin Portals

Both portals must remain fully synchronised.

If a customer creates a booking, the Admin Portal's availability must
reflect the new booking.

If a customer changes or cancels a booking, the available capacity must
be recalculated.

Similarly, if an admin creates, changes, reschedules, or cancels an
appointment, the Customer Booking Portal must immediately use the
updated availability.

There should not be separate scheduling rules for the two portals.

## Single Source of Truth

The availability calculation should be implemented as **one common
backend scheduling service/logic**.

Both the Customer Booking Portal and Admin Portal should request
availability from this same backend logic rather than independently
calculating availability in their frontends.

This prevents:

-   Customer/Admin availability mismatches
-   Incorrect overlapping appointments
-   Accidental overbooking
-   Duplicate scheduling rules
-   Different behaviour between portals

The frontend should display the result of the backend availability
calculation rather than deciding capacity by itself.

## Availability Validation Before Saving

Showing available slots is not enough. The backend must **validate
availability again immediately before creating or updating an
appointment**.

For example:

1.  Customer A and Customer B may both open the booking page at
    approximately the same time.
2.  Both could initially see the same time as available.
3.  Customer A completes the booking first.
4.  Before saving Customer B's booking, the backend must check capacity
    again.
5.  If Customer B's appointment would now exceed the maximum capacity,
    the booking must not be created and the customer should be asked to
    select another available time.

This final validation helps prevent overbooking caused by simultaneous
booking attempts.

## Appointment Status Consideration

Only appointments that actually occupy salon capacity should be included
in the availability calculation.

For example, active/upcoming/confirmed appointments should normally
count toward capacity, while cancelled appointments should not continue
blocking time.

The exact statuses used by the project should be mapped to this rule so
that cancelling an appointment correctly releases its capacity.

## Expected Scheduling Behaviour

The system should follow these principles:

1.  Maximum simultaneous appointments = **2**.
2.  Different packages may have different durations.
3.  Overlapping appointments are allowed.
4.  One existing appointment does not automatically block a time period.
5.  Two simultaneous appointments mean the salon is at full capacity for
    that overlapping period.
6.  Availability must be checked across the selected package's **entire
    duration**.
7.  A starting time is unavailable if the proposed appointment would
    create more than two simultaneous appointments at any point.
8.  Capacity becomes available again as soon as an appointment ends.
9.  Customer and Admin portals must always use the same availability
    rules.
10. Internal capacity management must remain hidden from customers.
11. The backend should be the single source of truth for availability.
12. Availability must be validated again before an appointment is
    finally saved or updated.

## Goal

The purpose of this update is to create a smarter appointment scheduling
system that:

-   Makes maximum use of the salon's ability to handle two pets
    simultaneously
-   Supports packages with different durations
-   Allows valid overlapping bookings
-   Prevents overbooking
-   Avoids unnecessarily blocking available appointment times
-   Keeps Customer and Admin portals fully synchronised
-   Automatically releases capacity when appointments finish or are
    cancelled
-   Keeps the customer booking experience simple
-   Maximises the number of appointments the salon can accept without
    creating scheduling conflicts

The final system should therefore calculate availability based on
**package duration + existing appointments + appointment status +
maximum simultaneous capacity**, while keeping all internal capacity
calculations invisible to customers.
