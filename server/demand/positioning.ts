// Task #174 — Crew positioning suggestions. Given an on-duty idle crew
// member (lat/lng optional), recommend the zone with the highest
// demand score and a one-line justification for the crew's Today card.

import { scoreAllZones, type ZoneDemand } from "./scorer";
import { getWindowCountsByZone } from "./windows";
import { getZone } from "./zones";

export interface PositioningSuggestion {
  best: ZoneDemand | null;
  current: ZoneDemand | null;   // zone the crew is currently in, if any
  shouldRelocate: boolean;
  headline: string;
  detail: string;
}

export async function suggestPosition(
  crewLat: number | null | undefined,
  crewLng: number | null | undefined,
): Promise<PositioningSuggestion> {
  const counts = await getWindowCountsByZone();
  const zones = scoreAllZones(counts);
  const ranked = [...zones].sort((a, b) => b.score - a.score);
  const best = ranked[0] ?? null;

  let current: ZoneDemand | null = null;
  if (crewLat != null && crewLng != null) {
    const z = getZone(crewLat, crewLng);
    if (z) current = zones.find(x => x.zoneCode === z.code) ?? null;
  }

  if (!best || best.score < 0.3) {
    return {
      best,
      current,
      shouldRelocate: false,
      headline: "Quiet right now — hold your position",
      detail: "No elevated demand zones yet. Stay posted and we'll route the next job your way.",
    };
  }

  const shouldRelocate = !!current && current.zoneCode !== best.zoneCode && best.score - current.score > 0.2;

  if (shouldRelocate && current) {
    return {
      best,
      current,
      shouldRelocate: true,
      headline: `Head to ${best.zoneName}`,
      detail: `Demand there is ${Math.round(best.score * 100)}% vs ${Math.round(current.score * 100)}% where you are.`,
    };
  }

  return {
    best,
    current,
    shouldRelocate: false,
    headline: current && current.zoneCode === best.zoneCode
      ? `You're in a hot zone — ${best.zoneName}`
      : `Hottest zone: ${best.zoneName}`,
    detail: best.reasons.slice(0, 2).join(" · ") || "Orders are coming in.",
  };
}
