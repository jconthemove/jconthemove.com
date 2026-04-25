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

// ─────────────────────────────────────────────────────────────────────────
// Task #218 — Labor-hours pricing model. Every service is fundamentally
// "crew × hours × $85/hr". The matrices above stay (they encode all the
// per-service nuance — bedrooms/stairs for moving, tier for junk, etc.),
// but every quoted line ALSO carries a labor-hours breakdown so the
// chat-intake card, /book wizard, and admin pricing-calibrate can show
// "2 movers × 4 hrs at $85/hr" and have it match the actual price.
// ─────────────────────────────────────────────────────────────────────────

/** Single rate that drives every labor-hours quote across the platform.
 *  Aliased to MOVER_RATE_PER_HOUR so the moving matrices and the labor-
 *  hours helper can never drift. Bumping this is the one knob that
 *  changes the platform-wide hourly rate. */
export const LABOR_RATE_PER_HOUR = MOVER_RATE_PER_HOUR; // 85

/** Per-service crew × hours defaults for the labor-hours pricing model.
 *  Source of truth for every "X movers × Y hrs" string the customer sees.
 *  When jobSize is provided, the per-size tuple overrides the default.
 *
 *  Spec (Task #218):
 *    moving small  = 2×2hr (special)
 *    moving medium = 2×4hr ≈ 16ft truck load+unload
 *    moving large  = 4×4hr ≈ 26ft truck load
 *    lawn_care     ≈ 0.5hr ($45)
 *    trash_valet   ≈ 0.33hr (~$28)
 *    rate          $85/hr
 */
export interface ServiceLaborDefaults {
  defaultCrew: number;
  defaultHours: number;
  jobSize?: Partial<Record<"small" | "medium" | "large", { crew: number; hours: number }>>;
}

export const SERVICE_LABOR_DEFAULTS: Record<string, ServiceLaborDefaults> = {
  moving: {
    // Default = medium so a chat-intake "moving" line without a size hint
    // still produces a sensible 16ft-truck estimate.
    defaultCrew: 2, defaultHours: 4,
    jobSize: {
      small:  { crew: 2, hours: 2 },  // 4 labor-hr → $340
      medium: { crew: 2, hours: 4 },  // 8 labor-hr → $680 (16ft truck load+unload)
      large:  { crew: 4, hours: 4 },  // 16 labor-hr → $1360 (26ft truck load)
    },
  },
  junk_removal: {
    defaultCrew: 2, defaultHours: 1,  // 2 labor-hr → $170 (matches existing floor)
    jobSize: {
      small:  { crew: 2, hours: 1 },  // 2 labor-hr → $170
      medium: { crew: 2, hours: 2 },  // 4 labor-hr → $340
      large:  { crew: 2, hours: 3 },  // 6 labor-hr → $510 (full truckload, per spec)
    },
  },
  cleaning: {
    defaultCrew: 2, defaultHours: 3,  // 6 labor-hr → $510
    jobSize: {
      small:  { crew: 1, hours: 3 },  // 3 labor-hr → $255
      medium: { crew: 2, hours: 3 },  // 6 labor-hr → $510
      large:  { crew: 3, hours: 4 },  // 12 labor-hr → $1020
    },
  },
  move_cleaning: {
    defaultCrew: 2, defaultHours: 4,  // 8 labor-hr → $680
    jobSize: {
      small:  { crew: 2, hours: 2 },
      medium: { crew: 2, hours: 4 },
      large:  { crew: 3, hours: 5 },
    },
  },
  lawn_care:       { defaultCrew: 1, defaultHours: 0.5 },   // ~$43 base mowing
  trash_valet:     { defaultCrew: 1, defaultHours: 0.33 },  // ~$28 per pickup
  snow_removal:    { defaultCrew: 1, defaultHours: 0.75 },  // ~$64 per driveway visit (per spec)
  window_cleaning: { defaultCrew: 1, defaultHours: 2 },     // ~$170 whole home (per spec)
  handyman:        { defaultCrew: 1, defaultHours: 2 },     // 2-hr min → $170
  labor:           { defaultCrew: 2, defaultHours: 2 },     // 4 labor-hr → $340
  delivery:        { defaultCrew: 2, defaultHours: 1 },     // 2 labor-hr → $170
  assembly:        { defaultCrew: 1, defaultHours: 2 },     // 2 labor-hr → $170
  demolition: {
    defaultCrew: 2, defaultHours: 3,  // light demo (room) per spec → $510
    jobSize: {
      small:  { crew: 2, hours: 3 },  // 6 labor-hr → $510 (light demo room)
      medium: { crew: 3, hours: 4 },  // 12 labor-hr → $1020
      large:  { crew: 4, hours: 6 },  // 24 labor-hr → $2040
    },
  },
  // Painting & Flooring keep their sqft-driven dollar math (services/
  // quoteRules/painting.ts & flooring.ts) — these defaults exist purely
  // so the customer-facing card can still show a labor-hours breakdown.
  painting:        { defaultCrew: 2, defaultHours: 6 },
  flooring:        { defaultCrew: 2, defaultHours: 8 },
  junk_reset:      { defaultCrew: 2, defaultHours: 2 },
  deep_clean_turnover: { defaultCrew: 2, defaultHours: 4 },
  assembly_finish: { defaultCrew: 2, defaultHours: 2 },
  walkway_priority: { defaultCrew: 1, defaultHours: 0.5 },
};

