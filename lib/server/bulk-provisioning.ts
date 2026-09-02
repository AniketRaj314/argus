import "server-only";

import { ensureSchema, getDb } from "../../db";
import {
  buildProvisioningPlan,
  bulkProvisioningRosterSchema,
  type BulkProvisioningEntry,
  type ProvisioningPlan,
  type ProvisioningPlanRow,
} from "../bulk-provisioning";
import { hashPassword, randomId } from "./crypto";
import { discoverOpenAIProjectKeys } from "./openai-admin";
import { normalizeEmail } from "./security";
import { passwordSchema } from "./validation";

const PLAN_TTL_SECONDS = 10 * 60;

type StoredPlan = {
  expiresAt: number;
  plan: ProvisioningPlan;
};

const pendingPlans = new Map<string, StoredPlan>();

export class BulkProvisioningError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "BulkProvisioningError";
  }
}

function cleanExpiredPlans(now = Math.floor(Date.now() / 1000)) {
  for (const [id, plan] of pendingPlans) if (plan.expiresAt <= now) pendingPlans.delete(id);
}

function maskKeyId(value: string) {
  if (value.length <= 14) return `${value.slice(0, 6)}••••`;
  return `${value.slice(0, 8)}••••${value.slice(-4)}`;
}

async function loadProvisioningState() {
  await ensureSchema();
  const [keys, accounts, root] = await Promise.all([
    getDb().prepare("SELECT id, key_id, label FROM api_keys WHERE status = 'active' ORDER BY label")
      .all<{ id: string; key_id: string; label: string }>(),
    getDb().prepare("SELECT id, email, display_name, credit_limit_cents FROM accounts WHERE deleted_at IS NULL ORDER BY created_at")
      .all<{ id: string; email: string; display_name: string; credit_limit_cents: number | null }>(),
    getDb().prepare("SELECT id FROM accounts WHERE role = 'root' AND deleted_at IS NULL")
      .first<{ id: string }>(),
  ]);
  if (!root) throw new BulkProvisioningError("ARGUS must have a root account before bulk provisioning.", "ROOT_MISSING");
  return {
    rootId: root.id,
    keys: keys.results.map((key) => ({ id: key.id, keyId: key.key_id, label: key.label })),
    accounts: accounts.results,
  };
}

export async function getBulkProvisioningContext() {
  const state = await loadProvisioningState();
  return {
    keys: state.keys.map((key) => ({ id: key.id, keyId: maskKeyId(key.keyId), label: key.label })),
    accounts: state.accounts.map((account) => ({
      id: account.id,
      email: account.email,
      displayName: account.display_name,
      creditLimitCents: account.credit_limit_cents,
    })),
  };
}

export async function syncProvisioningKeys() {
  const state = await loadProvisioningState();
  const discovered = await discoverOpenAIProjectKeys();
  const existingRows = await getDb().prepare("SELECT key_id, status FROM api_keys").all<{
    key_id: string;
    status: "active" | "archived";
  }>();
  const existing = new Map(existingRows.results.map((row) => [row.key_id, row.status]));
  const now = Math.floor(Date.now() / 1000);
  const statements = discovered.keys.map((key) => getDb().prepare(`INSERT INTO api_keys
    (id, key_id, label, project_id, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    ON CONFLICT(key_id) DO UPDATE SET
      label = excluded.label,
      project_id = excluded.project_id,
      status = 'active',
      created_at = LEAST(api_keys.created_at, excluded.created_at),
      updated_at = excluded.updated_at`)
    .bind(randomId("trk"), key.keyId, key.label, key.projectId, state.rootId, key.createdAt ?? now, now));

  for (let index = 0; index < statements.length; index += 100) {
    await getDb().batch(statements.slice(index, index + 100));
  }

  const result = {
    projects: discovered.projects,
    discovered: discovered.keys.length,
    created: discovered.keys.filter((key) => !existing.has(key.keyId)).length,
    restored: discovered.keys.filter((key) => existing.get(key.keyId) === "archived").length,
  };
  const unchanged = result.discovered - result.created - result.restored;
  await getDb().prepare(`INSERT INTO audit_events
    (id, actor_account_id, action, target_type, target_id, metadata_json, ip_hash, created_at)
    VALUES (?, ?, 'key.sync_completed', 'organization', NULL, ?, NULL, ?)`)
    .bind(randomId("evt"), state.rootId, JSON.stringify({ ...result, unchanged, source: "mcp_bulk" }), now).run();
  return { ...result, unchanged };
}

function publicPlanRow(row: ProvisioningPlanRow) {
  return {
    row: row.row,
    email: row.email,
    displayName: row.displayName,
    keyQuery: row.keyQuery,
    matchedKeyLabel: row.keyLabel,
    creditLimitCents: row.creditLimitCents,
    issues: row.issues,
  };
}

