


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."current_username"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select nullif(
    lower(trim(coalesce((current_setting('request.headers', true)::json ->> 'x-username'), ''))),
    ''
  );
$$;


ALTER FUNCTION "public"."current_username"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_team_initials_from_owner_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (new.initials is null or new.initials = '')
     and new.owner_name is not null and btrim(new.owner_name) <> '' then
    new.initials :=
      upper(
        left(split_part(btrim(new.owner_name), ' ', 1), 1) ||
        left(
          split_part(
            btrim(new.owner_name),
            ' ',
            greatest(1, array_length(regexp_split_to_array(btrim(new.owner_name), '\s+'), 1))
          ),
          1
        )
      );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_team_initials_from_owner_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_league_ids"() RETURNS SETOF "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select distinct league_id
  from public.teams
  where owner_username = public.current_username();
$$;


ALTER FUNCTION "public"."user_league_ids"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."draft_picks" (
    "id" "text" NOT NULL,
    "league_id" "text" NOT NULL,
    "pick_number" integer NOT NULL,
    "team_id" "text" NOT NULL,
    "player_id" "text" NOT NULL,
    "round" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."draft_picks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draft_state" (
    "league_id" "text" NOT NULL,
    "phase" "text" DEFAULT 'preDraft'::"text" NOT NULL,
    "pick_index" integer DEFAULT 1 NOT NULL,
    "is_draft_order_set" boolean DEFAULT false NOT NULL,
    "rounds_per_team" integer DEFAULT 20 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "draft_order_team_ids" "text"[]
);


ALTER TABLE "public"."draft_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drop_locks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "text" NOT NULL,
    "week" integer NOT NULL,
    "player_id" "text" NOT NULL,
    "locked_until_ms" bigint NOT NULL,
    "dropped_by_team_id" "text",
    "dropped_at_ms" bigint,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."drop_locks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."free_agent_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "text" NOT NULL,
    "week" integer NOT NULL,
    "team_id" "text" NOT NULL,
    "add_player_id" "text" NOT NULL,
    "drop_player_id" "text",
    "status" "text" DEFAULT 'PROCESSED'::"text" NOT NULL,
    "decided_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at_ms" bigint NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at_ms" bigint NOT NULL,
    "reason" "text"
);


ALTER TABLE "public"."free_agent_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."league_members" (
    "league_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "team_id" "text" NOT NULL,
    "username" "text" NOT NULL
);


ALTER TABLE "public"."league_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leagues" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "current_week" integer DEFAULT 1 NOT NULL,
    "total_weeks" integer DEFAULT 15 NOT NULL,
    "start_round" integer DEFAULT 1 NOT NULL,
    "real_regular_season_rounds" integer DEFAULT 15 NOT NULL,
    "draft_at" timestamp with time zone,
    "draft_date_time_text" "text",
    "draft_status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "playoff_format" "text" DEFAULT 'final4'::"text" NOT NULL,
    "draft_order" "jsonb"
);


