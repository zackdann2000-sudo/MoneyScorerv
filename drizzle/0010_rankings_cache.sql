-- ⚠️ SUPERADO (D5, 2026-11-21): esta tabela agora também é criada por
-- drizzle/0012_sync_journal.sql, que está NO journal. Este arquivo fica
-- como registro histórico do SQL original; não é executado pelo drizzle.
CREATE TABLE IF NOT EXISTS "rankings_cache" (
	"liga" text PRIMARY KEY NOT NULL,
	"times" integer DEFAULT 0 NOT NULL,
	"jogos" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
