import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, randomToken, sha256, verifyPassword } from "../lib/server/crypto";

test("password hashes are salted PBKDF2 records and verify correctly", async () => {
  const first = await hashPassword("A-very-strong-password-2026", "pepper");
  const second = await hashPassword("A-very-strong-password-2026", "pepper");
  assert.match(first, /^pbkdf2-sha256\$600000\$/);
  assert.notEqual(first, second, "the per-password salt must make hashes unique");
  assert.equal(await verifyPassword("A-very-strong-password-2026", first, "pepper"), true);
  assert.equal(await verifyPassword("wrong-password", first, "pepper"), false);
  assert.equal(await verifyPassword("A-very-strong-password-2026", first, "wrong-pepper"), false);
});

test("session material has sufficient entropy and hashes deterministically", async () => {
  const token = randomToken();
  assert.ok(token.length >= 43);
  assert.doesNotMatch(token, /[+/=]/);
  assert.equal(await sha256(token), await sha256(token));
});
