import type { Metadata } from "next";

// Pass-through layout that exists ONLY to mark every /admin route noindex.
// It renders children untouched, so the login page keeps the root layout's
// styling and the (dash) shell is unaffected.
//
// Belt and braces alongside robots.txt: robots.txt asks crawlers not to fetch,
// this tells them not to index anything they reach another way (a pasted link,
// a referrer). The salon's booking system should never appear in search.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
