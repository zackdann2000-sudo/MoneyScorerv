CREATE TABLE "hub_standing" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"stage_name" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"goals_for" integer DEFAULT 0 NOT NULL,
	"goals_against" integer DEFAULT 0 NOT NULL,
	"goal_diff" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"form" text,
	"form_home" text,
	"form_away" text,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_standing_position_chk" CHECK ("hub_standing"."position" >= 1),
	CONSTRAINT "hub_standing_played_chk" CHECK ("hub_standing"."played" >= "hub_standing"."wins" + "hub_standing"."draws" + "hub_standing"."losses"),
	CONSTRAINT "hub_standing_goal_diff_chk" CHECK ("hub_standing"."goal_diff" = "hub_standing"."goals_for" - "hub_standing"."goals_against")
);
--> statement-breakpoint
ALTER TABLE "hub_league" ADD COLUMN "tiebreak_rules" jsonb DEFAULT '["points","goalDifference","goalsFor"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_league" ADD COLUMN "has_knockout" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_standing" ADD CONSTRAINT "hub_standing_league_id_hub_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."hub_league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_standing" ADD CONSTRAINT "hub_standing_season_id_hub_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."hub_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_standing" ADD CONSTRAINT "hub_standing_team_id_hub_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."hub_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_standing_uq" ON "hub_standing" USING btree ("league_id","season_id","stage_name","team_id");--> statement-breakpoint
CREATE INDEX "hub_standing_order_idx" ON "hub_standing" USING btree ("league_id","season_id","stage_name","position");--> statement-breakpoint
CREATE INDEX "hub_standing_team_idx" ON "hub_standing" USING btree ("team_id");