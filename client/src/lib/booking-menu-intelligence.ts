import type { SmartBookingAnswers } from "@shared/smartBookingEngine";

export type BookingMenuIntelligence = {
  serviceLabel: string;
  sourceSignal: string | null;
  operationsSignal: string | null;
  customerNeeds: string[];
  range: string | null;
  unit: string | null;
  category: string | null;
  taskId: string | null;
} | null;

type RequestedQuoteItem = {
  serviceCode?: string | null;
  serviceLabel?: string | null;
  details?: Record<string, unknown> | null;
  [key: string]: unknown;
};

function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function itemStringValue(item: RequestedQuoteItem, key: string): string | null {
  const details = plainRecord(item.details);
  return stringValue(item[key]) || stringValue(details[key]);
}

function itemStringArrayValue(item: RequestedQuoteItem, key: string): string[] {
  const details = plainRecord(item.details);
  const raw = Array.isArray(item[key]) ? item[key] : details[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function assignString(target: SmartBookingAnswers, key: string, value: unknown) {
  const normalized = stringValue(value);
  if (normalized) target[key] = normalized;
}

function assignNumber(target: SmartBookingAnswers, key: string, value: unknown) {
  const normalized = numberValue(value);
  if (normalized !== undefined) target[key] = normalized;
}

export function extractBookingMenuIntelligence(
  quoteSnapshot: unknown,
  fallbackServiceLabel = "Selected service",
): BookingMenuIntelligence {
  const snapshot = plainRecord(quoteSnapshot);
  const requestedItems = Array.isArray(snapshot.requestedItems) ? snapshot.requestedItems : [];

  for (const rawItem of requestedItems) {
    const item = plainRecord(rawItem) as RequestedQuoteItem;
    const sourceSignal = itemStringValue(item, "priceMenuSourceSignal");
    const operationsSignal = itemStringValue(item, "priceMenuOperationsSignal");
    const customerNeeds = itemStringArrayValue(item, "priceMenuCustomerNeeds");
    const range = itemStringValue(item, "priceMenuRange");
    const unit = itemStringValue(item, "priceMenuUnit");
    const category = itemStringValue(item, "priceMenuCategory");
    const taskId = itemStringValue(item, "priceMenuTaskId");

    if (!sourceSignal && !operationsSignal && customerNeeds.length === 0 && !range && !unit && !category && !taskId) {
      continue;
    }

    return {
      serviceLabel: item.serviceLabel || item.serviceCode || fallbackServiceLabel,
      sourceSignal,
      operationsSignal,
      customerNeeds,
      range,
      unit,
      category,
      taskId,
    };
  }

  return null;
}

export function extractSmartBookingAnswersFromQuoteSnapshot(quoteSnapshot: unknown): SmartBookingAnswers {
  const snapshot = plainRecord(quoteSnapshot);
  const requestedItems = Array.isArray(snapshot.requestedItems) ? snapshot.requestedItems : [];
  const answers: SmartBookingAnswers = {};

  assignString(answers, "marketplaceShapeId", snapshot.marketplaceShapeId);
  assignString(answers, "jobShapeId", snapshot.marketplaceShapeId);

  const firstRawItem = requestedItems[0];
  const firstItem = firstRawItem ? plainRecord(firstRawItem) as RequestedQuoteItem : null;
  if (!firstItem) return answers;

  const details = plainRecord(firstItem.details);
  const detailMarketplaceShapeId = stringValue(details.marketplaceShapeId);

  assignString(answers, "marketplaceShapeId", detailMarketplaceShapeId || snapshot.marketplaceShapeId);
  assignString(answers, "jobShapeId", detailMarketplaceShapeId || snapshot.marketplaceShapeId);
  assignString(answers, "serviceCode", firstItem.serviceCode);
  assignString(answers, "serviceType", firstItem.serviceCode);
  assignString(answers, "serviceLabel", firstItem.serviceLabel);
  assignString(answers, "loadType", details.loadType);
  assignString(answers, "movingPath", details.movingPath);
  assignString(answers, "truckSize", details.truckSize);
  assignString(answers, "truckProvider", details.truckProvider);
  assignString(answers, "truckSituation", details.truckSituation || details.truckSize || details.truckProvider);
  assignString(answers, "accessNotes", details.accessNotes || details.scope);
  assignString(answers, "selectedPackage", details.selectedPackage || details.packageLabel);
  assignString(answers, "packageId", details.packageId);
  assignString(answers, "selectedMovingRec", details.packageId);
  assignString(answers, "selectedMovingRecLabel", details.packageLabel || details.priceMenuRange);
  assignString(answers, "priceMenuTaskId", details.priceMenuTaskId);
  assignString(answers, "priceMenuCategory", details.priceMenuCategory);
  assignString(answers, "priceMenuSourceSignal", details.priceMenuSourceSignal);
  assignString(answers, "priceMenuOperationsSignal", details.priceMenuOperationsSignal);

  assignNumber(answers, "crewSize", details.crew || details.crewSize || details.inventoryCrewRecommendation);
  assignNumber(answers, "selectedMovingRecCrew", details.crew || details.crewSize || details.inventoryCrewRecommendation);
  assignNumber(answers, "confirmedHours", details.hours || details.confirmedHours || details.inventoryLaborHours);
  assignNumber(answers, "laborHours", details.hours || details.confirmedHours || details.inventoryLaborHours);
  assignNumber(answers, "selectedMovingRecHours", details.hours || details.confirmedHours || details.inventoryLaborHours);
  assignNumber(answers, "containerCount", details.containerCount || details.boxCount);
  assignNumber(answers, "boxCount", details.boxCount || details.containerCount);

  const scope = stringValue(details.scope);
  if (scope) {
    answers.items = scope;
    answers.notes = scope;
  }

  return answers;
}
