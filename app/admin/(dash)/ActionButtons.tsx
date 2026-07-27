"use client";
import { useState, useTransition } from "react";
import { AppointmentStatus, PaymentMethod } from "@prisma/client";
import { STATUS_LABEL, TRANSITIONS } from "@/lib/status";
import { formatLKR } from "@/lib/format";
import { changeStatus, recordPayment, markNotificationSent } from "../actions";

const isMobile = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// A wa.me link → the two direct targets that skip wa.me's "Continue to Chat" page:
//   app = whatsapp:// (mobile app / desktop app — opens WITHOUT a browser tab)
//   web = web.whatsapp.com/send (opens the WhatsApp Web chat straight away)
function waUrls(waMeHref: string): { app: string; web: string } {
  const m = waMeHref.match(/wa\.me\/(\d+)\?text=(.*)$/);
  const phone = m?.[1] ?? "";
  const text = m?.[2] ?? "";
  return {
    app: `whatsapp://send?phone=${phone}&text=${text}`,
    web: `https://web.whatsapp.com/send?phone=${phone}&text=${text}`,
  };
}

// Mobile → open the app (page stays, no blank tab). Desktop → WhatsApp Web chat
// directly in a new tab (no wa.me landing page).
function openWa(waMeHref: string) {
  const u = waUrls(waMeHref);
  if (isMobile()) window.location.href = u.app;
  else window.open(u.web, "_blank", "noopener,noreferrer");
}

// The primary action for each state, so the common next step is one obvious tap.
const PRIMARY: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  PENDING_CONFIRMATION: "CONFIRMED",
  CONFIRMED: "GROOMING_STARTED",
  NOT_SURE: "CONFIRMED",
  ARRIVED: "GROOMING_STARTED",
  GROOMING_STARTED: "COMPLETED",
  PAID: "COMPLETED",
};

