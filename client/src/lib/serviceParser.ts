// Task #207 — Chat intake service parser.
//
// Deterministic keyword + simple intent matching. Takes free text from a
// customer chat plus optional structured chat answers and returns a small
// shape the chat overlay can hand straight to the booking wizard's URL
// prefill contract.
//
// This is intentionally a pure module — no React, no DOM, no network — so
// it can be swapped behind an LLM later without touching the chat UI.
//
// At the bottom of this file we colocate plain-assertion unit tests that
// run on demand via `runServiceParserTests()`. They are not wired into a
// formal test runner; the project doesn't have one. They exist so the
// next person editing this file can call the function in a REPL or stick
// a `if (import.meta.env.DEV) runServiceParserTests();` line somewhere
// to sanity-check changes.

export interface ParserAnswers {
  /** What the customer typed in the opening prompt. */
  freeText?: string;
  /** Quick-reply chip the customer tapped (catalog-style code or label). */
  pickedService?: string;
  /** Job size answer ("small", "medium", "large", or free text). */
  size?: string;
  /** Comma-separated list of add-on labels chosen via quick-reply. */
  addons?: string[];
  /** Timing answer ("asap", "this week", etc). */
  timing?: string;
}

export interface ParseResult {
  /** Catalog service codes (matches service_catalog.code). */
  services: string[];
  /** Bundle code if the matched cart looks like a known combo. */
  bundleHint?: string;
  /** Friendly job-size hint to seed Moving / Junk pickers. */
  jobSizeHint?: "small" | "medium" | "large";
}

// ── Keyword → catalog code map ────────────────────────────────────────────
// The first regex that matches a word in the free text adds that code to
// the result. Order matters only for tie-breaking on overlapping words —
// more specific patterns appear first.
const KEYWORD_MAP: Array<{ patterns: RegExp[]; code: string }> = [
  // trash valet first because "trash" alone shouldn't trigger junk
  {
    code: "trash_valet",
    patterns: [
      /\btrash\s*valet\b/i,
      /\b(weekly|curbside)\s*trash\b/i,
      /\bbin\s*pickup\b/i,
      /\broll[\s-]?out\s*(?:my\s*)?bins?\b/i,
    ],
  },
  {
    code: "moving",
    patterns: [
      /\bmov(e|ing|ers?)\b/i,
      /\brelocat(e|ing|ion)\b/i,
      /\b(load|unload).*(truck|uhaul|u-haul)\b/i,
      /\bhelp\s+(?:me\s+)?move\b/i,
    ],
  },
  {
    code: "junk_removal",
    patterns: [
      /\bjunk\b/i,
      /\bhaul[\s-]?(?:away|off)\b/i,
      /\b(debris|garbage)\s*(?:pickup|removal)?\b/i,
      /\bclean[\s-]?out\b/i,
      /\bget\s*rid\s*of\b/i,
    ],
  },
  {
    code: "cleaning",
    patterns: [
      /\bdeep\s*clean\b/i,
      /\bmove[\s-]?(?:in|out)\s*clean\b/i,
      /\b(?:house|home|apt|apartment)\s*clean(?:ing)?\b/i,
      /\bturnover\s*clean\b/i,
      /\bmaid\s*service\b/i,
      // generic "clean(ing)" is broad — keep last in this group
      /\bclean(?:ing)?\b/i,
    ],
  },
  {
    code: "lawn_care",
    patterns: [
      /\blawn\b/i,
      /\bmow(?:ing|er)?\b/i,
      /\bgrass\b/i,
      /\byard\s*work\b/i,
      /\b(?:hedge|bush)\s*trim/i,
    ],
  },
  {
    code: "snow_removal",
    patterns: [
      /\bsnow\b/i,
      /\bplow(?:ing)?\b/i,
      /\bshovel(?:ing)?\b/i,
      /\bdriveway\s*(?:clear|clean)/i,
    ],
  },
  {
    code: "window_cleaning",
    patterns: [
      /\bwindow(?:s)?\s*(?:clean|wash)/i,
      /\bclean\s+my\s+windows?\b/i,
    ],
  },
  {
    code: "handyman",
    patterns: [
      /\bhandy\s*man\b/i,
      /\bfix\s+(?:my|the|a)\b/i,
      /\brepair\b/i,
      /\b(install|hang|mount)\s+/i,
      /\bdrywall\s*(?:patch|repair)\b/i,
      /\bodd\s*jobs?\b/i,
    ],
  },
  {
    code: "demolition",
    patterns: [
      /\bdemo(?:lition)?\b/i,
      /\btear[\s-]?(?:out|down)\b/i,
      /\bknock\s*down\b/i,
      /\brip\s*out\b/i,
    ],
  },
  {
    code: "flooring",
    patterns: [
      /\bfloor(?:ing|s)?\b/i,
      /\b(hardwood|laminate|vinyl\s*plank|lvp|tile|carpet)\b/i,
    ],
  },
  {
    code: "painting",
    patterns: [
      /\bpaint(?:ing|er|ers)?\b/i,
      /\brepaint\b/i,
    ],
  },
  {
    code: "roofing",
    patterns: [
      /\broof(?:ing|er)?\b/i,
      /\bshingle/i,
    ],
  },
  {
    code: "delivery",
    patterns: [
      /\bdeliver(?:y|ing)?\b/i,
      /\bpick\s*up\s+and\s+drop\s*off\b/i,
    ],
  },
  {
    code: "labor",
    patterns: [
      /\bextra\s+(?:set\s+of\s+)?hands?\b/i,
      /\b(?:hourly\s+)?helpers?\b/i,
      /\blabor(?:ers?)?\b/i,
    ],
  },
];

