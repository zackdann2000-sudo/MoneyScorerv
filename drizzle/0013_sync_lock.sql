-- M3 — lock de trabalho entre processos (lease com expiração).
--
-- Gerada por `drizzle-kit generate` e depois tornada idempotente à mão, no
-- mesmo padrão do 0012 (o projeto aplica SQL fora do drizzle em alguns lugares,
-- e um `create table` seco falharia num banco que já tenha a tabela).
--
-- Por que uma TABELA e não `pg_try_advisory_lock` (que era o plano do M3):
-- o app roda no endpoint pooled do Neon (PgBouncer, modo transação) e ali dois
-- clientes Node distintos caem na MESMA sessão do Postgres — medido: mesmo
-- `pg_backend_pid`, e os dois recebem `true` do `pg_try_advisory_lock`. Advisory
-- lock é de sessão, logo é reentrante nesse cenário e não exclui nada. O lease
-- abaixo exclui de verdade e ainda tem expiração (processo que morre no meio do
-- download libera o lock sozinho).

CREATE TABLE IF NOT EXISTS "sync_lock" (
	"nome" text PRIMARY KEY NOT NULL,
	"dono" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_lock_expira_idx" ON "sync_lock" USING btree ("expira_em");
