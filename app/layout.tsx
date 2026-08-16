import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/site";
import { SITE } from "@/lib/data";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets safe-area-inset-* work on notched phones
  themeColor: "#ff69b4",
};

// Local search is the whole game for a single-location salon: people type
// "dog grooming Kadawatha", not "dog grooming". The town belongs in the title,
// the description and the keywords — it was previously only ever "Sri Lanka".
//
// Cats are searched for separately ("cat grooming near me" never matches a page
// that only ever says dog), so they carry their own keywords rather than being
// folded into a generic "pet grooming".
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  // "Salon" is dropped from the title to make room for cats — Google truncates
  // around 60 characters and the town is the half that has to survive.
  title: `${SITE.name} | Dog & Cat Grooming in ${SITE.city}`,
  description:
    `Professional, gentle dog and cat grooming in ${SITE.city} — spa baths, ` +
    `haircuts, full grooming and nail care. Open ${SITE.location}-wide for ` +
    `pickup. Book instantly on WhatsApp: ${SITE.whatsappDisplay}.`,
  keywords: [
    `dog grooming ${SITE.city}`,
    `cat grooming ${SITE.city}`,
    `pet grooming ${SITE.city}`,
    "dog grooming near me",
    "cat grooming near me",
    "pet grooming salon Sri Lanka",
    "dog spa bath Kadawatha",
    "cat grooming salon Kadawatha",
    "dog haircut Kadawatha",
    SITE.name,
  ],
  // The vercel.app alias serves byte-identical content. Without this, Google
  // sees two competing sites and may rank the alias instead of the real domain.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl(),
    siteName: SITE.name,
    locale: "en_LK",
    title: `${SITE.name} | Dog & Cat Grooming in ${SITE.city}`,
    description: `Gentle, professional dog and cat grooming in ${SITE.city}. Book instantly on WhatsApp.`,
    // Shared links (WhatsApp especially) showed no preview card at all before.
    images: [
      {
        url: "/media/logo.png",
        width: 1536,
        height: 1024,
        alt: SITE.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} | Dog & Cat Grooming in ${SITE.city}`,
    description: `Gentle, professional dog and cat grooming in ${SITE.city}. Book instantly on WhatsApp.`,
    images: ["/media/logo.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
