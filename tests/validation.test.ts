import assert from "node:assert/strict";
import test from "node:test";
import { createAccountSchema } from "../lib/server/validation";

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
});
