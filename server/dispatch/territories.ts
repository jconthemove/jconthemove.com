// Task #172 — Static territory definitions for JC ON THE MOVE's Upper
// Peninsula / Northwoods service area. Crews are matched to a job when
// the job site falls inside *any* territory radius the crew can serve.
// For now every approved worker can serve all three — the array is kept
// so per-worker territory tags can be layered in later without changing
// the engine.

export interface Territory {
  code: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMi: number;
}

export const TERRITORIES: Territory[] = [
  { code: "IRONWOOD", name: "Ironwood MI", centerLat: 46.454, centerLng: -90.172, radiusMi: 25 },
  { code: "IRON_RIVER", name: "Iron River MI", centerLat: 46.092, centerLng: -88.642, radiusMi: 30 },
  { code: "WI_BORDER", name: "WI Border", centerLat: 46.300, centerLng: -90.000, radiusMi: 40 },
];

export function inAnyTerritory(lat: number, lng: number): boolean {
  // Task #184 — delegate to the operator-editable zones table. Falls
  // back to the seeded TERRITORIES list on bare-metal failure.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  try {
    const { listZones } = require("../demand/zones") as typeof import("../demand/zones");
    const zones = listZones();
    if (zones.length) {
      return zones.some(z => haversine(lat, lng, z.centerLat, z.centerLng) <= z.radiusMi);
    }
  } catch {
    // fall through
  }
  return TERRITORIES.some(t => haversine(lat, lng, t.centerLat, t.centerLng) <= t.radiusMi);
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
