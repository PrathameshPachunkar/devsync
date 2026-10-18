CREATE TABLE "github_ignored" (
	"board_id" uuid NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_ignored_board_id_repo_number_pk" PRIMARY KEY("board_id","repo","number")
);
--> statement-breakpoint
CREATE TABLE "github_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"card_id" uuid,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"repo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "auth_mode" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "installation_id" bigint;--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "encrypted_token" text;--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "push_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "webhook_id" bigint;--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "sync_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "sync_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "sync_cursor" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_repos" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "columns" ADD COLUMN "github_rule" jsonb;--> statement-breakpoint
-- Hand-edited: add nullable, backfill from cards, then enforce NOT NULL, so
-- databases that already hold GitHub items migrate cleanly.
ALTER TABLE "github_items" ADD COLUMN "board_id" uuid;--> statement-breakpoint
UPDATE "github_items" SET "board_id" = "cards"."board_id" FROM "cards" WHERE "cards"."id" = "github_items"."card_id";--> statement-breakpoint
ALTER TABLE "github_items" ALTER COLUMN "board_id" SET NOT NULL;--> statement-breakpoint
-- Repos seeded by the demo sandbox were never real links.
UPDATE "board_repos" SET "auth_mode" = 'demo' WHERE "github_repo_id" IS NULL;--> statement-breakpoint
ALTER TABLE "github_items" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "github_ignored" ADD CONSTRAINT "github_ignored_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_outbox" ADD CONSTRAINT "github_outbox_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_outbox" ADD CONSTRAINT "github_outbox_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_outbox_due_idx" ON "github_outbox" USING btree ("completed_at","failed_at","next_attempt_at");--> statement-breakpoint
CREATE INDEX "github_outbox_board_id_idx" ON "github_outbox" USING btree ("board_id");--> statement-breakpoint
ALTER TABLE "github_items" ADD CONSTRAINT "github_items_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_repos_owner_name_idx" ON "board_repos" USING btree ("owner","name");--> statement-breakpoint
CREATE UNIQUE INDEX "github_items_board_repo_number_key" ON "github_items" USING btree ("board_id","repo","number");--> statement-breakpoint
CREATE INDEX "github_items_head_sha_idx" ON "github_items" USING btree ("head_sha");