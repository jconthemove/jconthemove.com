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
