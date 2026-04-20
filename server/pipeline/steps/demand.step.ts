import type { PipelineContext } from "../context";
import { getDemandForCoords, maybeAutoPromote } from "../../demand";

// Task #174 — Real demand signal. We geocode the service address only
// if lat/lng were already attached upstream (address geocoding lives
// in the booking form today). When coords are missing we quietly fall
// back to a neutral 0 so surge remains a no-op.
export async function demandStep(ctx: PipelineContext): Promise<PipelineContext> {
  // Self-throttle: try to auto-promote shadow → soft once we have ≥100
  // pipeline runs. Cheap count query, fire-and-forget.
  void maybeAutoPromote();

  const anyInput = ctx.input as unknown as { serviceLat?: number; serviceLng?: number };
  const lat = anyInput.serviceLat;
  const lng = anyInput.serviceLng;

  const { demand, zone } = await getDemandForCoords(lat, lng);
  if (!demand || !zone) {
    ctx.demandScore = 0;
    ctx.demandReason = "no coordinates or outside service area";
    return ctx;
  }
  ctx.demandScore = Math.min(1, demand.score); // cap at 1 for downstream consumers
  ctx.demandReason = `${zone.name} · ${demand.reasons.join(", ") || "baseline"}`;
  return ctx;
}
