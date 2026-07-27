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
  { key: "wash-premium", name: "Grooming Package for Wash", durationMin: 60, price: 6000, standalone: false },
  // Two variants of the same groom: a matted coat takes the same 2 hours but
  // costs Rs. 1,000 more, so each is its own bookable package rather than a
  // label the customer picks after the price is already fixed.
  { key: "wash-trim", name: "Grooming Package with Trim (without knots)", durationMin: 120, price: 6000, standalone: false },
  { key: "wash-trim-knots", name: "Grooming Package with Trim (with knots)", durationMin: 120, price: 7000, standalone: false },
  { key: "wash-basic", name: "Basic Grooming Package for Wash", durationMin: 30, price: 4000, standalone: false },
  { key: "cat", name: "Grooming Package for Cat", durationMin: 30, price: 3500, standalone: false },
  // Standalone services (booked WITHOUT a package) — SRS §4
  { key: "spa-only", name: "Spa Treatment", durationMin: 30, price: 1000, standalone: true },
  { key: "trim-only", name: "Trim Only", durationMin: 60, price: 3500, standalone: true },
  { key: "colour-only", name: "Colouring Only", durationMin: 30, price: 5000, standalone: true },
];

export type CatalogAddOn = {
  key: string;
  name: string;
  price: number;
  category: string;
  group: string;
};

// Optional extras that can ride along with a main package (no duration impact).
export const CATALOG_ADDONS: CatalogAddOn[] = [
  { key: "haircut", name: "Hair Cut", price: 2500, category: "haircut", group: "addon" },
  { key: "trim-noknots", name: "Full body trim / shave (without knots)", price: 3500, category: "trim", group: "addon" },
  { key: "trim-knots", name: "Full body trim / shave (with knots)", price: 4500, category: "trim", group: "addon" },
  { key: "colour", name: "Pet Hair Colouring", price: 5000, category: "colour", group: "addon" },
  { key: "spa-pawbutter", name: "Paw Butter Cream + Massage", price: 1000, category: "spa", group: "spa" },
  { key: "spa-oil", name: "Full Body Oil Massage", price: 2500, category: "spa", group: "spa" },
  { key: "spa-conditioner", name: "Conditioner Treatment", price: 3500, category: "spa", group: "spa" },
];

export const packageByKey = (key: string) =>
  CATALOG_PACKAGES.find((p) => p.key === key);
export const addOnByKey = (key: string) =>
  CATALOG_ADDONS.find((a) => a.key === key);
