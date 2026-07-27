import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Served at /robots.txt.
//
// `/admin` is behind auth anyway, but a crawler following a stray link would
// still burn crawl budget on redirects. `/p/` is the customer photo link sent
// over WhatsApp — unguessable, but explicitly not something to index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/p/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
