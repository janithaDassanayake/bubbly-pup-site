// Central content config for Bubbly Pup Pet Grooming.

export const SITE = {
  name: "Bubbly Pup Pet Grooming",
  shortName: "Bubbly Pup",
  tagline: "Pampering pets to glow with happiness",
  whatsapp: "94766684586", // E.164 without the + for wa.me links
  whatsappDisplay: "+94 76 668 4586",
  email: "hello@bubblypup.lk",
  // `city` is where the salon physically is (Hero badge — a local name reads as
  // "near me"); `location` stays the wider area it serves, which is what the
  // LocalBusiness `areaServed` should claim. Keep them separate.
  city: "Kadawatha",
  location: "Sri Lanka",
  // Salon address. `mapUrl` is the salon's own Google Maps share link (opens the
  // real place card + directions). `mapEmbed` is the keyless embed form — plain
  // `?output=embed`, deliberately NOT the Maps Embed API, so there is no API key
  // to leak and no billing account to keep alive.
  address: "327, 43 Sethsiri Gardens Road, Kadawatha 11850",
  mapUrl: "https://maps.app.goo.gl/9ARBxF2Nr3bJytJr5?g_st=iwb",
  mapEmbed:
    "https://www.google.com/maps?q=Bubbly+Pup+Pet+Grooming+Salon,+43+Sethsiri+Gardens+Road,+Kadawatha+11850&output=embed",
  // Where the thank-you message sends happy customers. Config, not copy — the
  // salon can repoint a review link without anyone touching the message code.
  googleReview:
    "https://search.google.com/local/writereview?placeid=ChIJRXaVrB_54joRpKqFunBv8u0",
  facebook: "https://www.facebook.com/p/Bubbly-Pup-Pet-Grooming-Salon-61578012331242/",
};

export type Package = {
  id: string;
  name: string;
  blurb: string;
  includes: string[];
  emoji: string;
  popular?: boolean;
};

// The 7 grooming packages (mirrors the Woofly structure).
export const PACKAGES: Package[] = [
  {
    id: "spa-bath",
    name: "Spa Bath",
    blurb: "A relaxing wash and fluff-up.",
    includes: ["Bath and Blow Dry"],
    emoji: "🛁",
  },
  {
    id: "haircut",
    name: "Haircut",
    blurb: "A fresh new look from nose to tail.",
    includes: ["Full Body Haircut / Hair Trimming"],
    emoji: "✂️",
  },
  {
    id: "basic-grooming",
    name: "Basic Grooming",
    blurb: "Tidy-up of the important areas, plus a bath.",
    includes: [
      "Hygiene Haircut (Face, Sanitary Area, Under Paws)",
      "Bath and Blow Dry",
    ],
    emoji: "🐾",
    popular: true,
  },
  {
    id: "full-grooming",
    name: "Full Grooming",
    blurb: "The complete head-to-paw makeover.",
    includes: [
      "Full Body Haircut / Hair Trimming",
      "Bath and Blow Dry",
    ],
    emoji: "🌟",
    popular: true,
  },
  {
    id: "basic-no-bath",
    name: "Basic Grooming Without Bath",
    blurb: "Quick hygiene trim, no bath needed.",
    includes: ["Hygiene Haircut (Face, Sanitary Area, Under Paws)"],
    emoji: "💇",
  },
  {
    id: "dry-bath",
    name: "Dry Bath",
    blurb: "A waterless freshen-up for sensitive pets.",
    includes: ["Full Body Bath With Dry Shampoo"],
    emoji: "🧴",
  },
  {
    id: "dry-bath-hygiene",
    name: "Dry Bath With Hygiene Haircut",
    blurb: "Dry shampoo plus a neat hygiene trim.",
    includes: [
      "Hygiene Haircut (Face, Sanitary Area, Under Paws)",
      "Full Body Bath With Dry Shampoo",
    ],
    emoji: "✨",
  },
];

