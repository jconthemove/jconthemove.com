/**
 * shared/depositRules.ts — Canonical deposit-requirement rules.
 *
 * Both the booking chatbot (client) and the chatbot-quote API handler (server)
 * import from here so the deposit decision is always identical for every
 * service/ZIP combination.
 */

export const IRONWOOD_ZIP = "49938";

/**
 * Extract the first 5-digit US ZIP found in a string.
 * Handles plain ZIPs ("49938"), "ZIP: 49938", full addresses ("Ironwood MI 49938"), etc.
 */
export function extractZip(zip: string): string {
  const clean = zip.trim();
  if (/^\d{5}$/.test(clean)) return clean;
  const match = clean.match(/\b(\d{5})\b/);
  return match ? match[1] : clean;
}

/** Returns true when the ZIP belongs to the Ironwood MI service area. */
export function isIronwoodArea(zip: string): boolean {
  return extractZip(zip) === IRONWOOD_ZIP;
}

export interface DepositInfo {
  required: boolean;
  amount: number;
  termsHtml: string;
}

/**
 * Determine deposit requirement for a service + location.
 *
 * Rules (from master system document):
 *  - Handyman: always required — $50 local, $100 non-local
 *  - Painting / Flooring / Roofing: required only for non-local customers ($100)
 *  - All other services: no deposit
 *
 * @param service  Raw service label (case-insensitive match attempted)
 * @param zip      Customer ZIP or address string — ZIP is extracted automatically
 */
export function getDepositInfo(service: string, zip: string): DepositInfo {
  const isLocal = isIronwoodArea(zip);
  const svc = service.toLowerCase();

  if (svc === "handyman") {
    const amount = isLocal ? 50 : 100;
    return {
      required: true,
      amount,
      termsHtml: `$${amount} non-refundable estimate deposit (credited toward your project upon booking).`,
    };
  }

  if (["painting", "flooring", "roofing"].includes(svc)) {
    if (!isLocal) {
      return {
        required: true,
        amount: 100,
        termsHtml: "$100 non-refundable estimate deposit (credited toward your project if you book within 6 months).",
      };
    }
  }

  return { required: false, amount: 0, termsHtml: "" };
}
