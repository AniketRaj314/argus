import assert from "node:assert/strict";
import test from "node:test";
import { buildProvisioningPlan, bulkProvisioningRosterSchema } from "../lib/bulk-provisioning";

const keys = [
  { id: "internal-alice", keyId: "key_alice", label: "Alice Sharma" },
  { id: "internal-bob", keyId: "key_bob", label: "Bob Singh" },
];

test("bulk provisioning exactly matches key labels and prepares limits", () => {
  const plan = buildProvisioningPlan([
    { email: " ALICE@EXAMPLE.COM ", key: "alice sharma", creditLimitUsd: 125.5 },
    { email: "bob@example.com", key: "key_bob", displayName: "Bob S." },
  ], keys, []);

  assert.equal(plan.ready, true);
  assert.equal(plan.issueCount, 0);
  assert.deepEqual(plan.rows.map((row) => ({
    email: row.email,
    displayName: row.displayName,
    keyId: row.keyId,
    creditLimitCents: row.creditLimitCents,
  })), [
    { email: "alice@example.com", displayName: "Alice Sharma", keyId: "internal-alice", creditLimitCents: 12_550 },
    { email: "bob@example.com", displayName: "Bob S.", keyId: "internal-bob", creditLimitCents: null },
  ]);
});

test("bulk provisioning refuses ambiguous labels while exact key IDs still resolve", () => {
  const duplicateLabels = [...keys, { id: "internal-other", keyId: "key_other", label: "Alice Sharma" }];
  const ambiguous = buildProvisioningPlan([
    { email: "alice@example.com", key: "Alice Sharma" },
  ], duplicateLabels, []);
  assert.equal(ambiguous.ready, false);
  assert.deepEqual(ambiguous.rows[0]?.issues.map((issue) => issue.code), ["KEY_AMBIGUOUS"]);

  const exact = buildProvisioningPlan([
    { email: "alice@example.com", key: "key_alice" },
  ], duplicateLabels, []);
  assert.equal(exact.ready, true);
  assert.equal(exact.rows[0]?.keyId, "internal-alice");
});

test("bulk provisioning reports account, roster, key, and assignment conflicts", () => {
  const plan = buildProvisioningPlan([
    { email: "existing@example.com", key: "Alice Sharma" },
    { email: "existing@example.com", key: "Alice Sharma" },
    { email: "new@example.com", key: "Missing Person" },
  ], keys, ["existing@example.com"]);

  assert.equal(plan.ready, false);
  const codes = plan.rows.flatMap((row) => row.issues.map((issue) => issue.code));
  assert.ok(codes.includes("ACCOUNT_EXISTS"));
  assert.ok(codes.includes("DUPLICATE_EMAIL"));
  assert.ok(codes.includes("DUPLICATE_KEY"));
  assert.ok(codes.includes("KEY_NOT_FOUND"));
});

test("bulk roster validation limits size and decimal precision", () => {
  assert.equal(bulkProvisioningRosterSchema.safeParse([
    { email: "person@example.com", key: "Person", creditLimitUsd: 10.001 },
  ]).success, false);
  assert.equal(bulkProvisioningRosterSchema.safeParse(Array.from({ length: 101 }, (_, index) => ({
    email: `person${index}@example.com`, key: `Person ${index}`,
  }))).success, false);
});
