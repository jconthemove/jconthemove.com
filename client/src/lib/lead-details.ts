export function extractCustomerMediaLink(details?: string | null): string | null {
  if (!details) return null;
  const match = details.match(/^Photo\/video\/album link:\s*(.+)$/im);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}
