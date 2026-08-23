import { assertCsrf, audit, deleteSession, requireSession } from "../../../../lib/server/auth";
import { assertSameOrigin, jsonError, noStoreHeaders, sessionCookie } from "../../../../lib/server/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    await assertCsrf(request, session);
    await audit(request, "auth.logout", "account", session.account.id, session.account.id);
    await deleteSession(request);
    return Response.json({ ok: true }, {
      headers: noStoreHeaders({ "Set-Cookie": sessionCookie("", request, 0) }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
