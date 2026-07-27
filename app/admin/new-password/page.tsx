// A new admin signs in with a temporary password somebody else has seen, so the
// portal is withheld until they set their own. Lives OUTSIDE (dash) on purpose:
// the dash layout redirects here, and a page inside it would redirect to itself.
// Middleware still requires a session to reach it.
import { requireAdmin } from "@/lib/session";
import { redirect } from "next/navigation";
import AuthShell from "../AuthShell";
import NewPasswordForm from "./NewPasswordForm";

export const dynamic = "force-dynamic";

export default async function NewPasswordPage() {
  const admin = await requireAdmin();
  // Nothing to force — don't strand an admin on a screen they can't leave.
  if (!admin.mustChangePassword) redirect("/admin");

  return (
    <AuthShell
      title="Choose your password"
      subtitle={`Signed in as ${admin.email} with a temporary password`}
    >
      <p className="adm-note" style={{ marginBottom: 14 }}>
        Somebody else created this account, so they know the temporary password. Set your own
        to carry on.
      </p>
      <NewPasswordForm />
    </AuthShell>
  );
}
