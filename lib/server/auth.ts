import "server-only";
import { ensureSchema, getDb, getRuntimeEnv, type AccountRow } from "../../db";
import { randomId, randomToken, sha256 } from "./crypto";
import { ApiError, hashClientIp, parseCookies } from "./security";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;

export type SafeAccount = {
  id: string;
  email: string;
  displayName: string;
  role: "root" | "user";
  status: "active" | "disabled";
  createdAt: number;
  lastLoginAt: number | null;
  creditLimitCents: number | null;
  mustChangePassword: boolean;
};

export type AuthSession = {
  account: SafeAccount;
  csrfToken: string;
  tokenHash: string;
};

async function csrfTokenForSession(sessionToken: string): Promise<string> {
  return sha256(`argus-csrf\u0000${sessionToken}\u0000${getRuntimeEnv().ARGUS_PASSWORD_PEPPER ?? ""}`);
}

function safeAccount(row: AccountRow): SafeAccount {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    creditLimitCents: row.credit_limit_cents,
    mustChangePassword: row.must_change_password === 1,
  };
}

export async function isConfigured(): Promise<boolean> {
  await ensureSchema();
  const row = await getDb().prepare("SELECT COUNT(*) AS count FROM accounts WHERE role = 'root'").first<{ count: number }>();
  return Number(row?.count ?? 0) > 0;
}

