// Task #172 — Original static territory list for JC ON THE MOVE's Upper
// Peninsula / Northwoods service area. As of Task #184 these values are
// only used to seed the operator-editable `demand_zones` table on first
// boot. Live containment checks read from server/demand/zones.ts so
// that demand scoring and dispatch always agree.

import { listZones } from "../demand/zones";

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
  // Task #184 — single source of truth: the operator-editable zones
  // cache. An empty active-zone set is a valid operational state
  // (operator has deactivated all zones) and means "no service area",
  // matching the demand engine's behavior. We do not silently fall
  // back to the seeded TERRITORIES list.
  const zones = listZones();
  return zones.some(z => haversine(lat, lng, z.centerLat, z.centerLng) <= z.radiusMi);
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