// Quick-reply chip label → catalog code. Mirrors the chip set on the
// home hero so taps go straight to a known service without re-parsing.
const CHIP_TO_CODE: Record<string, string> = {
  Moving: "moving",
  Junk: "junk_removal",
  "Junk Removal": "junk_removal",
  Cleaning: "cleaning",
  Lawn: "lawn_care",
  "Lawn Care": "lawn_care",
  Snow: "snow_removal",
  "Snow Removal": "snow_removal",
  Handyman: "handyman",
  Window: "window_cleaning",
  "Window Cleaning": "window_cleaning",
  "Trash Valet": "trash_valet",
  Demolition: "demolition",
  Flooring: "flooring",
  Painting: "painting",
  Roofing: "roofing",
  "Move Cleaning": "move_cleaning",
  Delivery: "delivery",
  Labor: "labor",
};

// Bundle hints: if the parsed cart is a *superset* of one of these
// signature combos, surface the matching bundle code so the chat can
// display the bundle name confidently before the live quote endpoint
// confirms it. The actual discount is always applied server-side by the
// existing bundle engine — we never invent a discount in the UI.
const BUNDLE_HINT_RULES: Array<{ requires: string[]; code: string }> = [
  { requires: ["moving", "junk_removal"], code: "move_junk_reset" },
  { requires: ["junk_removal", "cleaning"], code: "junk_deep_clean_turnover" },
  { requires: ["moving", "painting"], code: "move_paint_refresh" },
  { requires: ["demolition", "flooring"], code: "demo_flooring_replace" },
  { requires: ["snow_removal"], code: "snow_walkway_priority" },
  { requires: ["labor", "delivery"], code: "labor_delivery_assembly" },
];

// Add-on chip label → catalog code mapping for the "ask_addons" step.
// The chip set is curated so a customer never sees an add-on whose
// service code isn't in the live catalog.
export const ADDON_CHIPS: Array<{ label: string; code: string }> = [
  { label: "🗑️ Junk haul-away", code: "junk_removal" },
  { label: "🧹 Cleaning", code: "cleaning" },
  { label: "🪟 Window cleaning", code: "window_cleaning" },
  { label: "🔧 Handyman", code: "handyman" },
  { label: "🌿 Lawn touch-up", code: "lawn_care" },
];

