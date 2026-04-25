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
// 1 × 0.5 × 85 = $42.50, rounded for display = $43.
eq("lawn care = 1 person × 0.5 hr ≈ $43",
  { crew: lawn?.crewSize, hrs: lawn?.laborHours, $: lawn?.amount },
  { crew: 1, hrs: 0.5, $: 43 });

const valet = quoteByLaborHours("trash_valet");
// 1 × 0.33 × 85 = $28.05 → rounded $28.
eq("trash valet = 1 person × 0.33 hr ≈ $28",
  { crew: valet?.crewSize, hrs: valet?.laborHours, $: valet?.amount },
  { crew: 1, hrs: 0.33, $: 28 });

eq("explicit override honors caller's crew/hrs (source='explicit')",
  quoteByLaborHours("moving", { crewSize: 3, laborHours: 5 }),
  { crewSize: 3, laborHours: 5, totalLaborHours: 15, ratePerHour: 85, amount: 1275, source: "explicit" });

eq("formatLaborSummary copies the line we render in the chat card",
  formatLaborSummary({ crewSize: 2, laborHours: 4 }),
  "2 movers × 4 hrs");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll labor-hours pricing assertions passed.");
}
