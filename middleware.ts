// Edge middleware: guard every /admin route except the login page & auth APIs.
// Verifies the JWT cookie with jose (Edge-compatible).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Reachable WITHOUT a session — you can't log in to recover a lost password.
// Both enforce their own limits (single-use expiring tokens, no account
// enumeration, throttling) in app/admin/auth-actions.ts.
const PUBLIC = ["/admin/forgot", "/admin/reset"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = await verifySession(token);

  // Already-authenticated admins skip the login screen.
  if (pathname === "/admin/login") {
    if (user) return NextResponse.redirect(new URL("/admin", req.url));
    return NextResponse.next();
  }

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!user) {
    const url = new URL("/admin/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protect the admin UI. Auth API routes (/api/admin/login|logout) are excluded
  // so login can run; they enforce their own checks.
  matcher: ["/admin/:path*"],
};
