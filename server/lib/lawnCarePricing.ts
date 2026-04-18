export const PROPERTY_SIZE_BASE_PRICES: Record<string, Record<string, number>> = {
  mowing: { small: 45, medium: 65, large: 95, xlarge: 145, custom: 0 },
  trimming: { small: 35, medium: 55, large: 80, xlarge: 120, custom: 0 },
  cleanup: { small: 50, medium: 75, large: 110, xlarge: 160, custom: 0 },
  full_service: { small: 85, medium: 120, large: 175, xlarge: 250, custom: 0 },
};

export const SIZE_TIER_MULTIPLIERS: Record<string, number> = {
  small: 1.0,
  medium: 1.45,
  large: 2.1,
  xlarge: 3.2,
  custom: 0,
};

export const SIZE_TIER_RANGES: Record<string, { minSqFt: number; maxSqFt: number; label: string }> = {
  small:  { minSqFt: 0,     maxSqFt: 5000,  label: "Small (under 5,000 sq ft)" },
  medium: { minSqFt: 5000,  maxSqFt: 10000, label: "Medium (5,000–10,000 sq ft)" },
  large:  { minSqFt: 10000, maxSqFt: 20000, label: "Large (10,000–20,000 sq ft)" },
  xlarge: { minSqFt: 20000, maxSqFt: 999999, label: "X-Large (20,000+ sq ft)" },
};

export function sizeTierFromSqFt(sqFt: number): "small" | "medium" | "large" | "xlarge" {
  if (sqFt < 5000) return "small";
  if (sqFt < 10000) return "medium";
  if (sqFt < 20000) return "large";
  return "xlarge";
}

export const CONDITION_MULTIPLIERS: Record<string, number> = {
  well_maintained: 1.0,
  slightly_overgrown: 1.2,
  overgrown: 1.5,
  heavily_overgrown: 2.0,
};

export const CONDITION_LABELS: Record<string, string> = {
  well_maintained: "well-maintained",
  slightly_overgrown: "slightly overgrown",
  overgrown: "overgrown",
  heavily_overgrown: "heavily overgrown",
};

export const FREQUENCY_MULTIPLIERS: Record<string, number> = {
  one_time: 1.0,
  bi_weekly: 0.9,
  weekly: 0.85,
  monthly: 0.95,
};

export const FREQUENCY_LABELS: Record<string, string> = {
  one_time: "one-time",
  weekly: "weekly",
  bi_weekly: "every two weeks",
  monthly: "monthly",
};

export const ADD_ON_PRICES: Record<string, number> = {
  edging: 15,
  blowing: 10,
  weeding: 25,
  fertilization: 35,
  aeration: 55,
  overseeding: 45,
  leaf_removal: 40,
  mulching: 50,
  hedge_trimming: 30,
  gutter_cleaning: 60,
};

export const ADD_ON_LABELS: Record<string, string> = {
  edging: "Edging",
  blowing: "Blowing / Cleanup",
  weeding: "Weeding",
  fertilization: "Fertilization",
  aeration: "Aeration",
  overseeding: "Overseeding",
  leaf_removal: "Leaf Removal",
  mulching: "Mulching",
  hedge_trimming: "Hedge Trimming",
  gutter_cleaning: "Gutter Cleaning",
};

export const CUSTOM_ESTIMATE_THRESHOLDS = {
  maxSqFtAutoQuote: 15000,
  minPrice: 35,
};

export interface LawnCareQuoteInput {
  serviceCategory: string;
  serviceFrequency: string;
  propertySize: string;
  squareFootage?: number;
  propertyCondition: string;
  addOns: string[];
  hasFence?: boolean;
  hasPets?: boolean;
  hasSteepSlope?: boolean;
  needsHaulAway?: boolean;
  zip?: string;
  distanceMiles?: number;
}

export const LAWN_CARE_TRAVEL_THRESHOLD_MILES = 5;
export const LAWN_CARE_TRAVEL_FEE = 50;

export interface LawnPriceLineItem {
  id: string;
  label: string;
  amount: number;
  /** explanation in plain English */
  explain?: string;
}