ALTER TABLE "public"."leagues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matchup_results" (
    "league_id" "text" NOT NULL,
    "week_no" integer NOT NULL,
    "home_team_id" "text" NOT NULL,
    "away_team_id" "text" NOT NULL,
    "home_score" integer DEFAULT 0 NOT NULL,
    "away_score" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."matchup_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_images" (
    "internal_player_id" "text" NOT NULL,
    "external_player_id" bigint,
    "image_profile" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."player_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_round_stats" (
    "id" bigint NOT NULL,
    "season" integer NOT NULL,
    "internal_player_id" "text" NOT NULL,
    "external_player_id" integer,
    "round" integer NOT NULL,
    "points" numeric DEFAULT 0 NOT NULL,
    "raw_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_profile" "text"
);


ALTER TABLE "public"."player_round_stats" OWNER TO "postgres";


ALTER TABLE "public"."player_round_stats" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."player_round_stats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."rosters" (
    "league_id" "text" NOT NULL,
    "team_id" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rosters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_selections" (
    "league_id" "text" NOT NULL,
    "week" integer NOT NULL,
    "team_id" "text" NOT NULL,
    "lineup" "jsonb" NOT NULL,
    "captain_id" "text",
    "vice_id" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone
);


ALTER TABLE "public"."team_selections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "text" NOT NULL,
    "league_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "initials" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "owner_username" "text",
    "owner_name" "text"
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trade_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "text" NOT NULL,
    "week" integer NOT NULL,
    "from_team_id" "text" NOT NULL,
    "to_team_id" "text" NOT NULL,
    "offer_player_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "request_player_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trade_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trades" (
    "id" "text" NOT NULL,
    "league_id" "text" NOT NULL,
    "from_team_id" "text" NOT NULL,
    "to_team_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "username_norm" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waiver_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "text" NOT NULL,
    "week" integer NOT NULL,
    "team_id" "text" NOT NULL,
    "add_player_id" "text" NOT NULL,
    "drop_player_id" "text",
    "priority" integer NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "decided_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at_ms" bigint NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at_ms" bigint NOT NULL,
    "processed_at_ms" bigint,
    "decided_at_ms" bigint
);


ALTER TABLE "public"."waiver_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waiver_order" (
    "league_id" "text" NOT NULL,
    "week" integer NOT NULL,
    "team_id" "text" NOT NULL,
    "rank" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."waiver_order" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waiver_runs" (
    "league_id" "text" NOT NULL,
    "week" integer NOT NULL,
    "status" "text" NOT NULL,
    "started_at_ms" bigint,
    "processed_at_ms" bigint,
    "error" "text"
);


ALTER TABLE "public"."waiver_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."watchlist" (
    "id" bigint NOT NULL,
    "league_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "player_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."watchlist" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."watchlist_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."watchlist_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."watchlist_id_seq" OWNED BY "public"."watchlist"."id";



ALTER TABLE ONLY "public"."watchlist" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."watchlist_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."draft_picks"
    ADD CONSTRAINT "draft_picks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_picks"
    ADD CONSTRAINT "draft_picks_unique_league_pick" UNIQUE ("league_id", "pick_number");



ALTER TABLE ONLY "public"."draft_picks"
    ADD CONSTRAINT "draft_picks_unique_league_player" UNIQUE ("league_id", "player_id");



ALTER TABLE ONLY "public"."draft_state"
    ADD CONSTRAINT "draft_state_pkey" PRIMARY KEY ("league_id");



ALTER TABLE ONLY "public"."draft_state"
    ADD CONSTRAINT "draft_state_unique_league" UNIQUE ("league_id");



ALTER TABLE ONLY "public"."drop_locks"
    ADD CONSTRAINT "drop_locks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."free_agent_transfers"
    ADD CONSTRAINT "free_agent_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."league_members"
    ADD CONSTRAINT "league_members_pkey" PRIMARY KEY ("league_id", "username");



ALTER TABLE ONLY "public"."leagues"
    ADD CONSTRAINT "leagues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matchup_results"
    ADD CONSTRAINT "matchup_results_pkey" PRIMARY KEY ("league_id", "week_no", "home_team_id", "away_team_id");



ALTER TABLE ONLY "public"."player_images"
    ADD CONSTRAINT "player_images_pkey" PRIMARY KEY ("internal_player_id");



ALTER TABLE ONLY "public"."player_round_stats"
    ADD CONSTRAINT "player_round_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_round_stats"
    ADD CONSTRAINT "player_round_stats_season_internal_player_id_round_key" UNIQUE ("season", "internal_player_id", "round");



ALTER TABLE ONLY "public"."rosters"
    ADD CONSTRAINT "rosters_pkey" PRIMARY KEY ("league_id", "team_id");



ALTER TABLE ONLY "public"."rosters"
    ADD CONSTRAINT "rosters_unique_league_team" UNIQUE ("league_id", "team_id");



