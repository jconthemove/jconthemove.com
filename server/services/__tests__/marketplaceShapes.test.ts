import assert from "node:assert/strict";
import {
  MARKETPLACE_ACTION_TASKS,
  MARKETPLACE_OPERATING_FLYWHEEL,
  MARKETPLACE_REFERENCE_BLUEPRINTS,
  MARKETPLACE_REQUEST_SHAPES,
  MARKETPLACE_SIMPLE_SIDES,
  MARKETPLACE_SOURCE_FLOW_MATRIX,
  MARKETPLACE_SMART_BOOKING_STEPS,
  getMarketplaceShapeForServiceCode,
  getMarketplaceSourceFlowForSource,
  type MarketplaceActionPhase,
  type MarketplaceActionRail,
  type MarketplaceRequestShapeId,
  type MarketplaceSideId,
} from "../../../shared/marketplaceShapes";
import {
  SERVICE_PRICE_MENU,
  SERVICE_PRICE_MENU_CATEGORIES,
  formatServicePriceRange,
  sourceSignalForServicePriceMenuTask,
} from "../../../shared/servicePriceMenu";

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

test("links every source flow to at least one operational action task", () => {
  const linkedFlowIds = new Set(MARKETPLACE_ACTION_TASKS.flatMap((task) => task.flowIds));

  for (const flow of MARKETPLACE_SOURCE_FLOW_MATRIX) {
    assert.ok(linkedFlowIds.has(flow.id), `${flow.id} should be linked to at least one action task`);
  }
});

test("keeps the smart service price menu usable and tied to valid request shapes", () => {
  const shapeIds = new Set(MARKETPLACE_REQUEST_SHAPES.map((shape) => shape.id));
  const categoryIds = new Set(SERVICE_PRICE_MENU_CATEGORIES.map((category) => category.id));

  assert.ok(SERVICE_PRICE_MENU.length >= 20, "service price menu should cover the core launch paths");

  for (const task of SERVICE_PRICE_MENU) {
    assertFilled(task.id, "task.id");
    assertFilled(task.serviceCode, `${task.id}.serviceCode`);
    assertFilled(task.label, `${task.id}.label`);
    assertFilled(task.description, `${task.id}.description`);
    assertFilled(task.priceUnit, `${task.id}.priceUnit`);
    assertFilled(task.operationsSignal, `${task.id}.operationsSignal`);
    assert.ok(categoryIds.has(task.categoryId), `${task.id} references unknown category ${task.categoryId}`);
    assert.ok(shapeIds.has(task.shapeId), `${task.id} references unknown shape ${task.shapeId}`);
    assert.ok(task.priceMin > 0, `${task.id} must have a positive minimum estimate`);
    assert.ok(task.priceMax >= task.priceMin, `${task.id} maximum estimate cannot be below minimum`);
    assert.ok(task.defaultCrew >= 1, `${task.id} must suggest at least one worker`);
    assert.ok(task.defaultHours >= 1, `${task.id} must suggest at least one hour`);
    assert.ok(task.tags.length > 0, `${task.id} should have searchable tags`);
    assert.ok(task.customerNeeds.length > 0, `${task.id} should tell the intake what to ask for`);
    assert.match(formatServicePriceRange(task), /^\$[\d,]+-\$[\d,]+$/, `${task.id} should format a customer range`);
    assertFilled(sourceSignalForServicePriceMenuTask(task), `${task.id}.sourceSignal`);
  }
});

test("keeps each service menu category tied to the intended outside-source pattern", () => {
  const expectedSignals: Array<[string, string[]]> = [
    ["store_pickup", ["Target", "Walmart", "Google"]],
    ["donation_or_dump_run", ["Goodwill", "Craigslist", "Facebook"]],
    ["load_truck", ["MovingHelp", "MovingHelper", "U-Haul", "PODS"]],
    ["lawn_one_time", ["McDonald's", "Google", "Facebook", "JCMOVES"]],
    ["handyman_small_repair", ["Porch", "HireAHelper", "Yelp", "Google"]],
  ];

  for (const [taskId, references] of expectedSignals) {
    const task = SERVICE_PRICE_MENU.find((entry) => entry.id === taskId);
    assert.ok(task, `${taskId} should exist in the service price menu`);
    const signal = sourceSignalForServicePriceMenuTask(task!);
    for (const reference of references) {
      assert.ok(signal.includes(reference), `${taskId} source signal should include ${reference}`);
    }
  }
});

test("routes service menu task codes to the same shape shown on the customer picker", () => {
  for (const task of SERVICE_PRICE_MENU) {
    const routed = getMarketplaceShapeForServiceCode(task.serviceCode);
    assert.equal(
      routed.id,
      task.shapeId,
      `${task.id} serviceCode ${task.serviceCode} should route to ${task.shapeId}`,
    );
  }
});

test("keeps common marketplace service aliases pointed at the intended operational card shape", () => {
  const examples: Array<[string, MarketplaceRequestShapeId]> = [
    ["moving", "moving_help"],
    ["load_unload", "moving_help"],
    ["ubox", "moving_help"],
    ["pack_unpack", "moving_help"],
    ["delivery", "delivery_reuse"],
    ["store_pickup", "delivery_reuse"],
    ["single_item", "delivery_reuse"],
    ["small_project_labor", "delivery_reuse"],
    ["lawn_care", "repeat_loop"],
    ["snow_removal", "repeat_loop"],
    ["junk_removal", "repeat_loop"],
    ["handyman", "repeat_loop"],
    ["roofing", "repeat_loop"],
    ["flooring", "repeat_loop"],
    ["painting", "repeat_loop"],
    ["demolition", "repeat_loop"],
  ];

  for (const [serviceCode, expectedShapeId] of examples) {
    assert.equal(
      getMarketplaceShapeForServiceCode(serviceCode).id,
      expectedShapeId,
      `${serviceCode} should route to ${expectedShapeId}`,
    );
  }
});

if (process.exitCode && process.exitCode !== 0) {
  console.error(`marketplaceShapes(): ${passed} test(s) passed before failure`);
} else {
  console.log(`marketplaceShapes(): ${passed} test(s) passed`);
}
