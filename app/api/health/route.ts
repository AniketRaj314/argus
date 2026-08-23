import { getHealthSnapshot } from "../../../lib/server/health";
import { noStoreHeaders } from "../../../lib/server/security";

export async function GET() {
  const health = await getHealthSnapshot();
  return Response.json(health, {
    status: health.status === "operational" ? 200 : 503,
    headers: noStoreHeaders(),
  });
}