// ---------- Detailed price list (from the salon flyer) ----------
export type PriceRow = { service: string; price: string };
// A package that comes in two variants (with / without knots). Each tier is its
// OWN bookable catalog package, because the prices differ by Rs. 1,000 — a tier
// that only changed the wording would leave the salon quoting the wrong total.
export type PriceTier = {
  key: string; // catalog package key (lib/catalog.ts)
  label: string;
  original: string;
  offer: string;
};

// Optional extras / à-la-carte services a customer can pick.
//
// One category PER SERVICE for the care items (bath, nails, ears, teeth,
// perfume) rather than a single shared "care": `addOnsFor` hides an add-on when
// the chosen package's `covers` lists its category, and the packages don't cover
// the same set — Cat Bath & Care has no ear or teeth cleaning, Basic Bath has no
// teeth. A shared category would either offer a second shampoo bath on a package
// that already includes one, or hide an ear cleaning the cat package would
// happily sell.
export type AddOnCategory =
  | "haircut"
  | "trim"
  | "colour"
  | "spa"
  | "bath"
  | "nails"
  | "ears"
  | "teeth"
  | "perfume"
  // Sold on their own, not part of the shared care set: a cat trim, a cat bath,
  // and the dog hygiene trim. Each has its own category so a package can hide
  // exactly the one it already includes — "cat-bath" is on the cat card, so it
  // is never sold twice, while "cat-trim" is not and stays available.
  | "cat-trim"
  | "cat-bath"
  | "hygiene";
// A service only one species can book. Most have none — a nail clip is a nail
// clip — so the field is optional and "no species" means "offer it to both".
export type PetSpecies = "dog" | "cat";
export type ServiceGroup = "addon" | "spa"; // which picker it shows in
export type AddOn = {
  id: string;
  label: string;
  price: string;
  category: AddOnCategory;
  group: ServiceGroup;
  // Set only where the service is meaningless for the other animal — a Cat Full
  // Trim on a labrador, a dog hygiene trim on a cat.
  species?: PetSpecies;
};

// "Rs. 5,000" -> 5000, and back to "Rs. 5,000".
export const priceToNumber = (price: string) =>
  Number(price.replace(/[^\d]/g, "")) || 0;
export const formatLKR = (n: number) => `Rs. ${n.toLocaleString("en-US")}`;

export type PricePackage = {
  id: string;
  name: string;
  emoji: string;
  rows: PriceRow[];
  original?: string; // struck-through "before" total
  offer?: string; // single offer price
  tiers?: PriceTier[]; // two-tier offer (e.g. with / without knots)
  // A one-line strapline under the title. Used to say what a package is NOT, in
  // the same breath as its name — "wash" packages were being read as "grooming,
  // so surely a haircut is in there".
  tagline?: string;
  // Shout the name in caps on the price card. The caps live in CSS, never in
  // `name`: the same string is the booking dropdown, the WhatsApp confirmation
  // and the admin appointment list, and a stored ALL-CAPS name shouts in all
  // three — plus screen readers spell caps out letter by letter.
  capsTitle?: boolean;
  note?: string;
  // Louder than `note`: an exclusion the customer must not miss before booking.
  warning?: string;
  popular?: boolean;
  // Add-on categories this package already covers — so we never offer
  // an add-on that overlaps with what's already included.
  covers?: AddOnCategory[];
};

