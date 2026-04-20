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
