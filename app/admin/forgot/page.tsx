"use client";
// Public: "I can't get in." Deliberately says the same thing whether or not the
// address has an account, so nobody can use it to discover the admin's email.
import Link from "next/link";
import { useState, useTransition } from "react";
import AuthShell from "../AuthShell";
import { requestPasswordReset } from "../auth-actions";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [noMail, setNoMail] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      try {
        const r = await requestPasswordReset(email);
        if (!r.ok) return setError(r.error ?? "Something went wrong.");
        setNoMail(Boolean(r.mailNotConfigured));
        setSent(true);
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle={noMail ? undefined : "We've sent a reset link"}>
        {noMail ? (
          <>
            <p className="adm-error" style={{ marginBottom: 12 }}>
              Email isn&apos;t set up on this site yet, so a reset link can&apos;t be sent.
            </p>
            <p className="adm-note" style={{ marginBottom: 14 }}>
              Ask another admin to open <strong>Settings → Admin users</strong> and press
              <strong> Reset link</strong> for your account — that works without email. If
              you&apos;re the only admin, add <code>RESEND_API_KEY</code> and{" "}
              <code>MAIL_FROM</code> to the site&apos;s environment variables to switch this on.
            </p>
          </>
        ) : (
          <p className="adm-note" style={{ marginBottom: 14 }}>
            If <strong>{email}</strong> has an admin account, a link to set a new password is on
            its way. It works once and expires in 30 minutes. Check the spam folder if it
            doesn&apos;t arrive.
          </p>
        )}
        <Link
          href="/admin/login"
          className="adm-btn"
          style={{ width: "100%", justifyContent: "center", padding: 11 }}
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="We'll email you a link to set a new one">
      <form onSubmit={submit}>
        <div className="adm-field">
          <label htmlFor="email">Your admin email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        {error && <p className="adm-error" style={{ marginBottom: 12 }}>{error}</p>}
        <button
          type="submit"
          className="adm-btn adm-btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: 11 }}
          disabled={pending}
        >
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p style={{ textAlign: "center", marginTop: 14 }}>
        <Link href="/admin/login" className="adm-note" style={{ textDecoration: "underline" }}>
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
