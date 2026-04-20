import type { PipelineContext } from "../context";
import { pickCrew } from "../adapters/dispatch.adapter";

// Dispatch step — soft failure: if crew lookup throws, the job is kept
// in a pending state and the pipeline continues (per task contract).
export async function dispatchStep(ctx: PipelineContext): Promise<PipelineContext> {
  try {
    const choice = await pickCrew(ctx.input.items);
    ctx.crew = {
      recommendedCrewSize: choice.recommendedCrewSize,
      suggestedCrewIds: choice.suggestedCrewIds,
      primaryCrewId: choice.primaryCrewId,
      note: choice.note,
    };
  } catch (e) {
    ctx.crew = {
      recommendedCrewSize: 2,
      suggestedCrewIds: [],
      primaryCrewId: null,
      note: `dispatch failed → pending: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  return ctx;
}
