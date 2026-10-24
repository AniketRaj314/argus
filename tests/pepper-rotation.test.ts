import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashPassword, sha256, verifyPassword } from "../lib/server/crypto";
import { hashPasswordRecord, passwordRecordVersion, readPepperConfig, verifyAndUpgradePassword, verifyPasswordRecord, type PepperConfig } from "../lib/server/password-record";
import { csrfTokenForPepper, selectCsrfToken } from "../lib/server/session-tokens";

const password = "Existing-password-2026";
const old = { version: "legacy", secret: "old-test-pepper" };
const current = { version: "2026-10", secret: "new-test-pepper" };
const config: PepperConfig = { current, previous: old };

test("legacy passwords migrate on successful login and then need only the current pepper", async () => {
  let stored = await hashPassword(password, old.secret);
  const initial = stored;
  const result = await verifyAndUpgradePassword(password, stored, config, {
    readActiveHash: async () => stored,
    compareAndSwap: async (expected, replacement) => {
      assert.equal(expected, initial); stored = replacement; return true;
    },
  });
  assert.deepEqual(result, { valid: true, migrated: true, fromVersion: "legacy" });
  assert.equal(passwordRecordVersion(stored), current.version);
  assert.equal((await verifyPasswordRecord(password, stored, { current })).valid, true);
  assert.equal((await verifyPasswordRecord(password, initial, { current })).valid, false);
  assert.equal((await verifyPasswordRecord(password, stored, { current: old })).valid, false);
  assert.equal((await verifyPasswordRecord("wrong-password", stored, config)).valid, false);
});

test("wrong passwords never write; current hashes do not rehash again", async () => {
  const legacy = await hashPassword(password, old.secret);
  const hash = await hashPasswordRecord(password, config);
  const store = { readActiveHash: async () => { throw new Error("unexpected read"); }, compareAndSwap: async () => { throw new Error("unexpected write"); } };
  assert.equal((await verifyAndUpgradePassword("wrong", legacy, config, store)).valid, false);
  assert.deepEqual(await verifyAndUpgradePassword(password, hash, config, store), {
    valid: true, migrated: false, fromVersion: current.version,
  });
});

test("a concurrent password reset or account disable cannot be overwritten", async () => {
  const hash = await hashPassword(password, old.secret);
  const reset = await hashPasswordRecord("Changed-password-2026", config);
  for (const latest of [reset, null]) {
    let writes = 0;
    const result = await verifyAndUpgradePassword(password, hash, config, {
      readActiveHash: async () => latest,
      compareAndSwap: async () => { writes++; return false; },
    });
    assert.equal(result.valid, false);
    assert.equal(writes, 1);
  }
});

test("simultaneous migrations let both valid logins succeed without duplicate updates", async () => {
  const hash = await hashPassword(password, old.secret);
  let stored = hash;
  let writes = 0;
  const store = {
    readActiveHash: async () => stored,
    compareAndSwap: async (expected: string, replacement: string) => {
      if (stored !== expected) return false;
      stored = replacement; writes++; return true;
    },
  };
  const results = await Promise.all([1, 2].map(() => verifyAndUpgradePassword(password, hash, config, store)));
  assert.ok(results.every((result) => result.valid));
  assert.equal(writes, 1);
});

test("configuration rejects incomplete, duplicate, and invalid versions without exposing secrets", () => {
  assert.deepEqual(readPepperConfig({ ARGUS_PASSWORD_PEPPER: old.secret }), { current: old });
  for (const env of [
    {},
    { ARGUS_PASSWORD_PEPPER: old.secret, ARGUS_PASSWORD_PEPPER_PREVIOUS: current.secret },
    { ARGUS_PASSWORD_PEPPER: old.secret, ARGUS_PASSWORD_PEPPER_PREVIOUS_VERSION: "other" },
    { ARGUS_PASSWORD_PEPPER: old.secret, ARGUS_PASSWORD_PEPPER_VERSION: "bad$version" },
    { ARGUS_PASSWORD_PEPPER: old.secret, ARGUS_PASSWORD_PEPPER_PREVIOUS: current.secret, ARGUS_PASSWORD_PEPPER_PREVIOUS_VERSION: "legacy" },
  ]) assert.throws(() => readPepperConfig(env), (error: Error) => !error.message.includes(old.secret) && !error.message.includes(current.secret));
});

test("unknown versions and malformed hash records fail closed", async () => {
  const hash = await hashPasswordRecord(password, config);
  for (const bad of [hash.replace("2026-10", "unknown"), hash + "$extra", "peppered$2026-10$garbage", "pbkdf2-sha256$600000$!invalid!$invalid"]) {
    assert.equal((await verifyPasswordRecord(password, bad, config)).valid, false);
  }
});

test("compatibility rollout writes legacy hashes and reads the staged new version", async () => {
  const staged = { current: old, previous: current, migrateOnLogin: false };
  const hash = await hashPasswordRecord(password, staged);
  assert.equal(await verifyPassword(password, hash, old.secret), true);
  const result = await verifyPasswordRecord(password, await hashPasswordRecord(password, config), staged);
  assert.equal(result.valid, true);
  assert.equal(result.needsUpgrade, false, "staged readers must not downgrade new hashes");
});

test("existing CSRF tokens survive the pepper switch and new sessions use the new pepper", async () => {
  const token = await csrfTokenForPepper("existing-session", old.secret);
  const selected = await selectCsrfToken("existing-session", await sha256(token), [current.secret, old.secret]);
  assert.deepEqual(selected, { token, changed: false });
  const next = await selectCsrfToken("existing-session", await sha256(token), [current.secret]);
  assert.equal(next.changed, true);
  assert.notEqual(next.token, token);
  assert.equal(next.token, await csrfTokenForPepper("existing-session", current.secret));
});

test("every password writer uses the versioned boundary and migration preserves account policy", async () => {
  for (const file of ["app/api/setup/route.ts", "app/api/admin/accounts/route.ts", "app/api/auth/password/route.ts", "lib/server/bulk-provisioning.ts"]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /hashAccountPassword\(/);
    assert.doesNotMatch(source, /\bhashPassword\(/);
  }
  const passwords = await readFile(new URL("../lib/server/passwords.ts", import.meta.url), "utf8");
  assert.match(passwords, /AND password_hash = \? AND status = 'active' AND deleted_at IS NULL/);
  assert.doesNotMatch(passwords, /SET.*(?:must_change_password|password_changed_at|credit_limit|role|status)/);
  const auth = await readFile(new URL("../lib/server/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /sessionPeppers\(\)\.map/);
  assert.match(auth, /row\?\.blocked_until && row.blocked_until > now/);
});
