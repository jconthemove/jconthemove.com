// Task #174 — Zone assignment. Reuses the territory definitions from
// server/dispatch/territories.ts as the single source of truth so the
// demand model and the dispatch matcher never disagree about where a
// given lat/lng lives.

import { TERRITORIES, haversine, type Territory } from "../dispatch/territories";

export type ZoneCode = string;

export interface ZoneInfo {
  code: ZoneCode;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMi: number;
}

/** Returns the closest territory whose radius contains (lat,lng), or
 *  null when the point falls outside every territory. Ties are broken
 *  by shortest haversine distance to the territory center. */
export function getZone(lat: number | null | undefined, lng: number | null | undefined): ZoneInfo | null {
  if (lat == null || lng == null || !isFinite(Number(lat)) || !isFinite(Number(lng))) return null;
  const la = Number(lat);
  const ln = Number(lng);
  let best: { t: Territory; d: number } | null = null;
  for (const t of TERRITORIES) {
    const d = haversine(la, ln, t.centerLat, t.centerLng);
    if (d <= t.radiusMi) {
      if (!best || d < best.d) best = { t, d };
    }
  }
  return best ? { ...best.t } : null;
}

export function listZones(): ZoneInfo[] {
  return TERRITORIES.map(t => ({ ...t }));
}