export function StatusActions({
  id,
  status,
  only,
  autoSend,
  waPreview,
  priceEstimate = 0,
  paidAmount,
}: {
  id: string;
  status: AppointmentStatus;
  only?: AppointmentStatus[]; // restrict which transitions to show
  autoSend?: boolean; // Cloud API configured → thank-you sends server-side, no tab
  // Message text known up-front, so mobile can open WhatsApp inside the click
  // gesture instead of after the server round-trip (which mobile blocks).
  waPreview?: Partial<Record<AppointmentStatus, string>>;
  /** what the booking was quoted — the amount box starts here */
  priceEstimate?: number;
  /** already settled? then don't ask for the money again */
  paidAmount?: number | null;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  // Set while the "Paid & Completed" popup is open, holding the transition it
  // will run once the amount is confirmed.
  const [payFor, setPayFor] = useState<AppointmentStatus | null>(null);
  const [amount, setAmount] = useState(String(paidAmount ?? priceEstimate ?? ""));
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  let next = TRANSITIONS[status];
  if (only) next = next.filter((s) => only.includes(s));
  if (!next.length) return <span className="adm-note">—</span>;

  const run = (to: AppointmentStatus, payment?: { amount: number; method: PaymentMethod }) => {
    // Desktop only: pre-open a tab in the click gesture so the popup isn't blocked
    // after the await. On mobile we use the whatsapp:// app link instead (opens the
    // app, keeps this page, and leaves no blank tab). If the API sends it server-
    // side (autoSent) no tab/app is needed at all.
    // Confirming and completing both send the customer a message.
    const sendsWhatsApp = to === "COMPLETED" || to === "CONFIRMED";
    const mobile = isMobile();
    const waWin = sendsWhatsApp && !autoSend && !mobile ? window.open("", "_blank") : null;

    // MOBILE: open WhatsApp NOW, inside the click gesture. Doing it after the
    // await below silently fails — the browser won't launch an app link once the
    // gesture has expired. The status change continues in the background.
    const preview = sendsWhatsApp && !autoSend ? waPreview?.[to] : undefined;
    const openedEarly = Boolean(mobile && preview);
    if (openedEarly) window.location.href = waUrls(preview!).app;

    start(async () => {
      setErr("");
      setOkMsg("");
      // A server action that REJECTS (expired session, or the request being
      // aborted because we just switched to the WhatsApp app) escapes the
      // transition and takes the whole page down with a client-side exception.
      // Never let one out.
      let r: Awaited<ReturnType<typeof changeStatus>>;
      try {
        r = await changeStatus(id, to, payment);
      } catch {
        waWin?.close();
        // The status change may well have landed — the reply just never arrived.
        setErr("Couldn't confirm the update. Refresh to check.");
        return;
      }
      if (!r.ok) {
        setErr(r.error ?? "Failed");
        waWin?.close();
        return;
      }
      const what = to === "CONFIRMED" ? "Confirmation" : "Thank-you";
      if (r.autoSent) setOkMsg(`${what} sent ✓`);
      if (r.whatsapp) {
        const u = waUrls(r.whatsapp.href);
        // Already opened in the gesture on mobile — don't fire a second time.
        if (openedEarly) {
          setOkMsg(`${what} opened in WhatsApp — tap send ✓`);
        } else if (mobile) {
          window.location.href = u.app;
        } else if (waWin) {
          waWin.location.href = u.web;
        } else {
          window.open(u.web, "_blank", "noopener,noreferrer");
        }
        // Fire-and-forget: an audit update failing must not break the flow.
        markNotificationSent(r.whatsapp.notificationId).catch(() => {});
        if (!r.autoSent && !openedEarly) setOkMsg(`${what} opened in WhatsApp — tap send ✓`);
      } else {
        waWin?.close();
      }
    });
  };

  // Completing settles the bill, so ask what was actually taken instead of
  // silently banking the estimate. Skipped when it's already been paid — there's
  // nothing left to collect.
  const asksForPayment = (to: AppointmentStatus) =>
    to === "COMPLETED" && status !== "PAID" && paidAmount == null;

  return (
    <div className="adm-btn-row">
      {next.map((to) => (
        <button
          key={to}
          className={`adm-btn adm-btn-sm ${PRIMARY[status] === to ? "adm-btn-primary" : ""} ${
            to === "CANCELLED" || to === "NO_SHOW" ? "adm-btn-danger" : ""
          }`}
          disabled={pending}
          onClick={() => (asksForPayment(to) ? setPayFor(to) : run(to))}
        >
          {to === "COMPLETED" && status !== "PAID" ? "Paid & Completed" : STATUS_LABEL[to]}
        </button>
      ))}
      {okMsg && <span className="adm-note" style={{ color: "#1c7c3f" }}>{okMsg}</span>}
      {err && <span className="adm-note" style={{ color: "#c0392b" }}>{err}</span>}

      {payFor && (
        <div
          className="adm-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Record payment and complete"
          onClick={() => setPayFor(null)}
        >
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>💰 Payment received</h3>
            <p className="adm-note" style={{ marginTop: 4 }}>
              Quoted {formatLKR(priceEstimate)}. Enter what was actually taken — the
              thank-you message opens next.
            </p>

            <div className="adm-field" style={{ marginTop: 14 }}>
              <label htmlFor={`pay-amt-${id}`}>Amount (LKR)</label>
              <input
                id={`pay-amt-${id}`}
                type="number"
                min={0}
                inputMode="numeric"
                value={amount}
                autoFocus
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="adm-field">
              <span className="adm-field-label">Paid by</span>
              <div className="adm-choice-row">
                {(
                  [
                    ["CASH", "💵 Cash"],
                    ["CARD", "💳 Card"],
                    ["BANK_TRANSFER", "🏦 Bank transfer"],
                  ] as [PaymentMethod, string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    className={`adm-choice ${method === v ? "on" : ""}`}
                    aria-pressed={method === v}
                    onClick={() => setMethod(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="adm-btn-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                disabled={pending || amount === "" || Number(amount) < 0}
                // The click that closes this popup is the SAME gesture that has
                // to open WhatsApp on mobile, so `run` is called straight from
                // here — no await in between, or the app link is refused.
                onClick={() => {
                  const to = payFor;
                  setPayFor(null);
                  run(to, { amount: Number(amount), method });
                }}
              >
                Done — send thank-you
              </button>
              <button
                type="button"
                className="adm-btn"
                disabled={pending}
                onClick={() => setPayFor(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PayForm({
  id,
  suggested,
}: {
  id: string;
  suggested: number;
}) {
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(String(suggested || ""));
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [msg, setMsg] = useState("");

  const submit = () =>
    start(async () => {
      setMsg("");
      try {
        const r = await recordPayment(id, Number(amount), method);
        setMsg(r.ok ? "Saved ✓" : r.error ?? "Failed");
      } catch {
        setMsg("Couldn't save — check your connection and try again.");
      }
    });

  return (
    <div className="adm-btn-row" style={{ alignItems: "center" }}>
      <input
        type="number"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: 110 }}
        className=""
        placeholder="Amount"
      />
      <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
        <option value="CASH">Cash</option>
        <option value="CARD">Card</option>
        <option value="BANK_TRANSFER">Bank Transfer</option>
      </select>
      <button className="adm-btn adm-btn-sm adm-btn-primary" disabled={pending} onClick={submit}>
        Record payment
      </button>
      {msg && <span className="adm-note">{msg}</span>}
    </div>
  );
}

// One-tap free WhatsApp: opens wa.me with the pre-composed message, then marks
// the queued notification as sent (audit log).
export function SendWhatsApp({
  notificationId,
  href,
  label = "Send on WhatsApp",
  sent,
}: {
  notificationId: string;
  href: string;
  label?: string;
  sent?: boolean;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(sent ?? false);

  const click = () => {
    // Mobile → opens the WhatsApp app directly (no blank tab, page stays).
    // Desktop → new tab. Then records the send so the admin sees "Message sent".
    openWa(href);
    start(async () => {
      // Opening WhatsApp can background this page and abort the request; the
      // message still went out, so never crash over the audit write.
      try {
        await markNotificationSent(notificationId);
      } catch {
        /* ignore — the send itself already happened */
      }
      setDone(true);
    });
  };

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="adm-btn adm-btn-sm adm-btn-wa" onClick={click} disabled={pending}>
        💬 {done ? "Resend" : label}
      </button>
      {done && (
        <span className="adm-note" style={{ color: "#1c7c3f", fontWeight: 600 }}>
          Message sent ✓
        </span>
      )}
    </span>
  );
}
