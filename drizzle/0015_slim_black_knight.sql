CREATE TABLE "hub_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"analysis_type" text NOT NULL,
	"lineups_included" boolean DEFAULT false NOT NULL,
	"analysis_text" text DEFAULT '' NOT NULL,
	"summary" jsonb,
	"confidence" integer,
	"predicted_home_goals" real,
	"predicted_away_goals" real,
	"key_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lab_insights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_version" text DEFAULT 'v1' NOT NULL,
	"prompt_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_analysis_type_chk" CHECK ("hub_analysis"."analysis_type" in ('Preview', 'Final', 'Review'))
);
--> statement-breakpoint
CREATE TABLE "hub_arbitrage" (
	"id" serial PRIMARY KEY NOT NULL,
	"market" text NOT NULL,
	"profit_margin" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_arbitrage_leg" (
	"arbitrage_id" integer NOT NULL,
	"fixture_id" integer NOT NULL,
	"bookmaker" text NOT NULL,
	"selection" text NOT NULL,
	"odds" real NOT NULL,
	CONSTRAINT "hub_arbitrage_leg_arbitrage_id_fixture_id_bookmaker_pk" PRIMARY KEY("arbitrage_id","fixture_id","bookmaker")
);
--> statement-breakpoint
CREATE TABLE "hub_bookmaker_odd" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"bookmaker" text NOT NULL,
	"bookmaker_slug" text NOT NULL,
	"odds" real NOT NULL,
	"is_pick" boolean DEFAULT false NOT NULL,
	"is_kalshi" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_favorite_team" (
	"user_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_favorite_team_user_id_team_id_pk" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "hub_fixture" (
	"id" serial PRIMARY KEY NOT NULL,
	"sportmonks_id" integer NOT NULL,
	"league_id" integer NOT NULL,
	"season_id" integer,
	"stage_name" text,
	"round_name" text,
	"match_date" timestamp with time zone NOT NULL,
	"venue_name" text,
	"venue_city" text,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"home_score" integer DEFAULT 0 NOT NULL,
	"away_score" integer DEFAULT 0 NOT NULL,
	"home_score_ft" integer DEFAULT 0 NOT NULL,
	"away_score_ft" integer DEFAULT 0 NOT NULL,
	"home_red_cards" integer DEFAULT 0 NOT NULL,
	"away_red_cards" integer DEFAULT 0 NOT NULL,
	"minutes_played" integer DEFAULT 0 NOT NULL,
	"live_state" text DEFAULT 'NS' NOT NULL,
	"is_cup" boolean DEFAULT false NOT NULL,
	"is_postponed" boolean DEFAULT false NOT NULL,
	"home_table_position" integer,
	"away_table_position" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_fixture_sportmonks_id_unique" UNIQUE("sportmonks_id")
);
--> statement-breakpoint
CREATE TABLE "hub_job_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"detail" jsonb,
	CONSTRAINT "hub_job_log_status_chk" CHECK ("hub_job_log"."status" in ('running', 'ok', 'error'))
);
--> statement-breakpoint
CREATE TABLE "hub_league" (
	"id" serial PRIMARY KEY NOT NULL,
	"sportmonks_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"country_iso2" text,
	"country_name" text,
	"competition_type" text DEFAULT 'Liga' NOT NULL,
	"is_tracked" boolean DEFAULT true NOT NULL,
	"is_experimental" boolean DEFAULT false NOT NULL,
	"odds_provider_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_league_sportmonks_id_unique" UNIQUE("sportmonks_id"),
	CONSTRAINT "hub_league_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "hub_lineup" (
	"fixture_id" integer PRIMARY KEY NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"home_formation" text,
	"away_formation" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_lineup_player" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"player_id" integer,
	"role" text NOT NULL,
	"position" text,
	"shirt_number" integer,
	"is_captain" boolean DEFAULT false NOT NULL,
	"formation_position" integer,
	"injury_type" text,
	"expected_return" date,
	CONSTRAINT "hub_lineup_player_role_chk" CHECK ("hub_lineup_player"."role" in ('xi', 'bench', 'sidelined'))
);
--> statement-breakpoint
CREATE TABLE "hub_opportunity" (
	"id" serial PRIMARY KEY NOT NULL,
	"analysis_id" integer NOT NULL,
	"fixture_id" integer NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"probability" real NOT NULL,
	"odds" real NOT NULL,
	"value" real NOT NULL,
	"stake" numeric(6, 2) DEFAULT '1.00' NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"is_experimental" boolean DEFAULT false NOT NULL,
	"profit" numeric(10, 4),
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_opportunity_analysis_id_unique" UNIQUE("analysis_id"),
	CONSTRAINT "hub_opportunity_outcome_chk" CHECK ("hub_opportunity"."outcome" in ('pending', 'won', 'lost', 'void')),
	CONSTRAINT "hub_opportunity_odds_chk" CHECK ("hub_opportunity"."odds" > 1)
);
--> statement-breakpoint
CREATE TABLE "hub_outlier" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"bookmaker" text NOT NULL,
	"odds" real NOT NULL,
	"ref_odds" real NOT NULL,
	"deviation" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_player" (
	"id" serial PRIMARY KEY NOT NULL,
	"sportmonks_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"image_url" text,
	"position" text,
	"detailed_position" text,
	"shirt_number" integer,
	"nationality" text,
	"date_of_birth" date,
	"height" integer,
	"weight" integer,
	"team_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_player_sportmonks_id_unique" UNIQUE("sportmonks_id")
);
--> statement-breakpoint
CREATE TABLE "hub_prediction" (
	"analysis_id" integer NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"probability" real NOT NULL,
	CONSTRAINT "hub_prediction_analysis_id_market_selection_pk" PRIMARY KEY("analysis_id","market","selection")
);
--> statement-breakpoint
CREATE TABLE "hub_prompt" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"performance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_purchase" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"ref_id" integer NOT NULL,
	"credits" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_purchase_kind_chk" CHECK ("hub_purchase"."kind" in ('analysis', 'scenario', 'arbitrage'))
);
--> statement-breakpoint
CREATE TABLE "hub_scenario" (
	"id" serial PRIMARY KEY NOT NULL,
	"size" integer NOT NULL,
	"combined_odds" real NOT NULL,
	"expected_value" real,
	"starts_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_scenario_size_chk" CHECK ("hub_scenario"."size" between 3 and 5)
);
--> statement-breakpoint
CREATE TABLE "hub_scenario_leg" (
	"scenario_id" integer NOT NULL,
	"fixture_id" integer NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"odds" real NOT NULL,
	CONSTRAINT "hub_scenario_leg_scenario_id_fixture_id_pk" PRIMARY KEY("scenario_id","fixture_id")
);
--> statement-breakpoint
CREATE TABLE "hub_season" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"sportmonks_id" integer,
	"season_key" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_team" (
	"id" serial PRIMARY KEY NOT NULL,
	"sportmonks_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"country_iso2" text,
	"league_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_team_sportmonks_id_unique" UNIQUE("sportmonks_id")
);
--> statement-breakpoint
CREATE TABLE "hub_top_score" (
	"analysis_id" integer NOT NULL,
	"home" integer NOT NULL,
	"away" integer NOT NULL,
	"probability" real NOT NULL,
	CONSTRAINT "hub_top_score_analysis_id_home_away_pk" PRIMARY KEY("analysis_id","home","away")
);
--> statement-breakpoint
CREATE TABLE "hub_usage" (
	"user_id" integer NOT NULL,
	"fixture_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_usage_user_id_fixture_id_pk" PRIMARY KEY("user_id","fixture_id")
);
--> statement-breakpoint
CREATE TABLE "hub_value_bet" (
	"analysis_id" integer PRIMARY KEY NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"probability" real NOT NULL,
	"odds" real NOT NULL,
	"value" real NOT NULL,
	"max_playable_odds" real,
	"is_hot_pick" boolean DEFAULT false NOT NULL,
	"is_substitution" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_watchlist" (
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"ref_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_watchlist_user_id_kind_ref_id_pk" PRIMARY KEY("user_id","kind","ref_id"),
	CONSTRAINT "hub_watchlist_kind_chk" CHECK ("hub_watchlist"."kind" in ('opportunity', 'outlier', 'scenario'))
);
--> statement-breakpoint
CREATE TABLE "hub_xg_evaluation" (
	"opportunity_id" integer PRIMARY KEY NOT NULL,
	"home_xg" real,
	"away_xg" real,
	"model_home" integer,
	"model_away" integer,
	"actual_home" integer,
	"actual_away" integer,
	"exact" boolean DEFAULT false NOT NULL,
	"tendency" boolean DEFAULT false NOT NULL,
	"goal_difference" boolean DEFAULT false NOT NULL,
	"within_one_each" boolean DEFAULT false NOT NULL,
	"grade" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_xg_evaluation_grade_chk" CHECK ("hub_xg_evaluation"."grade" in ('hit', 'near', 'miss'))
);
--> statement-breakpoint
CREATE TABLE "hub_xg_factor" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"analysis_id" integer NOT NULL,
	"side" text NOT NULL,
	"factor_type" text NOT NULL,
	"impact" real DEFAULT 0 NOT NULL,
	"weight" real DEFAULT 0 NOT NULL,
	"context" jsonb,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "hub_analysis" ADD CONSTRAINT "hub_analysis_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_arbitrage_leg" ADD CONSTRAINT "hub_arbitrage_leg_arbitrage_id_hub_arbitrage_id_fk" FOREIGN KEY ("arbitrage_id") REFERENCES "public"."hub_arbitrage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_arbitrage_leg" ADD CONSTRAINT "hub_arbitrage_leg_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_bookmaker_odd" ADD CONSTRAINT "hub_bookmaker_odd_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_favorite_team" ADD CONSTRAINT "hub_favorite_team_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_favorite_team" ADD CONSTRAINT "hub_favorite_team_team_id_hub_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."hub_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_fixture" ADD CONSTRAINT "hub_fixture_league_id_hub_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."hub_league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_fixture" ADD CONSTRAINT "hub_fixture_season_id_hub_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."hub_season"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_fixture" ADD CONSTRAINT "hub_fixture_home_team_id_hub_team_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."hub_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_fixture" ADD CONSTRAINT "hub_fixture_away_team_id_hub_team_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."hub_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_lineup" ADD CONSTRAINT "hub_lineup_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_lineup_player" ADD CONSTRAINT "hub_lineup_player_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_lineup_player" ADD CONSTRAINT "hub_lineup_player_team_id_hub_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."hub_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_lineup_player" ADD CONSTRAINT "hub_lineup_player_player_id_hub_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."hub_player"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_opportunity" ADD CONSTRAINT "hub_opportunity_analysis_id_hub_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."hub_analysis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_opportunity" ADD CONSTRAINT "hub_opportunity_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_outlier" ADD CONSTRAINT "hub_outlier_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_player" ADD CONSTRAINT "hub_player_team_id_hub_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."hub_team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_prediction" ADD CONSTRAINT "hub_prediction_analysis_id_hub_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."hub_analysis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_prompt" ADD CONSTRAINT "hub_prompt_league_id_hub_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."hub_league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_purchase" ADD CONSTRAINT "hub_purchase_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_scenario_leg" ADD CONSTRAINT "hub_scenario_leg_scenario_id_hub_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."hub_scenario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_scenario_leg" ADD CONSTRAINT "hub_scenario_leg_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_season" ADD CONSTRAINT "hub_season_league_id_hub_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."hub_league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_team" ADD CONSTRAINT "hub_team_league_id_hub_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."hub_league"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_top_score" ADD CONSTRAINT "hub_top_score_analysis_id_hub_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."hub_analysis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_usage" ADD CONSTRAINT "hub_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_usage" ADD CONSTRAINT "hub_usage_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_value_bet" ADD CONSTRAINT "hub_value_bet_analysis_id_hub_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."hub_analysis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_watchlist" ADD CONSTRAINT "hub_watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_xg_evaluation" ADD CONSTRAINT "hub_xg_evaluation_opportunity_id_hub_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."hub_opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_xg_factor" ADD CONSTRAINT "hub_xg_factor_analysis_id_hub_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."hub_analysis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_analysis_fixture_type_version_uq" ON "hub_analysis" USING btree ("fixture_id","analysis_type","version");--> statement-breakpoint
