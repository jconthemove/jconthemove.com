export const PROPERTY_SIZE_BASE_PRICES: Record<string, Record<string, number>> = {
  mowing: {
    small: 45,
    medium: 65,
    large: 95,
    xlarge: 145,
    custom: 0,
  },
  trimming: {
    small: 35,
    medium: 55,
    large: 80,
    xlarge: 120,
    custom: 0,
  },
  cleanup: {
    small: 50,
    medium: 75,
    large: 110,
    xlarge: 160,
    custom: 0,
  },
  full_service: {
    small: 85,
    medium: 120,
    large: 175,
    xlarge: 250,
    custom: 0,
  },
};

export const CONDITION_MULTIPLIERS: Record<string, number> = {
  well_maintained: 1.0,
  slightly_overgrown: 1.2,
  overgrown: 1.5,
  heavily_overgrown: 2.0,
};

export const FREQUENCY_MULTIPLIERS: Record<string, number> = {
  one_time: 1.0,
  bi_weekly: 0.9,
  weekly: 0.85,
  monthly: 0.95,
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
}

export interface LawnCarePriceBreakdown {
  basePrice: number;
  conditionMultiplier: number;
  frequencyMultiplier: number;
  addOnTotal: number;
  travelFee: number;
  totalQuoted: number;
  isCustomEstimate: boolean;
  recommendedCrewType: string;
  recommendedCrewSize: number;
}

export function shouldForceCustomEstimate(input: LawnCareQuoteInput): boolean {
  if (input.serviceCategory === "custom") return true;
  if (input.propertySize === "custom") return true;
  if ((input.squareFootage ?? 0) > CUSTOM_ESTIMATE_THRESHOLDS.maxSqFtAutoQuote) return true;
  return false;
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
    };
  }

  const sizeMap: Record<string, string> = {
    "small (under 5,000 sq ft)": "small",
    "medium (5,000–10,000 sq ft)": "medium",
    "large (10,000–20,000 sq ft)": "large",
    "x-large (20,000+ sq ft)": "xlarge",
    small: "small",
    medium: "medium",
    large: "large",
    xlarge: "xlarge",
  };

  const sizeKey = sizeMap[input.propertySize.toLowerCase()] ?? "medium";
  const categoryPrices = PROPERTY_SIZE_BASE_PRICES[input.serviceCategory] ?? PROPERTY_SIZE_BASE_PRICES.mowing;
  const basePrice = categoryPrices[sizeKey] ?? 65;

  const conditionKey = input.propertyCondition.toLowerCase().replace(/\s+/g, "_");
  const conditionMultiplier = CONDITION_MULTIPLIERS[conditionKey] ?? 1.0;

  const frequencyKey = input.serviceFrequency.toLowerCase().replace(/[-\s]+/g, "_");
  const frequencyMultiplier = FREQUENCY_MULTIPLIERS[frequencyKey] ?? 1.0;

  const addOnTotal = (input.addOns ?? []).reduce((sum, addon) => {
    const key = addon.toLowerCase().replace(/\s+/g, "_");
    return sum + (ADD_ON_PRICES[key] ?? 0);
  }, 0);

  let adjustedBase = basePrice * conditionMultiplier * frequencyMultiplier;
  if (input.hasSteepSlope) adjustedBase *= 1.15;
  if (input.hasFence) adjustedBase += 10;

  const haulAway = input.needsHaulAway ? 45 : 0;
  const travelFee = 0;
  const totalQuoted = Math.max(
    Math.round(adjustedBase + addOnTotal + haulAway + travelFee),
    CUSTOM_ESTIMATE_THRESHOLDS.minPrice
  );

  const { crewType, crewSize } = recommendLawnCrew(input);

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
  };
}

export function recommendLawnCrew(input: LawnCareQuoteInput): { crewType: string; crewSize: number } {
  const sizeMap: Record<string, string> = {
    "small (under 5,000 sq ft)": "small",
    "medium (5,000–10,000 sq ft)": "medium",
    "large (10,000–20,000 sq ft)": "large",
    "x-large (20,000+ sq ft)": "xlarge",
    small: "small",
    medium: "medium",
    large: "large",
    xlarge: "xlarge",
  };
  const sizeKey = sizeMap[input.propertySize.toLowerCase()] ?? "medium";

  if (sizeKey === "small") return { crewType: "solo", crewSize: 1 };
  if (sizeKey === "medium") return { crewType: "standard", crewSize: 2 };
  if (sizeKey === "large") return { crewType: "standard", crewSize: 3 };
  return { crewType: "specialist", crewSize: 3 };
}
