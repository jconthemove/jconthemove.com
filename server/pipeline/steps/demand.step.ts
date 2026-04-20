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

  const lat = ctx.input.serviceLat;
  const lng = ctx.input.serviceLng;

  const { demand, zone } = await getDemandForCoords(lat, lng);
  if (!demand || !zone) {
    ctx.demandScore = 0;
    ctx.demandReason = "no coordinates or outside service area";
    ctx.demandZoneCode = undefined;
    return ctx;
  }
  ctx.demandScore = demand.score; // full 0..1.5 range preserved per spec
  ctx.demandReason = `${zone.name} · ${demand.reasons.join(", ") || "baseline"}`;
  ctx.demandZoneCode = zone.code;
  return ctx;
}
