export interface ServicePagePrefillInput {
  service: string;
  address?: string;
  step?: "services" | "address" | "configure" | "contact" | "review";
  label?: string;
  price?: number | null;
  details?: Record<string, unknown>;
}

export function buildBookHref(input: ServicePagePrefillInput): string {
  const params = new URLSearchParams({
    service: input.service,
    step: input.step || "configure",
  });

  if (input.address?.trim()) params.set("address", input.address.trim());
  if (input.label?.trim()) params.set("label", input.label.trim());
  if (typeof input.price === "number" && Number.isFinite(input.price) && input.price > 0) {
    params.set("price", String(Math.round(input.price)));
  }
  if (input.details && Object.keys(input.details).length > 0) {
    params.set("details", JSON.stringify(input.details));
  }

  return `/book?${params.toString()}`;
}
