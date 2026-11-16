import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { cleanScoringRules } from "@/lib/scoring/validate";
import { getSystemRules } from "@/lib/scoring/leagueRules";
import { cleanShieldName, cleanShieldRewards } from "@/lib/league/shield";
import { syncShieldRewards } from "@/lib/league/shieldServer";

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }
  const username = norm(usernameRaw);

  const body = await req.json().catch(() => null);
  const leagueId = String(body?.leagueId ?? "").trim();
  const patch = body?.patch ?? null;

  if (!leagueId || !patch || typeof patch !== "object") {
    return NextResponse.json({ ok: false, error: "Missing leagueId or patch" }, { status: 400 });
  }

  // Only the league creator can change settings (matches the settings screen,
  // which is read-only for everyone else).
  const { data: leagueRow, error: leagueErr } = await supabaseAdmin
    .from("leagues")
    .select("created_by, settings_locked_at, draft_status")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueErr) {
    return NextResponse.json({ ok: false, error: leagueErr.message }, { status: 500 });
  }
  if (!leagueRow) {
    return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });
  }
  if (norm(String(leagueRow.created_by ?? "")) !== username) {
    return NextResponse.json(
      { ok: false, error: "Only the league creator can change settings" },
      { status: 403 }
    );
  }

  // Finals, scoring, bonus points and the Shield's rewards lock once the draft starts.
  const lockedKeys = ["playoffFormat", "bonusPoints", "scoringSystem", "scoringCustom", "shieldRewards"];
  const locked = !!leagueRow.settings_locked_at || (leagueRow.draft_status ?? "scheduled") !== "scheduled";
  if (locked && lockedKeys.some((k) => k in patch)) {
    return NextResponse.json(
      { ok: false, error: "These settings are locked once the draft has started" },
      { status: 403 }
    );
  }

  // Map API patch -> DB columns
  const dbPatch: any = {};
  if ("name" in patch) dbPatch.name = patch.name ?? null;
  if ("playoffFormat" in patch) {
    if (!["none", "final2", "final3", "final4", "final6"].includes(patch.playoffFormat)) {
      return NextResponse.json({ ok: false, error: "Unknown finals format" }, { status: 400 });
    }
    dbPatch.playoff_format = patch.playoffFormat;
  }
  if ("draftDateTimeText" in patch) dbPatch.draft_date_time_text = patch.draftDateTimeText ?? null;
  if ("draftAt" in patch) {
    // the settings pop-up sends a timestamp in ms; the database wants a date
    if (patch.draftAt == null || patch.draftAt === "") dbPatch.draft_at = null;
    else {
      const d = new Date(typeof patch.draftAt === "number" ? patch.draftAt : String(patch.draftAt));
      if (Number.isNaN(d.getTime())) return NextResponse.json({ ok: false, error: "Draft time isn't a valid date" }, { status: 400 });
      dbPatch.draft_at = d.toISOString();
    }
  }

  if ("scoringSystem" in patch) {
    if (!["standard", "alternate", "custom"].includes(patch.scoringSystem)) {
      return NextResponse.json({ ok: false, error: "Unknown scoring system" }, { status: 400 });
    }
    dbPatch.scoring_system = patch.scoringSystem;
  }
  if ("scoringCustom" in patch && patch.scoringCustom) {
    const { rules, error } = cleanScoringRules(patch.scoringCustom, { allowStructure: false, base: await getSystemRules(supabaseAdmin, "standard") });
    if (!rules) return NextResponse.json({ ok: false, error }, { status: 400 });
    dbPatch.scoring_custom = rules;
  }
  if ("bonusPoints" in patch) dbPatch.bonus_points = patch.bonusPoints !== false;
  // The Shield can be switched on/off and renamed any time (off = that season doesn't count)
  if ("shieldEnabled" in patch) {
    const on = patch.shieldEnabled !== false;
    dbPatch.shield_enabled = on;
    // switched off / on part-way: from the first round not finalised yet (lib/league/shield.ts)
    const { data: cur } = await supabaseAdmin.from("leagues").select("shield_enabled, shield_toggles").eq("id", leagueId).maybeSingle();
    if (cur && (cur.shield_enabled !== false) !== on) {
      const { data: done } = await supabaseAdmin.from("league_week_finalisations").select("week").eq("league_id", leagueId).order("week", { ascending: false }).limit(1);
      const week = (done?.[0]?.week ?? 0) + 1;
      const toggles = (Array.isArray(cur.shield_toggles) ? cur.shield_toggles : []).filter((t: { week: number }) => t.week < week);
      dbPatch.shield_toggles = [...toggles, { week, on }];
    }
  }
  if ("shieldName" in patch) dbPatch.shield_name = cleanShieldName(patch.shieldName);
  if ("shieldRewards" in patch) dbPatch.shield_rewards = cleanShieldRewards(patch.shieldRewards);

  if ("startRound" in patch) dbPatch.start_round = patch.startRound ?? null;
  if ("totalWeeks" in patch) dbPatch.total_weeks = patch.totalWeeks ?? null;

  // optionally allow currentWeek edits
  if ("currentWeek" in patch) dbPatch.current_week = patch.currentWeek ?? null;

  const { error: updErr } = await supabaseAdmin
    .from("leagues")
    .update(dbPatch)
    .eq("id", leagueId);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  // switching the Shield off / on changes who held it when: refresh its ladder rewards
  if ("shieldEnabled" in dbPatch || "shield_rewards" in dbPatch) {
    try {
      await syncShieldRewards(supabaseAdmin, leagueId);
    } catch (e) {
      console.error("[leagues/update] shield rewards not refreshed:", e);
    }
  }

  return NextResponse.json({ ok: true });
}