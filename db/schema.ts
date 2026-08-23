import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["root", "user"] }).notNull(),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastLoginAt: integer("last_login_at"),
    passwordChangedAt: integer("password_changed_at").notNull(),
    monthlyBudgetCents: integer("monthly_budget_cents"),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    uniqueIndex("idx_accounts_email").on(table.email),
    uniqueIndex("idx_single_root").on(table.role).where(sql`${table.role} = 'root'`),
    check("accounts_role_check", sql`${table.role} IN ('root', 'user')`),
    check("accounts_status_check", sql`${table.status} IN ('active', 'disabled')`),
    check("accounts_monthly_budget_check", sql`${table.monthlyBudgetCents} IS NULL OR ${table.monthlyBudgetCents} >= 100`),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    keyId: text("key_id").notNull(),
    label: text("label").notNull(),
    projectId: text("project_id"),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    createdBy: text("created_by").notNull().references(() => accounts.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_api_keys_key_id").on(table.keyId),
    check("api_keys_status_check", sql`${table.status} IN ('active', 'archived')`),
  ],
);

export const accountApiKeys = pgTable(
  "account_api_keys",
  {
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by").notNull().references(() => accounts.id),
    assignedAt: integer("assigned_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.apiKeyId] }),
    index("idx_assignments_api_key_id").on(table.apiKeyId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    csrfHash: text("csrf_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("idx_sessions_account_id").on(table.accountId),
    index("idx_sessions_expires_at").on(table.expiresAt),
  ],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
  blockedUntil: integer("blocked_until"),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorAccountId: text("actor_account_id").references(() => accounts.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_audit_created_at").on(table.createdAt),
    index("idx_audit_actor").on(table.actorAccountId, table.createdAt),
  ],
);
