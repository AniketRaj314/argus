import { z } from "zod";

export const bulkProvisioningEntrySchema = z.object({
  email: z.string().email().max(254),
  key: z.string().trim().min(2).max(220),
  displayName: z.string().trim().min(2).max(80).optional(),
  creditLimitUsd: z.number()
    .min(1)
    .max(1_000_000)
    .refine((value) => Number.isInteger(value * 100), "Credit limits may have at most two decimal places.")
    .nullable()
    .optional(),
});

export const bulkProvisioningRosterSchema = z.array(bulkProvisioningEntrySchema).min(1).max(100);

export type BulkProvisioningEntry = z.infer<typeof bulkProvisioningEntrySchema>;
export type ProvisioningKey = { id: string; keyId: string; label: string };
export type ProvisioningIssueCode =
  | "ACCOUNT_EXISTS"
  | "DUPLICATE_EMAIL"
  | "KEY_NOT_FOUND"
  | "KEY_AMBIGUOUS"
  | "DUPLICATE_KEY";

export type ProvisioningPlanRow = {
  row: number;
  email: string;
  displayName: string;
  keyQuery: string;
  keyId: string | null;
  keyLabel: string | null;
  creditLimitCents: number | null;
  issues: Array<{ code: ProvisioningIssueCode; message: string }>;
};

export type ProvisioningPlan = {
  ready: boolean;
  rows: ProvisioningPlanRow[];
  createCount: number;
  issueCount: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeLabel(label: string) {
  return label.trim().toLocaleLowerCase("en-US");
}

function creditLimitCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.round(value * 100);
}

export function buildProvisioningPlan(
  roster: BulkProvisioningEntry[],
  keys: ProvisioningKey[],
  existingAccountEmails: Iterable<string>,
): ProvisioningPlan {
  const existing = new Set([...existingAccountEmails].map(normalizeEmail));
  const emailCounts = new Map<string, number>();
  const exactKeyIds = new Map(keys.map((key) => [key.keyId, key]));
  const keysByLabel = new Map<string, ProvisioningKey[]>();

  for (const key of keys) {
    const normalized = normalizeLabel(key.label);
    keysByLabel.set(normalized, [...(keysByLabel.get(normalized) ?? []), key]);
  }
  for (const entry of roster) {
    const email = normalizeEmail(entry.email);
    emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }

  const rows = roster.map<ProvisioningPlanRow>((entry, index) => {
    const email = normalizeEmail(entry.email);
    const keyMatches = exactKeyIds.has(entry.key)
      ? [exactKeyIds.get(entry.key)!]
      : keysByLabel.get(normalizeLabel(entry.key)) ?? [];
    const matchedKey = keyMatches.length === 1 ? keyMatches[0] : null;
    const issues: ProvisioningPlanRow["issues"] = [];

    if (existing.has(email)) issues.push({ code: "ACCOUNT_EXISTS", message: "An active ARGUS account already uses this email." });
    if ((emailCounts.get(email) ?? 0) > 1) issues.push({ code: "DUPLICATE_EMAIL", message: "This email appears more than once in the roster." });
    if (keyMatches.length === 0) issues.push({ code: "KEY_NOT_FOUND", message: "No active tracked key exactly matches this label or Key ID." });
    if (keyMatches.length > 1) issues.push({ code: "KEY_AMBIGUOUS", message: "More than one active tracked key has this label. Use the exact Key ID." });

    return {
      row: index + 1,
      email,
      displayName: entry.displayName?.trim() || matchedKey?.label || entry.key.trim(),
      keyQuery: entry.key.trim(),
      keyId: matchedKey?.id ?? null,
      keyLabel: matchedKey?.label ?? null,
      creditLimitCents: creditLimitCents(entry.creditLimitUsd),
      issues,
    };
  });

  const keyCounts = new Map<string, number>();
  for (const row of rows) if (row.keyId) keyCounts.set(row.keyId, (keyCounts.get(row.keyId) ?? 0) + 1);
  for (const row of rows) {
    if (row.keyId && (keyCounts.get(row.keyId) ?? 0) > 1) {
      row.issues.push({ code: "DUPLICATE_KEY", message: "This key is assigned to more than one new account in the roster." });
    }
  }

  const issueCount = rows.reduce((total, row) => total + row.issues.length, 0);
  return { ready: issueCount === 0, rows, createCount: rows.length, issueCount };
}
