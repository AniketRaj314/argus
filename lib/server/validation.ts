import { z } from "zod";

const password = z.string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Password is too long.")
  .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value), {
    message: "Include uppercase, lowercase, and a number.",
  });

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const setupSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().trim().min(2).max(80),
  password,
  setupToken: z.string().min(1).max(256),
});

export const createAccountSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().trim().min(2).max(80),
  password,
  role: z.enum(["user", "root"]).default("user"),
  apiKeyIds: z.array(z.string().min(5).max(128)).max(250).default([]),
  creditLimitCents: z.number().int().min(100, "The total limit must be at least $1.00.").max(100_000_000, "The total limit cannot exceed $1,000,000.").nullable().default(null),
});

export const updateAccountSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  email: z.string().email().max(254).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  password: password.optional(),
  creditLimitCents: z.number().int().min(100, "The total limit must be at least $1.00.").max(100_000_000, "The total limit cannot exceed $1,000,000.").nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "No changes supplied.");

export const createKeySchema = z.object({
  keyId: z.string().trim().regex(/^key_[A-Za-z0-9_-]{4,200}$/, "Enter a valid OpenAI API Key ID beginning with key_."),
  label: z.string().trim().min(2).max(80),
  projectId: z.string().trim().max(200).optional().or(z.literal("")),
});

export const assignKeySchema = z.object({
  accountId: z.string().min(5).max(128),
  apiKeyId: z.string().min(5).max(128),
  assigned: z.boolean(),
});
