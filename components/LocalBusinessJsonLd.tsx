// LocalBusiness structured data — what Google reads for local results
// ("pet grooming near me") and the knowledge panel.
//
// Opening hours come from the SAME Settings row the booking engine uses, so when
// the salon changes its opening time in Settings the search listing follows. A
// hard-coded copy here would quietly drift and start advertising hours the
// booking form refuses.
//
// Deliberately absent: `aggregateRating` and `review`. Ratings must reflect real
// collected reviews — inventing them to match the "Loved by 1000+ pets" copy
// would be a manual-action risk, not a shortcut. `geo` is absent for the same
// reason: no verified coordinates, and `hasMap` already points at the real pin.
import { SITE } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { requestOrigin } from "@/lib/site";

// Indexed the way Settings.workingDays stores days (0 = Sunday … 6 = Saturday).
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Mirrors lib/settings DEFAULTS — open every day, 09:00–18:00.
const FALLBACK_HOURS = {
  openTime: "09:00",
  closeTime: "18:00",
  workingDays: [1, 2, 3, 4, 5, 6, 0],
};

export default async function LocalBusinessJsonLd() {
  // A database blip must not take the homepage down over a <script> tag — the
  // printed hours are a better answer than a 500.
  const hours = await getSettings().catch(() => FALLBACK_HOURS);
  // Prefer the host actually being browsed, so bubblypup.lk describes itself
  // rather than the vercel.app alias.
  const origin = await requestOrigin();

  const data = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${origin}/#business`,
    name: SITE.name,
    description: SITE.tagline,
    url: origin,
    image: `${origin}/media/logo.png`,
    logo: `${origin}/media/logo.png`,
    // SITE.whatsapp is E.164 without the leading +, which is what wa.me wants;
    // schema.org wants the + back.
    telephone: `+${SITE.whatsapp}`,
    email: SITE.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: "327, 43 Sethsiri Gardens Road",
      addressLocality: "Kadawatha",
      postalCode: "11850",
      addressCountry: "LK",
    },
    hasMap: SITE.mapUrl,
    areaServed: SITE.location,
    currenciesAccepted: "LKR",
    sameAs: [SITE.facebook],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [...hours.workingDays]
          .sort((a, b) => a - b)
          .map((d) => DAY_NAMES[d])
          .filter(Boolean),
        opens: hours.openTime,
        closes: hours.closeTime,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // The JSON is injected verbatim, so escape `<` — otherwise a stray
      // "</script>" inside any field would close this tag early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
