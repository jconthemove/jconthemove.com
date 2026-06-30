export type SmartBookingAnswers = Record<string, unknown>;

export type SmartBookingPatch = {
  answers: SmartBookingAnswers;
  inferred: Record<string, unknown>;
};

export type SmartBookingTextInference = {
  serviceType?: string;
  fromZip?: string;
  moveDate?: string;
  loadType?: string;
  truckSituation?: string;
  truckSize?: string;
  jobSize?: string;
  homeSize?: string;
  selectedMovingRecCrew?: string;
  selectedMovingRecHours?: string;
  selectedMovingRecLabel?: string;
  notes?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function includesAny(value: unknown, needles: string[]): boolean {
  const raw = lower(value);
  return needles.some((needle) => raw.includes(needle));
}

function firstNumber(value: unknown): number | null {
  const match = text(value).match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
}

function inferZip(raw: string): string | undefined {
  return raw.match(/\b\d{5}(?:-\d{4})?\b/)?.[0];
}

function inferDateHint(raw: string): string | undefined {
  const explicit = raw.match(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/)?.[0];
  if (explicit) return explicit;

  const relative = raw.match(/\b(today|tomorrow|this weekend|next weekend|weekend|next week|asap|soon)\b/i)?.[0];
  if (relative) return relative;

  return raw.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[0];
}

function inferLoadType(raw: string): string | undefined {
  if (/\b(load\s*(?:and|\+|\/)\s*unload|unload\s*(?:and|\+|\/)\s*load|both)\b/i.test(raw)) {
    return "Both - load AND unload";
  }
  if (/\b(unload|unloading|empty truck|emptying)\b/i.test(raw)) return "Unload only";
  if (/\b(load|loading|pack truck|packing truck)\b/i.test(raw)) return "Load only";
  if (/\b(deliver|delivery|drop\s*off|pickup|pick\s*up)\b/i.test(raw)) return "Delivery / transport";
  return undefined;
}

function inferTruckSituation(raw: string): string | undefined {
  if (/\b(jc truck|your truck|you supply|company truck|need truck|bring truck)\b/i.test(raw)) {
    return "JC ON THE MOVE provides truck";
  }
  if (/\b(customer truck|my truck|own truck|rental|u-?haul|budget truck|penske|pods?|u-?box)\b/i.test(raw)) {
    return "Customer provides truck or no truck needed";
  }
  return undefined;
}

function inferTruckSize(raw: string): string | undefined {
  if (/\bu-?box\b/i.test(raw)) return "U-Box / storage container";
  if (/\bpod\b|\bpods\b/i.test(raw)) return "PODS / storage container";
  const match = raw.match(/\b(10|12|15|16|17|20|22|24|26)\s*(?:'|ft|foot|feet|footer)?\b/i);
  if (!match) return undefined;
  return `${match[1]}' truck`;
}

function inferHomeSize(raw: string): string | undefined {
  if (/\b(studio|efficiency)\b/i.test(raw)) return "Studio or 1-bed";
  if (/\b1\s*(?:bed|bedroom|br)\b/i.test(raw)) return "Studio or 1-bed";
  if (/\b2\s*(?:bed|bedroom|br)\b/i.test(raw) || /\b3\s*(?:bed|bedroom|br)\b/i.test(raw)) return "2-3 bed";
  if (/\b4\s*\+?\s*(?:bed|bedroom|br)|full house|whole house|large house\b/i.test(raw)) return "4+ bed";
  if (/\b(single item|one item|1 item|couple items|few items|1-2 items?)\b/i.test(raw)) return "1-2 items";
  return undefined;
}

function inferCrewHours(raw: string): Pick<SmartBookingTextInference, "selectedMovingRecCrew" | "selectedMovingRecHours" | "selectedMovingRecLabel"> {
  const crewMatch = raw.match(/\b([1-4])\s*(?:movers?|helpers?|crew)\b/i);
  const hoursMatch = raw.match(/\b([1-9](?:\.\d+)?)\s*(?:hours?|hrs?|hr)\b/i);
  const crew = crewMatch ? Number(crewMatch[1]) : null;
  const hours = hoursMatch ? Number(hoursMatch[1]) : null;
  const result: Pick<SmartBookingTextInference, "selectedMovingRecCrew" | "selectedMovingRecHours" | "selectedMovingRecLabel"> = {};

  if (crew && crew >= 1 && crew <= 4) result.selectedMovingRecCrew = String(crew);
  if (hours && hours > 0) result.selectedMovingRecHours = numberText(hours);
  if (result.selectedMovingRecCrew && result.selectedMovingRecHours) {
    result.selectedMovingRecLabel = `${result.selectedMovingRecCrew} movers / ${result.selectedMovingRecHours} hours`;
  }
  return result;
}

export function inferSmartBookingText(value: unknown): SmartBookingTextInference {
  const raw = text(value);
  if (!raw) return {};

  const inferred: SmartBookingTextInference = {};
  const serviceType = inferServiceTypeFromSingleAnswer(raw);
  if (serviceType) inferred.serviceType = serviceType;

  const zip = inferZip(raw);
  if (zip) inferred.fromZip = zip;

  const date = inferDateHint(raw);
  if (date) inferred.moveDate = date;

  const loadType = inferLoadType(raw);
  if (loadType) inferred.loadType = loadType;

  const truckSituation = inferTruckSituation(raw);
  if (truckSituation) inferred.truckSituation = truckSituation;

  const truckSize = inferTruckSize(raw);
  if (truckSize) inferred.truckSize = truckSize;

  const homeSize = inferHomeSize(raw);
  if (homeSize) {
    inferred.homeSize = homeSize;
    inferred.jobSize = homeSize;
  }

  Object.assign(inferred, inferCrewHours(raw));
  inferred.notes = raw;
  return inferred;
}

function applyMissing(answers: SmartBookingAnswers, inferred: Record<string, unknown>, key: keyof SmartBookingTextInference, value: unknown) {
  if (value == null || value === "") return;
  if (answers[key] == null || answers[key] === "") {
    answers[key] = value;
    inferred[key] = value;
  }
}

export function inferServiceTypeFromSingleAnswer(value: unknown): string | null {
  const raw = lower(value);
  if (!raw) return null;
  if (includesAny(raw, ["junk", "haul away", "remove trash", "cleanout"])) return "Junk Removal";
  if (includesAny(raw, ["trash valet", "weekly trash", "curbside"])) return "Trash Valet";
  if (includesAny(raw, ["window"])) return "Window Cleaning";
  if (includesAny(raw, ["paint"])) return "Painting";
  if (includesAny(raw, ["floor"])) return "Flooring";
  if (includesAny(raw, ["roof"])) return "Roofing";
  if (includesAny(raw, ["handyman", "repair", "fix"])) return "Handyman";
  if (includesAny(raw, ["snow", "plow", "shovel"])) return "Snow Removal";
  if (includesAny(raw, ["lawn", "mow", "yard"])) return "Lawn Care";
  if (includesAny(raw, ["cleaning", "maid", "move out clean", "move-in clean"])) return "Move-In/Out Cleaning";
  if (includesAny(raw, ["demo", "demolition", "tear out"])) return "Light Demolition";
  if (includesAny(raw, ["jump", "battery"])) return "Jump Start";
  if (includesAny(raw, ["move", "moving", "load", "unload", "uhaul", "u-haul", "truck"])) return "Moving";
  return null;
}

export function isMovingAnswer(answers: SmartBookingAnswers): boolean {
  return lower(answers.serviceType).includes("moving");
}

export function isTinyMovingJob(answers: SmartBookingAnswers): boolean {
  return includesAny(answers.jobSize, ["1-2", "1 - 2", "single", "couple small"]);
}

export function estimateMovingCrewHours(answers: SmartBookingAnswers): { crew: number; hours: number; reason: string } {
  const size = lower(answers.jobSize || answers.homeSize || answers.selectedMovingRecLabel);
  const truck = lower(answers.truckSize);
  const specialItems = Array.isArray(answers.specialItems) ? answers.specialItems.map(String).join(" ").toLowerCase() : "";
  const specialty = includesAny(specialItems, ["piano", "pool table", "safe", "hot tub", "heavy"]);

  if (specialty) return { crew: 3, hours: 3, reason: "specialty/heavy item default" };
  if (size.includes("4") || size.includes("full house") || truck.includes("26")) {
    return { crew: 4, hours: 4, reason: "large move default" };
  }
  if (size.includes("3 bedroom")) return { crew: 3, hours: 3, reason: "3 bedroom default" };
  if (size.includes("2 bedroom")) return { crew: 2, hours: 3, reason: "2 bedroom default" };
  if (size.includes("studio") || size.includes("1 bedroom") || size.includes("1-bedroom")) {
    return { crew: 2, hours: 2, reason: "studio/1 bedroom default" };
  }
  if (isTinyMovingJob(answers)) return { crew: 2, hours: 1, reason: "tiny job default" };
  return { crew: 2, hours: 3, reason: "standard moving default" };
}

export function applySmartBookingAnswer(
  previousAnswers: SmartBookingAnswers,
  stepId: string,
  value: unknown,
): SmartBookingPatch {
  const answers: SmartBookingAnswers = { ...previousAnswers, [stepId]: value };
  const inferred: Record<string, unknown> = {};
  const textInference = inferSmartBookingText(value);

  applyMissing(answers, inferred, "serviceType", textInference.serviceType);
  applyMissing(answers, inferred, "fromZip", textInference.fromZip);
  applyMissing(answers, inferred, "moveDate", textInference.moveDate);
  applyMissing(answers, inferred, "loadType", textInference.loadType);
  applyMissing(answers, inferred, "truckSituation", textInference.truckSituation);
  applyMissing(answers, inferred, "truckSize", textInference.truckSize);
  applyMissing(answers, inferred, "jobSize", textInference.jobSize);
  applyMissing(answers, inferred, "homeSize", textInference.homeSize);
  applyMissing(answers, inferred, "selectedMovingRecCrew", textInference.selectedMovingRecCrew);
  applyMissing(answers, inferred, "selectedMovingRecHours", textInference.selectedMovingRecHours);
  applyMissing(answers, inferred, "selectedMovingRecLabel", textInference.selectedMovingRecLabel);

  if (stepId === "serviceType") {
    const serviceType = inferServiceTypeFromSingleAnswer(value);
    if (serviceType) {
      answers.serviceType = serviceType;
      inferred.serviceType = serviceType;
    }
  }

  if (stepId === "serviceAddress") {
    answers.fromZip = answers.fromZip || value;
    inferred.fromZip = answers.fromZip;
  }

  if (isMovingAnswer(answers)) {
    if (stepId === "jobSize" && isTinyMovingJob(answers)) {
      answers.loadType = answers.loadType || "Both - load AND unload";
      answers.truckSituation = answers.truckSituation || "Customer provides truck or no truck needed";
      answers.homeSize = answers.homeSize || value;
      inferred.loadType = answers.loadType;
      inferred.truckSituation = answers.truckSituation;
      inferred.homeSize = answers.homeSize;
    }

    if (stepId === "jobSize" && !answers.homeSize) {
      answers.homeSize = value;
      inferred.homeSize = value;
    }

    if (stepId === "homeSize" && !answers.jobSize) {
      answers.jobSize = value;
      inferred.jobSize = value;
    }

    if (stepId === "truckSituation" && includesAny(value, ["own truck", "rental", "customer"])) {
      answers.truckSize = answers.truckSize || "Customer truck";
      inferred.truckSize = answers.truckSize;
    }

    const crewPlan = estimateMovingCrewHours(answers);
    if (!answers.selectedMovingRecCrew) {
      answers.selectedMovingRecCrew = String(crewPlan.crew);
      inferred.selectedMovingRecCrew = answers.selectedMovingRecCrew;
    }
    if (!answers.selectedMovingRecHours) {
      answers.selectedMovingRecHours = String(crewPlan.hours);
      inferred.selectedMovingRecHours = answers.selectedMovingRecHours;
    }
    if (!answers.selectedMovingRecLabel && answers.selectedMovingRecCrew && answers.selectedMovingRecHours) {
      answers.selectedMovingRecLabel = `${answers.selectedMovingRecCrew} movers / ${answers.selectedMovingRecHours} hours`;
      inferred.selectedMovingRecLabel = answers.selectedMovingRecLabel;
    }
    inferred.smartSizingReason = crewPlan.reason;
  }

  const possibleHours = firstNumber(value);
  if (stepId.toLowerCase().includes("duration") && possibleHours && !answers.selectedMovingRecHours) {
    answers.selectedMovingRecHours = String(possibleHours);
    inferred.selectedMovingRecHours = answers.selectedMovingRecHours;
  }

  return { answers, inferred };
}

export function shouldSkipSmartBookingStep(stepId: string, answers: SmartBookingAnswers): boolean {
  if (!isMovingAnswer(answers)) return false;
  if (stepId === "homeSize" && answers.jobSize) return true;
  if (stepId === "propertyType" && isTinyMovingJob(answers)) return true;
  if (stepId === "loadType" && isTinyMovingJob(answers)) return true;
  if ((stepId === "originFloor" || stepId === "destFloor") && isTinyMovingJob(answers)) return true;
  if (stepId === "truckSituation" && isTinyMovingJob(answers)) return true;
  if (stepId === "truckSize" && (isTinyMovingJob(answers) || includesAny(answers.truckSituation, ["own truck", "rental", "customer"]))) {
    return true;
  }
  return false;
}
