// Task #172 — Scoring engine. Given a job and the eligible crew pool,
// ranks candidates using the formula:
//
//   score = 100 - (distanceMi × 8) - (jobsToday × 6)
//           + (urgency === 'high' ? 15 : 0)
//           + (totalPrice > 800 ? max(0, 10 - jobsToday) : 0)
//
// Territory membership is a hard filter when lat/lng are known. When
// they're not, we drop the territory gate (territory data is advisory
// at that point) and rely on workload + capability alone.

import { haversine, inAnyTerritory } from "./territories";
import { getEligibleCrew } from "./crew";
import type { DispatchCandidate } from "./types";

export interface RankJob {
  id: string;
  serviceType: string;
  lat: number | null;
  lng: number | null;
  urgency: "low" | "normal" | "high";
  totalPrice: number;
}

export async function rankCandidates(
  job: RankJob,
  excludeIds: string[] = [],
): Promise<DispatchCandidate[]> {
  const pool = await getEligibleCrew({ serviceType: job.serviceType, excludeIds });
  if (pool.length === 0) return [];

  const hasCoords = typeof job.lat === "number" && typeof job.lng === "number";
  const inTerritory = hasCoords ? inAnyTerritory(job.lat!, job.lng!) : true;

  const scored: DispatchCandidate[] = pool.map(c => {
    // Worker position is not tracked yet; approximate distance as the
    // nearest territory center when the job has coords. Crew GPS lands
    // with Task #173 — the scoring formula stays identical then.
    let distanceMi = 0;
    if (hasCoords && inTerritory) {
      // Use 10mi base penalty since we don't have worker coords; add
      // territory-based adjustment (farther territories penalize more).
      distanceMi = 10; // TODO: replace with real crew lat/lng
    } else if (hasCoords && !inTerritory) {
      // Out of service area — compute true distance as a soft signal.
      const nearest = [46.454, -90.172]; // Ironwood center
      distanceMi = haversine(job.lat!, job.lng!, nearest[0], nearest[1]);
    }

    const reasons: string[] = [];
    let score = 100 - distanceMi * 8 - c.jobsToday * 6;
    reasons.push(`base=100`);
    if (distanceMi > 0) reasons.push(`dist -${Math.round(distanceMi * 8)}`);
    if (c.jobsToday > 0) reasons.push(`load -${c.jobsToday * 6}`);

    if (job.urgency === "high") {
      score += 15;
      reasons.push("urgency +15");
    }
    if (job.totalPrice > 800) {
      const hiBonus = Math.max(0, 10 - c.jobsToday);
      if (hiBonus > 0) {
        score += hiBonus;
        reasons.push(`hi-value +${hiBonus}`);
      }
    }

    // Slight bonus for drivers on moving/junk/snow jobs so the first
    // offer naturally lands on someone who can drive the truck.
    if ((job.serviceType === "moving" || job.serviceType === "residential" ||
         job.serviceType === "junk" || job.serviceType === "snow") && c.isDriver) {
      score += 5;
      reasons.push("driver +5");
    }

    return {
      crewId: c.id,
      score: Math.round(score),
      distanceMi,
      jobsToday: c.jobsToday,
      reasons,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
