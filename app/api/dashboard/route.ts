import { getVisibleKeys, requireSession } from "../../../lib/server/auth";
import { getDashboardData } from "../../../lib/server/openai-usage";
import { ApiError, jsonError, noStoreHeaders } from "../../../lib/server/security";
import { getBudgetSnapshot } from "../../../lib/server/budget";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range") ?? "30";
    if (!["7", "30", "all"].includes(rangeParam)) throw new ApiError(400, "Range must be 7 days, 30 days, or all time.", "VALIDATION_ERROR");
    const range = rangeParam === "all" ? "all" : Number(rangeParam) as 7 | 30;
    const visibleKeys = await getVisibleKeys(session.account);
    const selectedId = url.searchParams.get("key");
    const selectedKeys = selectedId ? visibleKeys.filter((key) => key.id === selectedId) : visibleKeys;
    if (selectedId && selectedKeys.length === 0) throw new ApiError(403, "That key is not assigned to this account.", "FORBIDDEN");
    const [dashboard, budget] = await Promise.all([
      getDashboardData(selectedKeys, range),
      session.account.role === "user" ? getBudgetSnapshot(session.account.creditLimitCents, visibleKeys) : Promise.resolve(null),
    ]);
    return Response.json({ ...dashboard, budget }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
