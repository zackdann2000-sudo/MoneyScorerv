-- Quota diária por plano (Free 1 / Starter 6 / Pro 20 / Expert 999).
-- Aditivo e idempotente: nenhuma linha existente muda de comportamento além
-- de ganhar o direito de ver 1 análise por dia.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "daily_quota" integer DEFAULT 1 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quota_used" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quota_day" text DEFAULT '' NOT NULL;

-- Novos planos passam a ser válidos no check.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_plan_chk";
ALTER TABLE "users" ADD CONSTRAINT "users_plan_chk"
  CHECK ("plan" in ('free', 'trial', 'vip', 'starter', 'pro', 'expert'));

-- Backfill: quem já é VIP não perde acesso (quota ilimitada),
-- o trial de 24h mantém o comportamento antigo.
UPDATE "users" SET "daily_quota" = 999 WHERE "plan" = 'vip';
CREATE INDEX IF NOT EXISTS "users_quota_day_idx" ON "users" ("quota_day");