export async function prepareBulkProvisioning(rosterInput: BulkProvisioningEntry[]) {
  const parsed = bulkProvisioningRosterSchema.safeParse(rosterInput);
  if (!parsed.success) {
    throw new BulkProvisioningError(parsed.error.issues[0]?.message ?? "The provisioning roster is invalid.", "INVALID_ROSTER");
  }
  const state = await loadProvisioningState();
  const plan = buildProvisioningPlan(parsed.data, state.keys, state.accounts.map((account) => account.email));
  cleanExpiredPlans();

  if (!plan.ready) {
    return {
      ready: false as const,
      planId: null,
      expiresAt: null,
      createCount: plan.createCount,
      issueCount: plan.issueCount,
      rows: plan.rows.map(publicPlanRow),
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const planId = randomId("bulkplan");
  const expiresAt = now + PLAN_TTL_SECONDS;
  pendingPlans.set(planId, { expiresAt, plan });
  return {
    ready: true as const,
    planId,
    expiresAt,
    createCount: plan.createCount,
    issueCount: 0,
    rows: plan.rows.map(publicPlanRow),
  };
}

export async function applyBulkProvisioning(planId: string) {
  cleanExpiredPlans();
  const stored = pendingPlans.get(planId);
  if (!stored) throw new BulkProvisioningError("This provisioning plan is missing or expired. Prepare a new preview.", "PLAN_EXPIRED");

  const defaultPassword = process.env.ARGUS_BULK_DEFAULT_PASSWORD ?? "";
  const passwordCheck = passwordSchema.safeParse(defaultPassword);
  if (!passwordCheck.success) {
    throw new BulkProvisioningError("ARGUS_BULK_DEFAULT_PASSWORD is missing or does not meet the password policy.", "DEFAULT_PASSWORD_INVALID");
  }
  const pepper = process.env.ARGUS_PASSWORD_PEPPER?.trim();
  if (!pepper) {
    throw new BulkProvisioningError("ARGUS_PASSWORD_PEPPER must be present so new accounts use the production password boundary.", "PEPPER_MISSING");
  }

  const state = await loadProvisioningState();
  const currentKeysByInternalId = new Map(state.keys.map((key) => [key.id, key]));
  const revalidated = buildProvisioningPlan(
    stored.plan.rows.map((row) => ({
      email: row.email,
      displayName: row.displayName,
      key: row.keyId ? (currentKeysByInternalId.get(row.keyId)?.keyId ?? row.keyId) : row.keyQuery,
      creditLimitUsd: row.creditLimitCents === null ? null : row.creditLimitCents / 100,
    })),
    state.keys,
    state.accounts.map((account) => account.email),
  );
  if (!revalidated.ready) {
    pendingPlans.delete(planId);
    throw new BulkProvisioningError("ARGUS changed after the preview. Prepare a new plan before applying it.", "PLAN_STALE");
  }

  const now = Math.floor(Date.now() / 1000);
  const created: Array<{ id: string; email: string; displayName: string; keyLabel: string; creditLimitCents: number | null }> = [];
  const statements = [];
  for (const row of revalidated.rows) {
    const accountId = randomId("acct");
    const passwordHash = await hashPassword(defaultPassword, pepper);
    statements.push(
      getDb().prepare(`INSERT INTO accounts
        (id, email, display_name, password_hash, role, status, created_at, updated_at, password_changed_at, must_change_password, credit_limit_cents)
        VALUES (?, ?, ?, ?, 'user', 'active', ?, ?, ?, 1, ?)`)
        .bind(accountId, normalizeEmail(row.email), row.displayName, passwordHash, now, now, now, row.creditLimitCents),
      getDb().prepare(`INSERT INTO account_api_keys
        (account_id, api_key_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)`)
        .bind(accountId, row.keyId!, state.rootId, now),
      getDb().prepare(`INSERT INTO audit_events
        (id, actor_account_id, action, target_type, target_id, metadata_json, ip_hash, created_at)
        VALUES (?, ?, 'account.created', 'account', ?, ?, NULL, ?)`)
        .bind(randomId("evt"), state.rootId, accountId, JSON.stringify({
          email: normalizeEmail(row.email), role: "user", assignedKeyCount: 1,
          creditLimitCents: row.creditLimitCents, source: "mcp_bulk",
        }), now),
      getDb().prepare(`INSERT INTO audit_events
        (id, actor_account_id, action, target_type, target_id, metadata_json, ip_hash, created_at)
        VALUES (?, ?, 'key.assigned', 'assignment', ?, ?, NULL, ?)`)
        .bind(randomId("evt"), state.rootId, `${accountId}:${row.keyId}`, JSON.stringify({
          accountId, apiKeyId: row.keyId, source: "mcp_bulk",
        }), now),
    );
    created.push({
      id: accountId,
      email: normalizeEmail(row.email),
      displayName: row.displayName,
      keyLabel: row.keyLabel!,
      creditLimitCents: row.creditLimitCents,
    });
  }
  statements.push(getDb().prepare(`INSERT INTO audit_events
    (id, actor_account_id, action, target_type, target_id, metadata_json, ip_hash, created_at)
    VALUES (?, ?, 'accounts.bulk_provisioned', 'organization', NULL, ?, NULL, ?)`)
    .bind(randomId("evt"), state.rootId, JSON.stringify({ accountCount: created.length, source: "mcp_bulk" }), now));

  try {
    await getDb().batch(statements);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw new BulkProvisioningError("An account or assignment changed during provisioning. No accounts were created.", "PROVISIONING_CONFLICT");
    }
    throw error;
  }
  pendingPlans.delete(planId);
  return { createdCount: created.length, created };
}
