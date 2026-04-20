import type { PipelineContext } from "../context";

// Persist step — during shadow mode this is a no-op. Actual booking
// writes still go through /api/bookings which owns the canonical
// persistence path (catalog validation, bundle audit log, trash valet
// auto-provisioning, etc). Promoting the pipeline to own those writes
// is a cutover follow-up once shadow parity is proven.
export async function persistStep(ctx: PipelineContext): Promise<PipelineContext> {
  if (ctx.input.persist) {
    // Intentionally left unimplemented in this task — see the /api/bookings
    // route for the canonical persist path. A future cutover task will
    // move that logic behind this adapter.
    ctx.persistedBookingId = undefined;
  }
  return ctx;
}
