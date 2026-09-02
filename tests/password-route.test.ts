import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("self-service password changes preserve the server-side security boundary", async () => {
  const route = await readFile(new URL("../app/api/auth/password/route.ts", import.meta.url), "utf8");
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /assertCsrf\(request, session\)/);
  assert.match(route, /verifyPassword\(parsed\.data\.currentPassword/);
  assert.match(route, /hashPassword\(parsed\.data\.newPassword/);
  assert.match(route, /must_change_password = 0/);
  assert.match(route, /DELETE FROM sessions WHERE account_id/);
  assert.doesNotMatch(route, /process\.env|NEXT_PUBLIC_|VITE_/);
});

test("temporary-password accounts are restricted until they replace the password", async () => {
  const auth = await readFile(new URL("../lib/server/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /session\.account\.mustChangePassword/);
  assert.match(auth, /pathname !== "\/api\/auth\/password"/);
  assert.match(auth, /pathname !== "\/api\/auth\/logout"/);
  assert.match(auth, /PASSWORD_CHANGE_REQUIRED/);

  const accounts = await readFile(new URL("../app/api/admin/accounts/route.ts", import.meta.url), "utf8");
  assert.match(accounts, /must_change_password, credit_limit_cents/);
  assert.match(accounts, /must_change_password = 1/);
});
