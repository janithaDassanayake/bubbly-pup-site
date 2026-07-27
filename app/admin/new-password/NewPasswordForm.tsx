"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeMyPassword } from "../actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

export default function NewPasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next !== confirm) return setError("The two new passwords don't match.");
    start(async () => {
      try {
        const r = await changeMyPassword({ current, next });
        if (!r.ok) return setError(r.error ?? "Couldn't set the password.");
        // The session still carries the "must change" claim — sign in again so it
        // is reissued without it, otherwise the dash bounces straight back here.
        await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
        router.replace("/admin/login");
        router.refresh();
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  return (
    <form onSubmit={submit}>
      <div className="adm-field">
        <label htmlFor="current">Temporary password</label>
        <input
          id="current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="adm-field">
        <label htmlFor="next">New password</label>
        <input
          id="next"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
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
        {pending ? "Saving…" : "Save and sign in"}
      </button>
    </form>
  );
}
