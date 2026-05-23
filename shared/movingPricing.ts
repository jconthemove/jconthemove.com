export const MOVING_LOCAL_MILES_MAX = 25;
export const MOVING_ONE_HOUR_MILES_MAX = 70;
export const MOVING_TWO_HOUR_MILES_MAX = 140;

export const MOVING_TRAVEL_ONE_HOUR_FEE = 100;
export const MOVING_TRAVEL_TWO_HOUR_FEE = 200;
export const MOVING_TRAVEL_THREE_HOUR_MINIMUM_FEE = 300;

export const JC_TRUCK_LOCAL_RENTAL_FEE = 150;
export const JC_TRUCK_OUT_OF_TOWN_RENTAL_FEE = 300;
export const JC_TRUCK_FAR_OUT_OF_TOWN_RENTAL_FEE = 450;
export const JC_TRUCK_INCLUDED_MILES = 30;
export const JC_TRUCK_EXTRA_MILE_RATE = 5;

export type MovingDistanceBracket = "local" | "1hr" | "2hr" | "3hr";

export function getMovingDistanceBracketFromMiles(distanceMiles?: number | null): MovingDistanceBracket {
  const miles = Number(distanceMiles ?? 0);
  if (!Number.isFinite(miles) || miles <= 0) return "local";
  if (miles <= MOVING_LOCAL_MILES_MAX) return "local";
  if (miles <= MOVING_ONE_HOUR_MILES_MAX) return "1hr";
  if (miles <= MOVING_TWO_HOUR_MILES_MAX) return "2hr";
  return "3hr";
}

export function getMovingTravelFeeForBracket(bracket: MovingDistanceBracket) {
  return bracket === "1hr" ? MOVING_TRAVEL_ONE_HOUR_FEE :
    bracket === "2hr" ? MOVING_TRAVEL_TWO_HOUR_FEE :
    bracket === "3hr" ? MOVING_TRAVEL_THREE_HOUR_MINIMUM_FEE :
    0;
}

export function calculateMovingTravelCharge(distanceMiles?: number | null) {
  const bracket = getMovingDistanceBracketFromMiles(distanceMiles);
  const fee = getMovingTravelFeeForBracket(bracket);

  return {
    bracket,
    fee,
    label:
      bracket === "1hr" ? "about 1 hour away" :
      bracket === "2hr" ? "about 2 hours away" :
      bracket === "3hr" ? "3+ hours away" :
      "local",
  };
}

export function calculateJcTruckRentalFee(distanceMiles?: number | null, outOfTown = false) {
  const miles = Number(distanceMiles ?? 0);
  const safeMiles = Number.isFinite(miles) && miles > 0 ? miles : 0;
  const baseFee = outOfTown || safeMiles > JC_TRUCK_INCLUDED_MILES
    ? safeMiles > MOVING_ONE_HOUR_MILES_MAX
      ? JC_TRUCK_FAR_OUT_OF_TOWN_RENTAL_FEE
      : JC_TRUCK_OUT_OF_TOWN_RENTAL_FEE
    : JC_TRUCK_LOCAL_RENTAL_FEE;
  const extraMiles = Math.max(0, Math.ceil(safeMiles - JC_TRUCK_INCLUDED_MILES));
  const mileageFee = extraMiles * JC_TRUCK_EXTRA_MILE_RATE;
  return {
    baseFee,
    mileageFee,
    totalFee: baseFee + mileageFee,
    includedMiles: JC_TRUCK_INCLUDED_MILES,
    extraMiles,
    ratePerExtraMile: JC_TRUCK_EXTRA_MILE_RATE,
  };
}
