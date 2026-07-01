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
  packageId: string | null;
  packageLabel: string | null;
  crew: number | null;
  hours: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  loadType: string | null;
  movingPath: string | null;
  truckSize: string | null;
  zoneName: string | null;
  quoteReviewRequired: boolean;
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

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["true", "yes", "1"].includes(value.trim().toLowerCase());
}

function dollars(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `$${Math.round(value).toLocaleString()}`;
}

function rangeFromNumbers(min: number | null, max: number | null): string | null {
  const low = dollars(min);
  const high = dollars(max);
  if (low && high && low !== high) return `${low} - ${high}`;
  return low || high || null;
}

function quotePreviewFromSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  const direct = plainRecord(snapshot.marketplaceQuotePreview);
  if (Object.keys(direct).length > 0) return direct;
  const recoveredSnapshot = plainRecord(snapshot.snapshot);
  return plainRecord(recoveredSnapshot.marketplacePreview);
}

function quotePreviewEstimate(preview: Record<string, unknown>): string | null {
  const quote = plainRecord(preview.quote);
  const direct = stringValue(preview.estimateLabel);
  if (direct) return direct;
  return rangeFromNumbers(numberValue(quote.minEstimate) ?? null, numberValue(quote.maxEstimate) ?? null);
}

function quotePreviewZoneName(preview: Record<string, unknown>): string | null {
  const quote = plainRecord(preview.quote);
  const zone = plainRecord(quote.zone);
  return stringValue(zone.name) || stringValue(zone.code);
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
  const recoveredSnapshot = plainRecord(snapshot.snapshot);
  const requestedItems = Array.isArray(snapshot.requestedItems)
    ? snapshot.requestedItems
    : Array.isArray(recoveredSnapshot.items)
      ? recoveredSnapshot.items
      : [];
  const sourceFlow = plainRecord(snapshot.marketplaceSourceFlow);
  const snapshotSourceSignal =
    stringValue(snapshot.marketplaceSourceSignal) ||
    stringValue(snapshot.sourceSignal) ||
    stringValue(sourceFlow.source);
  const snapshotOperationsSignal =
    stringValue(snapshot.marketplaceOperationsSignal) ||
    stringValue(sourceFlow.companyControl) ||
    stringValue(sourceFlow.automationHook);
  const preview = quotePreviewFromSnapshot(snapshot);
  const previewRange = quotePreviewEstimate(preview);
  const zoneName = quotePreviewZoneName(preview);

  for (const rawItem of requestedItems) {
    const item = plainRecord(rawItem) as RequestedQuoteItem;
    const details = plainRecord(item.details);
    const sourceSignal = itemStringValue(item, "priceMenuSourceSignal") || snapshotSourceSignal;
    const operationsSignal = itemStringValue(item, "priceMenuOperationsSignal") || snapshotOperationsSignal;
    const loadType = itemStringValue(item, "loadType");
    const movingPath = itemStringValue(item, "movingPath");
    const truckSize = itemStringValue(item, "truckSize") || itemStringValue(item, "truckProvider") || itemStringValue(item, "truckSituation");
    const packageId = itemStringValue(item, "packageId");
    const packageLabel = itemStringValue(item, "packageLabel") || itemStringValue(item, "selectedPackage");
    const crew = numberValue(details.crew || details.crewSize || details.inventoryCrewRecommendation) ?? null;
    const hours = numberValue(details.hours || details.confirmedHours || details.inventoryLaborHours) ?? null;
    const minPrice = numberValue(details.minPrice || details.inventoryPriceMin || details.selectedMovingRecTotalMin) ?? null;
    const maxPrice = numberValue(details.maxPrice || details.inventoryPriceMax || details.selectedMovingRecTotalMax) ?? null;
    const range = itemStringValue(item, "priceMenuRange") || previewRange || rangeFromNumbers(minPrice, maxPrice);
    const unit = itemStringValue(item, "priceMenuUnit");
    const category = itemStringValue(item, "priceMenuCategory");
    const taskId = itemStringValue(item, "priceMenuTaskId");
    const quoteReviewRequired =
      booleanValue(details.priceReviewRequired) ||
      packageId === "quote_review" ||
      stringValue(details.quoteConfidence) === "low";
    const customerNeeds = itemStringArrayValue(item, "priceMenuCustomerNeeds");
    const derivedNeeds = [
      loadType ? `Job: ${loadType}` : null,
      truckSize ? `Truck/access: ${truckSize}` : null,
      packageLabel ? `Package: ${packageLabel}` : null,
    ].filter((value): value is string => !!value);
    const displayNeeds = customerNeeds.length > 0 ? customerNeeds : derivedNeeds;

    if (
      !sourceSignal &&
      !operationsSignal &&
      displayNeeds.length === 0 &&
      !range &&
      !unit &&
      !category &&
      !taskId &&
      !packageId &&
      !packageLabel &&
      !crew &&
      !hours &&
      !loadType &&
      !movingPath &&
      !truckSize &&
      !zoneName &&
      !quoteReviewRequired
    ) {
      continue;
    }

    return {
      serviceLabel: item.serviceLabel || item.serviceCode || fallbackServiceLabel,
      sourceSignal,
      operationsSignal,
      customerNeeds: displayNeeds,
      range,
      unit,
      category,
      taskId,
      packageId,
      packageLabel,
      crew,
      hours,
      minPrice,
      maxPrice,
      loadType,
      movingPath,
      truckSize,
      zoneName,
      quoteReviewRequired,
    };
  }

  if (snapshotSourceSignal || snapshotOperationsSignal || previewRange || zoneName) {
    return {
      serviceLabel: fallbackServiceLabel,
      sourceSignal: snapshotSourceSignal,
      operationsSignal: snapshotOperationsSignal,
      customerNeeds: [],
      range: previewRange,
      unit: null,
      category: null,
      taskId: null,
      packageId: null,
      packageLabel: null,
      crew: null,
      hours: null,
      minPrice: null,
      maxPrice: null,
      loadType: null,
      movingPath: null,
      truckSize: null,
      zoneName,
      quoteReviewRequired: false,
    };
  }

  return null;
}

export function extractSmartBookingAnswersFromQuoteSnapshot(quoteSnapshot: unknown): SmartBookingAnswers {
  const snapshot = plainRecord(quoteSnapshot);
  const recoveredSnapshot = plainRecord(snapshot.snapshot);
  const requestedItems = Array.isArray(snapshot.requestedItems)
    ? snapshot.requestedItems
    : Array.isArray(recoveredSnapshot.items)
      ? recoveredSnapshot.items
      : [];
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
