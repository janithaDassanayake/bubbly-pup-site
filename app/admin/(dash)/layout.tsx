import "../admin.css";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { isAdmin, roleLabel } from "@/lib/roles";
import AdminNav from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Signed in on a temporary password: no admin page opens until it's replaced.
  // Guarding the shared layout covers every page at once.
  if (admin.mustChangePassword) redirect("/admin/new-password");
  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-brand">
          <span className="dot">🐾</span>
          Bubbly Pup
        </div>
        <AdminNav canManage={isAdmin(admin)} />
        <div className="adm-side-foot">
          Signed in as
          <br />
          <strong>{admin.name}</strong>
          <br />
          {roleLabel(admin.role)}
          <form action="/api/admin/logout" method="post">
            <button className="adm-logout" type="submit">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="adm-main">{children}</main>
    </div>
  );
}
