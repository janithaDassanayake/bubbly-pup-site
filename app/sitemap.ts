import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Served at /sitemap.xml.
//
// One entry on purpose: the marketing site is a single page and everything else
// (#pricing, #process, #reviews, #booking) is an anchor on it. Listing anchors
// as separate URLs would report duplicates, not extra pages. /admin and /p are
// excluded — see robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl(),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
