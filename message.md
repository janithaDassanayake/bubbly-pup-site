# WhatsApp messages

Every message the salon and its customers exchange, as it appears on the phone.
These are **rendered** samples — `*bold*` and `_italic_` markers are shown so the
templates can be compared with the code.

| # | Message | Sent when | Lives in |
|---|---------|-----------|----------|
| 1 | New Grooming Reservation | Customer taps **Book** on the website — customer → salon | `lib/booking-message.ts` |
| 2 | Booking received | Queued the moment the booking is saved — salon → customer | `lib/whatsapp.ts` |
| 3 | Appointment confirmed | Salon marks the booking **Confirmed** | `lib/whatsapp.ts` |
| 4 | Grooming complete | Groom finished, before/after photos attached | `lib/whatsapp.ts` |
| 5 | Thank you & feedback | Salon marks the visit **Paid & Completed** | `lib/whatsapp.ts` |

Business details (name, review links, salon number) come from `SITE` in
`lib/data.ts` — change them there, not in the message text.

---

## 1. New Grooming Reservation — customer → salon

```
🐾 *New Grooming Reservation* 🐾
_Bubbly Pup Pet Grooming_

📋 *Booking Ref:* BP-CFBB3D

━━━━━━━━━━━━━━━
🧴 *Package:*  Grooming Package for Wash
📅 *Date:*  Tue, 28 Jul 2026
⏰ *Time:*  09:00 AM
━━━━━━━━━━━━━━━

➕ *Add-ons*
   • Nail Trim — Rs. 500
   • Ear Cleaning — Rs. 400
   _Add-ons subtotal: Rs. 900_

👤 *Owner*
   • Name:  Nimali
   • WhatsApp:  +94 71 234 5678

🐶 *Dog*
   • Name:  Coco
   • Age:  1
   • Breed:  Basset Hound
   • Aggressive:  No

Please confirm my appointment. Thank you! 💕
```

**No admin link.** This message is composed on the *customer's* phone and sent from
their WhatsApp, so everything in it is theirs to read and forward — an `/admin`
URL has no place in it. The **Booking Ref** does the same job: paste it into the
portal's search to open that exact appointment.

**Variations.** À-la-carte bookings show `🧴 *Booking:*  Single service (no package)`
with a `✨ *Services*` list and a `*Total*`. Notes appear as `📝 *Notes:*` when the
customer wrote any. An aggressive dog is flagged, never buried in the list:

```
   • Aggressive:  *YES* ⚠️ _(owner accepted the grooming conditions)_
```

The phone number is normalised to `+94 71 234 5678` before sending, so the salon
can tap it straight from the chat.

---

## 2. Booking received — salon → customer

```
🐾 *Bubbly Pup Pet Grooming* 🐾

Hi Nimali! 👋
We've received your grooming booking for *Coco* 🐶

━━━━━━━━━━━━━━━
📋 *Booking:*  BP-CFBB3D
🧴 *Package:*  Grooming Package for Wash
📅 *Date:*  Tue, 28 Jul 2026
⏰ *Time:*  09:00 AM
━━━━━━━━━━━━━━━

⏳ Your slot is *pending confirmation* — we'll message you shortly to confirm.

Thank you for choosing us! 🐾💕
```

---

## 3. Appointment confirmed — salon → customer

```
🐾 *Bubbly Pup Pet Grooming* 🐾

Good news Nimali! ✅
*Coco*'s grooming appointment is *confirmed*.

━━━━━━━━━━━━━━━
📋 *Booking:*  BP-CFBB3D
🧴 *Package:*  Grooming Package for Wash
📅 *Date:*  Tue, 28 Jul 2026
⏰ *Time:*  09:00 AM
━━━━━━━━━━━━━━━

📍 Please arrive a few minutes early.
🔄 Need to reschedule? Just reply to this message.

See you and Coco soon! 🐶💕
```

---

## 4. Grooming complete — salon → customer

Deliberately short: it becomes the **caption** on the before/after photos, which
ride along as real image attachments.

```
🐾 *Bubbly Pup Pet Grooming* 🐾

Hi Nimali! Coco's grooming is all done ✨

🧴 *Service:*  Grooming Package for Wash
📸 Here's *Coco* before and after!

Thank you for choosing us — we'd love your feedback, just reply here. 🐾💕
```

---

## 5. Thank you & feedback — salon → customer

Sent right after pickup, when a happy customer is most likely to leave a review.

```
Thank you for visiting *Bubbly Pup Pet Grooming* today! 🐾💕

We hope *Coco* enjoyed the grooming session! 🐶✨

We'd love to hear about your experience. Your feedback means a lot to us and helps us keep giving the best care to our furry friends. 💗

⭐ *Leave us a Google Review:*
https://search.google.com/local/writereview?placeid=ChIJRXaVrB_54joRpKqFunBv8u0

💙 *Share your feedback on Facebook:*
https://www.facebook.com/p/Bubbly-Pup-Pet-Grooming-Salon-61578012331242/

Or simply reply to this message with your feedback 😊

Thank you for choosing *Bubbly Pup Pet Grooming*! 🐾
See you & Coco again soon! 🐶💕
```

---

## House style

- **Branded first line** on every salon message: `🐾 *Business Name* 🐾`.
- **Boxed details** between two `━━━━━━━━━━━━━━━` rules, in the same order every
  time — Booking, Package, Date, Time — so a customer can find their slot at a
  glance in whichever message they scroll to.
- Rules are kept short on purpose: a longer one wraps on a narrow phone and
  breaks into two ragged lines.
- Dates are always human (`Tue, 28 Jul 2026`), never `2026-07-28`.
- One clear next step near the end, then a warm sign-off.
