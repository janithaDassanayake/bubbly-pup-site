# Bubbly Pop Pet Grooming — Website

A modern, interactive single-page website for **Bubbly Pop Pet Grooming**, built
with **Next.js (App Router) + TypeScript**. White & pink theme, cinematic
before/after hero, grooming video series, explainer reels, testimonials, and a
booking form that sends reservations straight to WhatsApp.

## Run it

```bash
npm install      # first time only
npm run dev      # http://localhost:3000  (live-reload)
npm run build    # production build
npm run start    # serve the production build
```

## What's inside

| Section | Where |
|---|---|
| Hero — draggable **before/after** cinematic slider | `components/Hero.tsx` |
| Value props | `components/ValueProps.tsx` |
| 7 grooming packages + free add-ons | `components/Packages.tsx` |
| "How we do the grooming" cinematic film series | `components/HowWeGroom.tsx` |
| Problems & things-to-know explainer reels | `components/Explainers.tsx` |
| Testimonials | `components/Testimonials.tsx` |
| Booking form → WhatsApp | `components/Booking.tsx` |
| Footer + floating WhatsApp button | `components/Footer.tsx`, `components/FloatingWhatsApp.tsx` |

## Editing content

- **Packages, videos, testimonials, value props, time slots** → `lib/data.ts`
- **Dog breed dropdown** → `lib/breeds.ts`
- **Business name / WhatsApp number / email / location** → the `SITE` object in `lib/data.ts`
  - WhatsApp is currently **+94 76 668 4586** (`whatsapp: "94766684586"`).

## Media

All images/videos live in `public/media/` (copied from `images_and_videos/` with
clean ASCII names):

- `before.png`, `after.png` — hero transformation
- `grooming/groom-1..4.mp4` — "how we do the grooming" series
- `explainers/explainer-1..6.mp4` — problem/explainer reels
- `logo.png`, `owner.png`

To swap a video, drop a new file with the same name into the matching folder, or
update the path in `lib/data.ts`.

## Booking → WhatsApp

The form collects package, time slot, date, owner name, dog name, dog age, breed
(dropdown), and an aggressive Yes/No toggle. On submit it opens
`https://wa.me/94766684586?text=...` with the formatted reservation message
pre-filled — no backend needed.
