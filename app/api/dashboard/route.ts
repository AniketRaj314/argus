import { getVisibleKeys, requireSession } from "../../../lib/server/auth";
import { getDashboardData } from "../../../lib/server/openai-usage";
import { ApiError, jsonError, noStoreHeaders } from "../../../lib/server/security";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const url = new URL(request.url);
    const rangeDays = Number(url.searchParams.get("range") ?? "30");
    if (![7, 30].includes(rangeDays)) throw new ApiError(400, "Range must be 7 or 30 days.", "VALIDATION_ERROR");
    const visibleKeys = await getVisibleKeys(session.account);
    const selectedId = url.searchParams.get("key");
    const selectedKeys = selectedId ? visibleKeys.filter((key) => key.id === selectedId) : visibleKeys;
    if (selectedId && selectedKeys.length === 0) throw new ApiError(403, "That key is not assigned to this account.", "FORBIDDEN");
    const dashboard = await getDashboardData(selectedKeys, rangeDays);
    return Response.json(dashboard, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
