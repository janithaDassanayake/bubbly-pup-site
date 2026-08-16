// What the customer actually owes for a visit.
//
// Two numbers live on an appointment: `priceEstimate` — the package + add-ons
// total the rules produce — and `priceOverride` — a final price the admin typed
// on Edit appointment (a discount, or extra for extra work/time). The override
// wins when it's set; the estimate stays untouched so the original quote is
// still readable next to it.
//
// Everywhere that shows or collects money should read the price through here,
// or a discount agreed at the desk quietly turns back into full price on the
// payment screen.
export type PricedAppointment = {
  priceEstimate: number;
  priceOverride?: number | null;
};

export const finalPrice = (a: PricedAppointment): number =>
  a.priceOverride ?? a.priceEstimate;

export const isPriceAdjusted = (a: PricedAppointment): boolean =>
  a.priceOverride != null && a.priceOverride !== a.priceEstimate;
