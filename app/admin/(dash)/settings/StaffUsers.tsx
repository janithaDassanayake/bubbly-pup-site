"use client";
// Admin-level: staff and admin logins. Rendered only for owner/admin, and every
// action behind it is role-checked on the server too (actions.ts → guardAdminRole).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLogin, deleteLogin, issueResetLink, setLoginPassword, setLoginRole } from "../../actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  /** owner or admin — has full rights */
  isAdmin: boolean;
  /** the protected original account */
  isSuperUser: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
};

export default function StaffUsers({
  staff,
  meId,
  mailConfigured,
}: {
  staff: StaffRow[];
  meId: string;
  mailConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [requireChange, setRequireChange] = useState(false);

  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [rowPw, setRowPw] = useState("");
  // A one-time reset link, shown once and recoverable nowhere.
  const [link, setLink] = useState<{ email: string; url: string; emailed?: boolean; emailError?: string } | null>(null);

  const clear = () => {
    setError("");
    setMsg("");
    setLink(null);
  };
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after: () => void) => {
    clear();
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) return setError(r.error ?? "That didn't work.");
        after();
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const who = email.trim().toLowerCase();
    run(
      () => createLogin({ name, email, password, role, requireChange }),
      () => {
        setMsg(
          `${role === "admin" ? "Admin" : "Staff"} login created for ${who} — pass the password on to them.`
        );
        setName("");
        setEmail("");
        setPassword("");
        setRole("staff");
        setRequireChange(false);
        router.refresh();
      }
    );
  };

  const savePw = (row: StaffRow) =>
    run(
      () => setLoginPassword({ id: row.id, password: rowPw, requireChange: false }),
      () => {
        setMsg(`New password set for ${row.email} — pass it on to them.`);
        setPwFor(null);
        setRowPw("");
        router.refresh();
      }
    );

  const changeRole = (row: StaffRow, to: string) =>
    run(
      () => setLoginRole({ id: row.id, role: to }),
      () => {
        setMsg(`${row.email} is now ${to === "admin" ? "an admin" : "staff"}.`);
        router.refresh();
      }
    );

  const reset = (row: StaffRow) =>
    run(
      async () => {
        const r = await issueResetLink(row.id);
        if (r.ok) setLink({ email: row.email, url: r.link!, emailed: r.emailed, emailError: r.emailError });
        return r;
      },
      () => {}
    );

  const remove = (row: StaffRow) =>
    run(
      () => deleteLogin(row.id),
      () => {
        setMsg(`${row.email} can no longer sign in.`);
        router.refresh();
      }
    );

  return (
    <>
      <div className="adm-table-wrap">
        {/* adm-logins adds the phone treatment: the name/email cell goes full
            width (emails are too long for a 60% column) and the action buttons
            become two-per-row thumb targets. */}
        <table className="adm-table adm-cards adm-logins">
          <thead>
            <tr>
              <th>Login</th>
              <th>Role</th>
              <th>Added</th>
              <th>Last sign-in</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((a) => (
              <tr key={a.id}>
                <td data-label="Login">
                  <span className="adm-strong">{a.name}</span>
                  {a.id === meId && (
                    <span className="adm-badge" style={{ marginLeft: 8, background: "#ffe6f4", color: "#a12a6b" }}>
                      you
                    </span>
                  )}
                  {a.mustChangePassword && (
                    <span className="adm-badge" style={{ marginLeft: 8, background: "#fff4e5", color: "#b26a00" }}>
                      must change password
                    </span>
                  )}
                  <br />
                  <span className="adm-note">{a.email}</span>
                </td>
                <td data-label="Role">
                  <span
                    className="adm-badge"
                    style={
                      a.isSuperUser
                        ? { background: "#f3f0ff", color: "#6b46c1" }
                        : a.isAdmin
                        ? { background: "#fdeaf5", color: "#a12a6b" }
                        : { background: "#e6f4ff", color: "#0b6bcb" }
                    }
                  >
                    {a.roleLabel}
                  </span>
                </td>
                <td data-label="Added">{a.createdAt}</td>
                <td data-label="Last sign-in">{a.lastLoginAt ?? "never"}</td>
                <td data-label="Do">
                  <div className="adm-btn-row">
                    <button type="button" className="adm-btn adm-btn-sm" disabled={pending} onClick={() => reset(a)}>
                      Reset link
                    </button>
                    {/* The owner and your own account are managed elsewhere:
                        the owner is protected, and your own password needs the
                        current one (My Account). */}
                    {!a.isSuperUser && a.id !== meId && (
                      <>
                        <button
                          type="button"
                          className="adm-btn adm-btn-sm"
                          disabled={pending}
                          onClick={() => {
                            clear();
                            setRowPw("");
                            setPwFor(pwFor === a.id ? null : a.id);
                          }}
                        >
                          Set password
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn-sm"
                          disabled={pending}
                          onClick={() => changeRole(a, a.isAdmin ? "staff" : "admin")}
                          title={
                            a.isAdmin
                              ? "Remove their ability to manage logins and settings"
                              : "Let them manage logins and business settings"
                          }
                        >
                          {a.isAdmin ? "Make staff" : "Make admin"}
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn-sm adm-btn-danger"
                          disabled={pending}
                          onClick={() => remove(a)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>

                  {pwFor === a.id && (
                    <div className="adm-btn-row adm-pw-row" style={{ marginTop: 8, alignItems: "center" }}>
                      <input
                        type="text"
                        className="adm-pw-input"
                        value={rowPw}
                        onChange={(e) => setRowPw(e.target.value)}
                        placeholder={`New password for ${a.name}`}
                        minLength={MIN_PASSWORD_LENGTH}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="adm-btn adm-btn-sm adm-btn-primary"
                        disabled={pending}
                        onClick={() => savePw(a)}
                      >
                        Save
                      </button>
                      <button type="button" className="adm-btn adm-btn-sm" onClick={() => setPwFor(null)}>
                        Cancel
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Its own block, divided from the list above and aligned with the table's
          cell padding — flush against the card edge it read as part of the LOGIN
          column. */}
      <div className="adm-logins-form">
        {error && <p className="adm-error" style={{ marginBottom: 12 }}>{error}</p>}
        {msg && <p className="adm-ok" style={{ marginBottom: 12 }}>{msg}</p>}

        {link && (
          <div className="adm-handout">
            <strong>Reset link for {link.email}</strong>
            <p className="adm-note" style={{ margin: "6px 0", wordBreak: "break-all" }}>
              <code className="adm-secret">{link.url}</code>
            </p>
            <p className="adm-note" style={{ margin: 0 }}>
              Valid 30 minutes, usable once.{" "}
              {link.emailed
                ? "✓ Also emailed to them."
                : mailConfigured
                ? `⚠ Email failed${link.emailError ? `: ${link.emailError}` : ""} — send it yourself.`
                : "Email isn't configured, so send it yourself."}{" "}
              Shown once — reload and it&apos;s gone.
            </p>
          </div>
        )}

        <h3 className="adm-form-h" style={{ marginTop: error || msg || link ? 16 : 0, marginBottom: 10 }}>
          Add a login
        </h3>
        <form onSubmit={add}>
          <div className="adm-row2">
            <div className="adm-field">
              <label htmlFor="st-name">Name</label>
              <input
                id="st-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nimali"
                required
              />
            </div>
            <div className="adm-field">
              <label htmlFor="st-email">Email (their sign-in)</label>
              <input
                id="st-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
              />
            </div>
          </div>
          <div className="adm-row2">
            <div className="adm-field">
              <label htmlFor="st-pw">Password you choose for them</label>
              <input
                id="st-pw"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              <small className="adm-note">
                Shown as plain text so you can pass it on. They can change it later under
                <strong> My Account</strong>.
              </small>
            </div>
            <div className="adm-field">
              <label htmlFor="st-role">Role</label>
              <select id="st-role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="staff">Staff — day-to-day work only</option>
                <option value="admin">Admin — can also manage logins &amp; settings</option>
              </select>
              <small className="adm-note">
                {role === "admin"
                  ? "They'll be able to add and remove logins, and edit business settings and prices."
                  : "Appointments, slots, customers, payments, reports and WhatsApp."}
              </small>
            </div>
          </div>
          <label className="adm-check" style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={requireChange}
              onChange={(e) => setRequireChange(e.target.checked)}
            />
            <span>Make them choose their own password the first time they sign in</span>
          </label>
          <button className="adm-btn adm-btn-primary" type="submit" disabled={pending}>
            {pending ? "Working…" : "Add login"}
          </button>
        </form>
        <p className="adm-note" style={{ marginTop: 12 }}>
          <strong>Staff</strong> get the day-to-day portal. <strong>Admins</strong> can also manage
          logins and business settings. The <strong>Owner</strong> account can&apos;t be removed or
          demoted by anyone, so the salon can never be locked out. Nobody can create a login for
          themselves — there is no sign-up page.
        </p>
      </div>
    </>
  );
}
