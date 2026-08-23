import { ensureSchema, getDb, getRuntimeEnv } from "../../../db";
import { audit, createSession, isConfigured, passwordPepper } from "../../../lib/server/auth";
import { constantTimeEqual, hashPassword, randomId, sha256 } from "../../../lib/server/crypto";
import { ApiError, assertJsonRequest, assertSameOrigin, jsonError, noStoreHeaders, normalizeEmail, sessionCookie } from "../../../lib/server/security";
import { setupSchema } from "../../../lib/server/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonRequest(request);
    if (await isConfigured()) throw new ApiError(409, "ARGUS is already configured.", "ALREADY_CONFIGURED");
    const parsed = setupSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid setup details.", "VALIDATION_ERROR");
    const expected = getRuntimeEnv().ARGUS_SETUP_TOKEN;
    if (!expected) throw new ApiError(503, "Set ARGUS_SETUP_TOKEN on the server before first-time setup.", "SETUP_TOKEN_MISSING");
    const [actualHash, expectedHash] = await Promise.all([sha256(parsed.data.setupToken), sha256(expected)]);
    if (!constantTimeEqual(actualHash, expectedHash)) throw new ApiError(403, "The setup token is invalid.", "INVALID_SETUP_TOKEN");
    await ensureSchema();
    const now = Math.floor(Date.now() / 1000);
    const accountId = randomId("acct");
    const created = await getDb().prepare(`INSERT INTO accounts
      (id, email, display_name, password_hash, role, status, created_at, updated_at, password_changed_at)
      SELECT ?, ?, ?, ?, 'root', 'active', ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE role = 'root')`)
      .bind(accountId, normalizeEmail(parsed.data.email), parsed.data.displayName, await hashPassword(parsed.data.password, passwordPepper()), now, now, now).run();
    if (created.meta.changes !== 1) throw new ApiError(409, "ARGUS was configured by another request.", "ALREADY_CONFIGURED");
    await audit(request, "root.created", "account", accountId, accountId, { email: normalizeEmail(parsed.data.email) });
    const session = await createSession(accountId, request);
    return Response.json({ ok: true }, {
      status: 201,
      headers: noStoreHeaders({ "Set-Cookie": sessionCookie(session.token, request, session.expiresIn) }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
