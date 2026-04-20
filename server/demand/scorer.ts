// Task #174 — Demand scorer.
//
// Score formula (per zone), deterministic:
//    raw = 0.4 * q15m + 0.3 * q60m + 0.1 * q24h + 0.2 * activeJobs
//    if onlineCrew <= 1 → raw *= 1.5 (scarcity boost)
//    score = clamp(raw, 0, 1.5)
// So a zone with a single quote in the last 15m sits at 0.4 ("warm"),
// two fresh quotes at 0.8 ("hot"), and anything at or above 1.5 saturates
// at peak. Deterministic by design so operators can reason about pricing.

import type { ZoneWindowCounts } from "./windows";
import { getZoneOverride } from "./calibration";

export interface ZoneDemand {
  zoneCode: string;
  zoneName: string;
  score: number;            // 0..1.5 (capped; scarcity can push over 1)
  rawScore: number;         // pre-normalization signal strength
  counts: {
    q15m: number; q60m: number; q24h: number; activeJobs: number; onlineCrew: number;
  };
  reasons: string[];
}

export function scoreZone(c: ZoneWindowCounts): ZoneDemand {
  const override = getZoneOverride(c.zone.code);
  if (override.enabled === false) {
    return {
      zoneCode: c.zone.code,
      zoneName: c.zone.name,
      score: 0,
      rawScore: 0,
      counts: {
        q15m: c.quoteRequests15m,
        q60m: c.quoteRequests60m,
        q24h: c.quoteRequests24h,
        activeJobs: c.activeJobs,
        onlineCrew: c.onlineCrew,
      },
      reasons: ["zone disabled by operator"],
    };
  }
  let raw =
    0.4 * c.quoteRequests15m +
    0.3 * c.quoteRequests60m +
    0.1 * c.quoteRequests24h +
    0.2 * c.activeJobs;
  const reasons: string[] = [];
  if (c.quoteRequests15m > 0) reasons.push(`${c.quoteRequests15m} req last 15m (×0.4)`);
  if (c.quoteRequests60m > 0) reasons.push(`${c.quoteRequests60m} req last 60m (×0.3)`);
  if (c.quoteRequests24h > 0) reasons.push(`${c.quoteRequests24h} req last 24h (×0.1)`);
  if (c.activeJobs > 0) reasons.push(`${c.activeJobs} active job${c.activeJobs === 1 ? "" : "s"} (×0.2)`);

  if (c.onlineCrew <= 1) {
    raw *= 1.5;
    reasons.push(c.onlineCrew === 0 ? "no crew online (×1.5)" : "only 1 crew online (×1.5)");
  }

  const score = Math.max(0, Math.min(1.5, raw));

  return {
    zoneCode: c.zone.code,
    zoneName: c.zone.name,
    score: Math.round(score * 100) / 100,
    rawScore: Math.round(raw * 100) / 100,
    counts: {
      q15m: c.quoteRequests15m,
      q60m: c.quoteRequests60m,
      q24h: c.quoteRequests24h,
      activeJobs: c.activeJobs,
      onlineCrew: c.onlineCrew,
    },
    reasons,
  };
}

export function scoreAllZones(counts: ZoneWindowCounts[]): ZoneDemand[] {
  return counts.map(scoreZone);
}
