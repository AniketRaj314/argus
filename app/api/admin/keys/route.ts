import { ensureSchema, getDb } from "../../../../db";
import { assertCsrf, audit, requireRoot } from "../../../../lib/server/auth";
import { randomId } from "../../../../lib/server/crypto";
import { ApiError, assertJsonRequest, assertSameOrigin, jsonError, noStoreHeaders } from "../../../../lib/server/security";
import { createKeySchema } from "../../../../lib/server/validation";

export async function GET(request: Request) {
  try {
    await requireRoot(request); await ensureSchema();
    const rows = await getDb().prepare(`SELECT k.id, k.key_id, k.label, k.project_id, k.status, k.created_at,
      STRING_AGG(a.display_name, ' • ' ORDER BY a.display_name) AS assigned_names, COUNT(aak.account_id) AS assignment_count
      FROM api_keys k
      LEFT JOIN account_api_keys aak ON aak.api_key_id = k.id
      LEFT JOIN accounts a ON a.id = aak.account_id
      GROUP BY k.id ORDER BY k.created_at DESC`).all<{
        id: string; key_id: string; label: string; project_id: string | null; status: "active" | "archived";
        created_at: number; assigned_names: string | null; assignment_count: number;
      }>();
    return Response.json({ keys: rows.results.map((row) => ({
      id: row.id, keyId: row.key_id, label: row.label, projectId: row.project_id, status: row.status,
      createdAt: row.created_at, assignedNames: row.assigned_names?.split(" • ") ?? [], assignmentCount: Number(row.assignment_count),
    })) }, { headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertJsonRequest(request);
    const root = await requireRoot(request); await assertCsrf(request, root);
    const parsed = createKeySchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid key details.", "VALIDATION_ERROR");
    const id = randomId("trk"); const now = Math.floor(Date.now() / 1000);
    try {
      await getDb().prepare(`INSERT INTO api_keys
        (id, key_id, label, project_id, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`)
        .bind(id, parsed.data.keyId, parsed.data.label, parsed.data.projectId || null, root.account.id, now, now).run();
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new ApiError(409, "That API Key ID is already tracked.", "DUPLICATE_KEY");
      throw error;
    }
    await audit(request, "key.created", "api_key", id, root.account.id, { keyId: parsed.data.keyId, label: parsed.data.label });
    return Response.json({ id }, { status: 201, headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request); assertJsonRequest(request);
    const root = await requireRoot(request); await assertCsrf(request, root);
    const body = await request.json() as { id?: string; label?: string; status?: "active" | "archived" };
    if (!body.id || (body.status && !["active", "archived"].includes(body.status))) throw new ApiError(400, "Invalid key update.", "VALIDATION_ERROR");
    if (body.label !== undefined && (body.label.trim().length < 2 || body.label.length > 80)) throw new ApiError(400, "Key label must be 2–80 characters.", "VALIDATION_ERROR");
    const target = await getDb().prepare("SELECT id FROM api_keys WHERE id = ?").bind(body.id).first();
    if (!target) throw new ApiError(404, "Tracked key not found.", "NOT_FOUND");
    await getDb().prepare("UPDATE api_keys SET label = COALESCE(?, label), status = COALESCE(?, status), updated_at = ? WHERE id = ?")
      .bind(body.label?.trim() || null, body.status ?? null, Math.floor(Date.now() / 1000), body.id).run();
    await audit(request, "key.updated", "api_key", body.id, root.account.id, { fields: [body.label !== undefined ? "label" : null, body.status ? "status" : null].filter(Boolean) });
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}