ALTER TABLE ONLY "public"."team_selections"
    ADD CONSTRAINT "team_selections_pkey" PRIMARY KEY ("league_id", "week", "team_id");



ALTER TABLE ONLY "public"."team_selections"
    ADD CONSTRAINT "team_selections_unique" UNIQUE ("league_id", "week", "team_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_unique_league_owner" UNIQUE ("league_id", "owner_username");



ALTER TABLE ONLY "public"."trade_offers"
    ADD CONSTRAINT "trade_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_norm_key" UNIQUE ("username_norm");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_norm_unique" UNIQUE ("username_norm");



ALTER TABLE ONLY "public"."waiver_claims"
    ADD CONSTRAINT "waiver_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waiver_order"
    ADD CONSTRAINT "waiver_order_pkey" PRIMARY KEY ("league_id", "week", "team_id");



ALTER TABLE ONLY "public"."waiver_runs"
    ADD CONSTRAINT "waiver_runs_league_week_unique" UNIQUE ("league_id", "week");



ALTER TABLE ONLY "public"."waiver_runs"
    ADD CONSTRAINT "waiver_runs_pkey" PRIMARY KEY ("league_id", "week");



ALTER TABLE ONLY "public"."watchlist"
    ADD CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id");



CREATE INDEX "draft_picks_league_idx" ON "public"."draft_picks" USING "btree" ("league_id");



CREATE UNIQUE INDEX "draft_picks_league_picknum_unique" ON "public"."draft_picks" USING "btree" ("league_id", "pick_number");



CREATE UNIQUE INDEX "draft_picks_league_player_unique" ON "public"."draft_picks" USING "btree" ("league_id", "player_id");



CREATE INDEX "draft_picks_league_team_idx" ON "public"."draft_picks" USING "btree" ("league_id", "team_id");



CREATE UNIQUE INDEX "draft_picks_unique_pick" ON "public"."draft_picks" USING "btree" ("league_id", "pick_number");



CREATE INDEX "drop_locks_league_idx" ON "public"."drop_locks" USING "btree" ("league_id");



CREATE UNIQUE INDEX "drop_locks_unique" ON "public"."drop_locks" USING "btree" ("league_id", "player_id");



CREATE INDEX "free_agent_transfers_league_week_idx" ON "public"."free_agent_transfers" USING "btree" ("league_id", "week");



CREATE INDEX "idx_player_round_stats_player" ON "public"."player_round_stats" USING "btree" ("internal_player_id");



CREATE INDEX "idx_player_round_stats_round" ON "public"."player_round_stats" USING "btree" ("round");



CREATE INDEX "league_members_league_username_idx" ON "public"."league_members" USING "btree" ("league_id", "username");



CREATE INDEX "matchup_results_league_week_idx" ON "public"."matchup_results" USING "btree" ("league_id", "week_no");



CREATE UNIQUE INDEX "player_images_external_player_id_key" ON "public"."player_images" USING "btree" ("external_player_id") WHERE ("external_player_id" IS NOT NULL);



CREATE INDEX "rosters_league_idx" ON "public"."rosters" USING "btree" ("league_id");



CREATE INDEX "teams_league_owner_idx" ON "public"."teams" USING "btree" ("league_id", "owner_username");



CREATE INDEX "teams_owner_username_idx" ON "public"."teams" USING "btree" ("owner_username");



CREATE INDEX "trade_offers_from_team_idx" ON "public"."trade_offers" USING "btree" ("from_team_id");



CREATE INDEX "trade_offers_league_status_idx" ON "public"."trade_offers" USING "btree" ("league_id", "status");



CREATE INDEX "trade_offers_league_week_idx" ON "public"."trade_offers" USING "btree" ("league_id", "week");



CREATE INDEX "trade_offers_to_team_idx" ON "public"."trade_offers" USING "btree" ("to_team_id");



CREATE INDEX "waiver_claims_league_week_idx" ON "public"."waiver_claims" USING "btree" ("league_id", "week");



CREATE INDEX "waiver_claims_team_week_idx" ON "public"."waiver_claims" USING "btree" ("team_id", "week");



CREATE INDEX "waiver_order_league_week_rank_idx" ON "public"."waiver_order" USING "btree" ("league_id", "week", "rank");



CREATE INDEX "watchlist_league_user_idx" ON "public"."watchlist" USING "btree" ("league_id", "user_id");



CREATE INDEX "watchlist_player_idx" ON "public"."watchlist" USING "btree" ("player_id");



CREATE UNIQUE INDEX "watchlist_unique" ON "public"."watchlist" USING "btree" ("league_id", "user_id", "player_id");



CREATE OR REPLACE TRIGGER "matchup_results_set_updated_at" BEFORE UPDATE ON "public"."matchup_results" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_team_initials" BEFORE INSERT OR UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_team_initials_from_owner_name"();



CREATE OR REPLACE TRIGGER "trg_trade_offers_updated_at" BEFORE UPDATE ON "public"."trade_offers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."rosters"
    ADD CONSTRAINT "rosters_team_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



CREATE POLICY "deny_all" ON "public"."drop_locks" USING (false) WITH CHECK (false);



CREATE POLICY "deny_all" ON "public"."free_agent_transfers" USING (false) WITH CHECK (false);



CREATE POLICY "deny_all" ON "public"."rosters" USING (false) WITH CHECK (false);



CREATE POLICY "deny_all" ON "public"."trade_offers" USING (false) WITH CHECK (false);



CREATE POLICY "deny_all" ON "public"."trades" USING (false) WITH CHECK (false);



CREATE POLICY "deny_all" ON "public"."waiver_claims" USING (false) WITH CHECK (false);



CREATE POLICY "deny_all" ON "public"."waiver_order" USING (false) WITH CHECK (false);



ALTER TABLE "public"."draft_picks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "draft_picks_insert_owner" ON "public"."draft_picks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "draft_picks"."team_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "draft_picks_select_member" ON "public"."draft_picks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "draft_picks"."league_id") AND ("t"."owner_username" = "public"."current_username"())))));



