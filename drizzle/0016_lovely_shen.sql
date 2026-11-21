CREATE TABLE "hub_player_stat" (
	"player_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"team_id" integer,
	"appearances" integer DEFAULT 0 NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"shots" integer DEFAULT 0 NOT NULL,
	"rating" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_player_stat_player_id_season_id_pk" PRIMARY KEY("player_id","season_id")
);
--> statement-breakpoint
ALTER TABLE "hub_player_stat" ADD CONSTRAINT "hub_player_stat_player_id_hub_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."hub_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_player_stat" ADD CONSTRAINT "hub_player_stat_season_id_hub_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."hub_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_player_stat" ADD CONSTRAINT "hub_player_stat_team_id_hub_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."hub_team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_player_stat_season_idx" ON "hub_player_stat" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "hub_player_stat_team_idx" ON "hub_player_stat" USING btree ("team_id");