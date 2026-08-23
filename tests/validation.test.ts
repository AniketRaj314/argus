import assert from "node:assert/strict";
import test from "node:test";
import { changePasswordSchema, createAccountSchema, updateAccountSchema } from "../lib/server/validation";

test("account creation accepts an initial set of key assignments", () => {
  const parsed = createAccountSchema.parse({
    displayName: "Test Member",
    email: "member@example.com",
    password: "StrongPassword123",
    role: "user",
    apiKeyIds: ["key_internal_1", "key_internal_2"],
  });
  assert.deepEqual(parsed.apiKeyIds, ["key_internal_1", "key_internal_2"]);
});

test("account creation defaults to no initial key assignments", () => {
  const parsed = createAccountSchema.parse({
    displayName: "Test Member",
    email: "member@example.com",
    password: "StrongPassword123",
  });
  assert.deepEqual(parsed.apiKeyIds, []);
  assert.equal(parsed.creditLimitCents, null);
});

test("account creation accepts a total credit allocation in integer cents", () => {
  const parsed = createAccountSchema.parse({
    displayName: "Budget Member", email: "budget@example.com", password: "StrongPassword123",
    creditLimitCents: 12_500,
  });
  assert.equal(parsed.creditLimitCents, 12_500);
  assert.throws(() => createAccountSchema.parse({
    displayName: "Budget Member", email: "budget@example.com", password: "StrongPassword123",
    creditLimitCents: 99,
  }));
});

test("account updates can change or remove a total credit allocation", () => {
  assert.equal(updateAccountSchema.parse({ creditLimitCents: 5_000 }).creditLimitCents, 5_000);
  assert.equal(updateAccountSchema.parse({ creditLimitCents: null }).creditLimitCents, null);
});

test("password changes require a strong matching replacement", () => {
  const parsed = changePasswordSchema.parse({
    currentPassword: "CurrentPassword123", newPassword: "ReplacementPassword456", confirmPassword: "ReplacementPassword456",
  });
  assert.equal(parsed.newPassword, "ReplacementPassword456");
  assert.throws(() => changePasswordSchema.parse({
    currentPassword: "CurrentPassword123", newPassword: "ReplacementPassword456", confirmPassword: "DifferentPassword789",
  }), /confirmation does not match/i);
});
