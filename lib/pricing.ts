// Prices come from the DATABASE — Settings is the single source of truth.
//
// `lib/data.ts` still owns everything a price card needs that no database column
// holds: the emoji, the "what's included" list, the struck-through "before"
// total, the notes and the Best-value badge. This module marries the two, so a
// price the owner edits in Settings → Package pricing is the price the customer
// reads on the website, and an inactive package disappears from the site instead
// of offering a "Book" button the API will refuse.
//
// Server-only: it touches Prisma. Call it from a server component and pass the
// result down.
import { prisma } from "./db";
import {
  ADD_ONS,
  BOOKING_OPTIONS,
  EXTRA_SERVICES,
  PRICE_PACKAGES,
  SINGLE_SERVICE,
  SPA_SERVICES,
  formatLKR,
  packageOptionNames,
  type AddOn,
  type PricePackage,
} from "./data";

export type PricingView = {
  packages: PricePackage[]; // display content, database prices, inactive removed
  spa: AddOn[];
  extras: AddOn[];
  addOns: AddOn[]; // spa + extras, for the booking form
  bookingOptions: string[]; // package dropdown, matching what's actually bookable
  live: boolean; // false → database unreachable, showing the printed prices
};

const PRINTED: PricingView = {
  packages: PRICE_PACKAGES,
  spa: SPA_SERVICES,
  extras: EXTRA_SERVICES,
  addOns: ADD_ONS,
  bookingOptions: BOOKING_OPTIONS,
  live: false,
};

export async function getPricingView(): Promise<PricingView> {
  try {
    const [pkgRows, addOnRows] = await Promise.all([
      prisma.package.findMany({ select: { key: true, price: true, active: true } }),
      prisma.addOn.findMany({ select: { key: true, price: true, active: true } }),
    ]);
    const pkgByKey = new Map(pkgRows.map((p) => [p.key, p]));
    const addOnByKey = new Map(addOnRows.map((a) => [a.key, a]));

    const packages = PRICE_PACKAGES.flatMap((p): PricePackage[] => {
      // A tiered package is really two catalog packages (with / without knots);
      // each tier carries its own price and can be retired on its own.
      if (p.tiers) {
        const tiers = p.tiers.flatMap((t) => {
          const row = pkgByKey.get(t.key);
          return row?.active ? [{ ...t, offer: formatLKR(row.price) }] : [];
        });
        return tiers.length ? [{ ...p, tiers }] : [];
      }
      const row = pkgByKey.get(p.id);
      return row?.active ? [{ ...p, offer: formatLKR(row.price) }] : [];
    });

    const priced = (list: AddOn[]) =>
      list.flatMap((a) => {
        const row = addOnByKey.get(a.id);
        return row?.active ? [{ ...a, price: formatLKR(row.price) }] : [];
      });

    const spa = priced(SPA_SERVICES);
    const extras = priced(EXTRA_SERVICES);

    return {
      packages,
      spa,
      extras,
      addOns: [...extras, ...spa],
      bookingOptions: [
        ...packages.flatMap(packageOptionNames),
        ...(spa.length ? ["Spa Treatments"] : []),
        ...(extras.length || spa.length ? [SINGLE_SERVICE] : []),
      ],
      live: true,
    };
  } catch {
    // The marketing page must never 500 because the database blinked. Fall back
    // to the prices compiled into the site — stale beats a broken page.
    return PRINTED;
  }
}
