import { haversineMiles } from "./pricing";

export const TRASH_VALET_BASE_LAT = 46.4547;
export const TRASH_VALET_BASE_LNG = -90.1726;
export const TRASH_VALET_TRAVEL_THRESHOLD_MILES = 2.5;

// $6 per can per service event (first can); $3 each additional can same day
export const TRASH_VALET_FIRST_CAN_RATE = 6;
export const TRASH_VALET_ADDITIONAL_CAN_RATE = 3;

// Recycling is a separate service day (bi-weekly), same per-can rates
// $30/month minimum (local); $129/month minimum for out-of-area
export const TRASH_VALET_MONTHLY_MINIMUM = 30;
export const TRASH_VALET_TRAVEL_SURCHARGE_MONTHLY = 50;
export const TRASH_VALET_OUT_OF_AREA_MINIMUM = 129;

export interface TrashValetInput {
  cans: number;        // trash cans (weekly)
  recyclingCans?: number; // recycling cans (bi-weekly); defaults to same as cans
  bagCount: number;
  recyclingEnabled: boolean;
  recyclingAnchorDate?: string | null;
  lat?: number | null;
  lng?: number | null;
  planType: "monthly" | "yearly";
  targetWeekOf?: string | null;
}

export interface TrashValetQuote {
  billableCans: number;
  weeklyTrashCost: number;
  weeklyRecyclingCost: number;
  projectedMonthlyTrash: number;
  projectedMonthlyRecycling: number;
  projectedMonthlyPrice: number;
  monthlyRecyclingAdder: number;
  monthlyMinimumApplied: boolean;
  travelSurchargeMonthly: number;
  distanceMiles: number | null;
  finalMonthlyPrice: number;
  isRecyclingWeek: boolean;
  recyclingCharge: number;
  jobValue: number;
  travelChargePortion: number;
  planLabel: string;
  // kept for backward compat
  weeklyBasePrice: number;
}

export function isRecyclingWeek(anchorDate: string, targetDate: Date): boolean {
  const anchor = new Date(anchorDate + "T00:00:00Z");
  const target = new Date(targetDate.toISOString().split("T")[0] + "T00:00:00Z");
  const diffMs = target.getTime() - anchor.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks % 2 === 0;
}

function eventCost(cans: number): number {
  if (cans <= 0) return 0;
  return TRASH_VALET_FIRST_CAN_RATE + Math.max(0, cans - 1) * TRASH_VALET_ADDITIONAL_CAN_RATE;
}

export function calculateTrashValetQuote(input: TrashValetInput): TrashValetQuote {
  const cans = Math.max(0, Math.floor(input.cans ?? 0));
  const bagCount = Math.max(0, Math.floor(input.bagCount ?? 0));
  // Extra bags count toward the trash day (5 bags = 1 extra can)
  const trashCans = cans + Math.ceil(bagCount / 5);
  const billableCans = trashCans; // primary billing reference

  // Recycling: same number of cans unless separately specified
  const recyclingCans = Math.max(0, Math.floor((input.recyclingCans ?? cans)));

  // Per-event costs
  const weeklyTrashCost = eventCost(trashCans);           // every week
  const weeklyRecyclingCost = eventCost(recyclingCans);   // every other week (priced per event)

  // Monthly trash: weekly × 52/12
  const projectedMonthlyTrash = parseFloat((weeklyTrashCost * 52 / 12).toFixed(2));

  // Monthly recycling: bi-weekly × 26/12
  const monthlyRecyclingAdder = input.recyclingEnabled
    ? parseFloat((weeklyRecyclingCost * 26 / 12).toFixed(2))
    : 0;
  const projectedMonthlyRecycling = monthlyRecyclingAdder;

  const projectedMonthlyPrice = parseFloat((projectedMonthlyTrash + projectedMonthlyRecycling).toFixed(2));

  const monthlyMinimumApplied = projectedMonthlyPrice < TRASH_VALET_MONTHLY_MINIMUM;
  const baseMonthly = monthlyMinimumApplied ? TRASH_VALET_MONTHLY_MINIMUM : projectedMonthlyPrice;

  let distanceMiles: number | null = null;
  let travelSurchargeMonthly = 0;
  if (input.lat != null && input.lng != null) {
    distanceMiles = parseFloat(haversineMiles(
      TRASH_VALET_BASE_LAT, TRASH_VALET_BASE_LNG,
      input.lat, input.lng
    ).toFixed(3));
    if (distanceMiles > TRASH_VALET_TRAVEL_THRESHOLD_MILES) {
      travelSurchargeMonthly = TRASH_VALET_TRAVEL_SURCHARGE_MONTHLY;
    }
  }

  const rawMonthly = baseMonthly + travelSurchargeMonthly;
  const finalMonthlyPrice = parseFloat(
    (travelSurchargeMonthly > 0 ? Math.max(TRASH_VALET_OUT_OF_AREA_MINIMUM, rawMonthly) : rawMonthly).toFixed(2)
  );

  // Per-week recycling charge (for individual job costing)
  const targetDate = input.targetWeekOf ? new Date(input.targetWeekOf + "T00:00:00Z") : new Date();
  let recyclingWeek = false;
  let recyclingCharge = 0;
  if (input.recyclingEnabled && input.recyclingAnchorDate) {
    recyclingWeek = isRecyclingWeek(input.recyclingAnchorDate, targetDate);
    if (recyclingWeek) recyclingCharge = weeklyRecyclingCost;
  }

  const travelChargePortion = parseFloat((travelSurchargeMonthly * 12 / 52).toFixed(2));
  const jobValue = parseFloat((weeklyTrashCost + recyclingCharge + travelChargePortion).toFixed(2));

  const planLabel = input.planType === "yearly"
    ? "Yearly (11 months charged, 12 months service)"
    : "Monthly";

  return {
    billableCans,
    weeklyTrashCost: parseFloat(weeklyTrashCost.toFixed(2)),
    weeklyRecyclingCost: parseFloat(weeklyRecyclingCost.toFixed(2)),
    projectedMonthlyTrash,
    projectedMonthlyRecycling,
    projectedMonthlyPrice,
    monthlyRecyclingAdder,
    monthlyMinimumApplied,
    travelSurchargeMonthly,
    distanceMiles,
    finalMonthlyPrice,
    isRecyclingWeek: recyclingWeek,
    recyclingCharge: parseFloat(recyclingCharge.toFixed(2)),
    jobValue,
    travelChargePortion,
    planLabel,
    weeklyBasePrice: weeklyTrashCost, // backward compat alias
  };
}
