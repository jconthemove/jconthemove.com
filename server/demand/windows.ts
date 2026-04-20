// Task #174 — Rolling-window observations that feed the demand scorer.
// Reads straight from the leads and crew_locations tables with SQL to
// keep the hot path cheap (one query per snapshot) rather than one
// query per zone. All counts are returned as plain integers so the
// scorer never has to worry about decimal coercion.

import { pool } from "../db";
import { listZones, type ZoneInfo } from "./zones";
import { haversine } from "../dispatch/territories";

export interface ZoneWindowCounts {
  zone: ZoneInfo;
  quoteRequests15m: number;
  quoteRequests60m: number;
  quoteRequests24h: number;
  activeJobs: number;   // in_progress / available / assigned / accepted
  onlineCrew: number;   // crew_locations updated in last 15m within zone
}

interface LeadRow { lat: number | null; lng: number | null; createdAt: Date; status: string }
interface CrewRow { lat: number; lng: number; updatedAt: Date }

const ACTIVE_JOB_STATUSES = [
  "available", "assigned", "accepted", "in_progress",
];

function within(rowLat: number, rowLng: number, zone: ZoneInfo): boolean {
  return haversine(rowLat, rowLng, zone.centerLat, zone.centerLng) <= zone.radiusMi;
}

function pickClosest(lat: number, lng: number, zones: ZoneInfo[]): ZoneInfo | null {
  let best: { z: ZoneInfo; d: number } | null = null;
  for (const z of zones) {
    const d = haversine(lat, lng, z.centerLat, z.centerLng);
    if (d <= z.radiusMi) {
      if (!best || d < best.d) best = { z, d };
    }
  }
  return best ? best.z : null;
}

export async function getWindowCountsByZone(): Promise<ZoneWindowCounts[]> {
  const zones = listZones();
  const now = Date.now();

  // Pull every lead with coords from last 24h, all active leads, and
  // every online crew ping in last 15m. Small tables → single SELECT
  // is fine. If leads ever grows past ~100k rows we'll add date/status
  // indexes but the WHERE pushdowns already constrain this.
  const [leadsRes, crewRes] = await Promise.all([
    pool.query<{ lat: string | null; lng: string | null; created_at: Date; status: string }>(
      `SELECT lat, lng, created_at, status
         FROM leads
        WHERE lat IS NOT NULL AND lng IS NOT NULL
          AND (created_at > now() - interval '24 hours'
               OR status = ANY($1::text[]))`,
      [ACTIVE_JOB_STATUSES],
    ),
    pool.query<{ lat: string; lng: string; updated_at: Date }>(
      `SELECT lat, lng, updated_at
         FROM crew_locations
        WHERE updated_at > now() - interval '15 minutes'`,
    ),
  ]);

  const leads: LeadRow[] = leadsRes.rows.map(r => ({
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
    createdAt: r.created_at,
    status: r.status,
  }));
  const crew: CrewRow[] = crewRes.rows.map(r => ({
    lat: Number(r.lat), lng: Number(r.lng), updatedAt: r.updated_at,
  }));

  return zones.map(z => {
    const inZoneLeads = leads.filter(l => l.lat != null && l.lng != null && within(l.lat, l.lng, z));
    const quoteRequests24h = inZoneLeads.filter(l => now - l.createdAt.getTime() < 24 * 3600_000).length;
    const quoteRequests60m = inZoneLeads.filter(l => now - l.createdAt.getTime() < 60 * 60_000).length;
    const quoteRequests15m = inZoneLeads.filter(l => now - l.createdAt.getTime() < 15 * 60_000).length;
    const activeJobs = inZoneLeads.filter(l => ACTIVE_JOB_STATUSES.includes(l.status)).length;
    const onlineCrew = crew.filter(c => within(c.lat, c.lng, z)).length;
    return { zone: z, quoteRequests15m, quoteRequests60m, quoteRequests24h, activeJobs, onlineCrew };
  });
}

/** Pure spec-shape helper: given an array of job-like records with
 *  {lat, lng, createdAt, status}, bucket them by zone and return the
 *  same counts shape as getWindowCountsByZone — but WITHOUT touching
 *  the DB or crew-location pings. Useful for unit tests and for callers
 *  that already have an in-memory job set (e.g. pipeline simulation). */
export interface BuildWindowsJob {
  lat: number | null;
  lng: number | null;
  createdAt: Date;
  status: string;
}
export function buildWindows(
  jobs: BuildWindowsJob[],
  crewPings: { lat: number; lng: number; updatedAt: Date }[] = [],
  nowMs: number = Date.now(),
): ZoneWindowCounts[] {
  const zones = listZones();
  return zones.map(z => {
    const inZoneLeads = jobs.filter(l => l.lat != null && l.lng != null && within(l.lat!, l.lng!, z));
    const quoteRequests24h = inZoneLeads.filter(l => nowMs - l.createdAt.getTime() < 24 * 3600_000).length;
    const quoteRequests60m = inZoneLeads.filter(l => nowMs - l.createdAt.getTime() < 60 * 60_000).length;
    const quoteRequests15m = inZoneLeads.filter(l => nowMs - l.createdAt.getTime() < 15 * 60_000).length;
    const activeJobs = inZoneLeads.filter(l => ACTIVE_JOB_STATUSES.includes(l.status)).length;
    const onlineCrew = crewPings.filter(c =>
      nowMs - c.updatedAt.getTime() < 15 * 60_000 && within(c.lat, c.lng, z)
    ).length;
    return { zone: z, quoteRequests15m, quoteRequests60m, quoteRequests24h, activeJobs, onlineCrew };
  });
}

export async function getCountsForZone(zoneCode: string): Promise<ZoneWindowCounts | null> {
  const all = await getWindowCountsByZone();
  return all.find(w => w.zone.code === zoneCode) ?? null;
}

/** Helper for non-zone lookups (e.g. a lat/lng that falls outside all
 *  territories). Returns null; caller should treat demand as neutral. */
export function zoneForCoords(lat: number, lng: number): ZoneInfo | null {
  return pickClosest(lat, lng, listZones());
}
