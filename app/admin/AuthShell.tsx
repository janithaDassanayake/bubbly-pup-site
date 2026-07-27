import "./admin.css";

// The centred pink card used by every out-of-portal auth screen (forgot password,
// reset, forced first-password). Same furniture as the login page, so recovery
// never looks like a different site — which is exactly when people worry about
// phishing.
export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg,#fff4fa,#ffe6f4)",
        padding: 20,
        fontFamily: "var(--font, Poppins, system-ui, sans-serif)",
      }}
    >
      <div className="adm-card" style={{ width: "100%", maxWidth: 400 }}>
        <div className="adm-card-body">
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: "2.2rem" }}>🐾</div>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 800, marginTop: 6 }}>{title}</h1>
            {subtitle && (
              <p className="adm-note" style={{ marginTop: 4 }}>
                {subtitle}
              </p>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
