// Task #174 — Calibration settings for the demand/surge pipeline. Kept
// as an in-process singleton (no DB table) because the values are
// operational knobs, not customer data, and a restart to defaults is
// the desired failsafe behavior during early rollout.
//
// Modes:
//   shadow — compute everything, but never change customer pricing.
//            Default until we've logged ≥100 pipeline quotes.
//   soft   — apply HALF of the surge delta (e.g. 1.30 → 1.15 applied).
//   full   — apply the full multiplier.

import { db } from "../db";
import { pipelineRuns } from "@shared/schema";
import { sql } from "drizzle-orm";

export type DemandMode = "shadow" | "soft" | "full";

export interface ZoneOverride {
  /** When false the zone is excluded from scoring entirely (treated as
   *  normal demand, no surge). */
  enabled: boolean;
  /** Optional override of the surge elevated threshold (default 0.7).
   *  Peak threshold is kept at +0.3 above this value. */
  elevatedThreshold?: number;
}

export interface DemandCalibration {
  mode: DemandMode;
  /** When true, positioning cards and yellow alerts are suppressed for
   *  crew. Useful during training. */
  crewPositioningMuted: boolean;
  /** Per-zone enable/disable + threshold overrides, keyed by zone code. */
  zones: Record<string, ZoneOverride>;
}

const state: DemandCalibration = {
  mode: "shadow",
  crewPositioningMuted: false,
  zones: {},
};

// Track whether we've auto-promoted out of the initial shadow phase.
let autoPromotedFromShadow = false;

export function getDemandCalibration(): DemandCalibration {
  return { ...state };
}

export function setDemandCalibration(patch: Partial<DemandCalibration>): DemandCalibration {
  if (patch.mode && ["shadow", "soft", "full"].includes(patch.mode)) state.mode = patch.mode;
  if (typeof patch.crewPositioningMuted === "boolean") state.crewPositioningMuted = patch.crewPositioningMuted;
  if (patch.zones && typeof patch.zones === "object") {
    for (const [code, override] of Object.entries(patch.zones)) {
      if (!override) continue;
      const existing = state.zones[code] ?? { enabled: true };
      state.zones[code] = {
        enabled: typeof override.enabled === "boolean" ? override.enabled : existing.enabled,
        elevatedThreshold: typeof override.elevatedThreshold === "number"
          ? Math.max(0.1, Math.min(1.5, override.elevatedThreshold))
          : existing.elevatedThreshold,
      };
    }
  }
  // Operator override marks us out of auto-promotion.
  autoPromotedFromShadow = true;
  return getDemandCalibration();
}

/** Returns the override for a single zone (defaulting to enabled=true). */
export function getZoneOverride(zoneCode: string): ZoneOverride {
  return state.zones[zoneCode] ?? { enabled: true };
}

/** Periodically called from the demand step. Once pipeline_runs exceeds
 *  100 rows we leave the default shadow mode and opt into soft mode so
 *  the system begins gently shaping price. Operators can override at
 *  any time via setDemandCalibration() and the auto-promotion stops. */
export async function maybeAutoPromote(): Promise<void> {
  if (autoPromotedFromShadow) return;
  if (state.mode !== "shadow") { autoPromotedFromShadow = true; return; }
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pipelineRuns);
    if ((row?.count ?? 0) >= 100) {
      state.mode = "soft";
      autoPromotedFromShadow = true;
      // eslint-disable-next-line no-console
      console.log("[demand] auto-promoted shadow → soft mode after 100 pipeline runs");
    }
  } catch {
    // Non-fatal; stay in shadow.
  }
}
