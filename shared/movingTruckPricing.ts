export const JC_TRUCK_LOCAL_RENTAL_FEE = 200;
export const JC_TRUCK_OUT_OF_TOWN_RENTAL_FEE = 400;
export const JC_TRUCK_INCLUDED_MILES = 30;
export const JC_TRUCK_EXTRA_MILE_RATE = 5;

export function calculateJcTruckRentalFee(distanceMiles?: number | null, outOfTown = false) {
  const miles = Number(distanceMiles ?? 0);
  const safeMiles = Number.isFinite(miles) && miles > 0 ? miles : 0;
  const baseFee = outOfTown || safeMiles > JC_TRUCK_INCLUDED_MILES
    ? JC_TRUCK_OUT_OF_TOWN_RENTAL_FEE
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
