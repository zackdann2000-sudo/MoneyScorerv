-- ⚠️ SUPERADO (D5, 2026-11-21): esta tabela agora também é criada por
-- drizzle/0012_sync_journal.sql, que está NO journal. Este arquivo fica
-- como registro histórico do SQL original; não é executado pelo drizzle.
-- ============================================================
-- Tabela de cache da API GameRead (módulo isolado /gameread)
--
-- Cole este arquivo inteiro no SQL Editor do Neon e execute.
-- É idempotente (IF NOT EXISTS): pode rodar mais de uma vez sem erro.
--
-- Por que existe: a API do gameread.app é pública, de terceiros e sem SLA.
-- O props-radar devolve ~300 KB por requisição. Sem cache, tráfego real vira
-- bloqueio de IP. O TTL de 15 min é aplicado na rota, não aqui — esta tabela
-- apenas guarda o último payload conhecido de cada endpoint.
-- ============================================================

CREATE TABLE IF NOT EXISTS "gameread_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"endpoint" text DEFAULT '' NOT NULL,
	"date_key" text,
	"payload" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gameread_cache_updated_idx" ON "gameread_cache" USING btree ("updated_at");
