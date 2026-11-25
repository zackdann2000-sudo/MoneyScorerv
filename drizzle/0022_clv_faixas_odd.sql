-- CLV (Closing Line Value) no Track Record.
--
-- `odd_abertura`  → odd da Pinnacle no instante do pick (gravada pelo registro).
-- `odd_fechamento`→ odd da Pinnacle lida no cron de liquidação (closing line).
-- `clv_pct`       → (abertura / fechamento − 1) × 100.
--
-- Colunas nulas por padrão: pick antiga não ganha CLV retroativo — sem as duas
-- pontas da Pinnacle o valor fica NULL e a UI mostra "—".
--
-- Idempotente: pode rodar duas vezes sem erro.

ALTER TABLE "value_bet_history" ADD COLUMN IF NOT EXISTS "odd_abertura" real;--> statement-breakpoint
ALTER TABLE "value_bet_history" ADD COLUMN IF NOT EXISTS "odd_fechamento" real;--> statement-breakpoint
ALTER TABLE "value_bet_history" ADD COLUMN IF NOT EXISTS "clv_pct" real;--> statement-breakpoint
ALTER TABLE "value_bet_history" ADD COLUMN IF NOT EXISTS "fechamento_em" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vbh_clv_idx" ON "value_bet_history" USING btree ("clv_pct");
