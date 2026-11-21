-- M4+ / modelo de negócio — log de trials negados (`trial_ips`).
--
-- Não é fonte de decisão: quem decide ainda é `users` (device_id + IP). Esta
-- tabela é histórico de tentativas recusadas, para medir farm de contas.
--
-- SQL do `drizzle-kit generate --name trial_ips`, com `IF NOT EXISTS` à mão no
-- mesmo padrão de 0012/0013/0014 (o projeto roda SQL fora do drizzle em alguns
-- lugares e um `create table` seco falharia num banco que já tenha a tabela).

CREATE TABLE IF NOT EXISTS "trial_ips" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"motivo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trial_ips_ip_idx" ON "trial_ips" USING btree ("ip","created_at");
