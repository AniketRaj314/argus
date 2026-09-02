import { getCsrfToken, getSession, getVisibleKeys, isConfigured } from "../../../lib/server/auth";
import { jsonError, noStoreHeaders } from "../../../lib/server/security";

export async function GET(request: Request) {
  try {
    const configured = await isConfigured();
    const session = await getSession(request);
    if (!session) return Response.json({ configured, authenticated: false }, { headers: noStoreHeaders() });
    const [csrfToken, keys] = await Promise.all([
      getCsrfToken(request),
      session.account.mustChangePassword ? Promise.resolve([]) : getVisibleKeys(session.account),
    ]);
    return Response.json({
      configured,
      authenticated: true,
      csrfToken,
      account: session.account,
      keys,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
