"use client";
import "../admin.css";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLogin() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setBusy(false);
        return;
      }
      const next = params.get("next") || "/admin";
      router.replace(next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

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
      <div className="adm-card" style={{ width: "100%", maxWidth: 380 }}>
        <div className="adm-card-body">
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: "2.2rem" }}>🐾</div>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 800, marginTop: 6 }}>
              Bubbly Pup Admin
            </h1>
            <p className="adm-note" style={{ marginTop: 4 }}>
              Sign in to manage appointments
            </p>
          </div>
          <form onSubmit={submit}>
            <div className="adm-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="adm-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="adm-error" style={{ marginBottom: 12 }}>{error}</p>}
            <button
              type="submit"
              className="adm-btn adm-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: 11 }}
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p style={{ textAlign: "center", marginTop: 14 }}>
            <Link href="/admin/forgot" className="adm-note" style={{ textDecoration: "underline" }}>
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
