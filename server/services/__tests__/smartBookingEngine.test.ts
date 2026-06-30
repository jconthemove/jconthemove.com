import assert from "node:assert/strict";
import {
  applySmartBookingAnswer,
  inferSmartBookingText,
  shouldSkipSmartBookingStep,
} from "../../../shared/smartBookingEngine";

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

console.log("smartBookingEngine()");

test("infers a moving quote shape from one customer sentence", () => {
  const inferred = inferSmartBookingText(
    "49938 Friday unload only, customer U-Haul 26 foot, 3 movers 2 hours",
  );

  assert.equal(inferred.serviceType, "Moving");
  assert.equal(inferred.fromZip, "49938");
  assert.equal(inferred.moveDate, "Friday");
  assert.equal(inferred.loadType, "Unload only");
  assert.equal(inferred.truckSituation, "Customer provides truck or no truck needed");
  assert.equal(inferred.truckSize, "26' truck");
  assert.equal(inferred.selectedMovingRecCrew, "3");
  assert.equal(inferred.selectedMovingRecHours, "2");
  assert.equal(inferred.selectedMovingRecLabel, "3 movers / 2 hours");
  assert.equal(inferred.selectedMovingRec, "moving_3m_2h");
  assert.equal(inferred.selectedMovingRecTotalMin, "400");
  assert.equal(inferred.selectedMovingRecTotalMax, "550");
});

test("applies smart answers without overwriting explicit crew choices", () => {
  const patch = applySmartBookingAnswer(
    { serviceType: "Moving", selectedMovingRecCrew: "4", selectedMovingRecHours: "4" },
    "notes",
    "Ironwood 49938 load and unload, customer rental 15 ft, 2 movers 3 hours",
  );

  assert.equal(patch.answers.fromZip, "49938");
  assert.equal(patch.answers.loadType, "Both - load AND unload");
  assert.equal(patch.answers.truckSituation, "Customer provides truck or no truck needed");
  assert.equal(patch.answers.truckSize, "15' truck");
  assert.equal(patch.answers.selectedMovingRecCrew, "4");
  assert.equal(patch.answers.selectedMovingRecHours, "4");
});

test("defaults a tiny moving request and skips redundant questions", () => {
  const patch = applySmartBookingAnswer(
    { serviceType: "Moving" },
    "jobSize",
    "single item couch move",
  );

  assert.equal(patch.answers.jobSize, "single item couch move");
  assert.equal(patch.answers.loadType, "Both - load AND unload");
  assert.equal(patch.answers.truckSituation, "Customer provides truck or no truck needed");
  assert.equal(patch.answers.selectedMovingRecCrew, "2");
  assert.equal(patch.answers.selectedMovingRecHours, "1");
  assert.equal(shouldSkipSmartBookingStep("truckSize", patch.answers), true);
});

test("infers JC truck and common 2 mover / 3 hour package", () => {
  const patch = applySmartBookingAnswer(
    {},
    "serviceType",
    "Need moving help in 49938 next weekend 2 bedroom, load and unload, bring JC truck, 2 movers 3 hours",
  );

  assert.equal(patch.answers.serviceType, "Moving");
  assert.equal(patch.answers.moveDate, "next weekend");
  assert.equal(patch.answers.jobSize, "2-3 bed");
  assert.equal(patch.answers.loadType, "Both - load AND unload");
  assert.equal(patch.answers.truckSituation, "JC ON THE MOVE provides truck");
  assert.equal(patch.answers.selectedMovingRecLabel, "2 movers / 3 hours");
  assert.equal(patch.answers.selectedMovingRec, "moving_2m_3h");
  assert.equal(patch.answers.selectedMovingRecTotalMin, "400");
  assert.equal(patch.answers.selectedMovingRecTotalMax, "500");
});

test("understands compact crew/hour shorthand for fast booking", () => {
  const patch = applySmartBookingAnswer(
    {},
    "notes",
    "Moving 54534 tomorrow unload uhaul 26ft 3m/2h",
  );

  assert.equal(patch.answers.serviceType, "Moving");
  assert.equal(patch.answers.fromZip, "54534");
  assert.equal(patch.answers.moveDate, "tomorrow");
  assert.equal(patch.answers.loadType, "Unload only");
  assert.equal(patch.answers.truckSize, "26' truck");
  assert.equal(patch.answers.selectedMovingRecCrew, "3");
  assert.equal(patch.answers.selectedMovingRecHours, "2");
  assert.equal(patch.answers.selectedMovingRec, "moving_3m_2h");
  assert.equal(patch.answers.selectedMovingRecTotalMin, "400");
  assert.equal(patch.answers.selectedMovingRecTotalMax, "550");
});

console.log(`smartBookingEngine tests passed: ${passed}`);
