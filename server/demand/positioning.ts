// Task #174 — Crew positioning suggestions. Given an on-duty idle crew
// member (lat/lng optional), recommend the zone with the highest
// demand score and a one-line justification for the crew's Today card.

import { scoreAllZones, type ZoneDemand } from "./scorer";
import { getWindowCountsByZone } from "./windows";
import { getZone, listZones } from "./zones";

export interface PositioningSuggestion {
  best: ZoneDemand | null;
  current: ZoneDemand | null;   // zone the crew is currently in, if any
  shouldRelocate: boolean;
  headline: string;
  detail: string;
  /** Task #174 — concrete navigation target so the crew card can
   *  one-tap into maps / the assigned destination on the dispatch
   *  screen. Null when no suggestion or crew is already in the best zone. */
  targetZone: {
    code: string;
    name: string;
    lat: number;
    lng: number;
    dispatchBonusPct: number;
  } | null;
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

  const bestZoneInfo = best ? getZoneInfoByCode(best.zoneCode) : null;
  // Dispatch bonus scales with surge band — hot zones earn more tokens
  // per completed job as a nudge to reposition.
  const dispatchBonusPct = best ? Math.round(Math.max(0, best.score - 0.5) * 20) : 0;
  const buildTarget = () => (bestZoneInfo ? {
    code: bestZoneInfo.code,
    name: bestZoneInfo.name,
    lat: bestZoneInfo.centerLat,
    lng: bestZoneInfo.centerLng,
    dispatchBonusPct,
  } : null);

  if (!best || best.score < 0.3) {
    return {
      best,
      current,
      shouldRelocate: false,
      headline: "Quiet right now — hold your position",
      detail: "No elevated demand zones yet. Stay posted and we'll route the next job your way.",
      targetZone: null,
    };
  }

  const shouldRelocate = !!current && current.zoneCode !== best.zoneCode && best.score - current.score > 0.2;

  if (shouldRelocate && current) {
    return {
      best,
      current,
      shouldRelocate: true,
      headline: `Head to ${best.zoneName}`,
      detail: dispatchBonusPct > 0
        ? `Demand ${Math.round(best.score * 100)}% vs ${Math.round(current.score * 100)}% where you are · +${dispatchBonusPct}% dispatch bonus`
        : `Demand ${Math.round(best.score * 100)}% vs ${Math.round(current.score * 100)}% where you are`,
      targetZone: buildTarget(),
    };
  }

  return {
    best,
    current,
    shouldRelocate: false,
    headline: current && current.zoneCode === best.zoneCode
      ? `You're in a hot zone — ${best.zoneName}`
      : `Hottest zone: ${best.zoneName}`,
    detail: dispatchBonusPct > 0
      ? `${best.reasons.slice(0, 2).join(" · ") || "Orders incoming"} · +${dispatchBonusPct}% dispatch bonus`
      : best.reasons.slice(0, 2).join(" · ") || "Orders are coming in.",
    targetZone: current && current.zoneCode === best.zoneCode ? null : buildTarget(),
  };
}

function getZoneInfoByCode(code: string) {
  return listZones().find(z => z.code === code) ?? null;
}
