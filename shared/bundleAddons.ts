// Bundle add-on manifest — single source of truth for the "Bundle & Save"
// chips on every service quote screen. Both the customer-facing UI
// (ServiceBundleAddon, BookingChatbot) and the server (bundleBilling,
// square-invoice) read from this file so a new add-on only has to be
// added in one place.
//
// Two kinds of add-ons today:
//   • fulfillmentType: "companion_service" — generates a child lead in
//     bundleScheduling. Not billed up front; priced when the crew quotes.
//   • fulfillmentType: "shop_card" — billed alongside the primary
//     service on the same Square invoice. On payment, the equivalent
//     dollar amount is minted as JCMOVES USD service credit in the
//     customer's wallet.
//
// User rule: any new add-on without an explicit `priceUsd` defaults to
// the "$100 Shop Card" treatment when surfaced through
// `getBillableShopCardLine` — that's why the helper falls back to
// SHOP_CARD_DEFAULT instead of silently dropping the line.

export type BundleAddonFulfillment = "companion_service" | "shop_card";

export interface BundleAddon {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  fulfillmentType: BundleAddonFulfillment;
  priceUsd?: number;            // present iff billed up front
  grantsWalletCredit?: boolean; // shop_card → mint equivalent JCMOVES USD on payment
  shortDescription?: string;    // used in confirmation email + admin email
  redeemableCopy?: string;      // customer-facing "where can I spend this?"
}

export const SHOP_CARD_DEFAULT_AMOUNT_USD = 100;

export const BUNDLE_ADDONS: BundleAddon[] = [
  { id: "moving",          label: "Moving",          emoji: "🚛", hint: "from $85/mover·hr", fulfillmentType: "companion_service" },
  { id: "junk_removal",    label: "Junk Removal",    emoji: "🗑️", hint: "from $170",         fulfillmentType: "companion_service" },
  { id: "cleaning",        label: "Cleaning",        emoji: "🧼", hint: "from $150",         fulfillmentType: "companion_service" },
  { id: "window_cleaning", label: "Window Cleaning", emoji: "🪟", hint: "$5/pane",           fulfillmentType: "companion_service" },
  { id: "lawn_care",       label: "Lawn Care",       emoji: "🌿", hint: "from $50/visit",    fulfillmentType: "companion_service" },
  { id: "trash_valet",     label: "Trash Valet",     emoji: "♻️", hint: "from $25/mo",       fulfillmentType: "companion_service" },
  { id: "snow_removal",    label: "Snow Removal",    emoji: "❄️", hint: "from $40/visit",    fulfillmentType: "companion_service" },
  { id: "assembly",        label: "Assembly",        emoji: "🔧", hint: "$75 first 2 items", fulfillmentType: "companion_service" },
  {
    id: "ashley_shop",
    label: "$100 Shop Card",
    emoji: "🛍️",
    hint: "$100 · 10% off",
    fulfillmentType: "shop_card",
    priceUsd: SHOP_CARD_DEFAULT_AMOUNT_USD,
    grantsWalletCredit: true,
    shortDescription: "$100 JCMOVES USD added to your wallet on payment",
    redeemableCopy:
      "Spend the $100 JCMOVES USD on any future JC ON THE MOVE invoice — moving, junk, cleaning, lawn, trash valet, or Ashley's Shop. Applies at $1 = $1 off.",
  },
];

const BY_ID: Record<string, BundleAddon> = Object.fromEntries(
  BUNDLE_ADDONS.map((a) => [a.id, a]),
);

export function getBundleAddon(id: string): BundleAddon | undefined {
  return BY_ID[id];
}

export function isShopCardAddon(id: string): boolean {
  return BY_ID[id]?.fulfillmentType === "shop_card";
}

export interface BundleBillableLine {
  /** Stable id we can look up later (matches BundleAddon.id, or "shop_card_default"). */
  addonId: string;
  /** Customer-visible name on the Square invoice + email. */
  name: string;
  unitPriceUsd: number;
  quantity: number;
  /** When true, payment of this line mints an equivalent JCMOVES USD credit. */
  grantsWalletCredit: boolean;
  shortDescription?: string;
  redeemableCopy?: string;
}

/**
 * Convert a raw `bundleAddons` selection into the line items we should
 * bill the customer for up front.
 *
 * Rules:
 *   1. Every add-on with `priceUsd` becomes its own line.
 *   2. If the customer ticked at least one add-on but none of them
 *      carry an explicit price, fall back to a single $100 Shop Card
 *      line (the user's "everything new defaults to a shop card" rule).
 *      We deliberately DO NOT add the default line if a priced shop
 *      card was already selected — that would double-charge.
 */
export function getBundleBillableLines(bundleAddons: string[] | null | undefined): BundleBillableLine[] {
  const ids = (bundleAddons || []).map((s) => String(s || "").trim()).filter(Boolean);
  if (ids.length === 0) return [];

  const lines: BundleBillableLine[] = [];
  let sawPricedAddon = false;
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const addon = BY_ID[id];
    if (!addon) continue;
    if (addon.priceUsd && addon.priceUsd > 0) {
      sawPricedAddon = true;
      lines.push({
        addonId: addon.id,
        name: addon.label,
        unitPriceUsd: addon.priceUsd,
        quantity: 1,
        grantsWalletCredit: !!addon.grantsWalletCredit,
        shortDescription: addon.shortDescription,
        redeemableCopy: addon.redeemableCopy,
      });
    }
  }

  // No priced add-ons but the customer DID tick something → default to
  // a single $100 Shop Card so we never silently drop a billable bundle.
  if (!sawPricedAddon) {
    lines.push({
      addonId: "shop_card_default",
      name: `$${SHOP_CARD_DEFAULT_AMOUNT_USD} Shop Card`,
      unitPriceUsd: SHOP_CARD_DEFAULT_AMOUNT_USD,
      quantity: 1,
      grantsWalletCredit: true,
      shortDescription: `$${SHOP_CARD_DEFAULT_AMOUNT_USD} JCMOVES USD added to your wallet on payment`,
      redeemableCopy:
        `Spend the $${SHOP_CARD_DEFAULT_AMOUNT_USD} JCMOVES USD on any future JC ON THE MOVE invoice — moving, junk, cleaning, lawn, trash valet, or Ashley's Shop. Applies at $1 = $1 off.`,
    });
  }

  return lines;
}

/** Total $ value of all billable bundle lines (sum of unit × qty). */
export function sumBundleBillableLines(lines: BundleBillableLine[]): number {
  return lines.reduce((s, l) => s + l.unitPriceUsd * l.quantity, 0);
}
