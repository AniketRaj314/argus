import postgres from "postgres";
import { passwordRecordVersion, readPepperConfig } from "../lib/server/password-record";

// Read-only administrative report. No ensureSchema, hashes, or secrets in output.
async function main() {
  const config = readPepperConfig({
    ARGUS_PASSWORD_PEPPER: process.env.ARGUS_PASSWORD_PEPPER,
    ARGUS_PASSWORD_PEPPER_VERSION: process.env.ARGUS_PASSWORD_PEPPER_VERSION,
    ARGUS_PASSWORD_PEPPER_PREVIOUS: process.env.ARGUS_PASSWORD_PEPPER_PREVIOUS,
    ARGUS_PASSWORD_PEPPER_PREVIOUS_VERSION: process.env.ARGUS_PASSWORD_PEPPER_PREVIOUS_VERSION,
    ARGUS_PASSWORD_PEPPER_MIGRATE: process.env.ARGUS_PASSWORD_PEPPER_MIGRATE,
  });
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Database configuration is missing.");
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => undefined });
  try {
    const rows = await sql<{ email: string; status: string; password_hash: string }[]>`
      SELECT email, status, password_hash FROM accounts WHERE deleted_at IS NULL ORDER BY email`;
    const pending = rows.filter((row) => passwordRecordVersion(row.password_hash) !== config.current.version);
    const unknown = pending.filter((row) => passwordRecordVersion(row.password_hash) !== config.previous?.version);
    console.log(JSON.stringify({
      currentVersion: config.current.version,
      previousVersion: config.previous?.version ?? null,
      migrationEnabled: config.migrateOnLogin !== false,
      currentAccounts: rows.length - pending.length,
      pendingAccounts: pending.length,
      pendingActiveAccounts: pending.filter((row) => row.status === "active").length,
      pendingDisabledAccounts: pending.filter((row) => row.status === "disabled").length,
      unknownVersionAccounts: unknown.length,
      canRetirePreviousPepperForPasswords: pending.length === 0,
      ...(process.argv.includes("--accounts") ? { pending: pending.map((row) => ({
        email: row.email, status: row.status, version: passwordRecordVersion(row.password_hash),
      })) } : {}),
    }, null, 2));
  } finally { await sql.end({ timeout: 3 }); }
}

main().catch(() => {
  console.error("Pepper status failed. Check server configuration and database access. No credentials were printed.");
  process.exitCode = 1;
});
