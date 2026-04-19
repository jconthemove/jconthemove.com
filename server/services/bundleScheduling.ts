// Task #115: When a customer bundles add-on services with their primary
// booking, create a real `leads` row for each add-on so it shows up in the
// admin pipeline as something that needs to be scheduled — instead of just
// living as an "intent" tag on the primary booking.
//
// We deliberately:
//   • create an unmissable note in `details` so admins know it's a bundle child
//   • mirror the primary customer's contact info so the lead can be worked
//   • use `status: "quote_requested"` so it lands in the same pipeline column
//     as any other inbound lead awaiting follow-up
//   • swallow per-addon failures so the primary booking always succeeds
//   • when the caller supplies per-addon schedule info, persist the preferred
//     start date on `moveDate` and surface frequency / "call to schedule" in
//     the details note so the crew has a concrete starting point
//   • when the caller supplies a `bundleGroupId`, stamp every child lead with
//     it so the customer-facing /my-jobs view (and any admin grouping UI) can
//     fold the bundle into a single card

import { db } from "../db";
import { leads } from "@shared/schema";
import { z } from "zod";

// Shared Zod shape for the per-add-on scheduling info collected in any
// primary booking flow (lawn care, trash valet, …). Defined once here so
// every route that accepts bundle data validates it the same way without
// scattering `any` casts at the request boundary.
export const bundleScheduleEntrySchema = z.object({
  service: z.string().min(1),
  requestedStartDate: z.string().optional(),
  frequency: z.string().optional(),
  callToSchedule: z.boolean().optional(),
  notes: z.string().optional(),
});

export const bundleSubmissionSchema = z.object({
  bundleAddons: z.array(z.string()).default([]),
  bundleSchedules: z.array(bundleScheduleEntrySchema).default([]),
});

// Re-exported under a service-specific name for clarity at call sites.
export const trashBundleSubscribeSchema = bundleSubmissionSchema;

// Use Drizzle's native insert type (not the Zod-derived InsertLead which
// omits server-set fields like `status`) so we can stamp status + bundle
// fields without resorting to a type-safety bypass.
type LeadInsert = typeof leads.$inferInsert;

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

const ADDON_LABELS: Record<string, string> = {
  moving: "Moving",
  junk_removal: "Junk Removal",
  cleaning: "Cleaning",
  window_cleaning: "Window Cleaning",
  lawn_care: "Lawn Care",
  trash_valet: "Trash Valet",
  snow_removal: "Snow Removal",
  assembly: "Assembly",
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

export interface BundleAddonSchedule {
  service: string;
  requestedStartDate?: string;     // ISO date for one-time / recurring start
  frequency?: string;              // weekly / biweekly / per_event / etc.
  callToSchedule?: boolean;        // true for moving / assembly
  notes?: string;
}

export interface CreatedBundleChild {
  id: string;
  service: string;       // raw add-on id (e.g. "junk_removal")
  serviceType: string;   // mapped lead service type (e.g. "junk")
  label: string;         // human label
  startDate: string | null;
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
  schedules?: BundleAddonSchedule[]; // optional per-addon scheduling info
  bundleGroupId?: string | null;     // shared id for grouping the bundle
}): Promise<CreatedBundleChild[]> {
  const created: CreatedBundleChild[] = [];
  const seen = new Set<string>();

  // Index schedules by addon id so we can attach the right one to each lead
  // without relying on positional alignment with the addons array.
  const scheduleByAddon = new Map<string, BundleAddonSchedule>();
  for (const s of args.schedules || []) {
    if (s && s.service) scheduleByAddon.set(s.service, s);
  }

  for (const rawAddon of args.addons || []) {
    const addon = String(rawAddon || "").trim();
    if (!addon || SKIP_ADDONS.has(addon) || seen.has(addon)) continue;
    seen.add(addon);

    const mapped = ADDON_TO_LEAD_SERVICE_TYPE[addon];
    if (!mapped) continue;
    if (mapped === args.parentServiceType) continue;

    const schedule = scheduleByAddon.get(addon);
    const label = ADDON_LABELS[addon] || addon;

    // Build the details note. When the customer scheduled this add-on
    // through the new per-addon micro-step, surface that info; otherwise
    // fall back to the original generic "please follow up" wording.
    const detailParts: string[] = [];
    if (schedule) {
      detailParts.push(`📦 Bundled with ${args.parentRef}.`);
      if (schedule.callToSchedule) {
        detailParts.push("Customer requested: please call to schedule.");
      } else if (schedule.requestedStartDate) {
        detailParts.push(`Preferred start: ${schedule.requestedStartDate}.`);
      }
      if (schedule.frequency) {
        detailParts.push(`Frequency: ${schedule.frequency.replace(/_/g, " ")}.`);
      }
      if (schedule.notes) detailParts.push(`Notes: ${schedule.notes}`);
    } else {
      detailParts.push(
        `📦 Bundle add-on requested with ${args.parentRef}. ` +
          `Customer wants this service scheduled as part of their bundle — please follow up to confirm details and book.`,
      );
    }

    const startDate =
      schedule && !schedule.callToSchedule && schedule.requestedStartDate
        ? schedule.requestedStartDate
        : null;

    const insertValues: LeadInsert = {
      firstName: args.contact.firstName || "Bundle",
      lastName: args.contact.lastName || "Customer",
      email: args.contact.email || placeholderEmail(args.contact.phone),
      phone: args.contact.phone,
      serviceType: mapped,
      fromAddress: args.contact.address || "(see primary booking)",
      details: detailParts.join(" "),
      status: "quote_requested",
      moveDate: startDate,
      bundleGroupId: args.bundleGroupId ?? null,
    };

    try {
      const [row] = await db
        .insert(leads)
        .values(insertValues)
        .returning({ id: leads.id });
      if (row?.id) {
        created.push({
          id: row.id,
          service: addon,
          serviceType: mapped,
          label,
          startDate,
        });
      }
    } catch (err) {
      console.warn(
        `[bundleScheduling] failed to create child lead for addon "${addon}" (parent: ${args.parentRef}):`,
        (err as Error).message,
      );
    }
  }

  return created;
}
