// Bridges the marketing booking form (package names + add-on ids) to the backend
// catalog keys used by /api/availability and /api/bookings. The 4 grooming
// packages share ids with PRICE_PACKAGES; standalone options resolve by intent.
import { ADD_ONS, SINGLE_SERVICE, SPA_OPTION, packageForOption } from "./data";

// Marketing add-on category → the standalone catalog key that carries its duration.
const CATEGORY_TO_KEY: Record<string, string> = {
  colour: "colour-only",
  trim: "trim-only",
  haircut: "trim-only",
  spa: "spa-only",
  // The care services booked on their own share one 30-minute standalone slot.
  // Without an entry here they'd fall through to "spa-only" and be recorded as
  // a spa treatment in the salon's appointment list.
  bath: "care-only",
  nails: "care-only",
  ears: "care-only",
  teeth: "care-only",
  perfume: "care-only",
};

export function packageKeyForOption(optionName: string, addOnIds: string[]): string | null {
  // A real package: name matches a PRICE_PACKAGES row, whose id == catalog key.
  // A tiered package ("… (with knots)") resolves to that tier's own key, so the
  // price estimate and duration come from the variant the customer picked.
  const match = packageForOption(optionName);
  if (match) return match.tier?.key ?? match.pkg.id;

  if (optionName === SPA_OPTION) return "spa-only";

  // Single service (no package): pick the standalone key from the chosen add-ons.
  if (optionName === SINGLE_SERVICE) {
    const chosen = ADD_ONS.filter((a) => addOnIds.includes(a.id));
    if (chosen.some((a) => a.category === "colour")) return "colour-only";
    if (chosen.some((a) => a.category === "trim" || a.category === "haircut")) return "trim-only";
    if (chosen.length) return CATEGORY_TO_KEY[chosen[0].category] ?? "spa-only";
    return "spa-only";
  }
  return null;
}
