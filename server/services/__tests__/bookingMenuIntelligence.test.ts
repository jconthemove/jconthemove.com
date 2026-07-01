import assert from "node:assert/strict";
import { extractBookingMenuIntelligence } from "../../../client/src/lib/booking-menu-intelligence";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

console.log("bookingMenuIntelligence()");

test("uses frozen marketplace source flow when item-level source signals are missing", () => {
  const result = extractBookingMenuIntelligence({
    marketplaceSourceFlow: {
      source: "U-Haul + MovingHelp + MovingHelper",
      companyControl: "Manage rates by zone, crew size, minimum hours, discount threshold, and travel.",
    },
    requestedItems: [
      {
        serviceCode: "moving",
        serviceLabel: "Moving Help",
        details: {
          packageLabel: "2 movers / 3 hours",
          crew: 2,
          hours: 3,
        },
      },
    ],
  });

  assert.equal(result?.sourceSignal, "U-Haul + MovingHelp + MovingHelper");
  assert.equal(result?.operationsSignal, "Manage rates by zone, crew size, minimum hours, discount threshold, and travel.");
  assert.equal(result?.packageLabel, "2 movers / 3 hours");
  assert.equal(result?.crew, 2);
  assert.equal(result?.hours, 3);
});

test("can render a source-flow-only snapshot as useful card intelligence", () => {
  const result = extractBookingMenuIntelligence({
    marketplaceSourceFlow: {
      source: "Facebook + Craigslist",
      automationHook: "Ad creator, Discord/webhook reminders, and quote attribution.",
    },
    marketplaceQuotePreview: {
      estimateLabel: "$500 - $750",
    },
  }, "Moving Request");

  assert.equal(result?.serviceLabel, "Moving Request");
  assert.equal(result?.sourceSignal, "Facebook + Craigslist");
  assert.equal(result?.operationsSignal, "Ad creator, Discord/webhook reminders, and quote attribution.");
  assert.equal(result?.range, "$500 - $750");
});

console.log(`bookingMenuIntelligence(): ${passed} test(s) passed`);