ALTER TABLE "public"."draft_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "draft_state_insert_member" ON "public"."draft_state" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "draft_state"."league_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "draft_state_select_member" ON "public"."draft_state" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "draft_state"."league_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "draft_state_update_member" ON "public"."draft_state" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "draft_state"."league_id") AND ("t"."owner_username" = "public"."current_username"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "draft_state"."league_id") AND ("t"."owner_username" = "public"."current_username"())))));



ALTER TABLE "public"."drop_locks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."free_agent_transfers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "involved teams can update trade" ON "public"."trade_offers" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "m"
  WHERE (("m"."league_id" = "trade_offers"."league_id") AND ("m"."user_id" = "auth"."uid"()) AND (("m"."team_id" = "trade_offers"."from_team_id") OR ("m"."team_id" = "trade_offers"."to_team_id")))))) WITH CHECK (true);



CREATE POLICY "league members can read drop locks" ON "public"."drop_locks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "m"
  WHERE (("m"."league_id" = "drop_locks"."league_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "league members can read free agent transfers" ON "public"."free_agent_transfers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "m"
  WHERE (("m"."league_id" = "free_agent_transfers"."league_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "league members can read trades" ON "public"."trade_offers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "m"
  WHERE (("m"."league_id" = "trade_offers"."league_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "league members can read waiver claims" ON "public"."waiver_claims" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "m"
  WHERE (("m"."league_id" = "waiver_claims"."league_id") AND ("m"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."leagues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rosters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rosters_delete_owner" ON "public"."rosters" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "rosters"."team_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "rosters_insert_owner" ON "public"."rosters" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "rosters"."team_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "rosters_select_member" ON "public"."rosters" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "rosters"."league_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "rosters_update_owner" ON "public"."rosters" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "rosters"."team_id") AND ("t"."owner_username" = "public"."current_username"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "rosters"."team_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "team owner can create free agent transfers" ON "public"."free_agent_transfers" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."league_members" "m"
  WHERE (("m"."league_id" = "free_agent_transfers"."league_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."team_id" = "free_agent_transfers"."team_id")))));



CREATE POLICY "team owner can create trades" ON "public"."trade_offers" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."league_members" "m"
  WHERE (("m"."league_id" = "trade_offers"."league_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."team_id" = "trade_offers"."from_team_id")))));



CREATE POLICY "team owner can create waiver claims" ON "public"."waiver_claims" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."league_members" "m"
  WHERE (("m"."league_id" = "waiver_claims"."league_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."team_id" = "waiver_claims"."team_id")))));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_insert_own" ON "public"."teams" FOR INSERT WITH CHECK ((("owner_username" = "public"."current_username"()) AND ("user_id" = "public"."current_username"())));



CREATE POLICY "teams_select_member" ON "public"."teams" FOR SELECT USING (("league_id" IN ( SELECT "public"."user_league_ids"() AS "user_league_ids")));



CREATE POLICY "teams_update_own" ON "public"."teams" FOR UPDATE USING (("owner_username" = "public"."current_username"())) WITH CHECK (("owner_username" = "public"."current_username"()));



CREATE POLICY "temp public read" ON "public"."leagues" FOR SELECT USING (true);



CREATE POLICY "temp public read" ON "public"."rosters" FOR SELECT USING (true);



CREATE POLICY "temp public read" ON "public"."trades" FOR SELECT USING (true);



CREATE POLICY "temp public write" ON "public"."leagues" USING (true) WITH CHECK (true);



CREATE POLICY "temp public write" ON "public"."rosters" USING (true) WITH CHECK (true);



CREATE POLICY "temp public write" ON "public"."trades" USING (true) WITH CHECK (true);



ALTER TABLE "public"."trade_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trade_offers_delete_from_team_owner" ON "public"."trade_offers" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "ft"
  WHERE (("ft"."id" = "trade_offers"."from_team_id") AND ("ft"."league_id" = "trade_offers"."league_id") AND ("ft"."owner_username" = "public"."current_username"())))));



CREATE POLICY "trade_offers_delete_owner" ON "public"."trade_offers" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "trade_offers"."from_team_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "trade_offers_insert_from_team_owner" ON "public"."trade_offers" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."teams" "ft"
  WHERE (("ft"."id" = "trade_offers"."from_team_id") AND ("ft"."league_id" = "trade_offers"."league_id") AND ("ft"."owner_username" = "public"."current_username"())))) AND (EXISTS ( SELECT 1
   FROM "public"."teams" "tt"
  WHERE (("tt"."id" = "trade_offers"."to_team_id") AND ("tt"."league_id" = "trade_offers"."league_id"))))));



CREATE POLICY "trade_offers_insert_owner" ON "public"."trade_offers" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "trade_offers"."from_team_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "trade_offers_select_league_members" ON "public"."trade_offers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "trade_offers"."league_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "trade_offers_select_member" ON "public"."trade_offers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "trade_offers"."league_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "trade_offers_update_involved_teams" ON "public"."trade_offers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "trade_offers"."league_id") AND ("t"."owner_username" = "public"."current_username"()) AND (("t"."id" = "trade_offers"."from_team_id") OR ("t"."id" = "trade_offers"."to_team_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "trade_offers"."league_id") AND ("t"."owner_username" = "public"."current_username"()) AND (("t"."id" = "trade_offers"."from_team_id") OR ("t"."id" = "trade_offers"."to_team_id"))))));



CREATE POLICY "trade_offers_update_owner" ON "public"."trade_offers" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "trade_offers"."from_team_id") AND ("t"."owner_username" = "public"."current_username"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "trade_offers"."from_team_id") AND ("t"."owner_username" = "public"."current_username"())))));



ALTER TABLE "public"."trades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trades_insert_member" ON "public"."trades" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "trades"."league_id") AND ("t"."owner_username" = "public"."current_username"())))));



