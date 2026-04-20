// Task #184 — DB-backed demand zones. The 5-territory hard-coded list
// from server/dispatch/territories.ts is now only used as a one-time
// seed for the `demand_zones` table. Operators can add, rename, move,
// resize, or disable zones from the admin panel without a code release.
//
// All consumers (demand scoring, surge, dispatch territory check)
// import listZones() / getZone() from here, so the DB is the single
// source of truth.

import { pool } from "../db";
import { TERRITORIES, haversine, type Territory } from "../dispatch/territories";

export type ZoneCode = string;

export interface ZoneInfo {
  id?: number;
  code: ZoneCode;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMi: number;
  active?: boolean;
}

// Cache starts empty. Until initDemandZones() runs at boot, listZones()
// returns the seeded TERRITORIES list lazily so callers (including the
// dispatch territory check, which imports us via a static cycle) never
// see undefined behavior. Once init loads from DB, that becomes the
// authoritative source of truth.
let cache: ZoneInfo[] = [];
let initialized = false;
let initPromise: Promise<void> | null = null;
let seededFromTerritories = false;

function ensureSeed() {
  if (initialized) return;
  if (seededFromTerritories) return;
  // TERRITORIES may be temporarily undefined during the dispatch ↔
  // demand circular import; guard against that.
  if (!Array.isArray(TERRITORIES) || TERRITORIES.length === 0) return;
  cache = TERRITORIES.map(t => ({ ...t, active: true }));
  seededFromTerritories = true;
}

async function loadFromDb(): Promise<ZoneInfo[]> {
  const { rows } = await pool.query<{
    id: number;
    code: string;
    name: string;
    center_lat: string;
    center_lng: string;
    radius_mi: string;
    active: boolean;
  }>(
    `SELECT id, code, name, center_lat, center_lng, radius_mi, active
       FROM demand_zones
      WHERE active = true
      ORDER BY id`
  );
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    centerLat: Number(r.center_lat),
    centerLng: Number(r.center_lng),
    radiusMi: Number(r.radius_mi),
    active: r.active,
  }));
}

export async function initDemandZones(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS demand_zones (
        id SERIAL PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        name TEXT NOT NULL,
        center_lat NUMERIC(9,6) NOT NULL,
        center_lng NUMERIC(9,6) NOT NULL,
        radius_mi NUMERIC(6,2) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    const { rows: countRows } = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM demand_zones`
    );
    if (!countRows[0]?.count) {
      for (const t of TERRITORIES) {
        await pool.query(
          `INSERT INTO demand_zones (code, name, center_lat, center_lng, radius_mi, active)
           VALUES ($1,$2,$3,$4,$5,true)
           ON CONFLICT (code) DO NOTHING`,
          [t.code, t.name, t.centerLat, t.centerLng, t.radiusMi]
        );
      }
    }
    cache = await loadFromDb();
    initialized = true;
  })();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

export async function reloadZones(): Promise<ZoneInfo[]> {
  cache = await loadFromDb();
  return listZones();
}

/** Sync read of the in-memory cache. Before initDemandZones() finishes
 *  we lazily seed from the legacy TERRITORIES list so callers never get
 *  an empty result during boot. After init the DB is the truth. */
export function listZones(): ZoneInfo[] {
  ensureSeed();
  return cache.map(z => ({ ...z }));
}

/** Returns the closest zone whose radius contains (lat,lng), or null
 *  when the point falls outside every zone. */
export function getZone(lat: number | null | undefined, lng: number | null | undefined): ZoneInfo | null {
  if (lat == null || lng == null || !isFinite(Number(lat)) || !isFinite(Number(lng))) return null;
  const la = Number(lat);
  const ln = Number(lng);
  let best: { z: ZoneInfo; d: number } | null = null;
  for (const z of cache) {
    const d = haversine(la, ln, z.centerLat, z.centerLng);
    if (d <= z.radiusMi) {
      if (!best || d < best.d) best = { z, d };
    }
  }
  return best ? { ...best.z } : null;
}

/** Used by dispatch's inAnyTerritory check. */
export function inAnyZone(lat: number, lng: number): boolean {
  return getZone(lat, lng) !== null;
}

// ---- CRUD ---------------------------------------------------------------

export interface ZoneInput {
  code: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMi: number;
  active?: boolean;
}

function validate(input: Partial<ZoneInput>, requireAll: boolean): string | null {
  if (requireAll || input.code !== undefined) {
    if (!input.code || !/^[A-Z0-9_-]{2,64}$/i.test(String(input.code))) {
      return "code must be 2–64 chars, letters/digits/_/- only";
    }
  }
  if (requireAll || input.name !== undefined) {
    if (!input.name || !String(input.name).trim()) return "name is required";
  }
  if (requireAll || input.centerLat !== undefined) {
    const v = Number(input.centerLat);
    if (!isFinite(v) || v < -90 || v > 90) return "centerLat must be between -90 and 90";
  }
  if (requireAll || input.centerLng !== undefined) {
    const v = Number(input.centerLng);
    if (!isFinite(v) || v < -180 || v > 180) return "centerLng must be between -180 and 180";
  }
  if (requireAll || input.radiusMi !== undefined) {
    const v = Number(input.radiusMi);
    if (!isFinite(v) || v <= 0 || v > 500) return "radiusMi must be between 0 and 500";
  }
  return null;
}

async function fetchZoneById(id: number): Promise<ZoneInfo | null> {
  // Always reads directly from DB so admin operations on inactive
  // zones still return the row (the active-only cache is for hot-path
  // demand lookups, not admin reads).
  const { rows } = await pool.query<{
    id: number; code: string; name: string;
    center_lat: string; center_lng: string; radius_mi: string;
    active: boolean;
  }>(
    `SELECT id, code, name, center_lat, center_lng, radius_mi, active
       FROM demand_zones WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    centerLat: Number(r.center_lat),
    centerLng: Number(r.center_lng),
    radiusMi: Number(r.radius_mi),
    active: r.active,
  };
}

