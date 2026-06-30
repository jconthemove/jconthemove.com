import assert from "node:assert/strict";
import {
  MARKETPLACE_ACTION_TASKS,
  MARKETPLACE_OPERATING_FLYWHEEL,
  MARKETPLACE_REFERENCE_BLUEPRINTS,
  MARKETPLACE_REQUEST_SHAPES,
  MARKETPLACE_SIMPLE_SIDES,
  MARKETPLACE_SOURCE_FLOW_MATRIX,
  MARKETPLACE_SMART_BOOKING_STEPS,
  getMarketplaceSourceFlowForSource,
  type MarketplaceActionPhase,
  type MarketplaceActionRail,
  type MarketplaceSideId,
} from "../../../shared/marketplaceShapes";

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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function assertFilled(value: string, label: string) {
  assert.ok(value.trim().length > 0, `${label} must be filled`);
}

console.log("marketplaceShapes()");

const expectedSourceAliases: Array<[string, string]> = [
  ["target", "target_walmart_catalog"],
  ["walmart", "target_walmart_catalog"],
  ["goodwill", "goodwill_reuse"],
  ["mcdonalds", "mcdonalds_menu"],
  ["mc donalds", "mcdonalds_menu"],
  ["2men and a truck", "two_men_ops"],
  ["two men and a truck", "two_men_ops"],
  ["uhaul", "uhaul_movinghelp"],
  ["u-haul", "uhaul_movinghelp"],
  ["movinghelp.com", "uhaul_movinghelp"],
  ["movinghelper.com", "uhaul_movinghelp"],
  ["porch moving group", "porch_hireahelper_consensus"],
  ["hire-a-helper", "porch_hireahelper_consensus"],
  ["yelp", "google_yelp_trust"],
  ["google", "google_yelp_trust"],
  ["facebook", "facebook_craigslist_ads"],
  ["craigslist", "facebook_craigslist_ads"],
  ["pods", "pods_ubox_containers"],
  ["u-box", "pods_ubox_containers"],
  ["square", "square_collect"],
  ["discord", "discord_webhooks"],
  ["solbot webhook", "discord_webhooks"],
  ["jcmoves", "jcmoves_rewards"],
  ["crypto", "jcmoves_rewards"],
  ["generosity", "generosity_fund"],
  ["mom", "generosity_fund"],
  ["nominee", "generosity_fund"],
];

const requiredBlueprintReferences = [
  "Target",
  "Walmart",
  "Goodwill",
  "McDonald's",
  "Two Men and a Truck",
  "U-Haul",
  "MovingHelp",
  "MovingHelper",
  "Porch Moving Group",
  "HireAHelper",
  "Yelp",
  "Google",
  "Facebook",
  "Craigslist",
  "PODS",
  "U-Box",
  "Square",
  "JCMOVES Crypto",
  "Generosity Fund",
];

test("resolves every named inspiration source to an operational flow", () => {
  for (const [alias, expectedId] of expectedSourceAliases) {
    const flow = getMarketplaceSourceFlowForSource(alias);
    assert.ok(flow, `${alias} should resolve to a marketplace flow`);
    assert.equal(flow?.id, expectedId, `${alias} should resolve to ${expectedId}`);
  }
});

test("keeps best-of-best references visible as blueprints", () => {
  const referenceText = normalize(MARKETPLACE_REFERENCE_BLUEPRINTS.map((blueprint) => blueprint.reference).join(" "));

  for (const reference of requiredBlueprintReferences) {
    assert.ok(
      referenceText.includes(normalize(reference)),
      `${reference} should be represented in reference blueprints`,
    );
  }
});

