CREATE TABLE "account_api_keys" (
	"account_id" text NOT NULL,
	"api_key_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_at" integer NOT NULL,
	CONSTRAINT "account_api_keys_account_id_api_key_id_pk" PRIMARY KEY("account_id","api_key_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"last_login_at" integer,
	"password_changed_at" integer NOT NULL,
	CONSTRAINT "accounts_role_check" CHECK ("accounts"."role" IN ('root', 'user')),
	CONSTRAINT "accounts_status_check" CHECK ("accounts"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"label" text NOT NULL,
	"project_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "api_keys_status_check" CHECK ("api_keys"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_account_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata_json" text DEFAULT '{}' NOT NULL,
	"ip_hash" text,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"window_started_at" integer NOT NULL,
	"blocked_until" integer
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"expires_at" integer NOT NULL,
	"created_at" integer NOT NULL,
	"last_seen_at" integer NOT NULL,
	"ip_hash" text,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "account_api_keys" ADD CONSTRAINT "account_api_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_api_keys" ADD CONSTRAINT "account_api_keys_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_api_keys" ADD CONSTRAINT "account_api_keys_assigned_by_accounts_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assignments_api_key_id" ON "account_api_keys" USING btree ("api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_accounts_email" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_single_root" ON "accounts" USING btree ("role") WHERE "accounts"."role" = 'root';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_api_keys_key_id" ON "api_keys" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created_at" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_events" USING btree ("actor_account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_account_id" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires_at" ON "sessions" USING btree ("expires_at");