function detectSize(text: string | undefined): ParseResult["jobSizeHint"] {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (
    /\b(huge|massive|whole\s*house|full\s*house|4\s*bed|4\+\s*bed|five\s*bed|5\s*bed|big\s*house|3\s*bed|three\s*bed)/.test(t)
  ) return "large";
  if (
    /\b(tiny|small|just\s*a\s*few|couple\s*(?:of\s*)?(?:items|things)|single\s*item|one\s*item|few\s*items|studio|1\s*bed|one\s*bed)\b/.test(t)
  ) return "small";
  if (/\b(medium|2\s*bed|two\s*bed|apartment|apt|condo|townhouse)\b/.test(t)) return "medium";
  // fall back on the explicit size answer if the customer used the chip
  if (t === "small") return "small";
  if (t === "medium") return "medium";
  if (t === "large") return "large";
  return undefined;
}

/** Resolve a chip label or catalog code to a catalog code. */
export function chipToServiceCode(chip: string): string | undefined {
  if (CHIP_TO_CODE[chip]) return CHIP_TO_CODE[chip];
  // pass-through if the caller already supplied a code
  if (Object.values(CHIP_TO_CODE).includes(chip)) return chip;
  return undefined;
}

/** Main entry point. Returns a sorted, de-duplicated set of service codes
 *  plus optional bundle/size hints. Never throws — empty/garbage input
 *  yields `{ services: [] }` so callers can show the empty-match fallback. */
export function parseJobIntake(answers: ParserAnswers): ParseResult {
  const services = new Set<string>();

  // 1. quick-reply chip seed
  if (answers.pickedService) {
    const code = chipToServiceCode(answers.pickedService);
    if (code) services.add(code);
  }

  // 2. add-on chips from the addons step
  if (answers.addons) {
    for (const addonLabel of answers.addons) {
      const code = chipToServiceCode(addonLabel);
      if (code) services.add(code);
      else {
        // also accept raw codes / addon-chip labels
        const found = ADDON_CHIPS.find((c) => c.label === addonLabel || c.code === addonLabel);
        if (found) services.add(found.code);
      }
    }
  }

  // 3. free-text keyword scan
  const text = (answers.freeText || "").trim();
  if (text) {
    for (const { patterns, code } of KEYWORD_MAP) {
      if (patterns.some((re) => re.test(text))) services.add(code);
    }
  }

  const list = Array.from(services).sort();

  // 4. bundle hint — most specific first (longest required list wins)
  let bundleHint: string | undefined;
  const sortedRules = [...BUNDLE_HINT_RULES].sort((a, b) => b.requires.length - a.requires.length);
  for (const rule of sortedRules) {
    if (rule.requires.every((c) => list.includes(c))) {
      bundleHint = rule.code;
      break;
    }
  }

  // 5. job-size hint pulled from free text + explicit size answer
  const jobSizeHint = detectSize(answers.size) ?? detectSize(text);

  return { services: list, bundleHint, jobSizeHint };
}

/** Friendly label rendered on the recommended-plan card for each detected
 *  service. Falls back to the catalog name when we don't have a custom one.
 *
 *  Task #218 — When the server-quoted line carries crewSize/laborHours,
 *  prefer those numbers in the heading so the card matches the actual
 *  pricing math (crew × hours × $85). When they're absent (parser-only
 *  preview before the quote returns), fall back to a jobSize-driven
 *  label. */
