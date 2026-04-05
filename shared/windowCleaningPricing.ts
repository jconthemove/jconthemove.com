export interface WindowCleaningInput {
  standardWindows: number;
  largeWindows: number;
  ladderWindows: number;
  includeInside: boolean;
  includeOutside: boolean;
  seasonMode: "normal" | "winter_inside_only";
  promoCode?: string;
}

export interface WindowCleaningQuote {
  windowCount: number;
  paneCount: number;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  breakdown: {
    standardPanes: number;
    largePanes: number;
    ladderPanes: number;
    insidePanes: number;
    outsidePanes: number;
  };
  promoApplied: boolean;
  promoError?: string;
}

const PRICE_PER_PANE = 5;
const MINIMUM_WINDOWS = 4;
const LARGE_WINDOW_PANE_MULTIPLIER = 2;
const LADDER_WINDOW_RATE_MULTIPLIER = 2;

export function calculateWindowCleaningQuote(
  input: WindowCleaningInput,
  isApril: boolean = new Date().getMonth() === 3,
): WindowCleaningQuote {
  const { standardWindows, largeWindows, ladderWindows, includeInside, includeOutside, seasonMode, promoCode } = input;

  const effectiveIncludeOutside = seasonMode === "winter_inside_only" ? false : includeOutside;
  const sidesPerWindow = (effectiveIncludeOutside ? 1 : 0) + (includeInside ? 1 : 0);

  const windowCount = standardWindows + largeWindows + ladderWindows;

  const standardPanes = standardWindows * sidesPerWindow;
  const largePanes = largeWindows * LARGE_WINDOW_PANE_MULTIPLIER * sidesPerWindow;
  const ladderPanes = ladderWindows * sidesPerWindow;
  const paneCount = standardPanes + largePanes + ladderPanes;

  const standardCost = (standardPanes + largePanes) * PRICE_PER_PANE;
  const ladderCost = ladderPanes * PRICE_PER_PANE * LADDER_WINDOW_RATE_MULTIPLIER;
  const computedSubtotal = standardCost + ladderCost;

  const minimumSubtotal = MINIMUM_WINDOWS * sidesPerWindow * PRICE_PER_PANE;
  const subtotal = Math.max(computedSubtotal, minimumSubtotal, MINIMUM_WINDOWS * PRICE_PER_PANE);

  let discountAmount = 0;
  let discountPercent = 0;
  let promoApplied = false;
  let promoError: string | undefined;

  if (promoCode && promoCode.toUpperCase() === "CLEANWINDOWS") {
    if (isApril) {
      discountPercent = 20;
      discountAmount = Math.round(subtotal * 0.2 * 100) / 100;
      promoApplied = true;
    } else {
      promoError = "CLEANWINDOWS is only valid in April";
    }
  } else if (promoCode && promoCode.trim().length > 0) {
    promoError = "Invalid promo code";
  }

  const total = Math.max(0, subtotal - discountAmount);

  return {
    windowCount: Math.max(windowCount, MINIMUM_WINDOWS),
    paneCount,
    subtotal,
    discountAmount,
    discountPercent,
    total,
    breakdown: {
      standardPanes,
      largePanes,
      ladderPanes,
      insidePanes: includeInside && sidesPerWindow > 0 ? Math.round(paneCount / sidesPerWindow) : 0,
      outsidePanes: effectiveIncludeOutside && sidesPerWindow > 0 ? Math.round(paneCount / sidesPerWindow) : 0,
    },
    promoApplied,
    promoError,
  };
}
