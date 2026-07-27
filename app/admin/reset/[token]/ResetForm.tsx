"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetPassword } from "../../auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

export default function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // Caught here so a typo never burns the single-use token.
    if (pw !== confirm) return setError("The two passwords don't match.");
    start(async () => {
      try {
        const r = await resetPassword(token, pw);
        if (!r.ok) return setError(r.error ?? "Couldn't set the password.");
        setDone(true);
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  if (done) {
    return (
      <>
        <p className="adm-ok" style={{ marginBottom: 14 }}>
          Password updated ✓
        </p>
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: 11 }}
          onClick={() => router.replace("/admin/login")}
        >
          Sign in
        </button>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="adm-field">
        <label htmlFor="pw">New password</label>
        <input
          id="pw"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
          autoFocus
        />
        <small className="adm-note">At least {MIN_PASSWORD_LENGTH} characters.</small>
      </div>
      <div className="adm-field">
        <label htmlFor="confirm">Repeat it</label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {error && <p className="adm-error" style={{ marginBottom: 12 }}>{error}</p>}
      <button
        type="submit"
        className="adm-btn adm-btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: 11 }}
        disabled={pending}
      >
        {pending ? "Saving…" : "Set password"}
      </button>
      <p style={{ textAlign: "center", marginTop: 14 }}>
        <Link href="/admin/login" className="adm-note" style={{ textDecoration: "underline" }}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