export async function createZone(input: ZoneInput): Promise<ZoneInfo> {
  await initDemandZones();
  const err = validate(input, true);
  if (err) throw new Error(err);
  const code = String(input.code).trim().toUpperCase();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO demand_zones (code, name, center_lat, center_lng, radius_mi, active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [code, input.name.trim(), input.centerLat, input.centerLng, input.radiusMi, input.active ?? true]
  );
  await reloadZones();
  const fresh = await fetchZoneById(rows[0].id);
  return fresh ?? { ...input, code, active: input.active ?? true };
}

export async function updateZone(id: number, patch: Partial<ZoneInput>): Promise<ZoneInfo | null> {
  await initDemandZones();
  const err = validate(patch, false);
  if (err) throw new Error(err);
  const existing = await fetchZoneById(id);
  if (!existing) return null;
  const sets: string[] = [];
  const args: any[] = [];
  let i = 1;
  if (patch.code !== undefined) { sets.push(`code = $${i++}`); args.push(String(patch.code).trim().toUpperCase()); }
  if (patch.name !== undefined) { sets.push(`name = $${i++}`); args.push(String(patch.name).trim()); }
  if (patch.centerLat !== undefined) { sets.push(`center_lat = $${i++}`); args.push(Number(patch.centerLat)); }
  if (patch.centerLng !== undefined) { sets.push(`center_lng = $${i++}`); args.push(Number(patch.centerLng)); }
  if (patch.radiusMi !== undefined) { sets.push(`radius_mi = $${i++}`); args.push(Number(patch.radiusMi)); }
  if (patch.active !== undefined) { sets.push(`active = $${i++}`); args.push(!!patch.active); }
  if (sets.length) {
    args.push(id);
    await pool.query(`UPDATE demand_zones SET ${sets.join(", ")} WHERE id = $${i}`, args);
    await reloadZones();
  }
  // Always return fresh from DB — works whether the zone is active or
  // inactive after the update (e.g. admin just toggled it off).
  return fetchZoneById(id);
}

export async function deleteZone(id: number): Promise<boolean> {
  await initDemandZones();
  const { rowCount } = await pool.query(`DELETE FROM demand_zones WHERE id = $1`, [id]);
  await reloadZones();
  return (rowCount ?? 0) > 0;
}

export async function listAllZones(): Promise<ZoneInfo[]> {
  await initDemandZones();
  const { rows } = await pool.query<{
    id: number; code: string; name: string;
    center_lat: string; center_lng: string; radius_mi: string;
    active: boolean;
  }>(`SELECT id, code, name, center_lat, center_lng, radius_mi, active
        FROM demand_zones ORDER BY active DESC, id`);
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    centerLat: Number(r.center_lat),
    centerLng: Number(r.center_lng),
    radiusMi: Number(r.radius_mi),
    active: r.active,
  }));
}
