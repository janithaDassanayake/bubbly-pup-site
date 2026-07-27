"use client";
import { useState, useTransition } from "react";
import { updateCustomerContact } from "../../../actions";
import { formatPhone, PHONE_HINT, phoneProblem } from "@/lib/phone";

// Inline editor for the one field the whole system depends on. Collapsed by
// default — the common case is reading the number, not changing it.
export default function EditContact({
  id,
  name: name0,
  phone: phone0,
  email: email0,
}: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(name0);
  const [phone, setPhone] = useState(phone0);
  const [email, setEmail] = useState(email0 ?? "");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMsg("");
    const bad = phoneProblem(phone);
    if (bad) return setError(bad);
    start(async () => {
      try {
        const r = await updateCustomerContact({ id, name, phone, email });
        if (!r.ok) return setError(r.error ?? "Couldn't save the changes.");
        setMsg("Saved ✓ Queued WhatsApp messages now point at the new number.");
        setOpen(false);
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  if (!open) {
    return (
      <p style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>{formatPhone(phone)}{email ? ` · ${email}` : ""}</span>
        <button type="button" className="adm-btn" onClick={() => setOpen(true)}>
          Edit contact
        </button>
        {msg && <span className="adm-note">{msg}</span>}
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 10, maxWidth: 460 }}>
      {error && <p className="adm-error" style={{ marginBottom: 12 }}>{error}</p>}
      <div className="adm-field">
        <label htmlFor="cc-name">Name</label>
        <input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="adm-field">
        <label htmlFor="cc-phone">WhatsApp number</label>
        <input
          id="cc-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <span className="adm-note">{PHONE_HINT}</span>
      </div>
      <div className="adm-field">
        <label htmlFor="cc-email">Email (optional)</label>
        <input
          id="cc-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="adm-btn"
          onClick={() => {
            setOpen(false);
            setError("");
            setName(name0);
            setPhone(phone0);
            setEmail(email0 ?? "");
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
