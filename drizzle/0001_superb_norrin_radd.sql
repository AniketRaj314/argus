ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "monthly_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "deleted_at" integer;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_monthly_budget_check') THEN
    ALTER TABLE "accounts" ADD CONSTRAINT "accounts_monthly_budget_check"
      CHECK ("accounts"."monthly_budget_cents" IS NULL OR "accounts"."monthly_budget_cents" >= 100);
  END IF;
END $$;
