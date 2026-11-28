-- 0025_quota_analises.sql
--
-- Quitação da cota diária: qual partida gastou a análise do dia.
--
-- POR QUE EXISTE: a cota de 1 análise/dia passa a ser cobrada no SERVIDOR, na
-- rota `/api/matches/[id]/analysis`. Sem esta tabela o débito seria por
-- requisição (reabrir a mesma análise debitaria de novo) ou dependeria do
-- `localStorage` do cliente (o furo original: limpar o storage liberava tudo).
--
-- O índice único é a garantia atômica: INSERT ... ON CONFLICT DO NOTHING só
-- deixa UMA linha por (usuário, partida, dia), então duas abas simultâneas não
-- cobram duas vezes a mesma partida.
--
-- `dia` = YYYY-MM-DD no fuso de Brasília (mesmo de `users.quota_day`). Não há
-- cron de reset: linha de ontem simplesmente não conta para hoje.
--
-- Aplicar com: npm run db:migrate-quota-analises  (idempotente)

CREATE TABLE IF NOT EXISTS "analyses_opened" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "match_id" text NOT NULL,
  "dia" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analyses_opened_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "analyses_opened"
      ADD CONSTRAINT "analyses_opened_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analyses_opened_uq" ON "analyses_opened" ("user_id","match_id","dia");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analyses_opened_dia_idx" ON "analyses_opened" ("dia");
