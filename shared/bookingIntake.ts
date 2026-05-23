import type { BookingQuoteRequest } from "./schema";

type ChatbotAnswers = Record<string, unknown>;

export type BookingIntakeResult = {
  bookingQuoteRequest: BookingQuoteRequest;
  confidence: "high" | "medium" | "low";
  missing: string[];
  notes: string[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function includes(value: unknown, needle: string): boolean {
  return text(value).toLowerCase().includes(needle.toLowerCase());
}

function mapServiceCode(answers: ChatbotAnswers, serviceLabel?: string): string {
  const raw = `${serviceLabel || ""} ${text(answers.serviceType)}`.toLowerCase();
  if (raw.includes("junk")) return "junk_removal";
  if (raw.includes("trash valet")) return "trash_valet";
  if (raw.includes("window")) return "window_cleaning";
  if (raw.includes("paint")) return "painting";
  if (raw.includes("floor")) return "flooring";
  if (raw.includes("roof")) return "roofing";
  if (raw.includes("handyman")) return "handyman";
  if (raw.includes("snow")) return "snow_removal";
  if (raw.includes("lawn")) return "lawn_care";
  if (raw.includes("clean")) return "move_cleaning";
  if (raw.includes("demo")) return "demolition";
  if (raw.includes("assembly")) return "assembly";
  if (raw.includes("jump start") || raw.includes("jumpstart")) return "jump_start";
  return "moving";
}

function mapMovingJobSize(answers: ChatbotAnswers): "small" | "medium" | "large" | undefined {
  const raw = `${text(answers.jobSize)} ${text(answers.homeSize)} ${text(answers.selectedMovingRecLabel)}`.toLowerCase();
  if (raw.includes("single") || raw.includes("studio") || raw.includes("1-bedroom") || raw.includes("1 bedroom")) {
    return "small";
  }
  if (raw.includes("4+") || raw.includes("4 bedroom") || raw.includes("full house")) return "large";
  if (raw.includes("2") || raw.includes("3")) return "medium";
  return undefined;
}

function mapJunkTier(answers: ChatbotAnswers): "tiny" | "small" | "medium" | "large" | "xlarge" | undefined {
  const raw = `${text(answers.junkLocation)} ${text(answers.homeSize)} ${text(answers.selectedPackage)}`.toLowerCase();
  if (raw.includes("full") || raw.includes("large")) return "large";
  if (raw.includes("half") || raw.includes("medium") || raw.includes("room")) return "medium";
  if (raw.includes("quarter") || raw.includes("small")) return "small";
  if (raw.includes("single") || raw.includes("item") || raw.includes("tiny")) return "tiny";
  return undefined;
}

function numberFrom(value: unknown): number | undefined {
  const parsed = Number(text(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildBookingIntakeFromChatbot(
  answers: ChatbotAnswers,
  serviceLabel?: string,
): BookingIntakeResult {
  const serviceCode = mapServiceCode(answers, serviceLabel);
  const missing: string[] = [];
  const notes: string[] = [];
  const details: Record<string, unknown> = {
    source: "chatbot",
    serviceAddress: text(answers.serviceAddress) || undefined,
    fromAddress: text(answers.fromZip) || text(answers.serviceAddress) || undefined,
    toAddress: text(answers.toZip) || undefined,
    moveDate: text(answers.moveDate) || undefined,
    selectedPackage: text(answers.selectedPackage) || text(answers.selectedMovingRecLabel) || undefined,
    selectedMovingRec: text(answers.selectedMovingRec) || undefined,
    selectedMovingRecLabel: text(answers.selectedMovingRecLabel) || undefined,
    selectedMovingRecNotes: text(answers.selectedMovingRecNotes) || undefined,
    selectedMovingRecCrew: numberFrom(answers.selectedMovingRecCrew),
    selectedMovingRecHours: numberFrom(answers.selectedMovingRecHours),
    selectedMovingRecTotalMin: numberFrom(answers.selectedMovingRecTotalMin),
    selectedMovingRecTotalMax: numberFrom(answers.selectedMovingRecTotalMax),
    oversizedItemCount: numberFrom(answers.oversizedItemCount),
    specialItems: Array.isArray(answers.specialItems) ? answers.specialItems : undefined,
    notes: text(answers.notes) || undefined,
  };

  if (!details.serviceAddress && !details.fromAddress) missing.push("service address");

  if (serviceCode === "moving") {
    const jobSize = mapMovingJobSize(answers);
    details.jobSize = jobSize;
    details.truckSize = text(answers.truckSize) || undefined;
    details.crewSize = numberFrom(answers.selectedMovingRecCrew);
    details.laborHours = numberFrom(answers.selectedMovingRecHours);
    const loadTypeRaw = text(answers.loadType).toLowerCase();
    details.loadType = loadTypeRaw.includes("both") || (loadTypeRaw.includes("load") && loadTypeRaw.includes("unload"))
      ? "local"
      : loadTypeRaw.includes("unload")
        ? "unload_only"
        : loadTypeRaw.includes("load")
          ? "load_only"
          : "local";
    details.bedrooms = text(answers.homeSize) || text(answers.jobSize) || undefined;
    details.stairs = includes(answers.originFloor, "2nd") || includes(answers.destFloor, "2nd") ? 1
      : includes(answers.originFloor, "3rd") || includes(answers.destFloor, "3rd") ? 2
        : includes(answers.originFloor, "4th") || includes(answers.destFloor, "4th") ? 3
          : 0;
    if (!jobSize && !details.bedrooms) missing.push("move size");
  } else if (serviceCode === "junk_removal") {
    const tier = mapJunkTier(answers);
    details.tier = tier;
    details.location = text(answers.junkLocation) || undefined;
    if (!tier) missing.push("junk load size");
  } else if (serviceCode === "window_cleaning") {
    details.standardWindows = numberFrom(answers.standardWindows) ?? 0;
    details.largeWindows = numberFrom(answers.largeWindows) ?? 0;
    details.ladderWindows = numberFrom(answers.ladderWindows) ?? 0;
    if (!details.standardWindows && !details.largeWindows && !details.ladderWindows) missing.push("window count");
  } else if (serviceCode === "trash_valet") {
    details.trashCans = numberFrom(answers.trashCans) ?? 1;
    details.trashBags = numberFrom(answers.trashBags) ?? 0;
    details.planType = text(answers.trashPlanType) || undefined;
  } else {
    details.jobSize = text(answers.jobSize) || text(answers.jobScope) || undefined;
    details.squareFeet = numberFrom(answers.flooringRoomsSqft) || undefined;
    details.answers = answers;
    notes.push("Quote-only or specialty service: booking engine returns a preliminary line for admin review.");
  }

  const confidence = missing.length === 0 ? "high" : missing.length <= 2 ? "medium" : "low";

  return {
    bookingQuoteRequest: {
      source: "chatbot_orchestrator",
      items: [
        {
          serviceCode,
          quantity: 1,
          unitPrice: serviceCode === "moving" ? numberFrom(answers.selectedMovingRecTotalMin) : undefined,
          details,
        },
      ],
    },
    confidence,
    missing,
    notes,
  };
}
