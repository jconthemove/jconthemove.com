export type SmartBookingAnswers = Record<string, unknown>;

export type SmartBookingPatch = {
  answers: SmartBookingAnswers;
  inferred: Record<string, unknown>;
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