export const PRICE_PACKAGES: PricePackage[] = [
  {
    id: "wash-premium",
    // Keep the name in step with lib/catalog.ts (the DB/admin name) — the
    // customer's confirmation and the salon's appointment list should read the
    // same words. The 🛁 is the card's emoji tile and the caps are `capsTitle`,
    // so neither is part of the stored name.
    name: "Full Bath & Cleaning Package",
    emoji: "🛁",
    tagline: "NO HAIRCUT • NO BODY TRIM • NO SHAVE",
    capsTitle: true,
    popular: true,
    rows: [
      { service: "Shampoo Bath", price: "Rs. 1,500" },
      { service: "Coat Conditioner", price: "Rs. 1,000" },
      { service: "Conditioner Body Massage", price: "Rs. 800" },
      { service: "Blow Dry", price: "Rs. 800" },
      { service: "Hair Brushing", price: "Rs. 850" },
      { service: "Hair Trimming (Sanitary Areas Only)", price: "Rs. 850" },
      { service: "Paw Trimming", price: "Rs. 400" },
      { service: "Ear Cleaning", price: "Rs. 500" },
      { service: "Nail Clipping / Grinding", price: "Rs. 500" },
      { service: "Teeth Cleaning / Mouth Freshener", price: "Rs. 450" },
      { service: "Perfume Application", price: "Rs. 350" },
    ],
    original: "Rs. 8,000",
    offer: "Rs. 6,000",
    warning:
      "⚠️ PLEASE NOTE: This package does NOT include a full-body haircut, body trim or shaving. Haircut / trim services are available separately.",
    // Read straight off this card's own rows above — every one of these is
    // already in the package, so selling it again as an add-on would charge
    // twice for one service. `trim` is deliberately NOT here: the warning says
    // the full-body trim is sold separately.
    // "hygiene" too: the rows above already trim the sanitary areas and paws, so
    // the standalone hygiene trim would be charging twice. The cat services are
    // hidden because this is a dog package, not because it includes them.
    covers: ["bath", "ears", "nails", "teeth", "perfume", "hygiene", "cat-trim", "cat-bath"],
  },
  {
    id: "wash-basic",
    // Same family as wash-premium above, so it shares its 🛁 and its caps.
    name: "Basic Bath & Cleaning",
    emoji: "🛁",
    tagline: "NO FULL-BODY HAIRCUT • NO SHAVE",
    capsTitle: true,
    rows: [
      { service: "Shampoo Bath", price: "Rs. 1,500" },
      { service: "Blow Dry", price: "Rs. 800" },
      { service: "Hair Brushing", price: "Rs. 850" },
      { service: "Nail Clipping / Grinding", price: "Rs. 500" },
      { service: "Perfume Application", price: "Rs. 350" },
      { service: "Ear / Eyes / Paw Cleaning", price: "Rs. 500" },
    ],
    original: "Rs. 4,500",
    offer: "Rs. 4,000",
    warning:
      "⚠️ PLEASE NOTE: This package does not include a full-body haircut, body trim or body massage.",
    // "Ear / Eyes / Paw Cleaning" covers `ears`. No teeth cleaning on this card,
    // so that one stays sellable as an add-on.
    // No sanitary/paw trim on this card, so the Dog Hygiene Trim stays sellable
    // alongside it; the cat-only services are hidden on a dog package.
    covers: ["bath", "ears", "nails", "perfume", "cat-trim", "cat-bath"],
  },
  {
    id: "wash-trim",
    // The complement of the two bath packages above — this is the one that DOES
    // include the full-body cut, so it shares their caps treatment.
    name: "Full Body Haircut Package",
    emoji: "✂️",
    capsTitle: true,
    rows: [
      { service: "Full Trim", price: "Rs. 3,500" },
      { service: "With Knots", price: "Rs. 4,500" },
      { service: "Shampoo Bath", price: "Rs. 1,500" },
      { service: "Nail Clipping", price: "Rs. 500" },
      { service: "Ear Cleaning", price: "Rs. 500" },
      { service: "Hair Brushing", price: "Rs. 800" },
      { service: "Perfume Application", price: "Rs. 350" },
    ],
    tiers: [
      {
        key: "wash-trim",
        label: "Without knots",
        original: "Rs. 7,150",
        offer: "Rs. 6,000",
      },
      {
        key: "wash-trim-knots",
        label: "With knots",
        original: "Rs. 8,150",
        offer: "Rs. 7,000",
      },
    ],
    // Already includes a full trim — don't offer it again — plus the bath,
    // nails, ears and perfume listed on its card. No teeth cleaning there, so
    // that stays sellable.
    // A full-body haircut takes the sanitary areas, paw pads and eye area with
    // it, so the hygiene trim is already in the price. Cat services hidden — dog
    // package.
    covers: ["trim", "bath", "nails", "ears", "perfume", "hygiene", "cat-trim", "cat-bath"],
  },
  {
    id: "cat",
    name: "Cat Bath & Care",
    emoji: "🐱",
    // Shouted on the card like the other three, so the row of names reads as a
    // set. The caps are CSS only — the stored name stays Title Case for the
    // WhatsApp confirmation, the admin list and screen readers.
    capsTitle: true,
    rows: [
      { service: "Shampoo Bath", price: "Rs. 1,500" },
      { service: "Blow Dry", price: "Rs. 800" },
      { service: "Hair Brushing", price: "Rs. 850" },
      { service: "Nail Clipping", price: "Rs. 500" },
      { service: "Perfume Application", price: "Rs. 350" },
    ],
    original: "Rs. 4,000",
    offer: "Rs. 3,500",
    // Cats aren't offered a full-body trim/shave. Ears and teeth are NOT on the
    // cat card, so both stay available as add-ons.
    // "cat-bath" is the Shampoo Bath on this card — never sold twice. "cat-trim"
    // is deliberately NOT covered: no trim is included here, so a Cat Full Trim
    // is a real add-on. "hygiene" is the dog trim, not offered on a cat.
    covers: ["trim", "bath", "nails", "perfume", "cat-bath", "hygiene"],
  },
];

