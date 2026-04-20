// Task #169 — shared pricing matrix tables. The server's unified
// `server/services/pricingEngine.ts` re-exports these so the server-side
// `quoteMoving` / `quoteJunk` helpers and the client-side /pricing,
// /book, chatbot, and admin pricing-calibrate surfaces all read from the
// same numbers. Change a value here and every quote surface updates.

export const MOVING_LOAD_TYPE_MULTIPLIER: Record<string, number> = {
  labor_only: 0.6,
  local: 1.0,
  long_distance: 1.85,
};

export const MOVING_BASE_MATRIX: Record<string, Record<string, number>> = {
  studio: { "0": 285, "1": 365, "2": 425, "3": 485 },
  "1br": { "0": 425, "1": 525, "2": 625, "3": 725 },
  "2br": { "0": 685, "1": 825, "2": 965, "3": 1100 },
  "3br": { "0": 985, "1": 1175, "2": 1365, "3": 1555 },
  "4br": { "0": 1395, "1": 1635, "2": 1875, "3": 2115 },
  "5br+": { "0": 1850, "1": 2150, "2": 2450, "3": 2750 },
};

export interface JunkTier {
  code: string;
  label: string;
  shortLabel: string;
  loadFraction: string;
  weightCap: string;
  price: number;
}

export const JUNK_TIERS: JunkTier[] = [
  { code: "tiny", label: "Tiny Load", shortLabel: "Tiny", loadFraction: "≤ 1/8 truck", weightCap: "≤ 300 lbs", price: 95 },
  { code: "small", label: "Small Load", shortLabel: "Small", loadFraction: "1/4 truck", weightCap: "≤ 600 lbs", price: 175 },
  { code: "medium", label: "Medium Load", shortLabel: "Medium", loadFraction: "1/2 truck", weightCap: "≤ 1200 lbs", price: 325 },
  { code: "large", label: "Large Load", shortLabel: "Large", loadFraction: "3/4 truck", weightCap: "≤ 1800 lbs", price: 475 },
  { code: "xlarge", label: "X-Large Load", shortLabel: "X-Large", loadFraction: "Full truck", weightCap: "≤ 2400 lbs", price: 625 },
];

export function quoteMovingFromTable(opts: { bedrooms?: string; stairs?: number | string; loadType?: string }): { amount: number; base: number; multiplier: number } {
  const br = String(opts.bedrooms || "1br");
  const stairs = String(Math.max(0, Math.min(3, Number(opts.stairs ?? 0))));
  const lt = String(opts.loadType || "local");
  const base = MOVING_BASE_MATRIX[br]?.[stairs] ?? MOVING_BASE_MATRIX["1br"]["0"];
  const multiplier = MOVING_LOAD_TYPE_MULTIPLIER[lt] ?? 1;
  return { amount: Math.round(base * multiplier), base, multiplier };
}

export function quoteJunkFromTable(tierCode: string): { amount: number; tier: JunkTier | null } {
  const tier = JUNK_TIERS.find((t) => t.code === tierCode) ?? null;
  return { amount: tier?.price ?? 0, tier };
}

// ── Moving crew-rate / truck-add tables (display on /pricing) ────────────
export const MOVER_RATE_PER_HOUR = 85;
export const MOVER_TRUCK_ADD_PER_HOUR = 40;
export const MOVING_MIN_HOURS: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 3, 5: 4,
};
export const JC222_FLAT_PRICE = 222;
export const JC222_REGULAR_EQUIVALENT = 360;

// ── Window cleaning tier display rows ────────────────────────────────────
export interface WindowTier {
  label: string;
  price: number | null;
  desc: string;
}
export const WINDOW_TIERS: WindowTier[] = [
  { label: "4 Windows",   price: 20,   desc: "Minimum booking" },
  { label: "8 Windows",   price: 40,   desc: "Average home" },
  { label: "12 Windows",  price: 60,   desc: "Larger home" },
  { label: "20+ Windows", price: null, desc: "Custom quote" },
];

// ── Trash Valet monthly plan display rows ────────────────────────────────
export interface TrashPlan {
  label: string;
  mo: number | null;
  perVisit: string;
}
export const TRASH_PLANS: TrashPlan[] = [
  { label: "1 Can",   mo: 30,   perVisit: "~$7.50" },
  { label: "2 Cans",  mo: 36,   perVisit: "~$9" },
  { label: "3 Cans",  mo: 42,   perVisit: "~$10.50" },
  { label: "4+ Cans", mo: null, perVisit: "Custom" },
];

// ── Lawn-care package matrix (by property size) ──────────────────────────
export interface LawnPackage {
  label: string;
  small: number;
  medium: number;
  large: number;
  xlarge: number;
  popular?: boolean;
}
export const LAWN_PACKAGES: LawnPackage[] = [
  { label: "Mowing",       small: 45, medium: 65,  large: 95,  xlarge: 145 },
  { label: "Trimming",     small: 35, medium: 55,  large: 80,  xlarge: 120 },
  { label: "Yard Cleanup", small: 50, medium: 75,  large: 110, xlarge: 160 },
  { label: "Full Service", small: 85, medium: 120, large: 175, xlarge: 250, popular: true },
];
export const LAWN_ADDONS: Array<{ label: string; price: number }> = [
  { label: "Edging",          price: 15 },
  { label: "Blowing",         price: 10 },
  { label: "Weeding",         price: 25 },
  { label: "Fertilization",   price: 35 },
  { label: "Leaf Removal",    price: 40 },
  { label: "Mulching",        price: 50 },
  { label: "Hedge Trimming",  price: 30 },
  { label: "Gutter Cleaning", price: 60 },
];

// ── Per-service line-item minimum floors (keep parity with the server
//    SERVICE_LINE_MINIMUMS constant in bookingPricing). Explicit client
//    copy so /pricing, /book, the chatbot, and admin pricing-calibrate
//    can show the same floors without a server round-trip. Keep these
//    numbers in sync with server/services/bookingPricing.ts. */
export const SERVICE_LINE_FLOORS: Record<string, number> = {
  cleaning:       300,
  move_cleaning:  300,   // Task #169 — new distinct service code
  handyman:       150,
  labor:          200,
  delivery:       100,
  snow_removal:    50,
  demolition:     300,
  roofing:        500,
  lawn_care:       50,
  junk_removal:    95,   // tiny-tier floor
  moving:         285,   // studio / no-stairs floor
  window_cleaning: 20,   // 4-window minimum
  trash_valet:     30,   // monthly minimum
  jump_start:      50,
  painting:       500,
  flooring:       800,
};