test("defines complete customer, worker, company, automation, and reward details for every source flow", () => {
  const shapeIds = new Set(MARKETPLACE_REQUEST_SHAPES.map((shape) => shape.id));
  const flywheelStageIds = new Set(MARKETPLACE_OPERATING_FLYWHEEL.map((stage) => stage.id));

  for (const flow of MARKETPLACE_SOURCE_FLOW_MATRIX) {
    assertFilled(flow.source, `${flow.id}.source`);
    assertFilled(flow.borrowedSignal, `${flow.id}.borrowedSignal`);
    assertFilled(flow.start, `${flow.id}.start`);
    assertFilled(flow.progress, `${flow.id}.progress`);
    assertFilled(flow.finish, `${flow.id}.finish`);
    assertFilled(flow.customerMove, `${flow.id}.customerMove`);
    assertFilled(flow.workerMove, `${flow.id}.workerMove`);
    assertFilled(flow.companyControl, `${flow.id}.companyControl`);
    assertFilled(flow.automationHook, `${flow.id}.automationHook`);
    assertFilled(flow.surfaces, `${flow.id}.surfaces`);
    assertFilled(flow.rewardTrigger, `${flow.id}.rewardTrigger`);
    assert.ok(flow.shapeIds.length > 0, `${flow.id} must be attached to at least one request shape`);
    assert.ok(flow.flywheelStages.length > 0, `${flow.id} must be attached to at least one flywheel stage`);

    for (const shapeId of flow.shapeIds) {
      assert.ok(shapeIds.has(shapeId), `${flow.id} references unknown shape ${shapeId}`);
    }

    for (const stageId of flow.flywheelStages) {
      assert.ok(flywheelStageIds.has(stageId), `${flow.id} references unknown flywheel stage ${stageId}`);
    }
  }
});

test("keeps simple surfaces and smart booking steps tied to valid sides and shapes", () => {
  const expectedSides: MarketplaceSideId[] = ["customer", "worker", "company"];
  assert.deepEqual(
    MARKETPLACE_SIMPLE_SIDES.map((side) => side.id).sort(),
    expectedSides.sort(),
  );

  const shapeIds = new Set(MARKETPLACE_REQUEST_SHAPES.map((shape) => shape.id));
  for (const step of MARKETPLACE_SMART_BOOKING_STEPS) {
    assertFilled(step.prompt, `${step.id}.prompt`);
    assertFilled(step.autoInterpretation, `${step.id}.autoInterpretation`);
    assertFilled(step.customerPromise, `${step.id}.customerPromise`);
    assertFilled(step.workerSignal, `${step.id}.workerSignal`);
    assertFilled(step.companyControl, `${step.id}.companyControl`);
    assert.ok(step.quickOptions.length > 0, `${step.id} must provide quick options`);

    for (const shapeId of step.shapeIds) {
      assert.ok(shapeIds.has(shapeId), `${step.id} references unknown shape ${shapeId}`);
    }
  }
});

test("covers every action rail and phase with proof, guardrails, source flow links, and JCMOVES math", () => {
  const expectedRails: MarketplaceActionRail[] = ["customer", "bronze", "silver", "gold", "platinum"];
  const expectedPhases: MarketplaceActionPhase[] = ["start", "progress", "finish"];
  const rails = new Set(MARKETPLACE_ACTION_TASKS.map((task) => task.rail));
  const phases = new Set(MARKETPLACE_ACTION_TASKS.map((task) => task.phase));
  const sides = new Set(MARKETPLACE_SIMPLE_SIDES.map((side) => side.id));
  const shapeIds = new Set(MARKETPLACE_REQUEST_SHAPES.map((shape) => shape.id));
  const flowIds = new Set(MARKETPLACE_SOURCE_FLOW_MATRIX.map((flow) => flow.id));

  for (const rail of expectedRails) {
    assert.ok(rails.has(rail), `${rail} rail should have at least one task`);
  }

  for (const phase of expectedPhases) {
    assert.ok(phases.has(phase), `${phase} phase should have at least one task`);
  }

  for (const task of MARKETPLACE_ACTION_TASKS) {
    assertFilled(task.title, `${task.id}.title`);
    assertFilled(task.action, `${task.id}.action`);
    assertFilled(task.proof, `${task.id}.proof`);
    assertFilled(task.customerImpact, `${task.id}.customerImpact`);
    assertFilled(task.companyGuardrail, `${task.id}.companyGuardrail`);
    assertFilled(task.sourcePatterns, `${task.id}.sourcePatterns`);
    assert.ok(task.bonusJcMoves >= 0, `${task.id} bonus JCMOVES cannot be negative`);
    assert.ok(sides.has(task.side), `${task.id} references unknown side ${task.side}`);

    for (const flowId of task.flowIds) {
      assert.ok(flowIds.has(flowId), `${task.id} references unknown source flow ${flowId}`);
    }

    for (const shapeId of task.shapeIds) {
      assert.ok(shapeIds.has(shapeId), `${task.id} references unknown shape ${shapeId}`);
    }
  }
});

if (process.exitCode && process.exitCode !== 0) {
  console.error(`marketplaceShapes(): ${passed} test(s) passed before failure`);
} else {
  console.log(`marketplaceShapes(): ${passed} test(s) passed`);
}
