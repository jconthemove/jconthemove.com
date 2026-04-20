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
import { getDemandCalibration, getZoneOverride } from "./calibration";

export interface SurgeDecision {
  multiplier: number;         // what was actually applied (after mode)
  theoreticalMultiplier: number; // raw band (ignores shadow/soft mode)
  band: "discount" | "normal" | "elevated" | "peak" | "scarcity";
  reason: string;
  mode: "shadow" | "soft" | "full";
}

/** Pure spec-shape helper: maps a base price, demand score, and current
 *  crew availability into a surge decision. Does NOT consult calibration
 *  modes — callers that need mode gating should use decideSurge instead.
 *  Returns {total, multiplier, reason} per the task spec contract.
 *  Additional fields (band, surgedTotal) are provided for convenience. */
export function computeSurge(base: number, demandScore: number, crewAvailable: number): {
  total: number;
  multiplier: number;
  reason: string;
  band: SurgeDecision["band"];
  surgedTotal: number;
} {
  let multiplier = 1.0;
  let band: SurgeDecision["band"] = "normal";
  let reason = "normal demand";
  if (crewAvailable === 0) {
    multiplier = 1.5; band = "scarcity"; reason = "no crew available";
  } else if (demandScore > 1.0) {
    multiplier = 1.3; band = "peak"; reason = `peak demand (score ${demandScore})`;
  } else if (demandScore > 0.7) {
    multiplier = 1.15; band = "elevated"; reason = `elevated demand (score ${demandScore})`;
  } else if (demandScore < 0.2 && crewAvailable >= 4) {
    multiplier = 0.9; band = "discount"; reason = `quiet — ${crewAvailable} idle crew`;
  }
  multiplier = Math.max(0.85, Math.min(1.5, multiplier));
  const total = Math.round(base * multiplier * 100) / 100;
  return { total, multiplier, reason, band, surgedTotal: total };
}

export function decideSurge(demand: ZoneDemand): SurgeDecision {
  const cal = getDemandCalibration();
  const override = getZoneOverride(demand.zoneCode);
  // Per-zone elevated threshold (default 0.7). Peak threshold tracks
  // +0.3 above elevated, scaled proportionally so lowering elevated
  // proportionally lowers peak.
  const elevatedT = override.elevatedThreshold ?? 0.7;
  const peakT = Math.max(elevatedT + 0.15, elevatedT * (1.0 / 0.7));
  let band: SurgeDecision["band"] = "normal";
  let theoretical = 1.0;
  let reason = "normal demand";

  if (demand.counts.onlineCrew === 0) {
    theoretical = 1.5;
    band = "scarcity";
    reason = `no crew online in ${demand.zoneName}`;
  } else if (demand.score > peakT) {
    theoretical = 1.3;
    band = "peak";
    reason = `peak demand in ${demand.zoneName} (score ${demand.score} > ${peakT.toFixed(2)})`;
  } else if (demand.score > elevatedT) {
    theoretical = 1.15;
    band = "elevated";
    reason = `elevated demand in ${demand.zoneName} (score ${demand.score} > ${elevatedT.toFixed(2)})`;
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
