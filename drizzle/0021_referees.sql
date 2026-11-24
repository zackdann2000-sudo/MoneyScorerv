CREATE TABLE "hub_referee" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"nome_norm" text NOT NULL,
	"jogos" integer,
	"amarelos" integer,
	"vermelhos" integer,
	"faltas" integer,
	"penaltis" integer,
	"fonte" text,
	"visto_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_referee_nome_norm_unique" UNIQUE("nome_norm")
);
--> statement-breakpoint
CREATE TABLE "hub_referee_appearance" (
	"id" serial PRIMARY KEY NOT NULL,
	"referee_id" integer NOT NULL,
	"match_date" timestamp with time zone NOT NULL,
	"league_name" text DEFAULT '' NOT NULL,
	"home_name" text DEFAULT '' NOT NULL,
	"away_name" text DEFAULT '' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"amarelos" integer,
	"vermelhos" integer,
	"faltas" integer,
	"penaltis" integer,
	"fonte" text NOT NULL,
	"fonte_ref" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hub_referee_appearance" ADD CONSTRAINT "hub_referee_appearance_referee_id_hub_referee_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."hub_referee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_referee_nome_idx" ON "hub_referee" USING btree ("nome_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_ref_appearance_uq" ON "hub_referee_appearance" USING btree ("fonte","fonte_ref");--> statement-breakpoint
CREATE INDEX "hub_ref_appearance_ref_idx" ON "hub_referee_appearance" USING btree ("referee_id","match_date");