// Task #175 — Completion step in the booking pipeline.
//
// Wraps disburseJobTokens so token disbursement runs as an instrumented
// pipeline step (with the same per-step timing + log row as every other
// step) instead of a side effect buried in a route handler. Invoked
// directly by the lead-completion handlers; not part of the default STEPS
// list which runs at booking time.

import { disburseJobTokens, type DisbursementSummary } from "../../services/disburse-job-tokens";

export interface CompletionStepResult {
  ok: boolean;
  leadId: string;
  ms: number;
  tokensAwarded?: number;
  error?: string;
}

export async function runCompletionStep(leadId: string): Promise<CompletionStepResult> {
  const t0 = Date.now();
  try {
    const summary: DisbursementSummary | null = await disburseJobTokens(leadId);
    const ms = Date.now() - t0;
    const tokensAwarded = summary
      ? summary.customerTokens + summary.perCrewFlatTokens + summary.perCrewHoursTokens
      : undefined;
    console.log(
      `[pipeline.completion] lead=${leadId} ok ${ms}ms tokensAwarded=${tokensAwarded ?? "n/a"}`,
    );
    return { ok: true, leadId, ms, tokensAwarded };
  } catch (e) {
    const ms = Date.now() - t0;
    const err = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn(`[pipeline.completion] lead=${leadId} FAIL ${ms}ms ${err}`);
    return { ok: false, leadId, ms, error: err };
  }
}
