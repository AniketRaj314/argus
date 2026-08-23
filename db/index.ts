import "server-only";
import postgres from "postgres";

type RuntimeEnv = {
  DATABASE_URL?: string;
  OPENAI_ADMIN_KEY?: string;
  ARGUS_SETUP_TOKEN?: string;
  ARGUS_PASSWORD_PEPPER?: string;
  ARGUS_DEMO_MODE?: string;
};

type QueryExecutor = postgres.Sql | postgres.TransactionSql;

export function getRuntimeEnv(): RuntimeEnv {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_ADMIN_KEY: process.env.OPENAI_ADMIN_KEY,
    ARGUS_SETUP_TOKEN: process.env.ARGUS_SETUP_TOKEN,
    ARGUS_PASSWORD_PEPPER: process.env.ARGUS_PASSWORD_PEPPER,
    ARGUS_DEMO_MODE: process.env.ARGUS_DEMO_MODE,
  };
}

function databaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "postgresql://localhost:5432/argus";
  throw new Error("DATABASE_URL is required in production.");
}

function createClient(): postgres.Sql {
  const url = databaseUrl();
  const hostname = new URL(url).hostname;
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  return postgres(url, {
    max: Number(process.env.ARGUS_DB_POOL_MAX ?? (process.env.VERCEL ? 1 : 5)),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    ssl: local ? false : "require",
    onnotice: () => undefined,
  });
}

const globalDatabase = globalThis as typeof globalThis & { __argusPostgres?: postgres.Sql };

function getClient(): postgres.Sql {
  if (!globalDatabase.__argusPostgres) globalDatabase.__argusPostgres = createClient();
  return globalDatabase.__argusPostgres;
}

function numberedParameters(query: string): string {
  let parameter = 0;
  return query.replace(/\?/g, () => `$${++parameter}`);
}

class PreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly query: string) {}

  bind(...values: unknown[]): PreparedStatement {
    this.values = values;
    return this;
  }

  private async execute(executor: QueryExecutor = getClient()) {
    return executor.unsafe(numberedParameters(this.query), this.values as never[]);
  }

  async first<T>(): Promise<T | null> {
    const rows = await this.execute();
    return (rows[0] as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const rows = await this.execute();
    return { results: Array.from(rows) as T[] };
  }

  async run(executor?: QueryExecutor): Promise<{ success: true; meta: { changes: number } }> {
    const rows = await this.execute(executor);
    return { success: true, meta: { changes: rows.count ?? rows.length } };
  }
}

class ArgusDatabase {
  prepare(query: string): PreparedStatement {
    return new PreparedStatement(query);
  }

  async batch(statements: PreparedStatement[]) {
    return getClient().begin(async (transaction) => {
      const results = [];
      for (const statement of statements) results.push(await statement.run(transaction));
      return results;
    });
  }
}

const database = new ArgusDatabase();

export function getDb(): ArgusDatabase {
  return database;
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
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_single_root ON accounts ((role)) WHERE role = 'root'"),
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