CREATE INDEX "hub_analysis_fixture_idx" ON "hub_analysis" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "hub_arbitrage_created_idx" ON "hub_arbitrage" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_bookmaker_odd_uq" ON "hub_bookmaker_odd" USING btree ("fixture_id","market","selection","bookmaker_slug");--> statement-breakpoint
CREATE INDEX "hub_bookmaker_odd_fixture_idx" ON "hub_bookmaker_odd" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "hub_fixture_date_idx" ON "hub_fixture" USING btree ("match_date");--> statement-breakpoint
CREATE INDEX "hub_fixture_league_date_idx" ON "hub_fixture" USING btree ("league_id","match_date");--> statement-breakpoint
CREATE INDEX "hub_fixture_live_idx" ON "hub_fixture" USING btree ("live_state");--> statement-breakpoint
CREATE INDEX "hub_job_log_name_idx" ON "hub_job_log" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE INDEX "hub_league_country_idx" ON "hub_league" USING btree ("country_iso2");--> statement-breakpoint
CREATE INDEX "hub_league_tracked_idx" ON "hub_league" USING btree ("is_tracked");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_lineup_player_uq" ON "hub_lineup_player" USING btree ("fixture_id","team_id","player_id","role");--> statement-breakpoint
CREATE INDEX "hub_lineup_player_fixture_idx" ON "hub_lineup_player" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "hub_opportunity_settled_idx" ON "hub_opportunity" USING btree ("settled_at","outcome");--> statement-breakpoint
CREATE INDEX "hub_opportunity_fixture_idx" ON "hub_opportunity" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "hub_outlier_fixture_idx" ON "hub_outlier" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "hub_outlier_created_idx" ON "hub_outlier" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "hub_player_team_idx" ON "hub_player" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "hub_player_slug_idx" ON "hub_player" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_prompt_uq" ON "hub_prompt" USING btree ("league_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_purchase_uq" ON "hub_purchase" USING btree ("user_id","kind","ref_id");--> statement-breakpoint
CREATE INDEX "hub_scenario_created_idx" ON "hub_scenario" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_season_league_key_uq" ON "hub_season" USING btree ("league_id","season_key");--> statement-breakpoint
CREATE INDEX "hub_season_current_idx" ON "hub_season" USING btree ("is_current");--> statement-breakpoint
CREATE INDEX "hub_team_slug_idx" ON "hub_team" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "hub_team_league_idx" ON "hub_team" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "hub_usage_week_idx" ON "hub_usage" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "hub_xg_factor_analysis_idx" ON "hub_xg_factor" USING btree ("analysis_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_xg_factor_uq" ON "hub_xg_factor" USING btree ("analysis_id","side","factor_type");