import type { PipelineContext } from "../context";

// Schedule step — estimates a start window. For now we use the
// customer-requested date if provided, or the next business morning.
// The Predictive task (#174) will replace this with crew-load-aware
// window selection.
export async function scheduleStep(ctx: PipelineContext): Promise<PipelineContext> {
  const req = ctx.input.requestedDate;
  const base = req ? new Date(`${req}T09:00:00`) : nextBusinessMorning();
  const end = new Date(base.getTime() + 2 * 60 * 60 * 1000);
  ctx.schedule = {
    estimatedStart: base.toISOString(),
    windowLabel: `${fmtTime(base)} – ${fmtTime(end)}`,
  };
  return ctx;
}

function nextBusinessMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  // Skip Sunday → Monday
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
