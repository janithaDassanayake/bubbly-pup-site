// Domains allowed to invoke Server Actions (admin status/payment/settings writes).
// Behind a custom domain + reverse proxy (Caddy/Nginx) Next rejects actions whose
// Origin doesn't match unless the domain is listed here. Vercel/localhost work
// without it; set ALLOWED_ORIGINS="bubblypup.lk,www.bubblypup.lk" in prod.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained bundle for the Docker/VPS image. On Vercel (VERCEL=1) leave
  // it default — Vercel manages its own output.
  output: process.env.VERCEL ? undefined : "standalone",
  ...(allowedOrigins.length
    ? { experimental: { serverActions: { allowedOrigins } } }
    : {}),
};

export default nextConfig;
