import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("self-service password changes preserve the server-side security boundary", async () => {
  const route = await readFile(new URL("../app/api/auth/password/route.ts", import.meta.url), "utf8");
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /assertCsrf\(request, session\)/);
  assert.match(route, /verifyPassword\(parsed\.data\.currentPassword/);
  assert.match(route, /hashPassword\(parsed\.data\.newPassword/);
  assert.match(route, /DELETE FROM sessions WHERE account_id/);
  assert.doesNotMatch(route, /process\.env|NEXT_PUBLIC_|VITE_/);
});
