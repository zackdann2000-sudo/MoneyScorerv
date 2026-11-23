-- Índices que faltavam em `sessions` (RELATORIO_AUDITORIA §8.7, item 5).
--
-- A PK de `sessions` é o `token`, então não havia como o Postgres entrar pela
-- `user_id`: todo login/logout e o `ON DELETE cascade` de users -> sessions
-- varriam a tabela inteira. `expires_at` é o outro filtro quente (limpeza de
-- sessão expirada na leitura da sessão atual).
--
-- O que o drizzle-kit emitiu junto e foi removido de propósito: os ADD COLUMN
-- daily_quota/quota_used/quota_day, o CHECK users_plan_chk e o índice
-- users_quota_day_idx já foram aplicados por drizzle/0010_quota_diaria.sql
-- (fora do journal). Mesmo padrão do 0011 (D5): o snapshot 0020 já inclui
-- essas colunas, então a próxima `generate` não tenta recriá-las.
--
-- Idempotente e aditivo: nenhuma linha muda, só o plano de execução.
--
-- `favorites` e `alert_prefs` NÃO ganharam índice novo de propósito: já têm
-- uniqueIndex com `user_id` como primeira coluna (fav_user_team e
-- pref_user_team_match), que o Postgres usa para qualquer filtro por usuário —
-- inclusive o cascade. Um índice só em `user_id` ali seria custo de escrita
-- sem ganho de leitura.

CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" USING btree ("expires_at");