export function friendlyServiceLabel(
  code: string,
  opts?: { jobSize?: ParseResult["jobSizeHint"]; crewSize?: number; laborHours?: number },
): string {
  const size = opts?.jobSize;
  const crew = opts?.crewSize;
  const hrs = opts?.laborHours;
  const hasLabor = typeof crew === "number" && crew > 0
    && typeof hrs === "number" && hrs > 0;

  switch (code) {
    case "moving": {
      if (hasLabor) {
        const moverWord = crew === 1 ? "Mover" : "Movers";
        const hrsLabel = Number.isInteger(hrs) ? `${hrs}` : hrs!.toFixed(1);
        return `🚛 ${crew} ${moverWord} (${hrsLabel} hrs)`;
      }
      if (size === "small") return "🚛 2 Movers (2 hrs)";
      if (size === "large") return "🚛 4 Movers (4 hrs)";
      return "🚛 2 Movers (4 hrs)";
    }
    case "junk_removal": {
      if (hasLabor) {
        const crewWord = crew === 1 ? "Crew" : "Crew of " + crew;
        return `🗑️ ${crewWord} (${hrs} hrs haul-off)`;
      }
      if (size === "large") return "🗑️ Full truckload haul-off";
      return "🗑️ Junk haul-away";
    }
    case "cleaning":
    case "move_cleaning":
      if (hasLabor) return `🧹 ${crew} Cleaners (${hrs} hrs)`;
      return code === "move_cleaning" ? "🧹 Move-Out / Deep Clean" : "🧹 Cleaning visit";
    case "lawn_care":
      if (hasLabor) return `🌿 Lawn Care (${hrs} hr visit)`;
      return "🌿 Lawn Care visit";
    case "snow_removal":     return "❄️ Snow Removal";
    case "window_cleaning":
      if (hasLabor) return `🪟 Window Cleaning (${hrs} hrs)`;
      return "🪟 Window Cleaning";
    case "handyman":
      if (hasLabor) return `🔧 Handyman (${hrs} hrs)`;
      return "🔧 Handyman visit";
    case "trash_valet":
      if (hasLabor) return `♻️ Trash Valet (${hrs} hr/visit)`;
      return "♻️ Trash Valet (weekly)";
    case "demolition":
      if (hasLabor) return `⚒️ Demolition Crew (${hrs} hrs)`;
      return "⚒️ Light Demolition";
    case "flooring":         return "🪵 Flooring";
    case "painting":         return "🎨 Painting";
    case "roofing":          return "🏠 Roofing";
    case "labor":
      if (hasLabor) return `💪 ${crew} Helpers (${hrs} hrs)`;
      return "💪 Labor / extra hands";
    case "delivery":
      if (hasLabor) return `🚚 Delivery (${crew}-person crew, ${hrs} hrs)`;
      return "🚚 Delivery";
    case "assembly":
      if (hasLabor) return `🛠️ Assembly (${hrs} hrs)`;
      return "🛠️ Assembly";
    default:                 return code;
  }
}

/** Format the secondary "Based on N movers × M hrs at $85/hr" subline.
 *  Returns null when the line is not labor-priced. */
export function formatLaborBreakdownLine(opts: {
  crewSize?: number;
  laborHours?: number;
  ratePerHour?: number;
}): string | null {
  const crew = opts.crewSize;
  const hrs = opts.laborHours;
  const rate = opts.ratePerHour ?? 85;
  if (typeof crew !== "number" || crew <= 0) return null;
  if (typeof hrs !== "number" || hrs <= 0) return null;
  const crewWord = crew === 1 ? "person" : "people";
  const hrsLabel = Number.isInteger(hrs) ? `${hrs}` : hrs.toFixed(1);
  return `Based on ${crew} ${crewWord} × ${hrsLabel} hrs at $${rate}/hr`;
}

/** Bundle code → display name lookup. Used when the parser hints a bundle
 *  before the live quote endpoint confirms it. */
export function bundleHintName(code: string): string {
  switch (code) {
    case "move_junk_reset":         return "Move + Junk Reset";
    case "move_assembly_finish":    return "Move + Assembly Finish";
    case "junk_deep_clean_turnover": return "Junk + Deep Clean Turnover";
    case "labor_delivery_assembly": return "Labor + Delivery + Assembly";
    case "snow_walkway_priority":   return "Snow + Walkway Priority";
    case "move_paint_refresh":      return "Move + Paint Refresh";
    case "demo_flooring_replace":   return "Demo + New Flooring";
    default:                        return code;
  }
}

