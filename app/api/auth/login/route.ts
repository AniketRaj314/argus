import { ensureSchema, getDb, type AccountRow } from "../../../../db";
import { assertLoginAllowed, audit, createSession, recordLoginFailure, recordLoginSuccess } from "../../../../lib/server/auth";
import { passwordPeppers, verifyLoginPassword } from "../../../../lib/server/passwords";
import { ApiError, assertJsonRequest, assertSameOrigin, jsonError, noStoreHeaders, normalizeEmail, sessionCookie } from "../../../../lib/server/security";
import { loginSchema } from "../../../../lib/server/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonRequest(request);
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "Enter a valid email and password.", "VALIDATION_ERROR");
    await ensureSchema();
    const email = normalizeEmail(parsed.data.email);
    const limiter = await assertLoginAllowed(email, request);
    const account = await getDb().prepare("SELECT * FROM accounts WHERE email = ? AND deleted_at IS NULL").bind(email).first<AccountRow>();
    const result = account && account.status === "active"
      ? await verifyLoginPassword(parsed.data.password, account.id, account.password_hash) : null;
    if (!account || !result?.valid) {
      await recordLoginFailure(limiter.key, limiter.row, limiter.now);
      await audit(request, "auth.login_failed", "account", account?.id ?? null, account?.id ?? null, { email });
      throw new ApiError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    }
    if (result.migrated) {
      await audit(request, "auth.pepper_migrated", "account", account.id, account.id, {
        fromVersion: result.fromVersion, toVersion: passwordPeppers().current.version,
      });
    }
    await recordLoginSuccess(limiter.key);
    const session = await createSession(account.id, request);
    const now = Math.floor(Date.now() / 1000);
    await getDb().prepare("UPDATE accounts SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, account.id).run();
    await audit(request, "auth.login_succeeded", "account", account.id, account.id);
    return Response.json({ ok: true }, {
      headers: noStoreHeaders({ "Set-Cookie": sessionCookie(session.token, request, session.expiresIn) }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
