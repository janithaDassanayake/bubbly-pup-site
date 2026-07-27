// Every role gets here — it's the one account thing staff may do. Settings is
// owner-only, so the password form can't live there any more.
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { isAdmin, isSuperUser, roleLabel } from "@/lib/roles";
import ChangePassword from "./ChangePassword";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await requireAdmin();
  const row = await prisma.adminUser.findUnique({
    where: { id: me.sub },
    select: { name: true, email: true, role: true, lastLoginAt: true },
  });

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>My account</h1>
          <p>
            {row?.name ?? me.name} · {roleLabel(row?.role ?? me.role)}
          </p>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 18 }}>
        <div className="adm-card-head"><h2>Your password</h2></div>
        <div className="adm-card-body">
          <ChangePassword email={row?.email ?? me.email} />
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-head"><h2>What you can do</h2></div>
        <div className="adm-card-body">
          <p className="adm-note">
            {isSuperUser(row)
              ? "You're the owner: business settings and prices are yours, you can add or remove staff and admin logins, and your own account can't be removed or demoted by anyone."
              : isAdmin(row)
              ? "You're an admin: as well as the day-to-day portal you can edit business settings and prices, and add, re-password or remove staff and admin logins under Settings."
              : "You're staff: appointments, slots, customers, payments, reports and WhatsApp are all yours. Business settings, prices and logins belong to the owner and admins — ask them if something there needs changing."}
          </p>
          <p className="adm-note" style={{ marginTop: 8 }}>
            Forgotten your password while signed out? Use{" "}
            <strong>Forgot your password?</strong> on the sign-in screen
            {isAdmin(row) ? "" : ", or ask an admin for a reset link"}.
          </p>
        </div>
      </div>
    </>
  );
}
