// Shared, framework-free formatters for the admin portal.
import { formatPhone } from "./phone";

export const formatLKR = (n: number) => `Rs. ${(n || 0).toLocaleString("en-US")}`;

// How a customer is named in the portal now that the forms don't ask for one.
// Identity is the phone number (it's the UNIQUE key, and it's what the salon
// actually messages); pets are the human-friendly part and are shown beside it
// by the screens that have them. Customers saved before the name was dropped
// still have one, so it wins when it's there — no row loses a label it had.
export const customerLabel = (c: { name?: string | null; phone: string }) =>
  c.name?.trim() || formatPhone(c.phone);