export interface LaborQuote {
  crewSize: number;
  laborHours: number;
  /** crewSize × laborHours — the multiplier applied to ratePerHour. */
  totalLaborHours: number;
  ratePerHour: number;
  amount: number;
  /** Which slot in SERVICE_LABOR_DEFAULTS produced this tuple. */
  source: "explicit" | "jobSize" | "default" | "unknown";
}

/** Pure helper — never throws. Returns null only when the service code is
 *  not in SERVICE_LABOR_DEFAULTS and no explicit crew/hours were supplied. */
export function quoteByLaborHours(
  serviceCode: string,
  opts: {
    jobSize?: "small" | "medium" | "large";
    crewSize?: number;
    laborHours?: number;
  } = {},
): LaborQuote | null {
  const def = SERVICE_LABOR_DEFAULTS[serviceCode];
  const sized = opts.jobSize && def?.jobSize ? def.jobSize[opts.jobSize] : null;

  let source: LaborQuote["source"];
  let crewSize: number;
  let laborHours: number;

  if (opts.crewSize != null && opts.laborHours != null) {
    crewSize = opts.crewSize;
    laborHours = opts.laborHours;
    source = "explicit";
  } else if (sized) {
    crewSize = opts.crewSize ?? sized.crew;
    laborHours = opts.laborHours ?? sized.hours;
    source = "jobSize";
  } else if (def) {
    crewSize = opts.crewSize ?? def.defaultCrew;
    laborHours = opts.laborHours ?? def.defaultHours;
    source = "default";
  } else if (opts.crewSize != null || opts.laborHours != null) {
    // Unknown service code but caller supplied at least one knob — honor it.
    crewSize = opts.crewSize ?? 1;
    laborHours = opts.laborHours ?? 1;
    source = "unknown";
  } else {
    return null;
  }

  // Defensive clamp: at least 1 mover, at least 0.25 hr (15-min minimum).
  // Amount uses 2-decimal rounding (matches the route layer's
  // toFixed(2) override) so unit tests, e2e pipeline, and the live
  // /api/bookings/quote response all agree on the same dollar figure.
  crewSize = Math.max(1, Math.round(crewSize));
  laborHours = Math.max(0.25, +laborHours.toFixed(2));
  const totalLaborHours = +(crewSize * laborHours).toFixed(2);
  const amount = +(totalLaborHours * LABOR_RATE_PER_HOUR).toFixed(2);
  return { crewSize, laborHours, totalLaborHours, ratePerHour: LABOR_RATE_PER_HOUR, amount, source };
}

/** Friendly "2 movers × 4 hrs" string for use in chat cards & line items.
 *  Singularises "mover" / "hr" when count is 1. */
export function formatLaborSummary(meta: { crewSize: number; laborHours: number }): string {
  const crewWord = meta.crewSize === 1 ? "mover" : "movers";
  const hrs = Number.isInteger(meta.laborHours)
    ? `${meta.laborHours}`
    : `${meta.laborHours}`;
  const hrWord = meta.laborHours === 1 ? "hr" : "hrs";
  return `${meta.crewSize} ${crewWord} × ${hrs} ${hrWord}`;
}

