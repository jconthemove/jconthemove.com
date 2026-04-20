// Pricing adapter — wraps the existing unified pricing engine so the
// pipeline does not need to know about bundle DB loading. Import, don't
// HTTP-call-self.
import { quoteBundle, type BookingPricingItemInput, type BookingPricingResult } from "../../services/pricingEngine";
import { loadBookingRewardSettings } from "../../services/disburseBookingTokens";

export async function priceBooking(items: BookingPricingItemInput[]): Promise<BookingPricingResult> {
  const settings = await loadBookingRewardSettings();
  return quoteBundle(items, {
    flatBookingBonus: settings.flatBonus,
    earnRatePerDollar: settings.earnRate,
  });
}