export async function createSession(accountId: string, request: Request) {
  await ensureSchema();
  const now = Math.floor(Date.now() / 1000);
  const token = randomToken();
  const csrfToken = await csrfTokenForSession(token);
  const [tokenHash, csrfHash, ipHash] = await Promise.all([
    sha256(token),
    sha256(csrfToken),
    hashClientIp(request),
  ]);
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 320);
  const db = getDb();
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare(`INSERT INTO sessions
      (token_hash, account_id, csrf_hash, expires_at, created_at, last_seen_at, ip_hash, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(tokenHash, accountId, csrfHash, now + SESSION_TTL_SECONDS, now, now, ipHash, userAgent),
  ]);
  return { token, csrfToken, expiresIn: SESSION_TTL_SECONDS };
}

export async function getSession(request: Request): Promise<AuthSession | null> {
  await ensureSchema();
  const token = parseCookies(request).argus_session;
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await getDb().prepare(`SELECT
      s.token_hash, s.csrf_hash, s.expires_at, s.last_seen_at,
      a.id, a.email, a.display_name, a.password_hash, a.role, a.status,
      a.created_at, a.updated_at, a.last_login_at, a.credit_limit_cents, a.must_change_password
    FROM sessions s
    JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND a.status = 'active'`)
    .bind(tokenHash, now)
    .first<AccountRow & { token_hash: string; csrf_hash: string; expires_at: number; last_seen_at: number }>();
  if (!row) return null;
  if (now - row.last_seen_at > 300) {
    getDb().prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").bind(now, tokenHash).run().catch(() => undefined);
  }
  return { account: safeAccount(row), csrfToken: "", tokenHash };
}

export async function requireSession(request: Request): Promise<AuthSession> {
  const session = await getSession(request);
  if (!session) throw new ApiError(401, "Sign in to continue.", "UNAUTHENTICATED");
  const pathname = new URL(request.url).pathname;
  if (session.account.mustChangePassword && pathname !== "/api/auth/password" && pathname !== "/api/auth/logout") {
    throw new ApiError(403, "Change the temporary password before continuing.", "PASSWORD_CHANGE_REQUIRED");
  }
  return session;
}

export async function requireRoot(request: Request): Promise<AuthSession> {
  const session = await requireSession(request);
  if (session.account.role !== "root") throw new ApiError(403, "Root access is required.", "FORBIDDEN");
  return session;
}

export async function assertCsrf(request: Request, session: AuthSession) {
  const token = request.headers.get("x-csrf-token");
  if (!token) throw new ApiError(403, "Security token is missing.", "CSRF_REJECTED");
  const hash = await sha256(token);
  const row = await getDb().prepare("SELECT 1 AS ok FROM sessions WHERE token_hash = ? AND csrf_hash = ?")
    .bind(session.tokenHash, hash).first<{ ok: number }>();
  if (!row) throw new ApiError(403, "Security token is invalid.", "CSRF_REJECTED");
}

export async function getCsrfToken(request: Request): Promise<string | null> {
  const token = parseCookies(request).argus_session;
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await getDb().prepare("SELECT 1 AS ok FROM sessions WHERE token_hash = ?").bind(tokenHash).first<{ ok: number }>();
  if (!row) return null;
  // A stable, session-bound token prevents concurrent bootstrap requests from
  // invalidating one another. Only its hash is persisted in the database.
  const csrfToken = await csrfTokenForSession(token);
  await getDb().prepare("UPDATE sessions SET csrf_hash = ? WHERE token_hash = ?").bind(await sha256(csrfToken), tokenHash).run();
  return csrfToken;
}

export async function deleteSession(request: Request) {
  const token = parseCookies(request).argus_session;
  if (!token) return;
  await ensureSchema();
  await getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function assertLoginAllowed(email: string, request: Request) {
  await ensureSchema();
  const now = Math.floor(Date.now() / 1000);
  const ipHash = await hashClientIp(request);
  const key = await sha256(`${ipHash}\u0000${email}`);
  const row = await getDb().prepare("SELECT attempts, window_started_at, blocked_until FROM rate_limits WHERE key = ?")
    .bind(key).first<{ attempts: number; window_started_at: number; blocked_until: number | null }>();
  if (row?.blocked_until && row.blocked_until > now) {
    throw new ApiError(429, "Too many sign-in attempts. Try again in a few minutes.", "RATE_LIMITED");
  }
  return { key, row, now };
}

export async function recordLoginFailure(key: string, current: Awaited<ReturnType<typeof assertLoginAllowed>>["row"], now: number) {
  const db = getDb();
  if (!current || now - current.window_started_at >= LOGIN_WINDOW_SECONDS) {
    await db.prepare(`INSERT INTO rate_limits (key, attempts, window_started_at, blocked_until)
      VALUES (?, 1, ?, NULL)
      ON CONFLICT(key) DO UPDATE SET attempts = 1, window_started_at = excluded.window_started_at, blocked_until = NULL`)
      .bind(key, now).run();
    return;
  }
  const attempts = current.attempts + 1;
  await db.prepare("UPDATE rate_limits SET attempts = ?, blocked_until = ? WHERE key = ?")
    .bind(attempts, attempts >= LOGIN_MAX_ATTEMPTS ? now + LOCKOUT_SECONDS : null, key).run();
}

export async function recordLoginSuccess(key: string) {
  await getDb().prepare("DELETE FROM rate_limits WHERE key = ?").bind(key).run();
}

export async function audit(
  request: Request,
  action: string,
  targetType: string,
  targetId: string | null,
  actorAccountId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await ensureSchema();
  const sanitized = Object.fromEntries(Object.entries(metadata).filter(([key]) => !/password|token|secret/i.test(key)));
  await getDb().prepare(`INSERT INTO audit_events
    (id, actor_account_id, action, target_type, target_id, metadata_json, ip_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(randomId("evt"), actorAccountId, action, targetType, targetId, JSON.stringify(sanitized), await hashClientIp(request), Math.floor(Date.now() / 1000)).run();
}

export async function getVisibleKeys(account: SafeAccount): Promise<Array<{ id: string; keyId: string; label: string; projectId: string | null; createdAt: number }>> {
  await ensureSchema();
  const db = getDb();
  const result = account.role === "root"
    ? await db.prepare("SELECT id, key_id, label, project_id, created_at FROM api_keys WHERE status = 'active' ORDER BY label").all<{ id: string; key_id: string; label: string; project_id: string | null; created_at: number }>()
    : await db.prepare(`SELECT k.id, k.key_id, k.label, k.project_id, k.created_at
        FROM api_keys k JOIN account_api_keys aak ON aak.api_key_id = k.id
        WHERE aak.account_id = ? AND k.status = 'active' ORDER BY k.label`).bind(account.id)
      .all<{ id: string; key_id: string; label: string; project_id: string | null; created_at: number }>();
  return result.results.map((row) => ({ id: row.id, keyId: row.key_id, label: row.label, projectId: row.project_id, createdAt: row.created_at }));
}

export function passwordPepper(): string {
  return getRuntimeEnv().ARGUS_PASSWORD_PEPPER ?? "";
}