export interface LawnCarePriceBreakdown {
  // Existing fields kept for backwards compatibility
  basePrice: number;
  conditionMultiplier: number;
  frequencyMultiplier: number;
  addOnTotal: number;
  travelFee: number;
  totalQuoted: number;
  isCustomEstimate: boolean;
  recommendedCrewType: string;
  recommendedCrewSize: number;
  // New structured breakdown for shared rendering
  categoryBase: number;
  sizeMultiplier: number;
  sizeTier: string;
  propertyAdjustments: LawnPriceLineItem[];
  addOnDetails: LawnPriceLineItem[];
  haulAwayFee: number;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  /** Plain-English explanations for each multiplier */
  explanations: {
    size: string;
    condition: string;
    frequency: string;
    crew: string;
  };
}

export function shouldForceCustomEstimate(input: LawnCareQuoteInput): boolean {
  if (input.serviceCategory === "custom") return true;
  if (input.propertySize === "custom") return true;
  if ((input.squareFootage ?? 0) > CUSTOM_ESTIMATE_THRESHOLDS.maxSqFtAutoQuote) return true;
  return false;
}

const SIZE_KEY_MAP: Record<string, string> = {
  "small (under 5,000 sq ft)": "small",
  "medium (5,000–10,000 sq ft)": "medium",
  "large (10,000–20,000 sq ft)": "large",
  "x-large (20,000+ sq ft)": "xlarge",
  small: "small",
  medium: "medium",
  large: "large",
  xlarge: "xlarge",
};

function normSize(s: string): string {
  return SIZE_KEY_MAP[s.toLowerCase()] ?? "medium";
}

function timeEstimateMinutes(sizeKey: string, conditionMult: number): { min: number; max: number } {
  const baseRanges: Record<string, [number, number]> = {
    small: [30, 60],
    medium: [50, 90],
    large: [90, 150],
    xlarge: [150, 240],
  };
  const [min, max] = baseRanges[sizeKey] ?? baseRanges.medium;
  return { min: Math.round(min * conditionMult), max: Math.round(max * conditionMult) };
}

