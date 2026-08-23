import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB?: D1Database;
  OPENAI_ADMIN_KEY?: string;
  ARGUS_SETUP_TOKEN?: string;
  ARGUS_PASSWORD_PEPPER?: string;
  ARGUS_DEMO_MODE?: string;
};

export function getRuntimeEnv(): RuntimeEnv {
  return env as RuntimeEnv;
}

export function getDb(): D1Database {
  const db = getRuntimeEnv().DB;
  if (!db) throw new Error("ARGUS database binding is unavailable.");
  return db;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = initializeSchema().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function initializeSchema() {
  const db = getDb();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('root', 'user')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER,
      password_changed_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY NOT NULL,
      key_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      project_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_by TEXT NOT NULL REFERENCES accounts(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS account_api_keys (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      assigned_by TEXT NOT NULL REFERENCES accounts(id),
      assigned_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, api_key_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      csrf_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      ip_hash TEXT,
      user_agent TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY NOT NULL,
      attempts INTEGER NOT NULL,
      window_started_at INTEGER NOT NULL,
      blocked_until INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      actor_account_id TEXT REFERENCES accounts(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      ip_hash TEXT,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON sessions(account_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_assignments_account_id ON account_api_keys(account_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_assignments_api_key_id ON account_api_keys(api_key_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_account_id, created_at DESC)"),
  ]);
}

export type AccountRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: "root" | "user";
  status: "active" | "disabled";
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
};