CREATE POLICY "trades_select_member" ON "public"."trades" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."league_id" = "trades"."league_id") AND ("t"."owner_username" = "public"."current_username"())))));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waiver_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waiver_order" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."watchlist" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."draft_picks";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."leagues";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."rosters";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."teams";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."trades";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."current_username"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_username"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_username"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_team_initials_from_owner_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_team_initials_from_owner_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_team_initials_from_owner_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_league_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_league_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_league_ids"() TO "service_role";


















GRANT ALL ON TABLE "public"."draft_picks" TO "anon";
GRANT ALL ON TABLE "public"."draft_picks" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_picks" TO "service_role";



GRANT ALL ON TABLE "public"."draft_state" TO "anon";
GRANT ALL ON TABLE "public"."draft_state" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_state" TO "service_role";



GRANT ALL ON TABLE "public"."drop_locks" TO "anon";
GRANT ALL ON TABLE "public"."drop_locks" TO "authenticated";
GRANT ALL ON TABLE "public"."drop_locks" TO "service_role";



GRANT ALL ON TABLE "public"."free_agent_transfers" TO "anon";
GRANT ALL ON TABLE "public"."free_agent_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."free_agent_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."league_members" TO "anon";
GRANT ALL ON TABLE "public"."league_members" TO "authenticated";
GRANT ALL ON TABLE "public"."league_members" TO "service_role";



