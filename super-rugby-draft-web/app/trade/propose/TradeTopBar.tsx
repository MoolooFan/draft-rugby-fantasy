"use client";
// app/trade/propose/TradeTopBar.tsx
// The trade page's top card: title and Close, the team you're trading with (picked on the first
// step), the view picker (Draft Rank / Match Average / Points / Form / Projected) and the step
// buttons (Next / Back / Review). Moved out of TradeProposePageInner.tsx.
import React from "react";
import { StatViewToggle } from "@/components/StatViewToggle";
import { card35, inputWrap, type InfoMode, type Step } from "./helpers";

function StepButtons({ step, onStep, requestingCount, offeringCount }: { step: Step; onStep: (s: Step) => void; requestingCount: number; offeringCount: number }) {
  // REQUESTING: Next (right aligned)
  if (step === "REQUESTING") {
    const canNext = requestingCount > 0;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div />
        <button
          disabled={!canNext}
          onClick={() => onStep("OFFERING")}
          style={{
            height: 38,
            borderRadius: 12,
            border: "none",
            background: canNext ? "#2563EB" : "rgba(0,0,0,0.20)",
            color: "white",
            fontWeight: 700,
            cursor: canNext ? "pointer" : "not-allowed",
          }}
        >
          Next
        </button>
      </div>
    );
  }

  // OFFERING: Back + Review
  if (step === "OFFERING") {
    const canReview = offeringCount === requestingCount && requestingCount > 0;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button
          onClick={() => onStep("REQUESTING")}
          style={{
            height: 38,
            borderRadius: 12,
            border: "3px solid rgba(37,99,235,0.90)",
            background: "white",
            color: "#2563EB",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Back
        </button>

        <button
          disabled={!canReview}
          onClick={() => onStep("REVIEW")}
          style={{
            height: 38,
            borderRadius: 12,
            border: "none",
            background: canReview ? "#2563EB" : "rgba(0,0,0,0.20)",
            color: "white",
            fontWeight: 700,
            cursor: canReview ? "pointer" : "not-allowed",
          }}
        >
          Review
        </button>
      </div>
    );
  }

// REVIEW: Back only (Propose is in the footer)
if (step === "REVIEW") {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <button
        onClick={() => onStep("OFFERING")}
        style={{
          height: 38,
          borderRadius: 12,
          border: "3px solid rgba(37,99,235,0.90)",
          background: "white",
          color: "#2563EB",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Back
      </button>
      <div />
    </div>
  );
}

  return null;

}

export function TradeTopBar({
  step,
  onStep,
  requestingCount,
  offeringCount,
  onClose,
  partnerTeamId,
  onPartnerTeam,
  partnerOptions,
  yourTeamName,
  partnerTeamName,
  infoMode,
  onInfoMode,
  projLabel,
}: {
  step: Step;
  onStep: (s: Step) => void;
  requestingCount: number;
  offeringCount: number;
  onClose: () => void;
  partnerTeamId: string;
  onPartnerTeam: (teamId: string) => void;
  /** the league's other teams */
  partnerOptions: Array<{ id: string; name: string }>;
  yourTeamName: string;
  partnerTeamName: string;
  infoMode: InfoMode;
  onInfoMode: (m: InfoMode) => void;
  /** "Projected (Round 9)" */
  projLabel: string;
}) {
    return (
      <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Propose Trade</div>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: "none",
              background: "rgba(15,23,42,0.06)",
              color: "#0f172a",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {/* Team selector / display */}
{step === "REQUESTING" ? (
  // STEP 1: Pick partner team
  <div style={{ ...inputWrap, position: "relative" }}>
    <select
      value={partnerTeamId}
      onChange={(e) => onPartnerTeam(e.target.value)}
      style={{
        width: "100%",
        height: 34,
        border: "none",
        outline: "none",
        background: "transparent",
        fontSize: 13,
        fontWeight: 600,
        color: partnerTeamId ? "#0f172a" : "rgba(15,23,42,0.55)",
        WebkitAppearance: "none",
        appearance: "none",
        paddingRight: 30,
      }}
    >
      {partnerOptions
        .map((t: any) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
    </select>

    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        right: 10,
        top: "50%",
        transform: "translateY(-50%)",
        color: "rgba(15,23,42,0.45)",
        fontSize: 16,
        pointerEvents: "none",
      }}
    >
      ▾
    </span>
  </div>
) : (
  // STEP 2 + 3: Locked display (no dropdown)
  <div
    style={{
      ...inputWrap,
      fontSize: 13,
      fontWeight: 700,
      color: "#0f172a",
      height: 34,
      display: "flex",
      alignItems: "center",
    }}
  >
    {step === "OFFERING" ? yourTeamName : partnerTeamName}
  </div>
)}

          {/* C1: Per game / Total / Per 80 (for Points) */}
          {infoMode === "TOTAL_PTS" ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <StatViewToggle />
            </div>
          ) : null}

          {/* View selector */}
          <div style={{ ...inputWrap, position: "relative" }}>
            <select
              value={infoMode}
              onChange={(e) => onInfoMode(e.target.value as InfoMode)}
              style={{
                width: "100%",
                height: 34,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                fontWeight: 600,
                color: "#0f172a",
                WebkitAppearance: "none",
                appearance: "none",
                paddingRight: 30,
              }}
            >
              <option value="DRAFT_RANK">Draft Rank</option>
<option value="AVG_PPG">Match Average</option>
<option value="TOTAL_PTS">Points</option>
<option value="FORM">Form</option>
<option value="PROJ">{projLabel}</option>

            </select>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(15,23,42,0.45)",
                fontSize: 16,
                pointerEvents: "none",
              }}
            >
              ▾
            </span>
          </div>
{/* Step buttons (moved from footer) */}
<StepButtons step={step} onStep={onStep} requestingCount={requestingCount} offeringCount={offeringCount} />

          
        </div>
      </div>
    );
  }
