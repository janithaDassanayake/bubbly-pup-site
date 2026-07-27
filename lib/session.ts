// Server-only session helpers (use next/headers — Node runtime, not Edge).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./auth";
import { prisma } from "./db";
import { isAdmin } from "./roles";

export async function getCurrentAdmin(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

// Use at the top of every protected admin page/action. Middleware already blocks
// unauthenticated navigation; this is defense-in-depth + gives us the user object.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentAdmin();
  if (!user) redirect("/admin/login");
  return user;
}

// Admin-level pages (Settings). NOTE the difference from requireAdmin() above:
// that one only means "signed in", this one means "owner or admin role". The role
// is re-read from the DATABASE rather than trusted from the session claim,
// matching guardAdminRole() in the server actions — one rule, checked the same way
// whether it guards a page or a mutation. Staff land on the dashboard, not a dead end.
export async function requireAdminRole(): Promise<SessionUser> {
  const user = await requireAdmin();
  const row = await prisma.adminUser.findUnique({
    where: { id: user.sub },
    select: { role: true },
  });
  if (!isAdmin(row)) redirect("/admin");
  return user;
}
