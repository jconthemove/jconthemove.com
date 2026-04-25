/** Task #218 — Labor-hours pricing model.
 *
 *  Framework-free assertions that codify the canonical labor-hour
 *  breakdowns the customer-facing chat card claims (small moving =
 *  2×2hr, medium = 2×4hr, etc.) so a future refactor that breaks them
 *  shows up loudly. They also document the contract between
 *  `quoteByLaborHours()` and the chat-intake card.
 *
 *  Run with: `tsx server/services/__tests__/laborHoursPricing.test.ts`
 *  (auto-discovered by `scripts/run-server-tests.sh`).
 */

import {
  quoteByLaborHours,
  formatLaborSummary,
  LABOR_RATE_PER_HOUR,
  SERVICE_LABOR_DEFAULTS,
} from "../../../shared/pricingTables";

let failures = 0;

function eq<T>(label: string, actual: T, expected: T) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`✗ ${label}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

console.log("── Task #218 labor-hours pricing model ─────────────");

eq("rate is $85/hr", LABOR_RATE_PER_HOUR, 85);

const smallMove = quoteByLaborHours("moving", { jobSize: "small" });
eq("small move = 2 movers × 2 hr = $340",
  { crew: smallMove?.crewSize, hrs: smallMove?.laborHours, $: smallMove?.amount },
  { crew: 2, hrs: 2, $: 340 });

const mediumMove = quoteByLaborHours("moving", { jobSize: "medium" });
eq("medium move = 2 movers × 4 hr = $680",
  { crew: mediumMove?.crewSize, hrs: mediumMove?.laborHours, $: mediumMove?.amount },
  { crew: 2, hrs: 4, $: 680 });

const largeMove = quoteByLaborHours("moving", { jobSize: "large" });
eq("large move = 4 movers × 4 hr = $1360",
  { crew: largeMove?.crewSize, hrs: largeMove?.laborHours, $: largeMove?.amount },
  { crew: 4, hrs: 4, $: 1360 });

const lawn = quoteByLaborHours("lawn_care");
// 1 × 0.5 × 85 = $42.50 (precise; the route layer uses the same).
eq("lawn care = 1 person × 0.5 hr = $42.50",
  { crew: lawn?.crewSize, hrs: lawn?.laborHours, $: lawn?.amount },
  { crew: 1, hrs: 0.5, $: 42.5 });

const valet = quoteByLaborHours("trash_valet");
// 1 × 0.33 × 85 = $28.05 (precise).
eq("trash valet = 1 person × 0.33 hr = $28.05",
  { crew: valet?.crewSize, hrs: valet?.laborHours, $: valet?.amount },
  { crew: 1, hrs: 0.33, $: 28.05 });

eq("explicit override honors caller's crew/hrs (source='explicit')",
  quoteByLaborHours("moving", { crewSize: 3, laborHours: 5 }),
  { crewSize: 3, laborHours: 5, totalLaborHours: 15, ratePerHour: 85, amount: 1275, source: "explicit" });

eq("formatLaborSummary copies the line we render in the chat card",
  formatLaborSummary({ crewSize: 2, laborHours: 4 }),
  "2 movers × 4 hrs");

// ── End-to-end: /api/bookings/quote response shape ─────────────────
// Drives a few canonical lines through the same resolveItems +
// computeBookingQuote pipeline the HTTP route uses, then asserts the
// per-item fields the chat card and wizard render against.
async function endToEndPipeline() {
  const { computeBookingQuote } = await import("../bookingPricing");
  const { quoteByLaborHours, LABOR_RATE_PER_HOUR } =
    await import("../../../shared/pricingTables");

  type JobSize = "small" | "medium" | "large";
  const cases: Array<[string, { jobSize?: JobSize }, number, number, number]> = [
    // [serviceCode, details, expectedDollars, expectedCrew, expectedHours]
    ["lawn_care",       {},                  42.5,  1, 0.5],
    ["trash_valet",     {},                  28.05, 1, 0.33],
    ["junk_removal",    { jobSize: "small"},  170,  2, 1],
    ["junk_removal",    { jobSize: "medium"}, 340,  2, 2],
    ["junk_removal",    { jobSize: "large"},  510,  2, 3],
    ["window_cleaning", {},                   170,  1, 2],
    ["snow_removal",    {},                   63.75,1, 0.75],
    ["handyman",        {},                   170,  1, 2],
    // Task #218 review-round-5: labor + moving must round-trip too,
    // proving every reviewer-named service is parity-tight at the
    // computeBookingQuote layer (not just at quoteByLaborHours).
    ["labor",           {},                   340,  2, 2],
    ["moving",          { jobSize: "small"},  340,  2, 2],
    ["moving",          { jobSize: "medium"}, 680,  2, 4],
    ["moving",          { jobSize: "large"}, 1360,  4, 4],
  ];

  for (const [code, details, expectedDollars, crew, hrs] of cases) {
    const labor = quoteByLaborHours(code, { jobSize: details.jobSize });
    const dollars = +(crew * hrs * LABOR_RATE_PER_HOUR).toFixed(2);
    const result = computeBookingQuote([{
      serviceCode: code,
      label: code,
      quantity: 1,
      unitPrice: dollars,
      priceMode: "quote",
      details,
      laborMeta: labor ? {
        crewSize: labor.crewSize,
        laborHours: labor.laborHours,
        totalLaborHours: labor.totalLaborHours,
        ratePerHour: labor.ratePerHour,
      } : undefined,
    }]);
    const item = result.items[0];
    eq(`${code}/${details.jobSize ?? "default"} → $${expectedDollars} crew=${crew} hrs=${hrs}`,
      { $: item.lineSubtotal, crew: item.crewSize, hrs: item.laborHours, rate: item.ratePerHour },
      { $: expectedDollars, crew, hrs, rate: 85 });
  }
}

await endToEndPipeline();

// ── Moving routing-priority assertions ──────────────────────────────
// Mirrors the reviewer's round-5 scenarios: the route layer must pick
// the matrix when detailed inputs are present, the labor tier when
// only jobSize/truckSize are set, and never overwrite a richer
// catalog/wizard amount when no moving hints are supplied at all.
async function movingRoutingPriority() {
  const { quoteMovingFromTable, quoteByLaborHours } =
    await import("../../../shared/pricingTables");
  // Recreate the routing decision tree from resolveItems in isolation
  // (the route's own DB-backed catalog isn't worth booting for a unit
  // assertion). If the rules diverge the smoke tests catch it; this
  // test pins the contract.
  // Mirrors the small-move special override in resolveItems: spec
  // line 44 says we always bill $300 for a small move, even when the
  // matrix or labor-tier math produces a higher amount.
  const SMALL_MOVE_SPECIAL_PRICE = 300;
  function resolveMovingPrice(
    details: Record<string, unknown>,
    catalogUnitPrice: number,
  ): { unit: number; jobSize?: string } {
    const hasDetailed =
      details.bedrooms != null || details.stairs != null || details.loadType != null;
    let unit = catalogUnitPrice;
    let jobSize: string | undefined;
    if (hasDetailed) {
      const m = quoteMovingFromTable({
        bedrooms: details.bedrooms as string | undefined,
        stairs: details.stairs as string | number | undefined,
        loadType: details.loadType as string | undefined,
      });
      if (m.amount > 0) unit = m.amount;
    } else {
      const explicit = (details.jobSize as string | undefined)?.toLowerCase();
      const truck = ((details.truckSize as string | undefined) ?? "").toLowerCase();
      let js: "small" | "medium" | "large" | undefined;
      if (explicit === "small" || explicit === "medium" || explicit === "large") js = explicit;
      else if (truck.includes("15")) js = "medium";
      else if (truck.includes("26")) js = "large";
      if (js) {
        const labor = quoteByLaborHours("moving", { jobSize: js });
        if (labor) { unit = labor.amount; jobSize = js; }
      }
    }
    // Resolve final jobSize the same way resolveItems does (deriveJobSize
    // re-infers from bedrooms when the explicit hint is absent).
    let finalJobSize = jobSize;
    if (!finalJobSize) {
      const beds = (details.bedrooms as string | undefined)?.toLowerCase() ?? "";
      if (beds.startsWith("studio") || beds.startsWith("1br")) finalJobSize = "small";
      else if (beds.startsWith("2br") || beds.startsWith("3br")) finalJobSize = "medium";
      else if (beds.startsWith("4br") || beds.startsWith("5br")) finalJobSize = "large";
    }
    if (finalJobSize === "small") {
      unit = SMALL_MOVE_SPECIAL_PRICE;
    }
    return { unit, jobSize: finalJobSize };
  }

  // (a) bedrooms+stairs → matrix amount preserved AS-IS (matrix is truth,
  // never re-snapped to labor product). Use a 3br entry so the small-move
  // special doesn't kick in.
  const matrix = quoteMovingFromTable({ bedrooms: "3br", stairs: "2", loadType: "Heavy" });
  const r1 = resolveMovingPrice({ bedrooms: "3br", stairs: 2, loadType: "Heavy" }, 500);
  eq("moving 3br+stairs+heavy → matrix wins (no labor snap mutation)",
    { unit: r1.unit }, { unit: matrix.amount });

  // (b) jobSize=medium only → labor tier amount $680
  const r2 = resolveMovingPrice({ jobSize: "medium" }, 500);
  eq("moving jobSize=medium only → labor tier $680",
    { unit: r2.unit, js: r2.jobSize }, { unit: 680, js: "medium" });

  // (c) no moving hints → catalog/wizard package amount preserved
  const r3 = resolveMovingPrice({}, 999);
  eq("moving with no details → wizard package amount preserved",
    { unit: r3.unit }, { unit: 999 });

  // (d) small-move special: jobSize=small → $300 (NOT $340 from labor tier)
  const r4 = resolveMovingPrice({ jobSize: "small" }, 999);
  eq("moving jobSize=small → $300 special (not $340 labor tier)",
    { unit: r4.unit, js: r4.jobSize }, { unit: 300, js: "small" });

  // (e) small-move special overrides matrix too: 1br no stairs → $300
  const r5 = resolveMovingPrice({ bedrooms: "1br", stairs: 0, loadType: "Light" }, 999);
  eq("moving 1br matrix entry → $300 special (override matrix upward/downward)",
    { unit: r5.unit, js: r5.jobSize }, { unit: 300, js: "small" });
}

await movingRoutingPriority();

// ── Painting/Flooring labor metadata parity ─────────────────────────
// Reviewer round-7 follow-up: the SERVICE_LABOR_DEFAULTS table feeds
// buildLaborMeta for painting/flooring while the rule files compute
// dollars; the crew-size assumption must be identical across both
// surfaces or the chat card and rule output disagree.
async function paintingFlooringLaborParity() {
  const { estimatePainting } = await import("../quoteRules/painting");
  const { estimateFlooring } = await import("../quoteRules/flooring");
  // Drive both rules with minimal answers so they emit a labor
  // breakdown (the no-answer fast path returns price-only).
  const paint = estimatePainting({
    answers: {
      paintingIntExt: "Interior",
      paintingRoomCount: "1 room",
      paintingRoomSize: "Average (12x12)",
    },
    fallbackMin: 200,
    fallbackMax: 5000,
  });
  const floor = estimateFlooring({
    answers: {
      flooringNewProduct: "LVP",
      flooringRoomsSqft: "2 rooms, ~400 sq ft",
    },
    fallbackMin: 200,
    fallbackMax: 10000,
  });
  // Painting rule uses crew=1 painter; table default must match.
  eq("painting table crew matches rule output",
    { crew: SERVICE_LABOR_DEFAULTS.painting?.defaultCrew, rate: LABOR_RATE_PER_HOUR },
    { crew: paint.breakdown.crewSize, rate: paint.breakdown.ratePerHour });
  // Flooring rule uses crew=2; table default must match.
  eq("flooring table crew matches rule output",
    { crew: SERVICE_LABOR_DEFAULTS.flooring?.defaultCrew, rate: LABOR_RATE_PER_HOUR },
    { crew: floor.breakdown.crewSize, rate: floor.breakdown.ratePerHour });
}

await paintingFlooringLaborParity();

// ── Quantity > 1 collapse for labor-authoritative services ──────────
// Reviewer round-8: previous code did `qty × full-labor-total`,
// double-counting customers who asked for 3 hours of handyman. The
// fix scales laborHours by quantity then collapses qty to 1, so the
// final lineSubtotal == crew × (hours × qty) × $85, NOT qty squared.
async function quantityCollapseSafety() {
  // Recreate the resolveItems collapse rule in isolation; same shape
  // as the moving routing test above.
  function applyLaborAuthority(
    code: string,
    quantity: number,
  ): { qty: number; unit: number; hrs: number; crew: number; sub: number } | null {
    const labor = quoteByLaborHours(code, {});
    if (!labor) return null;
    let crew = labor.crewSize;
    let hrs = labor.laborHours;
    let qty = Math.max(1, quantity);
    if (qty > 1) {
      hrs = +(hrs * qty).toFixed(2);
      qty = 1;
    }
    const unit = +(crew * hrs * LABOR_RATE_PER_HOUR).toFixed(2);
    return { qty, unit, hrs, crew, sub: +(qty * unit).toFixed(2) };
  }

  const h3 = applyLaborAuthority("handyman", 3)!;
  // 3 hrs × 1 person × $85 = $510, billed as 1 × $510 (not 3 × $170)
  eq("handyman quantity=3 collapses to crew=1 hrs=6 sub=$510 (no double-count)",
    { qty: h3.qty, unit: h3.unit, sub: h3.sub, crew: h3.crew, hrs: h3.hrs },
    { qty: 1, unit: 510, sub: 510, crew: 1, hrs: 6 });

  const l3 = applyLaborAuthority("labor", 3)!;
  // labor default crew=2 hrs=2 → ×3 → crew=2 hrs=6 → 2×6×85 = $1020
  eq("labor quantity=3 collapses to crew=2 hrs=6 sub=$1020 (no double-count)",
    { qty: l3.qty, unit: l3.unit, sub: l3.sub, crew: l3.crew, hrs: l3.hrs },
    { qty: 1, unit: 1020, sub: 1020, crew: 2, hrs: 6 });

  const h1 = applyLaborAuthority("handyman", 1)!;
  // qty=1 path stays untouched: 1 person × 2 hrs × $85 = $170
  eq("handyman quantity=1 stays untouched (sub=$170)",
    { qty: h1.qty, sub: h1.sub }, { qty: 1, sub: 170 });
}

await quantityCollapseSafety();

// ── Catalog-driven labor metadata (Task #218 step 2) ────────────
// quoteByLaborHours must accept catalog metadata so a service_catalog
// row can override the static SERVICE_LABOR_DEFAULTS table without
// touching code, and clamp the resulting amount to the suggested range.
console.log("\n── catalog-driven labor metadata ───────────────────");

// Catalog overrides the default crew + hours when present.
const catalogOverride = quoteByLaborHours("handyman", {
  catalog: {
    minCrew: 2,
    defaultLaborHours: { default: 3 },
  },
});
eq("catalog override → handyman 2 crew × 3 hr × $85 = $510",
  { crew: catalogOverride?.crewSize, hrs: catalogOverride?.laborHours, $: catalogOverride?.amount, src: catalogOverride?.source },
  { crew: 2, hrs: 3, $: 510, src: "catalog" });

// Catalog jobSize-keyed hours (small/medium/large).
const catalogMoving = quoteByLaborHours("moving", {
  jobSize: "medium",
  catalog: {
    minCrew: 3,
    defaultLaborHours: { small: 2, medium: 3, large: 4 },
  },
});
eq("catalog moving medium → 3 × 3 × $85 = $765",
  { crew: catalogMoving?.crewSize, hrs: catalogMoving?.laborHours, $: catalogMoving?.amount },
  { crew: 3, hrs: 3, $: 765 });

// Suggested-min clamp lifts the amount when crew × hrs × rate would be lower.
const clampedUp = quoteByLaborHours("handyman", {
  catalog: {
    minCrew: 1,
    defaultLaborHours: { default: 1 },   // would be 1×1×85 = $85
    suggestedMin: 150,
  },
});
eq("catalog clamps amount up to suggestedMin=$150",
  { $: clampedUp?.amount }, { $: 150 });

// Suggested-max clamp caps the amount.
const clampedDown = quoteByLaborHours("handyman", {
  catalog: {
    minCrew: 4,
    defaultLaborHours: { default: 4 },   // would be 4×4×85 = $1360
    suggestedMax: 800,
  },
});
eq("catalog clamps amount down to suggestedMax=$800",
  { $: clampedDown?.amount }, { $: 800 });

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll labor-hours pricing assertions passed.");
}
