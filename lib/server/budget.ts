import "server-only";
import { getSpendByKey } from "./openai-usage";

type BudgetKey = { id: string; keyId: string; label: string; projectId: string | null; createdAt: number };

export type BudgetSnapshot = {
  limitCents: number;
  spentCents: number | null;
  remainingCents: number | null;
  percentUsed: number | null;
  periodStart: number;
  periodEnd: number;
  status: "healthy" | "warning" | "exceeded" | "unavailable";
};

export function currentBudgetPeriod(now = Math.floor(Date.now() / 1000)) {
  const date = new Date(now * 1000);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000;
  return { start, end };
}

export async function getBudgetSnapshot(limitCents: number | null, keys: BudgetKey[]): Promise<BudgetSnapshot | null> {
  if (limitCents === null) return null;
  const { start, end } = currentBudgetPeriod();
  try {
    const spend = await getSpendByKey(keys, start, Math.min(end, Math.floor(Date.now() / 1000)));
    const spentCents = Math.max(0, Math.round([...spend.values()].reduce((sum, value) => sum + value, 0) * 100));
    const percentUsed = limitCents ? (spentCents / limitCents) * 100 : 0;
    return {
      limitCents, spentCents, remainingCents: Math.max(0, limitCents - spentCents), percentUsed,
      periodStart: start, periodEnd: end,
      status: percentUsed >= 100 ? "exceeded" : percentUsed >= 80 ? "warning" : "healthy",
    };
  } catch {
    return { limitCents, spentCents: null, remainingCents: null, percentUsed: null, periodStart: start, periodEnd: end, status: "unavailable" };
  }
}
