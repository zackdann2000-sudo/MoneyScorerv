CREATE TABLE "alert_prefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"team_id" text DEFAULT '*' NOT NULL,
	"match_id" text DEFAULT '' NOT NULL,
	"alerts" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_state" (
	"match_id" text PRIMARY KEY NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"provider" text PRIMARY KEY NOT NULL,
	"token" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"voter_key" text,
	"push" boolean DEFAULT false NOT NULL,
	"terms" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"user_id" integer,
	"status" text DEFAULT 'pendente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text DEFAULT '' NOT NULL,
	"league" text DEFAULT '' NOT NULL,
	"logo" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pick_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"date" text NOT NULL,
	"league" text DEFAULT '' NOT NULL,
	"market_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"odd_mercado" real,
	"odd_justa" real,
	"ev" real,
	"profit" real,
	"is_pick" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"green" boolean,
	CONSTRAINT "picks_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"league" text DEFAULT '' NOT NULL,
	"match_date" timestamp,
	"home_name" text DEFAULT '' NOT NULL,
	"away_name" text DEFAULT '' NOT NULL,
	"model_type" text DEFAULT '' NOT NULL,
	"p_home" real DEFAULT 0 NOT NULL,
	"p_draw" real DEFAULT 0 NOT NULL,
	"p_away" real DEFAULT 0 NOT NULL,
	"p_over25" real DEFAULT 0 NOT NULL,
	"fav" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"brier" real,
	CONSTRAINT "predictions_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
CREATE TABLE "push_subs" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" integer,
	"keys" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"title" text DEFAULT 'Múltipla' NOT NULL,
	"legs" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tip_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"user_id" integer,
	"author" text DEFAULT 'Torcedor' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tip_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"voter_key" text NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tip_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"voter_key" text NOT NULL,
	"choice" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"pass_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"path" text DEFAULT '/' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pref_user_team_match" ON "alert_prefs" USING btree ("user_id","team_id","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fav_user_team" ON "favorites" USING btree ("user_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_match_market" ON "pick_ledger" USING btree ("match_id","market_key");--> statement-breakpoint
CREATE UNIQUE INDEX "like_voter_target" ON "tip_likes" USING btree ("voter_key","target");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_match_voter" ON "tip_votes" USING btree ("match_id","voter_key");