// Task #174 — Demand scorer.
//
// Score formula (per zone):
//    raw = 0.4 * q15m + 0.3 * q60m + 0.1 * q24h + 0.2 * activeJobs
//    normalized = raw / (raw + K)                         // squash to 0..1
//    if onlineCrew <= 1 → multiply by 1.5 (scarcity boost, capped at 1)
// K=5 so a zone with ~5 weighted signals sits at 0.5 ("warm"), ~15 at 0.75,
// ~35 at 0.875. Calibrated against a quiet rural territory — tweak K via
// setDemandCalibration() once we have live traffic data.

import type { ZoneWindowCounts } from "./windows";

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

const K = 5;

export function scoreZone(c: ZoneWindowCounts): ZoneDemand {
  const raw =
    0.4 * c.quoteRequests15m +
    0.3 * c.quoteRequests60m +
    0.1 * c.quoteRequests24h +
    0.2 * c.activeJobs;
  let score = raw / (raw + K);
  const reasons: string[] = [];
  if (c.quoteRequests15m > 0) reasons.push(`${c.quoteRequests15m} req last 15m (×0.4)`);
  if (c.quoteRequests60m > 0) reasons.push(`${c.quoteRequests60m} req last 60m (×0.3)`);
  if (c.quoteRequests24h > 0) reasons.push(`${c.quoteRequests24h} req last 24h (×0.1)`);
  if (c.activeJobs > 0) reasons.push(`${c.activeJobs} active job${c.activeJobs === 1 ? "" : "s"} (×0.2)`);

  if (c.onlineCrew <= 1) {
    score = Math.min(1.5, score * 1.5);
    reasons.push(c.onlineCrew === 0 ? "no crew online (×1.5)" : "only 1 crew online (×1.5)");
  }

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