// Every à-la-carte service: trims/cuts/colour ("addon" group) + spa treatments
// ("spa" group). Each is individually selectable and priced.
// The salon's à-la-carte list. `id` is also the catalog/database key, so the
// ids of the four original services are kept even where the wording changed
// ("haircut" now reads Face Cut) — a new id would strand the existing rows and
// every appointment that links to them.
export const ADD_ONS: AddOn[] = [
  {
    id: "trim-noknots",
    label: "Full Trim (without knots)",
    price: "Rs. 3,500",
    category: "trim",
    group: "addon",
  },
  {
    id: "trim-knots",
    label: "Full Trim (with knots)",
    price: "Rs. 4,500",
    category: "trim",
    group: "addon",
  },
  { id: "haircut", label: "Face Cut", price: "Rs. 1,500", category: "haircut", group: "addon" },
  {
    id: "colour",
    label: "Pet Hair Colouring",
    price: "Rs. 1,000",
    category: "colour",
    group: "addon",
  },
  { id: "bath", label: "Shampoo Bath", price: "Rs. 2,800", category: "bath", group: "addon" },
  { id: "nails", label: "Nail Clipping", price: "Rs. 500", category: "nails", group: "addon" },
  { id: "ears", label: "Ear Cleaning", price: "Rs. 500", category: "ears", group: "addon" },
  { id: "teeth", label: "Teeth Cleaning", price: "Rs. 450", category: "teeth", group: "addon" },
  { id: "perfume", label: "Perfume Application", price: "Rs. 350", category: "perfume", group: "addon" },
  // Cat-only trims/baths and the dog hygiene trim. All three are à-la-carte:
  // they show in the Individual Grooming Services picker and under "Single
  // service (no package)", and on a package only where it does not already
  // include them (see each package's `covers`).
  { id: "cat-trim", label: "Cat Full Trim", price: "Rs. 1,500", category: "cat-trim", group: "addon", species: "cat" },
  { id: "cat-bath", label: "Cat Bath Only", price: "Rs. 1,500", category: "cat-bath", group: "addon", species: "cat" },
  {
    id: "hygiene-trim",
    // The parenthetical is rendered as a second, smaller line by the price-list
    // picker (SelectableServices splits on it), so the three areas read as the
    // detail they are instead of a four-line row.
    label: "Dog Hygiene Trim (sanitary, paw pads, eye area)",
    price: "Rs. 1,500",
    category: "hygiene",
    group: "addon",
    species: "dog",
  },
  { id: "spa-pawbutter", label: "Paw Butter Cream + Massage", price: "Rs. 1,500", category: "spa", group: "spa" },
  { id: "spa-oil", label: "Full Body Oil Massage", price: "Rs. 2,500", category: "spa", group: "spa" },
  { id: "spa-conditioner", label: "Conditioner", price: "Rs. 1,000", category: "spa", group: "spa" },
];

