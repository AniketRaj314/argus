import "server-only";
import { getSpendByKey } from "./openai-usage";

type BudgetKey = { id: string; keyId: string; label: string; projectId: string | null; createdAt: number };

export type BudgetSnapshot = {
  limitCents: number;
  spentCents: number | null;
  remainingCents: number | null;
  percentUsed: number | null;
  trackingStart: number;
  status: "healthy" | "warning" | "exceeded" | "unavailable";
};

export async function getBudgetSnapshot(limitCents: number | null, keys: BudgetKey[]): Promise<BudgetSnapshot | null> {
  if (limitCents === null) return null;
  const now = Math.floor(Date.now() / 1000);
  const trackingStart = keys.length ? Math.min(...keys.map((key) => key.createdAt)) : now;
  try {
    const spend = await getSpendByKey(keys, trackingStart, now);
    const spentCents = Math.max(0, Math.round([...spend.values()].reduce((sum, value) => sum + value, 0) * 100));
    const percentUsed = limitCents ? (spentCents / limitCents) * 100 : 0;
    return {
      limitCents, spentCents, remainingCents: Math.max(0, limitCents - spentCents), percentUsed,
      trackingStart,
      status: percentUsed >= 100 ? "exceeded" : percentUsed >= 80 ? "warning" : "healthy",
    };
  } catch {
    return { limitCents, spentCents: null, remainingCents: null, percentUsed: null, trackingStart, status: "unavailable" };
  }
}
