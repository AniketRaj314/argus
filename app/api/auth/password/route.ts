import { getDb } from "../../../../db";
import {
  assertCsrf, assertLoginAllowed, audit, passwordPepper, recordLoginFailure,
  recordLoginSuccess, requireSession,
} from "../../../../lib/server/auth";
import { hashPassword, verifyPassword } from "../../../../lib/server/crypto";
import { ApiError, assertJsonRequest, assertSameOrigin, jsonError, noStoreHeaders, sessionCookie } from "../../../../lib/server/security";
import { changePasswordSchema } from "../../../../lib/server/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertJsonRequest(request);
    const session = await requireSession(request); await assertCsrf(request, session);
    const parsed = changePasswordSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid password details.", "VALIDATION_ERROR");

    const limiter = await assertLoginAllowed(session.account.email, request);
    const account = await getDb().prepare("SELECT password_hash FROM accounts WHERE id = ? AND status = 'active' AND deleted_at IS NULL")
      .bind(session.account.id).first<{ password_hash: string }>();
    const currentIsValid = account
      ? await verifyPassword(parsed.data.currentPassword, account.password_hash, passwordPepper())
      : false;
    if (!account || !currentIsValid) {
      await recordLoginFailure(limiter.key, limiter.row, limiter.now);
      await audit(request, "account.password_change_failed", "account", session.account.id, session.account.id);
      throw new ApiError(400, "Current password is incorrect.", "INVALID_CURRENT_PASSWORD");
    }
    if (await verifyPassword(parsed.data.newPassword, account.password_hash, passwordPepper())) {
      throw new ApiError(400, "Choose a new password that differs from the current password.", "PASSWORD_UNCHANGED");
    }

    await recordLoginSuccess(limiter.key);
    const now = Math.floor(Date.now() / 1000);
    const nextHash = await hashPassword(parsed.data.newPassword, passwordPepper());
    await getDb().batch([
      getDb().prepare("UPDATE accounts SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?")
        .bind(nextHash, now, now, session.account.id),
      getDb().prepare("DELETE FROM sessions WHERE account_id = ?").bind(session.account.id),
    ]);
    await audit(request, "account.password_changed", "account", session.account.id, session.account.id);
    return Response.json({ ok: true }, {
      headers: noStoreHeaders({ "Set-Cookie": sessionCookie("", request, 0) }),
    });
  } catch (error) { return jsonError(error); }
}