export function calculateLawnCareQuote(input: LawnCareQuoteInput): LawnCarePriceBreakdown {
  if (shouldForceCustomEstimate(input)) {
    return {
      basePrice: 0,
      conditionMultiplier: 1,
      frequencyMultiplier: 1,
      addOnTotal: 0,
      travelFee: 0,
      totalQuoted: 0,
      isCustomEstimate: true,
      recommendedCrewType: "specialist",
      recommendedCrewSize: 2,
      categoryBase: 0,
      sizeMultiplier: 0,
      sizeTier: "custom",
      propertyAdjustments: [],
      addOnDetails: [],
      haulAwayFee: 0,
      estimatedMinutesMin: 0,
      estimatedMinutesMax: 0,
      explanations: {
        size: "Custom — Darrell will measure on-site.",
        condition: "We'll assess in person.",
        frequency: "Set after the walkthrough.",
        crew: "Crew sized once we see the property.",
      },
    };
  }

  const sizeKey = normSize(input.propertySize);
  const categoryPrices = PROPERTY_SIZE_BASE_PRICES[input.serviceCategory] ?? PROPERTY_SIZE_BASE_PRICES.mowing;
  const categoryBase = categoryPrices.small || 45;
  const sizeMultiplier = SIZE_TIER_MULTIPLIERS[sizeKey] ?? 1.0;
  // Keep using the table value for back-compat (rounded), but report the multiplier explicitly.
  const basePrice = categoryPrices[sizeKey] ?? Math.round(categoryBase * sizeMultiplier);

  const conditionKey = input.propertyCondition.toLowerCase().replace(/\s+/g, "_");
  const conditionMultiplier = CONDITION_MULTIPLIERS[conditionKey] ?? 1.0;

  const frequencyKey = input.serviceFrequency.toLowerCase().replace(/[-\s]+/g, "_");
  const frequencyMultiplier = FREQUENCY_MULTIPLIERS[frequencyKey] ?? 1.0;

  const addOnDetails: LawnPriceLineItem[] = (input.addOns ?? []).map((addon) => {
    const key = addon.toLowerCase().replace(/\s+/g, "_");
    return {
      id: key,
      label: ADD_ON_LABELS[key] ?? addon,
      amount: ADD_ON_PRICES[key] ?? 0,
    };
  }).filter((a) => a.amount > 0);
  const addOnTotal = addOnDetails.reduce((s, a) => s + a.amount, 0);

  let adjustedBase = basePrice * conditionMultiplier * frequencyMultiplier;
  const propertyAdjustments: LawnPriceLineItem[] = [];
  if (input.hasSteepSlope) {
    const before = adjustedBase;
    adjustedBase *= 1.15;
    propertyAdjustments.push({
      id: "steep_slope",
      label: "Steep slope / hill",
      amount: Math.round(adjustedBase - before),
      explain: "+15% — extra care on hills",
    });
  }
  if (input.hasFence) {
    adjustedBase += 10;
    propertyAdjustments.push({
      id: "fenced_yard",
      label: "Fenced yard",
      amount: 10,
      explain: "Gate access + extra trim time",
    });
  }

  const haulAwayFee = input.needsHaulAway ? 45 : 0;
  if (haulAwayFee > 0) {
    adjustedBase += haulAwayFee;
    propertyAdjustments.push({
      id: "haul_away",
      label: "Haul away debris",
      amount: haulAwayFee,
      explain: "We take it with us",
    });
  }

  const travelFee = (input.distanceMiles ?? 0) > LAWN_CARE_TRAVEL_THRESHOLD_MILES ? LAWN_CARE_TRAVEL_FEE : 0;
  const totalQuoted = Math.max(
    Math.round(adjustedBase + addOnTotal + travelFee),
    CUSTOM_ESTIMATE_THRESHOLDS.minPrice
  );

  const { crewType, crewSize } = recommendLawnCrew(input);
  const time = timeEstimateMinutes(sizeKey, conditionMultiplier);

  const sizeRange = SIZE_TIER_RANGES[sizeKey];
  const explanations = {
    size: sizeRange
      ? `${sizeRange.label} — base price for this category is $${basePrice}.`
      : `Base price $${basePrice}.`,
    condition: conditionMultiplier === 1
      ? "Well-maintained — no extra charge."
      : `${conditionMultiplier}× because ${CONDITION_LABELS[conditionKey] || conditionKey} (more cuts/passes needed).`,
    frequency: frequencyMultiplier === 1
      ? "One-time visit (no recurring discount)."
      : `${Math.round((1 - frequencyMultiplier) * 100)}% off for ${FREQUENCY_LABELS[frequencyKey] || frequencyKey} service.`,
    crew: `${crewSize}-person ${crewType} crew — fits this size + condition.`,
  };

  return {
    basePrice,
    conditionMultiplier,
    frequencyMultiplier,
    addOnTotal,
    travelFee,
    totalQuoted,
    isCustomEstimate: false,
    recommendedCrewType: crewType,
    recommendedCrewSize: crewSize,
    categoryBase,
    sizeMultiplier,
    sizeTier: sizeKey,
    propertyAdjustments,
    addOnDetails,
    haulAwayFee,
    estimatedMinutesMin: time.min,
    estimatedMinutesMax: time.max,
    explanations,
  };
}

export function recommendLawnCrew(input: LawnCareQuoteInput): { crewType: string; crewSize: number } {
  const sizeKey = normSize(input.propertySize);
  const condKey = (input.propertyCondition || "").toLowerCase().replace(/\s+/g, "_");
  const heavy = condKey === "heavily_overgrown" || condKey === "overgrown";

  if (sizeKey === "small") return { crewType: "solo", crewSize: heavy ? 2 : 1 };
  if (sizeKey === "medium") return { crewType: "standard", crewSize: heavy ? 3 : 2 };
  if (sizeKey === "large") return { crewType: "standard", crewSize: heavy ? 4 : 3 };
  return { crewType: "specialist", crewSize: heavy ? 4 : 3 };
}