// Split by picker.
export const SPA_SERVICES = ADD_ONS.filter((a) => a.group === "spa");
export const EXTRA_SERVICES = ADD_ONS.filter((a) => a.group === "addon");

// Booking a single service on its own (colour only, cut only, …).
export const SINGLE_SERVICE = "Single service (no package)";

// The name a tiered package is booked under — the tier has to reach the booking
// form, the message and the admin, so it lives in the option name itself rather
// than being lost between the price card and the appointment.
export const tierOptionName = (pkgName: string, tierLabel: string) =>
  `${pkgName} (${tierLabel.toLowerCase()})`;

// Every bookable option name, tiers expanded into one entry each.
export const packageOptionNames = (p: PricePackage): string[] =>
  p.tiers ? p.tiers.map((t) => tierOptionName(p.name, t.label)) : [p.name];

// Booking a spa visit with no grooming package. Declared here, ABOVE its first
// use, and referenced everywhere instead of being retyped — the same string is
// the dropdown entry, the price-card heading and the value `packageKeyForOption`
// matches on, so a copy that drifts silently breaks booking a spa visit.
export const SPA_OPTION = "Spa & Treatments";

// Options offered in the booking form's package dropdown.
export const BOOKING_OPTIONS: string[] = [
  ...PRICE_PACKAGES.flatMap(packageOptionNames),
  SPA_OPTION,
  SINGLE_SERVICE,
];

// Resolve any option name — plain or tiered — back to its price package.
export function packageForOption(
  optionName: string
): { pkg: PricePackage; tier?: PriceTier } | null {
  for (const pkg of PRICE_PACKAGES) {
    if (pkg.name === optionName) return { pkg };
    const tier = pkg.tiers?.find(
      (t) => tierOptionName(pkg.name, t.label) === optionName
    );
    if (tier) return { pkg, tier };
  }
  return null;
}

// Add-on categories a CATALOG PACKAGE KEY already includes — the same `covers`
// rules the website uses to hide an add-on, but reachable from the admin, which
// knows appointments by package key rather than by marketing option name.
// Without this the salon's own booking form would happily add a paid Shampoo
// Bath to a package whose card already lists one.
export function coveredCategoriesForKey(packageKey: string): AddOnCategory[] {
  const p = PRICE_PACKAGES.find(
    (x) => x.id === packageKey || x.tiers?.some((t) => t.key === packageKey)
  );
  return p?.covers ?? [];
}

// Which services a chosen option can be combined with.
export function addOnsFor(packageName: string): AddOn[] {
  // "Spa & Treatments" means the spa menu — it used to fall through to the
  // trims/cuts/colour list, so picking it offered a Full Body Trim and no
  // massage at all.
  if (packageName === SPA_OPTION) return SPA_SERVICES;
  if (packageName === SINGLE_SERVICE) return ADD_ONS;
  const covered = packageForOption(packageName)?.pkg.covers ?? [];
  return EXTRA_SERVICES.filter((a) => !covered.includes(a.category));
}

// Drop the services the chosen pet cannot have. Pet Type is the FIRST question
// on the booking form, so by the time the service chips render there is an
// answer to filter on. "" (nothing picked yet) shows everything — that is the
// price-list picker, which sells services with no pet in the conversation.
export const servicesForPet = (list: AddOn[], species: PetSpecies | "") =>
  species ? list.filter((a) => !a.species || a.species === species) : list;

// Options that ARE the services picked under them — "Spa & Treatments" and
// "Single service" carry no package of their own, so at least one service has
// to be chosen or there is nothing to price.
export const isServiceOnlyOption = (name: string) =>
  name === SPA_OPTION || name === SINGLE_SERVICE;

export const FREE_SERVICES = [
  { label: "Nail Cutting", emoji: "💅" },
  { label: "Ear Cleaning", emoji: "👂" },
  { label: "Mouth Cleaning", emoji: "🦷" },
  { label: "Paw Butter Application", emoji: "🧈" },
  { label: "Combing", emoji: "🪮" },
  { label: "Perfume", emoji: "🌸" },
];

