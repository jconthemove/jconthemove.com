import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Database pool error (connection will be replaced):', err.message);
});

process.on('uncaughtException', (err) => {
  if (err.message?.includes('terminating connection') || (err as any).code === '57P01') {
    console.error('Database connection terminated, pool will reconnect automatically');
    return;
  }
  console.error('Uncaught exception:', err);
  process.exit(1);
});

export const db = drizzle({ client: pool, schema });

// Convenience type for code that needs to accept a transaction handle
// from db.transaction(async (tx) => ...).
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
