import { ensureSchema, getDb } from "../../../../../db";
import { assertCsrf, audit, requireRoot } from "../../../../../lib/server/auth";
import { randomId } from "../../../../../lib/server/crypto";
import { discoverOpenAIProjectKeys } from "../../../../../lib/server/openai-admin";
import { assertSameOrigin, jsonError, noStoreHeaders } from "../../../../../lib/server/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const root = await requireRoot(request);
    await assertCsrf(request, root);
    await ensureSchema();

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
        project_id = excluded.project_id,
        status = 'active',
        updated_at = excluded.updated_at`)
      .bind(randomId("trk"), key.keyId, key.label, key.projectId, root.account.id, now, now));

    for (let index = 0; index < statements.length; index += 100) {
      await getDb().batch(statements.slice(index, index + 100));
    }

    const created = discovered.keys.filter((key) => !existing.has(key.keyId)).length;
    const restored = discovered.keys.filter((key) => existing.get(key.keyId) === "archived").length;
    const unchanged = discovered.keys.length - created - restored;
    await audit(request, "key.sync_completed", "organization", null, root.account.id, {
      projects: discovered.projects,
      discovered: discovered.keys.length,
      created,
      restored,
      unchanged,
    });

    return Response.json({
      projects: discovered.projects,
      discovered: discovered.keys.length,
      created,
      restored,
      unchanged,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
