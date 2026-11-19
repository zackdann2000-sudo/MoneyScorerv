CREATE TABLE IF NOT EXISTS "value_bet_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"mercado" text NOT NULL,
	"rotulo" text DEFAULT '' NOT NULL,
	"linha" real,
	"odd" real DEFAULT 0 NOT NULL,
	"ev_pct" real DEFAULT 0 NOT NULL,
	"stake" real DEFAULT 0 NOT NULL,
	"prob_modelo" real DEFAULT 0 NOT NULL,
	"match_date" text DEFAULT '' NOT NULL,
	"home_name" text DEFAULT '' NOT NULL,
	"away_name" text DEFAULT '' NOT NULL,
	"league_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vbh_match_mercado" ON "value_bet_history" USING btree ("match_id","mercado");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vbh_status_idx" ON "value_bet_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vbh_date_idx" ON "value_bet_history" USING btree ("match_date");