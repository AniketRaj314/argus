ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "credit_limit_cents" integer;--> statement-breakpoint
UPDATE "accounts" SET "credit_limit_cents" = "monthly_budget_cents"
  WHERE "credit_limit_cents" IS NULL AND "monthly_budget_cents" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_credit_limit_check') THEN
    ALTER TABLE "accounts" ADD CONSTRAINT "accounts_credit_limit_check"
      CHECK ("accounts"."credit_limit_cents" IS NULL OR "accounts"."credit_limit_cents" >= 100);
  END IF;
END $$;
