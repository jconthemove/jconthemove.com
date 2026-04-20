// Shared context for the booking pipeline orchestrator (Task #170).
//
// Every step takes a PipelineContext, mutates a few fields on it, and
// returns it. The step list is declared in index.ts so reordering or
// removing a step is one-line.

import type { BookingPricingItemInput, BookingPricingResult } from "../services/bookingPricing";

export interface PipelineInputItem extends BookingPricingItemInput {}

export interface PipelineInput {
  items: PipelineInputItem[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceAddress?: string;
  requestedDate?: string; // YYYY-MM-DD
  notes?: string;
  source?: string; // 'web_multi_book' | 'chatbot' | 'crew_add_job' | 'shadow' | ...
  /** When true, the pipeline will attempt to persist a booking row. When
   *  false (default during shadow mode) the run is purely advisory and
   *  only records a pipeline_runs entry. */
  persist?: boolean;
}

export interface UpsellChip {
  code: string;
  label: string;
  reason: string;
}

export interface StepLog {
  name: string;
  ok: boolean;
  ms: number;
  note?: string;
  error?: string;
}

export interface PipelineContext {
  input: PipelineInput;

  // Filled by pricing step
  quote?: BookingPricingResult;

  // Filled by demand step — 0..1 (0 = quiet, 1 = red hot)
  demandScore?: number;
  demandReason?: string;

  // Filled by surge step
  surgeMultiplier?: number;
  surgeReason?: string;
  surgedTotal?: number;

  // Filled by dispatch step
  crew?: {
    recommendedCrewSize: number;
    suggestedCrewIds: string[];
    primaryCrewId?: string | null;
    note?: string;
  };

  // Filled by schedule step
  schedule?: {
    estimatedStart?: string; // ISO timestamp
    windowLabel?: string;    // e.g. "9:00 AM – 11:00 AM"
  };

  // Filled by incentives step (crew bonus flags)
  incentives?: {
    crewBonusMultiplier: number; // e.g. 1.25 when a bonus mover is flagged
    note?: string;
  };

  // Filled by upsell step
  upsellChips?: UpsellChip[];

  // Filled by rewards step — customer-visible JCMOVES preview
  rewards?: {
    tokenEstimate: number;
    tierApplied?: string;
  };

  // Filled by persist step
  persistedBookingId?: string;
  persistedLeadId?: string;

  // Filled by notify step
  notifications?: { sms?: boolean; email?: boolean };

  // Diagnostics
  stepLogs: StepLog[];
  startedAt: number;
}

export function buildContext(input: PipelineInput): PipelineContext {
  return {
    input,
    stepLogs: [],
    startedAt: Date.now(),
  };
}
