import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatLKR } from "@/lib/format";
import { isCloudApiConfigured } from "@/lib/whatsapp-send";
import { isMailConfigured } from "@/lib/mailer";
import { requireAdminRole } from "@/lib/session";
import { updateSettings, updatePackage, updateAddOn } from "../../actions";
import { salonNow } from "@/lib/time";
import { isAdmin, isSuperUser, roleLabel } from "@/lib/roles";
import HolidayPicker from "./HolidayPicker";
import StaffUsers from "./StaffUsers";

export const dynamic = "force-dynamic";

// Dates in the admin table read as plain days — the exact minute doesn't matter.
const day = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(d)
    : null;

const DAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];

export default async function SettingsPage() {
  // Owner-only page: business hours, prices and logins are the owner's alone.
  // Staff are sent to the dashboard; `updateSettings`/`updatePackage` re-check
  // the role too, so hiding the page isn't the only defence.
  const me = await requireAdminRole();

  const [s, packages, addOns, adminRows] = await Promise.all([
    getSettings(),
    prisma.package.findMany({ orderBy: [{ standalone: "asc" }, { durationMin: "asc" }] }),
    prisma.addOn.findMany({ orderBy: [{ group: "asc" }, { price: "asc" }] }),
    prisma.adminUser.findMany({
      // Never send hashes to the browser — only what the table shows.
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
        mustChangePassword: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const cloudApi = isCloudApiConfigured();
  const staff = adminRows.map((a) => ({
    ...a,
    isAdmin: isAdmin(a),
    isSuperUser: isSuperUser(a),
    roleLabel: roleLabel(a.role),
    createdAt: day(a.createdAt)!,
    lastLoginAt: day(a.lastLoginAt),
  }));

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Settings</h1>
          <p>Business hours, opening days and package pricing.</p>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 18 }}>
        <div className="adm-card-head"><h2>Business & scheduling</h2></div>
        <div className="adm-card-body">
          <form action={updateSettings}>
            <div className="adm-field">
              <label htmlFor="businessName">Business name</label>
              <input id="businessName" name="businessName" defaultValue={s.businessName} />
            </div>
            <div className="adm-row2">
              <div className="adm-field">
                <label htmlFor="openTime">Opening time</label>
                <input id="openTime" name="openTime" type="time" defaultValue={s.openTime} />
              </div>
              <div className="adm-field">
                <label htmlFor="closeTime">Closing time</label>
                <input id="closeTime" name="closeTime" type="time" defaultValue={s.closeTime} />
              </div>
            </div>

            <div className="adm-field">
              <label>Opening days</label>
              <div className="adm-filters">
                {DAYS.map((d) => (
                  <label key={d.v} className="adm-chip" style={{ display: "inline-flex", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" name="workingDays" value={d.v} defaultChecked={s.workingDays.includes(d.v)} />
                    {d.l}
                  </label>
                ))}
              </div>
            </div>

            <div className="adm-row2">
              <div className="adm-field">
                <label htmlFor="slotStepMin">Slot step (minutes)</label>
                <input id="slotStepMin" name="slotStepMin" type="number" min={5} defaultValue={s.slotStepMin} />
              </div>
              <div className="adm-field">
                <label htmlFor="minLeadMinutes">Min lead time (minutes)</label>
                <input id="minLeadMinutes" name="minLeadMinutes" type="number" min={0} defaultValue={s.minLeadMinutes} />
              </div>
            </div>

            <div className="adm-field">
              <label htmlFor="capacity">Pets groomed at the same time</label>
              <input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                max={10}
                defaultValue={s.capacity}
              />
              <span className="adm-note">
                The salon runs one bath and one table, so <strong>2</strong> pets
                overlap comfortably — one washing while the other is dried and
                trimmed. Two pets still can&apos;t <em>start</em> together; how long
                the next one waits is set per package below.
              </span>
            </div>

            <HolidayPicker initial={s.holidays} todayISO={salonNow().dateISO} />

            <button className="adm-btn adm-btn-primary" type="submit">Save settings</button>
          </form>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 18 }}>
        <div className="adm-card-head">
          <h2>Packages & prices</h2>
          <p>
            The prices customers see on the website. A <strong>duration only</strong> row
            isn&apos;t a package and has no price of its own — it just sets how long a
            visit without a package takes. What that visit costs comes from{" "}
            <strong>Add-ons &amp; extras</strong> below, so no service is ever priced in
            two places.
          </p>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table adm-cards">
            <thead>
              <tr><th>Package / Service</th><th>Duration (min)</th><th>Price (LKR)</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.id}>
                  <td className="adm-strong" data-label="Package">
                    {p.name}
                    {p.standalone ? <span className="adm-badge" style={{ marginLeft: 8, background: "#f3f0ff", color: "#6b46c1" }}>duration only</span> : null}
                  </td>
                  {/* data-label="Do" makes this a full-width block in card mode
                      instead of an unlabelled cell squeezed to the right. */}
                  <td colSpan={4} data-label="Do">
                    <form action={updatePackage} className="adm-btn-row" style={{ alignItems: "center" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <label className="adm-note" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        Mins
                        <input name="durationMin" type="number" min={5} defaultValue={p.durationMin} style={{ width: 80 }} />
                      </label>
                      {/* How long this package holds the bath — not how long the
                          appointment is. The 2-hour trim uses the same tub as
                          the 1-hour wash, it just spends longer on the table. */}
                      <label
                        className="adm-note"
                        style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
                        title="Minutes before the NEXT pet can start — the time this one is in the bath"
                      >
                        Next pet after
                        <input name="startGapMin" type="number" min={0} max={240} defaultValue={p.startGapMin} style={{ width: 80 }} />
                      </label>
                      {/* A standalone row has no price of its own — the visit is
                          billed from the services chosen. One price, one place. */}
                      {p.standalone ? (
                        <span className="adm-note">Priced by the services chosen ↓</span>
                      ) : (
                        <label className="adm-note" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          LKR
                          <input name="price" type="number" min={0} defaultValue={p.price} style={{ width: 100 }} />
                        </label>
                      )}
                      <label className="adm-note" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="active" defaultChecked={p.active} /> Active
                      </label>
                      <button className="adm-btn adm-btn-sm adm-btn-primary" type="submit">Save</button>
                      {!p.standalone && (
                        <span className="adm-note">Current: {formatLKR(p.price)}</span>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 18 }}>
        <div className="adm-card-head">
          <h2>Add-ons & extras</h2>
          <p>
            The services in the website&apos;s <strong>Spa &amp; Treatments</strong> and{" "}
            <strong>Individual Grooming Services</strong> pickers. Edit these to change
            what a customer is quoted for an extra.
          </p>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table adm-cards">
            <thead>
              <tr><th>Service</th><th>Price (LKR)</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {addOns.map((a) => (
                <tr key={a.id}>
                  <td className="adm-strong" data-label="Service">
                    {a.name}
                    <span
                      className="adm-badge"
                      style={{ marginLeft: 8, background: "#fff0f5", color: "#9c2566" }}
                    >
                      {a.group === "spa" ? "spa" : "trims & colour"}
                    </span>
                  </td>
                  <td colSpan={3} data-label="Do">
                    <form action={updateAddOn} className="adm-btn-row" style={{ alignItems: "center" }}>
                      <input type="hidden" name="id" value={a.id} />
                      <label className="adm-note" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        LKR
                        <input name="price" type="number" min={0} defaultValue={a.price} style={{ width: 100 }} />
                      </label>
                      <label className="adm-note" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="active" defaultChecked={a.active} /> Active
                      </label>
                      <button className="adm-btn adm-btn-sm adm-btn-primary" type="submit">Save</button>
                      <span className="adm-note">Current: {formatLKR(a.price)}</span>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 18 }}>
        <div className="adm-card-head">
          <h2>Staff &amp; admin logins</h2>
          <span className="adm-note">
            {isMailConfigured()
              ? "✉️ Reset links are emailed automatically"
              : "Email not configured — links are shown here to pass on"}
          </span>
        </div>
        <StaffUsers staff={staff} meId={me.sub} mailConfigured={isMailConfigured()} />
      </div>

      <div className="adm-card">
        <div className="adm-card-head"><h2>WhatsApp messaging</h2></div>
        <div className="adm-card-body">
          <p className="adm-note" style={{ marginBottom: 10 }}>
            <strong>{cloudApi ? "✅ Automatic sending is ON." : "Currently: free one-tap links."}</strong>
          </p>
          <p className="adm-note">
            {cloudApi ? (
              <>
                The Meta WhatsApp Cloud API is connected — the thank-you message is sent
                <strong> automatically from your business number</strong> when you tap
                &ldquo;Paid&nbsp;&amp; Completed&rdquo;. Delivery is logged on the WhatsApp page.
              </>
            ) : (
              <>
                Messages are composed automatically and sent with <strong>one tap</strong> (free
                wa.me — no fees). To make the thank-you send <strong>fully automatically from your
                number</strong>, add your Meta WhatsApp Cloud API keys
                (<code>WHATSAPP_ACCESS_TOKEN</code>, <code>WHATSAPP_PHONE_NUMBER_ID</code>,
                and an approved <code>WHATSAPP_TEMPLATE_NAME</code>) — then this switches on
                with no code changes.
              </>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
