import { ensureSchema, getDb } from "../../../../db";
import { assertCsrf, audit, passwordPepper, requireRoot } from "../../../../lib/server/auth";
import { hashPassword, randomId, randomToken } from "../../../../lib/server/crypto";
import { ApiError, assertJsonRequest, assertSameOrigin, jsonError, noStoreHeaders, normalizeEmail } from "../../../../lib/server/security";
import { createAccountSchema, updateAccountSchema } from "../../../../lib/server/validation";

export async function GET(request: Request) {
  try {
    await requireRoot(request);
    await ensureSchema();
    const rows = await getDb().prepare(`SELECT a.id, a.email, a.display_name, a.role, a.status, a.created_at, a.last_login_at,
      a.credit_limit_cents,
      COUNT(aak.api_key_id) AS key_count
      FROM accounts a LEFT JOIN account_api_keys aak ON aak.account_id = a.id
      WHERE a.deleted_at IS NULL
      GROUP BY a.id ORDER BY CASE a.role WHEN 'root' THEN 0 ELSE 1 END, a.created_at DESC`).all<{
        id: string; email: string; display_name: string; role: "root" | "user"; status: "active" | "disabled";
        created_at: number; last_login_at: number | null; credit_limit_cents: number | null; key_count: number;
      }>();
    const assignments = await getDb().prepare(`SELECT aak.account_id, aak.api_key_id, k.key_id, k.label, k.project_id, k.created_at
      FROM account_api_keys aak JOIN api_keys k ON k.id = aak.api_key_id
      WHERE k.status = 'active'`).all<{
        account_id: string; api_key_id: string; key_id: string; label: string; project_id: string | null; created_at: number;
      }>();
    const assignedKeyCounts = new Map<string, number>();
    for (const assignment of assignments.results) assignedKeyCounts.set(assignment.api_key_id, (assignedKeyCounts.get(assignment.api_key_id) ?? 0) + 1);
    return Response.json({ accounts: rows.results.map((row) => ({
      id: row.id, email: row.email, displayName: row.display_name, role: row.role, status: row.status,
      createdAt: row.created_at, lastLoginAt: row.last_login_at, keyCount: Number(row.key_count),
      budgetLimitCents: row.credit_limit_cents,
      budgetSpentCents: null,
      sharedKeyCount: assignments.results.filter((item) => item.account_id === row.id && (assignedKeyCounts.get(item.api_key_id) ?? 0) > 1).length,
    })) }, { headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertJsonRequest(request);
    const root = await requireRoot(request); await assertCsrf(request, root);
    const parsed = createAccountSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid account details.", "VALIDATION_ERROR");
    const requestedKeyIds = [...new Set(parsed.data.apiKeyIds)];
    if (parsed.data.role === "root" && requestedKeyIds.length) {
      throw new ApiError(400, "Root accounts already see every tracked key.", "ROOT_ALL_KEYS");
    }
    if (parsed.data.role === "root" && parsed.data.creditLimitCents !== null) {
      throw new ApiError(400, "Account budgets apply to assigned-key users, not the root account.", "ROOT_NO_BUDGET");
    }
    if (requestedKeyIds.length) {
      const placeholders = requestedKeyIds.map(() => "?").join(", ");
      const visible = await getDb().prepare(`SELECT id FROM api_keys WHERE status = 'active' AND id IN (${placeholders})`)
        .bind(...requestedKeyIds).all<{ id: string }>();
      if (visible.results.length !== requestedKeyIds.length) {
        throw new ApiError(400, "One or more selected keys are unavailable.", "INVALID_KEY_ASSIGNMENT");
      }
    }
    const now = Math.floor(Date.now() / 1000);
    const id = randomId("acct");
    try {
      await getDb().batch([
        getDb().prepare(`INSERT INTO accounts
          (id, email, display_name, password_hash, role, status, created_at, updated_at, password_changed_at, must_change_password, credit_limit_cents)
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, 1, ?)`)
          .bind(id, normalizeEmail(parsed.data.email), parsed.data.displayName, await hashPassword(parsed.data.password, passwordPepper()), parsed.data.role, now, now, now, parsed.data.creditLimitCents),
        ...requestedKeyIds.map((keyId) => getDb().prepare(`INSERT INTO account_api_keys
          (account_id, api_key_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)`)
          .bind(id, keyId, root.account.id, now)),
      ]);
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new ApiError(409, "An account with that email already exists.", "DUPLICATE_ACCOUNT");
      throw error;
    }
    await audit(request, "account.created", "account", id, root.account.id, {
      email: normalizeEmail(parsed.data.email), role: parsed.data.role, assignedKeyCount: requestedKeyIds.length,
      creditLimitCents: parsed.data.creditLimitCents,
    });
    for (const keyId of requestedKeyIds) {
      await audit(request, "key.assigned", "assignment", `${id}:${keyId}`, root.account.id, { accountId: id, apiKeyId: keyId });
    }
    return Response.json({ id }, { status: 201, headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request); assertJsonRequest(request);
    const root = await requireRoot(request); await assertCsrf(request, root);
    const body = await request.json() as { id?: string; changes?: unknown };
    if (!body.id) throw new ApiError(400, "Account ID is required.", "VALIDATION_ERROR");
    const parsed = updateAccountSchema.safeParse(body.changes);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid changes.", "VALIDATION_ERROR");
    const target = await getDb().prepare("SELECT id, role, status, credit_limit_cents FROM accounts WHERE id = ? AND deleted_at IS NULL").bind(body.id).first<{ id: string; role: string; status: string; credit_limit_cents: number | null }>();
    if (!target) throw new ApiError(404, "Account not found.", "NOT_FOUND");
    if (target.role === "root" && parsed.data.status === "disabled") throw new ApiError(400, "Root accounts cannot be disabled.", "ROOT_PROTECTED");
    if (target.role === "root" && parsed.data.creditLimitCents !== undefined) throw new ApiError(400, "The root account does not use an assigned-key credit limit.", "ROOT_NO_BUDGET");
    const updates: string[] = ["updated_at = ?"];
    const values: unknown[] = [Math.floor(Date.now() / 1000)];
    if (parsed.data.displayName) { updates.push("display_name = ?"); values.push(parsed.data.displayName); }
    if (parsed.data.email !== undefined) { updates.push("email = ?"); values.push(normalizeEmail(parsed.data.email)); }
    if (parsed.data.status) { updates.push("status = ?"); values.push(parsed.data.status); }
    if (parsed.data.creditLimitCents !== undefined) { updates.push("credit_limit_cents = ?"); values.push(parsed.data.creditLimitCents); }
    if (parsed.data.password) {
      updates.push("password_hash = ?", "password_changed_at = ?", "must_change_password = 1");
      values.push(await hashPassword(parsed.data.password, passwordPepper()), Math.floor(Date.now() / 1000));
    }
    values.push(body.id);
    try { await getDb().prepare(`UPDATE accounts SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run(); }
    catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new ApiError(409, "An account with that email already exists.", "DUPLICATE_ACCOUNT");
      throw error;
    }
    if (parsed.data.status === "disabled" || parsed.data.password) {
      await getDb().prepare("DELETE FROM sessions WHERE account_id = ?").bind(body.id).run();
    }
    await audit(request, "account.updated", "account", body.id, root.account.id, { fields: Object.keys(parsed.data) });
    if (parsed.data.creditLimitCents !== undefined) {
      await audit(request, "credit_limit.updated", "account_credit", body.id, root.account.id, {
        previousLimitCents: target.credit_limit_cents, nextLimitCents: parsed.data.creditLimitCents,
      });
    }
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request); assertJsonRequest(request);
    const root = await requireRoot(request); await assertCsrf(request, root);
    const body = await request.json() as { id?: string };
    if (!body.id) throw new ApiError(400, "Account ID is required.", "VALIDATION_ERROR");
    const target = await getDb().prepare("SELECT id, role FROM accounts WHERE id = ? AND deleted_at IS NULL")
      .bind(body.id).first<{ id: string; role: string }>();
    if (!target) throw new ApiError(404, "Account not found.", "NOT_FOUND");
    if (target.role === "root") throw new ApiError(400, "Root accounts cannot be deleted.", "ROOT_PROTECTED");

    const now = Math.floor(Date.now() / 1000);
    const anonymizedEmail = `deleted+${target.id}@argus.invalid`;
    await getDb().batch([
      getDb().prepare("DELETE FROM sessions WHERE account_id = ?").bind(target.id),
      getDb().prepare("DELETE FROM account_api_keys WHERE account_id = ?").bind(target.id),
      getDb().prepare(`UPDATE accounts SET email = ?, display_name = 'Deleted account', password_hash = ?,
        status = 'disabled', updated_at = ?, password_changed_at = ?, deleted_at = ? WHERE id = ?`)
        .bind(anonymizedEmail, await hashPassword(randomToken(), passwordPepper()), now, now, now, target.id),
    ]);
    await audit(request, "account.deleted", "account", target.id, root.account.id, { anonymized: true });
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}