// ── Tests (plain assertion functions, no test framework) ──────────────────
function _assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`serviceParser test failed: ${msg}`);
}
function _arrayEq(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Run the colocated assertion tests. Returns the number of tests passed
 *  and throws on the first failure with a useful message. */
export function runServiceParserTests(): number {
  let passed = 0;

  // Free-text moving
  const r1 = parseJobIntake({ freeText: "I need help moving from my apartment" });
  _assert(r1.services.includes("moving"), "freeText 'moving' → moving");
  passed++;

  // Free-text moving + junk → bundle hint
  const r2 = parseJobIntake({ freeText: "Moving out and have a pile of junk to haul" });
  _assert(_arrayEq(r2.services, ["junk_removal", "moving"]), "moving + junk both detected");
  _assert(r2.bundleHint === "move_junk_reset", "moving+junk bundle hint");
  passed++;

  // Junk + cleaning bundle (deliberately no "move-out" wording — that
  // would also trigger the moving keyword and bump the cart into the
  // moving + junk bundle space)
  const r3 = parseJobIntake({ freeText: "Need junk haul-away and a deep clean before the new tenant" });
  _assert(r3.services.includes("junk_removal") && r3.services.includes("cleaning"),
    "junk + clean both detected");
  _assert(r3.bundleHint === "junk_deep_clean_turnover", "junk+cleaning bundle hint");
  passed++;

  // Window cleaning isolated (shouldn't also trigger generic cleaning)
  const r4 = parseJobIntake({ freeText: "Just need windows washed" });
  _assert(r4.services.includes("window_cleaning"), "window_cleaning detected");
  passed++;

  // Trash valet isolated (shouldn't trigger junk_removal)
  const r5 = parseJobIntake({ freeText: "Sign me up for trash valet weekly pickup" });
  _assert(_arrayEq(r5.services, ["trash_valet"]), "trash valet only, no junk_removal");
  passed++;

  // Chip seed
  const r6 = parseJobIntake({ pickedService: "Snow" });
  _assert(_arrayEq(r6.services, ["snow_removal"]), "Snow chip → snow_removal");
  _assert(r6.bundleHint === "snow_walkway_priority", "snow → walkway priority hint");
  passed++;

  // Add-on chips combine with seed
  const r7 = parseJobIntake({ pickedService: "Moving", addons: ["🗑️ Junk haul-away"] });
  _assert(r7.services.includes("moving") && r7.services.includes("junk_removal"),
    "Moving chip + junk addon → both");
  _assert(r7.bundleHint === "move_junk_reset", "addon-chip path produces bundle hint");
  passed++;

  // Job size from free text
  const r8 = parseJobIntake({ freeText: "Moving a 4 bedroom house" });
  _assert(r8.jobSizeHint === "large", "4 bed → large");
  passed++;

  // Job size from explicit answer
  const r9 = parseJobIntake({ freeText: "Moving", size: "small" });
  _assert(r9.jobSizeHint === "small", "explicit size answer wins");
  passed++;

  // Empty input → empty result, no bundle invented
  const r10 = parseJobIntake({ freeText: "" });
  _assert(r10.services.length === 0 && !r10.bundleHint, "empty → empty");
  passed++;

  // Garbage / unrecognized → empty
  const r11 = parseJobIntake({ freeText: "asdfqwer xyz" });
  _assert(r11.services.length === 0, "garbage → empty");
  passed++;

  // Painting recognized
  const r12 = parseJobIntake({ freeText: "Need a painter for the living room" });
  _assert(r12.services.includes("painting"), "painting detected");
  passed++;

  // Demolition recognized
  const r13 = parseJobIntake({ freeText: "Tear out the kitchen cabinets" });
  _assert(r13.services.includes("demolition"), "demolition detected");
  passed++;

  // Handyman recognized
  const r14 = parseJobIntake({ freeText: "Can you fix the bathroom faucet?" });
  _assert(r14.services.includes("handyman"), "handyman detected");
  passed++;

  // Lawn recognized
  const r15 = parseJobIntake({ freeText: "Mow my lawn next week" });
  _assert(r15.services.includes("lawn_care"), "lawn detected");
  passed++;

  // Move + paint bundle hint (Task #212)
  const r16 = parseJobIntake({ freeText: "We're moving in next week and want to repaint before our stuff arrives" });
  _assert(r16.services.includes("moving") && r16.services.includes("painting"),
    "moving + painting both detected");
  _assert(r16.bundleHint === "move_paint_refresh", "moving+painting bundle hint");
  passed++;

  // Demo + flooring bundle hint (Task #212)
  const r17 = parseJobIntake({ freeText: "Tear out the carpet and put down LVP flooring" });
  _assert(r17.services.includes("demolition") && r17.services.includes("flooring"),
    "demolition + flooring both detected");
  _assert(r17.bundleHint === "demo_flooring_replace", "demolition+flooring bundle hint");
  passed++;

  return passed;
}
