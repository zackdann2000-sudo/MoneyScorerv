-- M4 — as três correções ADITIVAS do plano de schema (D3, D4, D1).
--
-- Nada aqui remove coluna, troca tipo ou reescreve PK: o app antigo continua
-- funcionando se a migration rodar antes do deploy (e vice-versa). O SQL base é
-- o que `drizzle-kit generate --name m4_aditivo` emitiu; três ajustes foram
-- feitos à mão, todos do mesmo tipo — deixar a migration re-executável e não
-- travar por causa de dado antigo (o padrão de 0012/0013):
--
--   1. `IF NOT EXISTS` em coluna e índice: re-rodar não explode.
--   2. `NOT VALID` nos CHECK: cria a constraint sem varrer a tabela e sem
--      falhar por causa de lixo acumulado antes da regra existir. O `validate`
--      é passo separado e consciente (ver nota no fim do arquivo).
--   3. Triggers de `updated_at`: drizzle não modela trigger, então vêm à mão.

-- ── D1 + D4: colunas novas ───────────────────────────────────────────────────
-- public_id (D1): id não enumerável para expor em URL/API, sem tocar na PK.
-- updated_at (D4): relógio de "quando este dado de usuário mudou".

ALTER TABLE "alert_prefs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "apitou_pinned_desajustes" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD COLUMN IF NOT EXISTS "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN IF NOT EXISTS "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "fcm_tokens" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pick_ledger" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "value_bet_history" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- ── D1: unicidade do id público ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "deletion_requests_public_id_idx" ON "deletion_requests" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "favorites_public_id_idx" ON "favorites" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_public_id_idx" ON "tickets" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_public_id_idx" ON "users" USING btree ("public_id");--> statement-breakpoint

-- ── D3: normalização antes da regra ──────────────────────────────────────────
-- `conta/route.ts` gravava "concluida" (feminino) enquanto o resto do código
-- pensa em "concluido". O código foi corrigido no mesmo commit; esta linha
-- conserta o que já estiver no banco (hoje: 0 linhas, custo zero).

UPDATE "deletion_requests" SET "status" = 'concluido' WHERE "status" = 'concluida';--> statement-breakpoint

-- ── D3: CHECK NOT VALID nos campos de status ─────────────────────────────────
-- Os valores não são os do plano original: foram lidos do código que escreve.
-- `pick_ledger` recebe `ao_vivo` e `anulada` (credibility.ts), então a lista
-- ('pendente','green','red','void') do plano teria quebrado o cron com 500.
-- `value_bet_history` só conhece pendente|green|red (resultadoDoMercado()).
-- `tickets.status` não existe (o plano supôs que existisse); no lugar dele o
-- 5º check é `users.role`, que essa sim tem valores fechados (user|admin|owner).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_plan_chk' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_plan_chk" CHECK ("plan" IN ('free', 'trial', 'vip')) NOT VALID;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_chk' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_role_chk" CHECK ("role" IN ('user', 'admin', 'owner')) NOT VALID;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_status_chk' AND conrelid = 'pick_ledger'::regclass) THEN
    ALTER TABLE "pick_ledger" ADD CONSTRAINT "ledger_status_chk" CHECK ("status" IN ('pendente', 'ao_vivo', 'green', 'red', 'anulada')) NOT VALID;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vbh_status_chk' AND conrelid = 'value_bet_history'::regclass) THEN
    ALTER TABLE "value_bet_history" ADD CONSTRAINT "vbh_status_chk" CHECK ("status" IN ('pendente', 'green', 'red')) NOT VALID;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dr_status_chk' AND conrelid = 'deletion_requests'::regclass) THEN
    ALTER TABLE "deletion_requests" ADD CONSTRAINT "dr_status_chk" CHECK ("status" IN ('pendente', 'concluido', 'recusado')) NOT VALID;
  END IF;
END $$;--> statement-breakpoint

-- ── D4: um trigger só, para as 10 tabelas com `updated_at` ───────────────────
-- O plano pedia um trigger por tabela escritos à mão; a função é uma, e os
-- triggers são criados em laço para não haver 10 blocos quase idênticos.
-- Sem isso a coluna `updated_at` só teria o valor do INSERT e mentiria.

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;--> statement-breakpoint

DO $$
DECLARE
  alvo text;
  alvos text[] := ARRAY[
    'users', 'favorites', 'alert_prefs', 'tickets', 'pick_ledger',
    'value_bet_history', 'deletion_requests', 'gameread_pinned_props',
    'apitou_pinned_desajustes', 'fcm_tokens'
  ];
BEGIN
  FOREACH alvo IN ARRAY alvos LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 't_' || alvo || '_touch', alvo);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      't_' || alvo || '_touch', alvo
    );
  END LOOP;
END $$;
