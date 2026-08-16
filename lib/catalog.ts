// Canonical bookable catalog — the single source of truth for durations
// (from the SRS §4) and base prices. Used by the seed and the booking engine.
//
// "Packages" table holds BOTH real packages (standalone=false) and the
// individual standalone services (standalone=true), each carrying a duration.
// Add-ons never change the appointment duration (SRS §5, Rule 1).

export type CatalogPackage = {
  key: string;
  name: string;
  durationMin: number;
  price: number; // LKR — base/offer price; editable in admin Settings later
  standalone: boolean;
};

export const CATALOG_PACKAGES: CatalogPackage[] = [
  // Main grooming packages
  // Name mirrors PRICE_PACKAGES in lib/data.ts — the booking form sends the
  // marketing name, the admin reads this one, and they must be the same package
  // in words as well as in key.
  { key: "wash-premium", name: "Full Bath & Cleaning Package", durationMin: 60, price: 6000, standalone: false },
  // Two variants of the same groom: a matted coat takes the same 2 hours but
  // costs Rs. 1,000 more, so each is its own bookable package rather than a
  // label the customer picks after the price is already fixed.
  { key: "wash-trim", name: "Full Body Haircut Package (without knots)", durationMin: 120, price: 6000, standalone: false },
  { key: "wash-trim-knots", name: "Full Body Haircut Package (with knots)", durationMin: 120, price: 7000, standalone: false },
  { key: "wash-basic", name: "Basic Bath & Cleaning", durationMin: 30, price: 4000, standalone: false },
  { key: "cat", name: "Cat Bath & Care", durationMin: 30, price: 3500, standalone: false },
  // Standalone services (booked WITHOUT a package) — SRS §4
  { key: "spa-only", name: "Spa Treatment", durationMin: 30, price: 1500, standalone: true },
  { key: "trim-only", name: "Trim Only", durationMin: 60, price: 3500, standalone: true },
  { key: "colour-only", name: "Colouring Only", durationMin: 30, price: 1500, standalone: true },
  // The slot a customer occupies when they book care services on their own —
  // a nail clip, an ear clean, a bath — with no package. Price 0 because a
  // standalone booking is quoted as the sum of the services chosen
  // (`/api/bookings`: `pkg.standalone ? addOnTotal : pkg.price + addOnTotal`);
  // this row exists to carry the 30-minute duration, not a price.
  { key: "care-only", name: "No package (care services)", durationMin: 30, price: 0, standalone: true },
];

export type CatalogAddOn = {
  key: string;
  name: string;
  price: number;
  category: string;
  group: string;
};

// Optional extras that can ride along with a main package (no duration impact).
// Mirrors ADD_ONS in lib/data.ts — same keys, same names, same prices. The seed
// upserts BY KEY, so a renamed service keeps its row and its history.
export const CATALOG_ADDONS: CatalogAddOn[] = [
  { key: "trim-noknots", name: "Full Trim (without knots)", price: 3500, category: "trim", group: "addon" },
  { key: "trim-knots", name: "Full Trim (with knots)", price: 4500, category: "trim", group: "addon" },
  { key: "haircut", name: "Face Cut", price: 1500, category: "haircut", group: "addon" },
  { key: "colour", name: "Pet Hair Colouring", price: 1000, category: "colour", group: "addon" },
  { key: "bath", name: "Shampoo Bath", price: 2800, category: "bath", group: "addon" },
  { key: "nails", name: "Nail Clipping", price: 500, category: "nails", group: "addon" },
  { key: "ears", name: "Ear Cleaning", price: 500, category: "ears", group: "addon" },
  { key: "teeth", name: "Teeth Cleaning", price: 450, category: "teeth", group: "addon" },
  { key: "perfume", name: "Perfume Application", price: 350, category: "perfume", group: "addon" },
  { key: "spa-pawbutter", name: "Paw Butter Cream + Massage", price: 1500, category: "spa", group: "spa" },
  { key: "spa-oil", name: "Full Body Oil Massage", price: 2500, category: "spa", group: "spa" },
  { key: "spa-conditioner", name: "Conditioner", price: 1000, category: "spa", group: "spa" },
];

export const packageByKey = (key: string) =>
  CATALOG_PACKAGES.find((p) => p.key === key);
export const addOnByKey = (key: string) =>
  CATALOG_ADDONS.find((a) => a.key === key);
