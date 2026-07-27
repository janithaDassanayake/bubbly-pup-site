// Admin auth — single-owner salon. bcrypt password + jose-signed JWT stored in
// an HTTP-only cookie. jose is used (not jsonwebtoken) because the same verify
// runs in the Edge middleware runtime.
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE = "bp_admin";
const MAX_AGE_SEC = 60 * 60 * 12; // 12h working day

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(s);
}

export type SessionUser = {
  sub: string;
  email: string;
  name: string;
  role: string;
  /** Signed in with a temporary password — must set a real one before working. */
  mustChangePassword?: boolean;
};

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    // Short claim name: it rides in a cookie on every request.
    ...(user.mustChangePassword ? { mcp: 1 } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payloadToUser(payload);
  } catch {
    return null;
  }
}

function payloadToUser(p: JWTPayload): SessionUser | null {
  if (!p.sub) return null;
  return {
    sub: p.sub,
    email: String(p.email ?? ""),
    name: String(p.name ?? "Admin"),
    role: String(p.role ?? "admin"),
    mustChangePassword: p.mcp === 1,
  };
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SEC,
};
