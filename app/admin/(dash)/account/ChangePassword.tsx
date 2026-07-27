"use client";
import { useState, useTransition } from "react";
import { changeMyPassword } from "../../actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

export default function ChangePassword({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMsg("");
    if (next !== confirm) return setError("The two new passwords don't match.");
    start(async () => {
      try {
        const r = await changeMyPassword({ current, next });
        if (!r.ok) return setError(r.error ?? "Couldn't change the password.");
        setCurrent("");
        setNext("");
        setConfirm("");
        setMsg("Password changed ✓");
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  return (
    <form onSubmit={submit}>
      <p className="adm-note" style={{ marginBottom: 12 }}>
        Signed in as <strong>{email}</strong>.
      </p>
      <div className="adm-field">
        <label htmlFor="cp-current">Current password</label>
        <input
          id="cp-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div className="adm-row2">
        <div className="adm-field">
          <label htmlFor="cp-next">New password</label>
          <input
            id="cp-next"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </div>
        <div className="adm-field">
          <label htmlFor="cp-confirm">Repeat new password</label>
          <input
            id="cp-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
      </div>
      {error && <p className="adm-error" style={{ marginBottom: 12 }}>{error}</p>}
      {msg && <p className="adm-ok" style={{ marginBottom: 12 }}>{msg}</p>}
      <button className="adm-btn adm-btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
      <p className="adm-note" style={{ marginTop: 10 }}>
        At least {MIN_PASSWORD_LENGTH} characters. Sessions already signed in elsewhere stay
        valid until they expire (12 hours) — log out there too if that matters.
      </p>
    </form>
  );
}
