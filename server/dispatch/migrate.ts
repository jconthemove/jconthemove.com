// Task #172 — Idempotent startup migration. Adds the dispatch columns
// to leads + creates dispatch_log and app_settings tables. Called once
// during registerRoutes boot sequence. Any failure is logged but never
// aborts startup (the rest of the app still works; the dispatch
// service just runs in degraded mode).

import { pool } from "../db";

export async function migrateDispatchSchema(): Promise<void> {
  const statements = [
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7)`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7)`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'normal'`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS dispatch_state TEXT NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS dispatch_offered_to VARCHAR`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS dispatch_offer_expires_at TIMESTAMP`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS dispatch_tried_ids TEXT[] DEFAULT ARRAY[]::text[]`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS en_route_at TIMESTAMP`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS on_site_at TIMESTAMP`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`,
    `CREATE INDEX IF NOT EXISTS idx_leads_dispatch_state ON leads(dispatch_state)`,
    `CREATE INDEX IF NOT EXISTS idx_leads_dispatch_offered_to ON leads(dispatch_offered_to)`,
    `CREATE TABLE IF NOT EXISTS dispatch_log (
       id SERIAL PRIMARY KEY,
       lead_id VARCHAR NOT NULL,
       event TEXT NOT NULL,
       crew_id VARCHAR,
       actor_user_id VARCHAR,
       from_state TEXT,
       to_state TEXT,
       reason TEXT,
       data JSONB,
       created_at TIMESTAMP NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dispatch_log_lead ON dispatch_log(lead_id)`,
    `CREATE INDEX IF NOT EXISTS idx_dispatch_log_event ON dispatch_log(event)`,
    `CREATE INDEX IF NOT EXISTS idx_dispatch_log_created ON dispatch_log(created_at)`,
    `CREATE TABLE IF NOT EXISTS app_settings (
       key VARCHAR PRIMARY KEY,
       value TEXT NOT NULL,
       updated_at TIMESTAMP NOT NULL DEFAULT now()
     )`,
    // Task #173 — live GPS pings from on-duty crew.
    `CREATE TABLE IF NOT EXISTS crew_locations (
       user_id VARCHAR PRIMARY KEY,
       lat DECIMAL(10,7) NOT NULL,
       lng DECIMAL(10,7) NOT NULL,
       accuracy DECIMAL(10,2),
       updated_at TIMESTAMP NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_crew_locations_updated ON crew_locations(updated_at DESC)`,
  ];

  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.warn(`[dispatch.migrate] stmt failed: ${sql.slice(0, 60)}… —`, e);
    }
  }
  console.log("[dispatch.migrate] schema ready");
}
