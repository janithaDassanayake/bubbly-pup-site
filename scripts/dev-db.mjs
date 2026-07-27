// Zero-install local Postgres for development (no Docker needed).
// Downloads/uses a real PostgreSQL binary and serves it on localhost:5432 with
// the exact credentials in .env (bubbly / bubbly / bubbly). Data persists in
// ./.devdb so your test bookings survive restarts. Stop with Ctrl+C.
//
//   npm run db:local        # leave this running in its own terminal
//   (then in another terminal)  npm run db:migrate && npm run db:seed && npm run dev
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, ".devdb");
const firstRun = !existsSync(join(DATA_DIR, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "bubbly",
  password: "bubbly",
  port: 5432,
  persistent: true,
});

async function ensureDatabase() {
  // Create the app DB as UTF8 on first boot (Windows clusters default to WIN1252,
  // which can't store emoji). Safe to re-run — only creates when missing.
  const client = pg.getPgClient();
  await client.connect();
  const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = 'bubbly'");
  if (rows.length === 0) {
    await client.query(
      "CREATE DATABASE bubbly ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0"
    );
    console.log("• Created database 'bubbly' (UTF8)");
  }
  await client.end();
}

async function main() {
  if (firstRun) {
    console.log("• First run — initialising a fresh PostgreSQL cluster in ./.devdb …");
    await pg.initialise();
  }
  await pg.start();
  await ensureDatabase();
  console.log("\n✅ Local Postgres is ready on  postgresql://bubbly:bubbly@localhost:5432/bubbly");
  if (firstRun) {
    console.log("\nNext, in another terminal:");
    console.log("   npm run db:migrate   # create the tables");
    console.log("   npm run db:seed      # packages, add-ons, settings, admin login");
    console.log("   npm run dev          # http://localhost:3000  →  /admin");
  }
  console.log("\n(Leave this running. Press Ctrl+C to stop the database.)");
}

const shutdown = async () => {
  console.log("\n• Stopping local Postgres …");
  try { await pg.stop(); } catch {}
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => { console.error("Failed to start local Postgres:", e); process.exit(1); });
setInterval(() => {}, 1 << 30); // keep alive
