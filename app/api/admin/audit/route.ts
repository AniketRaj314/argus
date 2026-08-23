import { getDb } from "../../../../db";
import { requireRoot } from "../../../../lib/server/auth";
import { jsonError, noStoreHeaders } from "../../../../lib/server/security";

export async function GET(request: Request) {
  try {
    await requireRoot(request);
    const rows = await getDb().prepare(`SELECT e.id, e.action, e.target_type, e.target_id, e.metadata_json, e.created_at,
      a.display_name AS actor_name, a.email AS actor_email
      FROM audit_events e LEFT JOIN accounts a ON a.id = e.actor_account_id
      ORDER BY e.created_at DESC LIMIT 100`).all<{
        id: string; action: string; target_type: string; target_id: string | null; metadata_json: string;
        created_at: number; actor_name: string | null; actor_email: string | null;
      }>();
    return Response.json({ events: rows.results.map((row) => ({
      id: row.id, action: row.action, targetType: row.target_type, targetId: row.target_id,
      metadata: JSON.parse(row.metadata_json || "{}"), createdAt: row.created_at,
      actorName: row.actor_name ?? "System", actorEmail: row.actor_email,
    })) }, { headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}
