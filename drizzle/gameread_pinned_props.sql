-- ⚠️ SUPERADO (D5, 2026-11-21): esta tabela agora também é criada por
-- drizzle/0012_sync_journal.sql, que está NO journal. Este arquivo fica
-- como registro histórico do SQL original; não é executado pelo drizzle.
-- ============================================================
-- Props fixadas pelo usuário no módulo /gameread
-- Cole no SQL Editor do Neon. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS "gameread_pinned_props" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
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
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gr_pin_user_prop" ON "gameread_pinned_props" USING btree ("user_id","prop_key");