GRANT ALL ON TABLE "public"."leagues" TO "anon";
GRANT ALL ON TABLE "public"."leagues" TO "authenticated";
GRANT ALL ON TABLE "public"."leagues" TO "service_role";



GRANT ALL ON TABLE "public"."matchup_results" TO "anon";
GRANT ALL ON TABLE "public"."matchup_results" TO "authenticated";
GRANT ALL ON TABLE "public"."matchup_results" TO "service_role";



GRANT ALL ON TABLE "public"."player_images" TO "anon";
GRANT ALL ON TABLE "public"."player_images" TO "authenticated";
GRANT ALL ON TABLE "public"."player_images" TO "service_role";



GRANT ALL ON TABLE "public"."player_round_stats" TO "anon";
GRANT ALL ON TABLE "public"."player_round_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."player_round_stats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."player_round_stats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."player_round_stats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."player_round_stats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rosters" TO "anon";
GRANT ALL ON TABLE "public"."rosters" TO "authenticated";
GRANT ALL ON TABLE "public"."rosters" TO "service_role";



GRANT ALL ON TABLE "public"."team_selections" TO "anon";
GRANT ALL ON TABLE "public"."team_selections" TO "authenticated";
GRANT ALL ON TABLE "public"."team_selections" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."trade_offers" TO "anon";
GRANT ALL ON TABLE "public"."trade_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."trade_offers" TO "service_role";



GRANT ALL ON TABLE "public"."trades" TO "anon";
GRANT ALL ON TABLE "public"."trades" TO "authenticated";
GRANT ALL ON TABLE "public"."trades" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."waiver_claims" TO "anon";
GRANT ALL ON TABLE "public"."waiver_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."waiver_claims" TO "service_role";



GRANT ALL ON TABLE "public"."waiver_order" TO "anon";
GRANT ALL ON TABLE "public"."waiver_order" TO "authenticated";
GRANT ALL ON TABLE "public"."waiver_order" TO "service_role";



GRANT ALL ON TABLE "public"."waiver_runs" TO "anon";
GRANT ALL ON TABLE "public"."waiver_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."waiver_runs" TO "service_role";



GRANT ALL ON TABLE "public"."watchlist" TO "anon";
GRANT ALL ON TABLE "public"."watchlist" TO "authenticated";
GRANT ALL ON TABLE "public"."watchlist" TO "service_role";



GRANT ALL ON SEQUENCE "public"."watchlist_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."watchlist_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."watchlist_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































