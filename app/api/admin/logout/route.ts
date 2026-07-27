import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 303, NOT the default 307. A 307 preserves the method, so the browser re-POSTed
  // to /admin/login — a page that only answers GET — and logging out dumped the
  // user on 405 Method Not Allowed with their session already gone. 303 See Other
  // tells the browser to switch to GET, which is what "logged out, now show me the
  // login page" actually means.
  const res = NextResponse.redirect(new URL("/admin/login", req.url), 303);
  // Mirror the attributes the cookie was SET with (lib/auth cookieOptions) —
  // a mismatch can leave the original cookie in place.
  res.cookies.set(SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
