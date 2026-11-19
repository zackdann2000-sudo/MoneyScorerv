CREATE TABLE IF NOT EXISTS "fcm_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" integer,
	"platform" text DEFAULT 'android' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "value_alert_log" (
	"chave" text PRIMARY KEY NOT NULL,
	"match_id" text DEFAULT '' NOT NULL,
	"mercado" text DEFAULT '' NOT NULL,
	"ev_pct" real DEFAULT 0 NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fcm_tokens_user_idx" ON "fcm_tokens" USING btree ("user_id");
