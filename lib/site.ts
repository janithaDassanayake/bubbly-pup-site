// Absolute URLs. Reset links MUST be absolute (they travel by email), and they
// must point at the deployment the admin is actually using — so prefer the live
// request's own host over any env var. That way preview deployments and a future
// custom domain both work with no configuration.
import { headers } from "next/headers";

// The fallback is the real customer-facing domain, not the vercel.app alias —
// canonical/OG tags must point search engines at bubblypup.lk even if SITE_URL
// is ever unset, or the alias competes with the real site for the same keywords.
export const siteUrl = () =>
  (process.env.SITE_URL || "https://bubblypup.lk").replace(/\/$/, "");

export async function requestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return siteUrl();
    const proto =
      h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    // Outside a request (scripts, build) there are no headers to read.
    return siteUrl();
  }
}
