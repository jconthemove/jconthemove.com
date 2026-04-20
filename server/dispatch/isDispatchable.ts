// Task #175 — Deposit gate for the dispatch loop.
//
// `dispatchJob` and the offer queue both consult this predicate before
// sending a Crew offer. A job that requires a deposit and hasn't received
// one stays in `pending` forever (visible to admin for override) but is
// never offered to a crew, so movers don't drive out for an unpaid job.

import { pool } from "../db";

export interface DispatchabilityCheck {
  ok: boolean;
  reason?: string;
}

export async function isDispatchable(leadId: string): Promise<DispatchabilityCheck> {
  try {
    const { rows } = await pool.query<{
      deposit_required: boolean | null;
      deposit_paid: boolean | null;
      dispatch_override_reason: string | null;
    }>(
      `SELECT deposit_required, deposit_paid, dispatch_override_reason
         FROM leads
        WHERE id = $1
        LIMIT 1`,
      [leadId],
    );
    if (rows.length === 0) return { ok: false, reason: "lead not found" };
    const r = rows[0];
    if (r.deposit_required && !r.deposit_paid) {
      if (r.dispatch_override_reason) {
        return { ok: true, reason: `admin override: ${r.dispatch_override_reason}` };
      }
      return { ok: false, reason: "deposit not paid" };
    }
    return { ok: true };
  } catch (e) {
    // Fail CLOSED on infra errors so a transient DB blip can't allow a
    // crew to be dispatched to a job whose deposit state we cannot read.
    // The offer queue logs the skip reason and will retry on the next
    // cron tick (every 2 min) when the DB is healthy again.
    // eslint-disable-next-line no-console
    console.warn("[isDispatchable] DB error — failing closed:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "deposit state unreadable (DB error)" };
  }
}
