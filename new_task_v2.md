### Appointment Reservation Page – Required Changes

#### 1. Aggressive Dog Confirmation & Consent

On the **Make Reservation** page, we currently ask:

**“Is your dog aggressive?” — Yes / No**

If the customer selects **Yes**, display a confirmation popup with the following message:

> **Important Notice – Aggressive Dog**
>
> Grooming an aggressive or highly anxious dog can be challenging and may not always be possible to complete safely. Our groomers will always do their best to provide the requested grooming service while prioritizing the safety and well-being of your dog and our staff.
>
> If your dog shows severe aggression, attempts to bite, or becomes too distressed during grooming, we may need to pause, modify, or stop the grooming session. In such cases, some requested grooming services may not be completed.

Below the message, add a **required checkbox**:

☐ **I understand and accept the above conditions regarding grooming an aggressive dog and agree to proceed with the appointment.**

The customer **cannot continue with the reservation until this checkbox is selected**.

#### 2. Change the Reservation Form Order

Update the field positions in the **Make Reservation** form so that:

**Appointment Date** comes first → **Time Slot** comes immediately after it.

The available time slots should be shown **based on the selected appointment date**.

**Expected flow:**
`Select Appointment Date → Display Available Time Slots → Select Time Slot → Continue Reservation`
