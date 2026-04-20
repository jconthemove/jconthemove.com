// Booking pipeline orchestrator (Task #170).
//
// One ordered, logged execution path from raw booking input → priced,
// surged, dispatched, scheduled, rewarded decision. Each step is its
// own file under ./steps and operates on a shared PipelineContext —
// adding or reordering is a one-line edit below.

import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { pipelineRuns } from "@shared/schema";
import { buildContext, type PipelineContext, type PipelineInput, type StepLog } from "./context";
import { pricingStep } from "./steps/pricing.step";
import { demandStep } from "./steps/demand.step";
import { surgeStep } from "./steps/surge.step";
import { dispatchStep } from "./steps/dispatch.step";
import { scheduleStep } from "./steps/schedule.step";
import { incentivesStep } from "./steps/incentives.step";
import { upsellStep } from "./steps/upsell.step";
import { rewardsStep } from "./steps/rewards.step";
import { persistStep } from "./steps/persist.step";
import { notifyStep } from "./steps/notify.step";

type Step = {
  name: string;
  run: (ctx: PipelineContext) => Promise<PipelineContext>;
  /** When true, thrown errors abort the whole pipeline. When false, the
   *  error is captured in stepLogs and the pipeline continues. */
  hardFail?: boolean;
};

// Declared order. Rearrange or insert by editing this list.
const STEPS: Step[] = [
  { name: "pricing", run: pricingStep, hardFail: true },
  { name: "demand", run: demandStep },
  { name: "surge", run: surgeStep },
  { name: "dispatch", run: dispatchStep }, // soft-fail: pending job on error
  { name: "schedule", run: scheduleStep },
  { name: "incentives", run: incentivesStep },
  { name: "upsell", run: upsellStep },
  { name: "rewards", run: rewardsStep },
  { name: "persist", run: persistStep },
  { name: "notify", run: notifyStep }, // SMS failure is logged only
];

export interface PipelineResult {
  ok: boolean;
  context: PipelineContext;
  steps: StepLog[];
  elapsedMs: number;
  runId?: number;
  error?: string;
}

function hashInput(input: PipelineInput): string {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify({
    items: input.items,
    address: input.serviceAddress ?? "",
    requestedDate: input.requestedDate ?? "",
  }));
  return h.digest("hex").slice(0, 32);
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const ctx = buildContext(input);
  let fatal: Error | null = null;

  for (const step of STEPS) {
    const t0 = Date.now();
    try {
      await step.run(ctx);
      const ms = Date.now() - t0;
      const note = summarizeStep(step.name, ctx);
      ctx.stepLogs.push({ name: step.name, ok: true, ms, note });
      // eslint-disable-next-line no-console
      console.log(`[pipeline] STEP: ${step.name} ok ${ms}ms ${note ?? ""}`.trim());
    } catch (e) {
      const ms = Date.now() - t0;
      const err = e instanceof Error ? e.message : String(e);
      ctx.stepLogs.push({ name: step.name, ok: false, ms, error: err });
      // eslint-disable-next-line no-console
      console.warn(`[pipeline] STEP: ${step.name} FAIL ${ms}ms ${err}`);
      if (step.hardFail) {
        fatal = e instanceof Error ? e : new Error(err);
        break;
      }
    }
  }

  const elapsedMs = Date.now() - ctx.startedAt;
  const status: "ok" | "error" | "partial" = fatal
    ? "error"
    : ctx.stepLogs.some((s) => !s.ok)
      ? "partial"
      : "ok";

  // Record the run. Failures writing to pipeline_runs are logged but
  // never propagate — observability must not break the pipeline response.
  let runId: number | undefined;
  try {
    const [row] = await db.insert(pipelineRuns).values({
      inputHash: hashInput(input),
      source: input.source || "api",
      status,
      totalAmount: ctx.surgedTotal != null ? String(ctx.surgedTotal) : (ctx.quote?.finalTotal != null ? String(ctx.quote.finalTotal) : null),
      surgeMultiplier: ctx.surgeMultiplier != null ? String(ctx.surgeMultiplier) : null,
      crewSize: ctx.crew?.recommendedCrewSize ?? null,
      assignedCrewId: ctx.crew?.primaryCrewId ?? null,
      tokenEstimate: ctx.rewards?.tokenEstimate ?? null,
      steps: ctx.stepLogs,
      elapsedMs,
      error: fatal?.message,
    }).returning({ id: pipelineRuns.id });
    runId = row?.id;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[pipeline] failed to persist pipeline_runs row:", e instanceof Error ? e.message : e);
  }

  return {
    ok: !fatal,
    context: ctx,
    steps: ctx.stepLogs,
    elapsedMs,
    runId,
    error: fatal?.message,
  };
}

function summarizeStep(name: string, ctx: PipelineContext): string | undefined {
  switch (name) {
    case "pricing":
      return ctx.quote ? `total=${ctx.quote.finalTotal} bundle=${ctx.quote.bundleApplied?.code ?? "none"}` : undefined;
    case "surge":
      return `x${ctx.surgeMultiplier} → ${ctx.surgedTotal}`;
    case "dispatch":
      return `crew=${ctx.crew?.primaryCrewId ?? "none"} size=${ctx.crew?.recommendedCrewSize}`;
    case "schedule":
      return ctx.schedule?.windowLabel;
    case "upsell":
      return `chips=${ctx.upsellChips?.length ?? 0}`;
    case "rewards":
      return `tokens=${ctx.rewards?.tokenEstimate}`;
    case "notify":
      return `sms=${ctx.notifications?.sms}`;
    default:
      return undefined;
  }
}

/** Shadow-mode comparison: write a pipeline_runs row with the legacy
 *  quote total alongside the pipeline total so we can eyeball parity
 *  before the frontend cuts over. Fire-and-forget — caller should not
 *  await. Any failure is logged only. */
export async function shadowCompareAndLog(
  input: PipelineInput,
  legacyTotal: number,
): Promise<void> {
  try {
    const result = await runPipeline({ ...input, source: "shadow", persist: false });
    const pipelineTotal = result.context.quote?.finalTotal ?? 0;
    const match = Math.abs(legacyTotal - pipelineTotal) < 0.01;
    if (!match) {
      // eslint-disable-next-line no-console
      console.warn(`[pipeline.shadow] MISMATCH legacy=${legacyTotal} pipeline=${pipelineTotal}`);
    }
    if (result.runId != null) {
      await db.update(pipelineRuns)
        .set({ shadowCompare: { legacyTotal, pipelineTotal, match } })
        .where(eq(pipelineRuns.id, result.runId));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[pipeline.shadow] error:", e instanceof Error ? e.message : e);
  }
}
