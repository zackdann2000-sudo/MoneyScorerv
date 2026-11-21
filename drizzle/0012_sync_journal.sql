-- D5 — fechar o buraco do journal (baseline).
--
-- Problema que este arquivo resolve: 3 tabelas nasceram fora do journal, coladas
-- no SQL Editor do Neon. O schema.ts e os snapshots já as conhecem (ver
-- meta/0011_snapshot.json), mas NENHUMA entrada do journal as criava. Efeito:
-- um banco novo montado por `drizzle-kit migrate` ficava 3 tabelas incompleto,
-- e a próxima `drizzle-kit generate` podia tentar recriá-las.
--
--   drizzle/0010_rankings_cache.sql      -> rankings_cache      (nunca entrou no journal)
--   drizzle/gameread_cache.sql           -> gameread_cache      (colado no editor)
--   drizzle/gameread_pinned_props.sql    -> gameread_pinned_props (colado no editor)
--
-- Escrito 100% idempotente por um motivo: no banco de produção as 3 tabelas JÁ
-- existem. Aplicar esta migration lá precisa ser no-op; aplicar num banco novo
-- precisa criar tudo. Os ADD COLUMN IF NOT EXISTS existem para bancos que
-- tenham cópias antigas dessas tabelas (criadas com menos colunas).
--
-- As colunas aqui são `timestamptz` (não `timestamp`), porque o D2 já passou e
-- o snapshot 0011 já está com fuso — um `timestamp` aqui faria a próxima
-- generate emitir ALTER de novo.

CREATE TABLE IF NOT EXISTS "rankings_cache" (
	"liga" text PRIMARY KEY NOT NULL,
	"times" integer DEFAULT 0 NOT NULL,
	"jogos" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gameread_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"endpoint" text DEFAULT '' NOT NULL,
	"date_key" text,
	"payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gameread_pinned_props" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"prop_key" text NOT NULL,
	"market" text DEFAULT '' NOT NULL,
	"market_label" text DEFAULT '' NOT NULL,
	"selection" text DEFAULT '' NOT NULL,
	"line" real,
	"odd" real,
	"bookmaker" text DEFAULT '' NOT NULL,
	"subject_name" text DEFAULT '' NOT NULL,
	"subject_photo" text DEFAULT '' NOT NULL,
	"home_name" text DEFAULT '' NOT NULL,
	"away_name" text DEFAULT '' NOT NULL,
	"league_name" text DEFAULT '' NOT NULL,
	"fixture_id" text DEFAULT '' NOT NULL,
	"kickoff_utc" text DEFAULT '' NOT NULL,
	"hit_rate_l10" real,
	"score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Convergência de cópias antigas: se a tabela existe mas nasceu sem alguma
-- coluna, ela é adicionada aqui em vez de o app quebrar em runtime.
ALTER TABLE "gameread_cache" ADD COLUMN IF NOT EXISTS "endpoint" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_cache" ADD COLUMN IF NOT EXISTS "date_key" text;--> statement-breakpoint
ALTER TABLE "gameread_cache" ADD COLUMN IF NOT EXISTS "payload" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_cache" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "market" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "market_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "selection" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "line" real;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "odd" real;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "bookmaker" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "subject_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "subject_photo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "home_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "away_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "league_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "fixture_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "kickoff_utc" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "hit_rate_l10" real;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "score" real;--> statement-breakpoint
ALTER TABLE "gameread_pinned_props" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "rankings_cache" ADD COLUMN IF NOT EXISTS "times" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rankings_cache" ADD COLUMN IF NOT EXISTS "jogos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rankings_cache" ADD COLUMN IF NOT EXISTS "payload" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rankings_cache" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- FK e índices só se ainda não existirem. O bloco DO consulta pg_constraint
-- casando nome E tabela E schema: `conname` sozinho é global no catálogo, então
-- checar só o nome pularia a criação num schema diferente do public.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
     WHERE c.conname = 'gameread_pinned_props_user_id_users_id_fk'
       AND r.relname = 'gameread_pinned_props'
       AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE "gameread_pinned_props"
      ADD CONSTRAINT "gameread_pinned_props_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gameread_cache_updated_idx" ON "gameread_cache" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gr_pin_user_prop" ON "gameread_pinned_props" USING btree ("user_id","prop_key");
