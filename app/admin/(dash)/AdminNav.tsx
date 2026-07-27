"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// `adminOnly` links are hidden from staff — and the pages/actions behind them
// re-check the role server-side, so this is tidiness, not the security boundary.
const LINKS = [
  { href: "/admin", label: "Dashboard", glyph: "📊", exact: true },
  { href: "/admin/appointments", label: "Appointments", glyph: "📅" },
  { href: "/admin/slots", label: "Slot Management", glyph: "🗓️" },
  { href: "/admin/pending", label: "Pending Confirmation", glyph: "📞" },
  { href: "/admin/customers", label: "Customers & Pets", glyph: "🐶" },
  { href: "/admin/payments", label: "Payments", glyph: "💳" },
  { href: "/admin/reports", label: "Reports", glyph: "📈" },
  { href: "/admin/whatsapp", label: "WhatsApp", glyph: "💬" },
  { href: "/admin/settings", label: "Settings", glyph: "⚙️", adminOnly: true },
  { href: "/admin/account", label: "My Account", glyph: "🔑" },
];

export default function AdminNav({ canManage }: { canManage: boolean }) {
  const path = usePathname();
  return (
    <nav className="adm-nav">
      {LINKS.filter((l) => canManage || !l.adminOnly).map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            <span className="glyph">{l.glyph}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
