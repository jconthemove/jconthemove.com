// Task #115: When a customer bundles add-on services with their primary
// booking, create a stub `leads` row for each add-on so it shows up in the
// admin pipeline as something that needs to be scheduled — instead of just
// living as an "intent" tag on the primary booking.
//
// We deliberately:
//   • create an unmissable note in `details` so admins know it's a bundle child
//   • mirror the primary customer's contact info so the lead can be worked
//   • use `status: "quote_requested"` so it lands in the same pipeline column
//     as any other inbound lead awaiting follow-up
//   • swallow per-addon failures so the primary booking always succeeds

import { db } from "../db";
import { leads } from "@shared/schema";

const ADDON_TO_LEAD_SERVICE_TYPE: Record<string, string> = {
  moving: "residential",
  junk_removal: "junk",
  cleaning: "cleaning",
  window_cleaning: "window_cleaning",
  lawn_care: "lawn_care",
  trash_valet: "trash_valet",
  snow_removal: "snow",
  assembly: "assembly",
};

// Add-ons that aren't bookable services we'd schedule (they're shop links etc.)
const SKIP_ADDONS = new Set(["ashley_shop"]);

export interface BundleChildContact {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  address: string;
}

export function splitCustomerName(full: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Bundle",
    lastName: parts.slice(1).join(" ") || "Customer",
  };
}

function placeholderEmail(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "") || "unknown";
  return `bundle+${digits}@jconthemove.local`;
}

export async function createBundleChildLeads(args: {
  parentRef: string;            // human-friendly reference (e.g. "trash subscription abc123")
  parentServiceType: string;    // e.g. "trash_valet", "lawn_care", "residential"
  addons: string[];
  contact: BundleChildContact;
}): Promise<string[]> {
  const created: string[] = [];
  const seen = new Set<string>();

  for (const rawAddon of args.addons || []) {
    const addon = String(rawAddon || "").trim();
    if (!addon || SKIP_ADDONS.has(addon) || seen.has(addon)) continue;
    seen.add(addon);

    const mapped = ADDON_TO_LEAD_SERVICE_TYPE[addon];
    if (!mapped) continue;
    if (mapped === args.parentServiceType) continue;

    try {
      const [row] = await db
        .insert(leads)
        .values({
          firstName: args.contact.firstName || "Bundle",
          lastName: args.contact.lastName || "Customer",
          email: args.contact.email || placeholderEmail(args.contact.phone),
          phone: args.contact.phone,
          serviceType: mapped,
          fromAddress: args.contact.address || "(see primary booking)",
          details:
            `📦 Bundle add-on requested with ${args.parentRef}. ` +
            `Customer wants this service scheduled as part of their bundle — please follow up to confirm details and book.`,
          status: "quote_requested",
        })
        .returning({ id: leads.id });
      if (row?.id) created.push(row.id);
    } catch (err) {
      console.warn(
        `[bundleScheduling] failed to create child lead for addon "${addon}" (parent: ${args.parentRef}):`,
        (err as Error).message,
      );
    }
  }

  return created;
}
