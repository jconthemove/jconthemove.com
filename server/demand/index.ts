// Task #174 — Public entrypoint for the demand / surge / positioning
// subsystem. Other parts of the app import from here exclusively so the
// internal module layout can change without ripple edits.

import { getWindowCountsByZone, zoneForCoords } from "./windows";
import { scoreAllZones, type ZoneDemand } from "./scorer";
import { decideSurge, type SurgeDecision } from "./surge";
import { suggestPosition, type PositioningSuggestion } from "./positioning";
import { getDemandCalibration, setDemandCalibration, maybeAutoPromote, type DemandCalibration, type DemandMode } from "./calibration";
import { listZones, getZone, type ZoneInfo } from "./zones";

export type { ZoneDemand, SurgeDecision, PositioningSuggestion, DemandCalibration, DemandMode, ZoneInfo };
export { listZones, getZone, setDemandCalibration, getDemandCalibration, maybeAutoPromote, zoneForCoords };

/** Full snapshot for admin heatmap + GET /api/admin/demand. */
export interface DemandSnapshot {
  generatedAt: string;
  calibration: DemandCalibration;
  zones: Array<ZoneDemand & { surge: SurgeDecision }>;
}

export async function getDemandSnapshot(): Promise<DemandSnapshot> {
  const counts = await getWindowCountsByZone();
  const scored = scoreAllZones(counts);
  const zones = scored.map(z => ({ ...z, surge: decideSurge(z) }));
  return {
    generatedAt: new Date().toISOString(),
    calibration: getDemandCalibration(),
    zones,
  };
}

/** Demand + surge decision for a single coordinate. When the point is
 *  outside all zones we return neutral values so pricing is unchanged. */
export async function getDemandForCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<{ zone: ZoneInfo | null; demand: ZoneDemand | null; surge: SurgeDecision }> {
  if (lat == null || lng == null) {
    return neutralOutOfZone();
  }
  const zone = zoneForCoords(Number(lat), Number(lng));
  if (!zone) return neutralOutOfZone();
  const snapshot = await getDemandSnapshot();
  const found = snapshot.zones.find(z => z.zoneCode === zone.code);
  if (!found) return neutralOutOfZone();
  return { zone, demand: found, surge: found.surge };
}

function neutralOutOfZone() {
  return {
    zone: null,
    demand: null,
    surge: {
      multiplier: 1,
      theoreticalMultiplier: 1,
      band: "normal" as const,
      reason: "outside service area — neutral pricing",
      mode: getDemandCalibration().mode,
    },
  };
}

export { suggestPosition };