export const VALUE_PROPS = [
  {
    emoji: "👩‍⚕️",
    title: "Professional groomers",
    text: "Caring, trained hands that treat every pet like their own.",
  },
  {
    emoji: "💖",
    title: "Stress-free & gentle",
    text: "Calm, patient grooming — even nervous or first-time pets feel safe.",
  },
  // Replaced the old "6 free add-ons" claim: the six were nails, ears, teeth,
  // paw butter, combing and perfume "with every package", and the price cards
  // don't bear that out — Cat Bath & Care carries no ear or teeth cleaning, and
  // nothing lists paw butter. These four ARE on all four packages' cards, so
  // this is the strongest promise the price list actually backs.
  {
    emoji: "🧼",
    title: "Complete packages",
    text: "Shampoo bath, brushing, nail clipping and perfume in every package.",
  },
  {
    emoji: "📸",
    title: "Pawfect results",
    text: "Wow-worthy before & after transformations, every single visit.",
  },
];

// "How we do the grooming" — cinematic publication-style series.
export const GROOMING_VIDEOS = [
  {
    src: "/media/grooming/groom-1.mp4",
    title: "The Big Fluff",
    chapter: "Chapter 01",
    caption: "Bath, blow-dry and that signature bubbly finish.",
  },
  {
    src: "/media/grooming/groom-2.mp4",
    title: "Trim & Shape",
    chapter: "Chapter 02",
    caption: "Precision scissor work for a clean, comfy coat.",
  },
  {
    src: "/media/grooming/groom-3.mp4",
    title: "Hygiene Care",
    chapter: "Chapter 03",
    caption: "Gentle hygiene trim around face, paws and sanitary areas.",
  },
  {
    src: "/media/grooming/groom-4.mp4",
    title: "The Glow Up",
    chapter: "Chapter 04",
    caption: "Final styling, perfume and a proud little strut.",
  },
];

// Problems & things-to-know explainer videos.
export const EXPLAINER_VIDEOS = [
  {
    src: "/media/explainers/explainer-1.mp4",
    title: "Grooming is essential for every pet",
    tag: "Why grooming matters",
  },
  {
    src: "/media/explainers/explainer-2.mp4",
    title: "How to choose the right pet shampoo",
    tag: "Products",
  },
  {
    src: "/media/explainers/explainer-3.mp4",
    title: "Are oil treatments really good?",
    tag: "Coat & skin",
  },
  {
    src: "/media/explainers/explainer-4.mp4",
    title: "Get pets used to grooming from a young age",
    tag: "Training",
  },
  {
    src: "/media/explainers/explainer-5.mp4",
    title: "Skin rashes often come from poor grooming",
    tag: "Health",
  },
  {
    src: "/media/explainers/explainer-6.mp4",
    title: "Matting & shedding — a hassle we can fix",
    tag: "Coat care",
  },
];

export const TESTIMONIALS = [
  {
    name: "Sahan & Coco",
    pet: "Pomeranian",
    text: "Coco came home looking like a tiny lion! So fluffy and smelling amazing. The team was so gentle with her.",
    rating: 5,
  },
  {
    name: "Dineth & Bruno",
    pet: "Labrador",
    text: "Bruno actually enjoys his grooming days now. The free nail and ear cleaning is a lovely touch. Highly recommend!",
    rating: 5,
  },
  {
    name: "Nethmi & Mochi",
    pet: "Shih Tzu",
    text: "Booked through WhatsApp in seconds. The before/after was unreal — Mochi has never looked this cute. Bubbly Pup for life!",
    rating: 5,
  },
  {
    name: "Ishara & Rocky",
    pet: "Mixed Breed",
    text: "Rocky can be aggressive with strangers but they handled him so calmly and professionally. Such caring people.",
    rating: 5,
  },
];

export const TIME_SLOTS = [
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "01:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
  "05:00 PM",
];
