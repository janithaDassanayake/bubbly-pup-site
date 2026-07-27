# Bubbly Pop Pet Grooming — Website Project

A website for **Bubbly Pop Pet Grooming**, styled after [Woofly.in](https://woofly.in/),
with a pink + white interactive theme, cinematic before/after and grooming-process
effects, and a booking system that sends reservations straight to WhatsApp.

---

## 1. Project Goal

Build a good-looking, interactive website for the pet grooming salon **Bubbly Pop
Pet Grooming**. Match the layout, structure, and grooming-package style of the
reference site Woofly. Make it a **white and pink** color theme, modern and interactive.

---

## 2. Reference / Source Links

| Purpose | Link |
|---|---|
| Style + grooming packages reference | https://woofly.in/ |
| Salon details (Google business listing) | https://share.google/fEf8mZuh59SLK36aA |
| Customer before/after photos | From the Bubbly Pop Google listing (same link above) |

---

## 3. Brand & Design

- **Business name:** Bubbly Pop Pet Grooming
- **Color theme:** White + pink, interactive feel
- **Style basis:** Follow the same layout/structure as Woofly
- **Tone:** Friendly, fun, professional pet-care brand

---

## 4. Grooming Packages (taken from Woofly)

Use the same packages as the Woofly site:

1. **Spa Bath** — Bath and Blow Dry
2. **Haircut** — Full Body Haircut / Hair Trimming
3. **Basic Grooming** — Hygiene Haircut (Face, Sanitary Area, Under Paws), Bath and Blow Dry
4. **Full Grooming** — Full Body Haircut / Hair Trimming, Bath and Blow Dry
5. **Basic Grooming Without Bath** — Hygiene Haircut (Face, Sanitary Area, Under Paws)
6. **Dry Bath** — Full Body Bath With Dry Shampoo
7. **Dry Bath With Hygiene Haircut** — Hygiene Haircut + Dry Bath

**Free services included with every package:** Nail Cutting, Ear Cleaning, Mouth
Cleaning, Paw Butter Application, Combing, and Perfume.

---

## 5. Booking / Reservation System

The booking works as a **"Book Now" / Make a Reservation** flow. When a customer
submits, the reservation is **sent to our WhatsApp**.

- **WhatsApp number for reservations:** **+94712345678**

### Booking form must collect:
- Selected **time slot** and **package**
- **Person's name**
- **Dog's name**
- **Dog's age**
- **Dog's breed** — provided via a **dropdown list of all dog breeds**
- **Aggressive?** — whether the dog is aggressive or not
- **Date and time** of the appointment

All of the above gets formatted into a message that opens in WhatsApp directed to
+94712345678.

---

## 6. Video Sections

There are **two** video sections (videos are in the `images_and_videos` folder):

1. **Problems & things-to-know section** — videos where the grooming problems and
   important things to know about grooming are explained.
2. **"How we do the grooming" series** — a video series showing how the grooming is
   actually done. This section should use a **cinematic-portfolio "publication" effect**.

---

## 7. Cinematic Effects

- **Front page (hero):** Use a **cinematic-portfolio front-page effect** on
  `before.png` and `after.png` to show the adorable transformation.
- **How we groom:** Use a **cinematic-portfolio publication effect** for the grooming
  process video series.

---

## 8. Images & Media

All images and videos come from the **`images_and_videos`** folder, including:
- `before.png` and `after.png` (for the cinematic hero transformation)
- Grooming process videos (for the "how we do the grooming" series)
- Problem/explanation videos
- Customer before/after photos (also pullable from the Bubbly Pop Google listing)

---

## 9. Testimonials

Add **a few testimonials** from happy customers. Customer photos and before/after
images can be sourced from the Bubbly Pop Pet Grooming Google listing.

---

## 10. Page Structure (overview)

1. Hero — cinematic before/after transformation (`before.png` → `after.png`)
2. Intro / value props (professional groomers, satisfaction, etc.)
3. Grooming packages (the 7 from Woofly)
4. "How we do the grooming" — cinematic publication-style video series
5. Problems & things-to-know — explainer videos
6. Testimonials — with customer before/after photos
7. Booking / Reservation form → sends to WhatsApp (+94712345678)
8. Contact / footer

---

## 11. Open Items / Needed From You

To finish with your real content, please provide:
- The **`images_and_videos` folder** (it was not included in the upload — the uploads
  folder came through empty). This holds `before.png`, `after.png`, the grooming
  videos, and explainer videos.
- Confirmation that the customer photos should be pulled from the Google listing, or
  the actual image files, since the Google share link blocks automated access.

---

## 12. Tech Notes

- Single-page website, white + pink theme, interactive.
- WhatsApp booking uses a `https://wa.me/94712345678?text=...` link with the
  reservation details URL-encoded into the message.
- Place media files in `assets/images/` and `assets/videos/` and reference them
  from the page.
