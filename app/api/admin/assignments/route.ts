import { getDb } from "../../../../db";
import { assertCsrf, audit, requireRoot } from "../../../../lib/server/auth";
import { ApiError, assertJsonRequest, assertSameOrigin, jsonError, noStoreHeaders } from "../../../../lib/server/security";
import { assignKeySchema } from "../../../../lib/server/validation";

export async function GET(request: Request) {
  try {
    await requireRoot(request);
    const rows = await getDb().prepare("SELECT account_id, api_key_id, assigned_at FROM account_api_keys ORDER BY assigned_at DESC")
      .all<{ account_id: string; api_key_id: string; assigned_at: number }>();
    return Response.json({ assignments: rows.results.map((row) => ({ accountId: row.account_id, apiKeyId: row.api_key_id, assignedAt: row.assigned_at })) }, { headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertJsonRequest(request);
    const root = await requireRoot(request); await assertCsrf(request, root);
    const parsed = assignKeySchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid assignment.", "VALIDATION_ERROR");
    const account = await getDb().prepare("SELECT id, role FROM accounts WHERE id = ?").bind(parsed.data.accountId).first<{ id: string; role: string }>();
    const key = await getDb().prepare("SELECT id FROM api_keys WHERE id = ?").bind(parsed.data.apiKeyId).first<{ id: string }>();
    if (!account || !key) throw new ApiError(404, "Account or key not found.", "NOT_FOUND");
    if (account.role === "root") throw new ApiError(400, "Root users already see every tracked key.", "ROOT_ALL_KEYS");
    if (parsed.data.assigned) {
      await getDb().prepare(`INSERT INTO account_api_keys (account_id, api_key_id, assigned_by, assigned_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(account_id, api_key_id) DO NOTHING`)
        .bind(account.id, key.id, root.account.id, Math.floor(Date.now() / 1000)).run();
    } else {
      await getDb().prepare("DELETE FROM account_api_keys WHERE account_id = ? AND api_key_id = ?").bind(account.id, key.id).run();
    }
    await audit(request, parsed.data.assigned ? "key.assigned" : "key.unassigned", "assignment", `${account.id}:${key.id}`, root.account.id, { accountId: account.id, apiKeyId: key.id });
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}
