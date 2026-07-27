// Public: land here from the emailed link. The token is checked BEFORE the form
// is drawn, so a dead link says so immediately instead of after typing a password.
import Link from "next/link";
import AuthShell from "../../AuthShell";
import { checkResetToken } from "@/lib/reset";
import ResetForm from "./ResetForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const check = await checkResetToken(token);

  if (!check.ok) {
    const message =
      check.reason === "expired"
        ? "That link has expired — they last 30 minutes."
        : check.reason === "used"
        ? "That link has already been used."
        : "That link isn't valid.";
    return (
      <AuthShell title="Link no longer works">
        <p className="adm-error" style={{ marginBottom: 14 }}>
          {message}
        </p>
        <Link
          href="/admin/forgot"
          className="adm-btn adm-btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: 11 }}
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle={check.admin.email}>
      <ResetForm token={token} />
    </AuthShell>
  );
}
