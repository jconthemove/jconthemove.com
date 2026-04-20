// Task #174 — Surge multiplier derived from a zone's demand score.
//
// Bands (post-scarcity-boost score → multiplier):
//   no crew online            → 1.50
//   score > 1.0 (hot+scarce)  → 1.30
//   score > 0.7               → 1.15
//   score < 0.2 AND idle≥4    → 0.90  (soft discount to attract demand)
//   else                      → 1.00
// Final multiplier is clamped to [0.85, 1.50].

import type { ZoneDemand } from "./scorer";
import { getDemandCalibration } from "./calibration";

export interface SurgeDecision {
  multiplier: number;         // what was actually applied (after mode)
  theoreticalMultiplier: number; // raw band (ignores shadow/soft mode)
  band: "discount" | "normal" | "elevated" | "peak" | "scarcity";
  reason: string;
  mode: "shadow" | "soft" | "full";
}

/** Pure spec-shape helper: maps a base price, demand score, and current
 *  crew availability into a multiplier. Does NOT consult calibration
 *  modes — callers that need mode gating should use decideSurge instead.
 *  Returned `surgedTotal` is `base * multiplier` rounded to cents. */
export function computeSurge(base: number, demandScore: number, crewAvailable: number): {
  multiplier: number;
  band: SurgeDecision["band"];
  surgedTotal: number;
} {
  let multiplier = 1.0;
  let band: SurgeDecision["band"] = "normal";
  if (crewAvailable === 0) { multiplier = 1.5; band = "scarcity"; }
  else if (demandScore > 1.0) { multiplier = 1.3; band = "peak"; }
  else if (demandScore > 0.7) { multiplier = 1.15; band = "elevated"; }
  else if (demandScore < 0.2 && crewAvailable >= 4) { multiplier = 0.9; band = "discount"; }
  multiplier = Math.max(0.85, Math.min(1.5, multiplier));
  return {
    multiplier,
    band,
    surgedTotal: Math.round(base * multiplier * 100) / 100,
  };
}

export function decideSurge(demand: ZoneDemand): SurgeDecision {
  const cal = getDemandCalibration();
  let band: SurgeDecision["band"] = "normal";
  let theoretical = 1.0;
  let reason = "normal demand";

  if (demand.counts.onlineCrew === 0) {
    theoretical = 1.5;
    band = "scarcity";
    reason = `no crew online in ${demand.zoneName}`;
  } else if (demand.score > 1.0) {
    theoretical = 1.3;
    band = "peak";
    reason = `peak demand in ${demand.zoneName}`;
  } else if (demand.score > 0.7) {
    theoretical = 1.15;
    band = "elevated";
    reason = `elevated demand in ${demand.zoneName}`;
  } else if (demand.score < 0.2 && (demand.counts.onlineCrew - demand.counts.activeJobs) >= 4) {
    theoretical = 0.9;
    band = "discount";
    reason = `quiet hour in ${demand.zoneName} — 4+ idle crew, discount to attract demand`;
  }

  theoretical = Math.max(0.85, Math.min(1.5, theoretical));

  // Mode gating. Shadow → always 1.0 (log only). Soft → apply half
  // of the delta. Full → apply as-is.
  let applied = theoretical;
  if (cal.mode === "shadow") applied = 1.0;
  else if (cal.mode === "soft") applied = 1 + (theoretical - 1) * 0.5;

  applied = Math.round(applied * 100) / 100;

  return {
    multiplier: applied,
    theoreticalMultiplier: Math.round(theoretical * 100) / 100,
    band,
    reason,
    mode: cal.mode,
  };
}
