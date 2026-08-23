import { getDb } from "../../../../../db";
import { requireRoot } from "../../../../../lib/server/auth";
import { currentBudgetPeriod } from "../../../../../lib/server/budget";
import { getSpendByKey } from "../../../../../lib/server/openai-usage";
import { jsonError, noStoreHeaders } from "../../../../../lib/server/security";

export async function GET(request: Request) {
  try {
    await requireRoot(request);
    const rows = await getDb().prepare(`SELECT a.id AS account_id, aak.api_key_id, k.key_id, k.label, k.project_id, k.created_at
      FROM accounts a
      LEFT JOIN account_api_keys aak ON aak.account_id = a.id
      LEFT JOIN api_keys k ON k.id = aak.api_key_id AND k.status = 'active'
      WHERE a.deleted_at IS NULL AND a.role = 'user' AND a.monthly_budget_cents IS NOT NULL`)
      .all<{ account_id: string; api_key_id: string | null; key_id: string | null; label: string | null; project_id: string | null; created_at: number | null }>();
    const keys = [...new Map(rows.results.filter((row) => row.api_key_id && row.key_id).map((row) => [row.api_key_id!, {
      id: row.api_key_id!, keyId: row.key_id!, label: row.label!, projectId: row.project_id, createdAt: row.created_at!,
    }])).values()];
    const { start: periodStart, end: periodEnd } = currentBudgetPeriod();
    const spendByKey = await getSpendByKey(keys, periodStart, Math.min(periodEnd, Math.floor(Date.now() / 1000)));
    const accountIds = [...new Set(rows.results.map((row) => row.account_id))];
    return Response.json({
      periodStart, periodEnd,
      accounts: accountIds.map((accountId) => ({
        id: accountId,
        spentCents: Math.max(0, Math.round(rows.results.filter((row) => row.account_id === accountId)
          .reduce((sum, row) => sum + (row.key_id ? spendByKey.get(row.key_id) ?? 0 : 0), 0) * 100)),
      })),
    }, { headers: noStoreHeaders() });
  } catch (error) { return jsonError(error); }
}
