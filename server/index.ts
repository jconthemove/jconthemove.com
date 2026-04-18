import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import type { InsertRewardItem } from "@shared/schema";

// ── Crash guard — log clearly before exiting so the auto-restart wrapper picks it up ──
process.on("uncaughtException", (err) => {
  console.error(`\n[CRASH] Uncaught exception at ${new Date().toISOString()}:`);
  console.error(err?.stack || err);
  console.error("[CRASH] Auto-restart wrapper will bring the server back up in a moment...\n");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`\n[CRASH] Unhandled promise rejection at ${new Date().toISOString()}:`);
  console.error(reason);
  console.error("[CRASH] Auto-restart wrapper will bring the server back up in a moment...\n");
  process.exit(1);
});

const app = express();

app.set("trust proxy", 1);

// CORS configuration for mobile app
const allowedOrigins = [
  'https://jconthemove.com',
  'https://www.jconthemove.com',
  'https://jconthemove.replit.app',
  'https://jc-on-the-move-mobile.replit.app',
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:5000',
  'http://localhost:8100',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed) || origin.includes('replit'))) {
      return callback(null, true);
    }
    return callback(null, true); // Allow all for now to debug
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie'],
}));

// CRITICAL SECURITY: Handle webhook routes BEFORE global JSON parser
// This preserves raw body bytes needed for HMAC signature validation
app.use('/api/advertising/webhook', express.raw({ type: 'application/json' }));
app.use('/api/webhooks/square', express.raw({ type: 'application/json' }));

// Increase body size limit to support video uploads (4GB limit to accommodate large videos and base64 overhead)
app.use(express.json({ limit: '4096mb' }));
app.use(express.urlencoded({ extended: true, limit: '4096mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (path.startsWith("/api/auth") || path === "/api/snow/logs" || path === "/api/users" || path === "/api/jewelry") {
    const rawCookie = req.headers.cookie || '(none)';
    const hasJcSid = rawCookie.includes('jc.sid');
    const hasConnectSid = rawCookie.includes('connect.sid');
    console.log(`[COOKIE-IN] ${req.method} ${path} | proto=${req.protocol} secure=${req.secure} | jc.sid=${hasJcSid} connect.sid=${hasConnectSid} | raw="${rawCookie.slice(0, 120)}"`);
  }

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
      
      const setCookie = res.getHeader('Set-Cookie');
      if (setCookie) {
        const cookieArr = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
        console.log(`[COOKIE-OUT] ${req.method} ${path} | Set-Cookie:`, cookieArr.map(c => String(c).slice(0, 100)));
      }
    }
  });

  next();
});

(async () => {
  let server;
  try {
    // Initialize server with comprehensive error handling
    console.log('Initializing application server...');
    server = await registerRoutes(app);
    console.log('Application routes registered successfully');

    // Ensure idempotency_keys table exists (extra durability layer for reward ops)
    (async () => {
      try {
        const { pool: dbPool } = await import('./db');
        await dbPool.query(`
          CREATE TABLE IF NOT EXISTS idempotency_keys (
            id         SERIAL PRIMARY KEY,
            key        TEXT NOT NULL UNIQUE,
            scope      TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        console.log('✅ idempotency_keys table ready');
      } catch (e) { console.error('idempotency_keys table init error:', e); }
    })();

    // Crew dispatch columns on leads
    (async () => {
      try {
        const { pool: dbPool } = await import('./db');
        await dbPool.query(`
          ALTER TABLE leads
            ADD COLUMN IF NOT EXISTS dispatch_sent_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS dispatch_notes   TEXT
        `);
        console.log('✅ Crew dispatch columns ready');
      } catch (e) { console.error('dispatch columns init error:', e); }
    })();

    // Seed the rewards marketplace catalog (idempotent)
    const { seedRewardShop } = await import('./seed-reward-shop');
    seedRewardShop().catch(e => console.error("Reward shop seed error:", e));

    // Live migration: update mover prices + insert new service-credit items
    (async () => {
      try {
        const { db } = await import('./db');
        const { pool: migPool } = await import('./db');
        const { rewardItems, rewardCategories } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');

        // (a) Rename legacy "Free 2 Movers · 2 Hours (Local)" → canonical name and ensure price is 100 000
        await migPool.query(`
          UPDATE reward_items
          SET name = '2 Movers · 2 Hours (Local)', token_price = 100000, updated_at = NOW()
          WHERE name IN ('Free 2 Movers · 2 Hours (Local)', '2 Movers · 2 Hours (Local)')
        `);

        // (b) Insert "2 Movers · 1 Hour (Local)" at 60 000 if it does not yet exist
        await migPool.query(`
          INSERT INTO reward_items
            (name, category_id, short_desc, full_desc, token_price, cash_value, status, featured,
             delivery_type, requires_approval, requires_schedule, expiration_days, promo_badge,
             fulfillment_note, admin_notes)
          SELECT
            '2 Movers · 1 Hour (Local)',
            id,
            '2 professional movers for 1 hour — local jobs only',
            'Redeem 60,000 JCMOVES for 2 professional movers for 1 hour on a local job. Admin will contact you to confirm the date and details.',
            60000, '85.00', 'active', false,
            'service_credit', true, true, 365, null,
            'Admin will reach out to schedule your 2-mover / 1-hour local job.',
            '2 movers, 1 hour local. Confirm date and logistics with customer. Approval required.'
          FROM reward_categories
          WHERE name = '🛠️ Service Credits'
          AND NOT EXISTS (
            SELECT 1 FROM reward_items WHERE name = '2 Movers · 1 Hour (Local)'
          )
          LIMIT 1
        `);
        console.log('✅ Mover items migrated (2 Movers · 1 Hr + 2 Movers · 2 Hr)');

        // (b) Find the 🛠️ Service Credits category id
        const [serviceCredits] = await db.select({ id: rewardCategories.id })
          .from(rewardCategories)
          .where(eq(rewardCategories.name, '🛠️ Service Credits'));

        if (serviceCredits) {
          const catId = serviceCredits.id;

          const newItems: InsertRewardItem[] = [
            {
              name: '10-Window Wash — Free Session',
              categoryId: catId,
              shortDesc: 'One residential window-cleaning session, up to 10 windows',
              fullDesc: 'Redeem 50,000 JCMOVES for a free residential window-cleaning session covering up to 10 windows. Admin schedules the appointment and will reach out to confirm a date that works for you.',
              tokenPrice: 50000,
              cashValue: '150.00',
              status: 'active',
              featured: false,
              deliveryType: 'service_credit',
              requiresApproval: true,
              requiresSchedule: true,
              expirationDays: 365,
              promoBadge: null,
              fulfillmentNote: 'Admin will contact you to schedule your window-cleaning session (up to 10 windows). Approval required before scheduling.',
              adminNotes: 'Schedule 10-window residential wash. Confirm date with customer before booking. Approval required.',
            },
            {
              name: '1 Month of Trash Valet — Free',
              categoryId: catId,
              shortDesc: 'One free month of weekly door-step trash pickup',
              fullDesc: 'Redeem 30,000 JCMOVES for one free month of our weekly door-step trash valet subscription. Admin applies the credit directly to your subscription — no hassle, just show up at your door.',
              tokenPrice: 30000,
              cashValue: '79.99',
              status: 'active',
              featured: false,
              deliveryType: 'service_credit',
              createsInvoiceCredit: true,
              requiresApproval: true,
              expirationDays: 365,
              promoBadge: null,
              fulfillmentNote: 'Admin will apply a one-month subscription credit to your trash valet account within 24 hours.',
              adminNotes: 'Apply 1-month trash valet subscription credit to customer account. Confirm with redemption ID.',
            },
            {
              name: 'Handyman Deposit — Long Distance or 2× Local',
              categoryId: catId,
              shortDesc: '$150 deposit credit toward one long-distance or two local handyman jobs',
              fullDesc: 'Redeem 50,000 JCMOVES for a $150 deposit credit redeemable toward one long-distance handyman call or two separate local handyman jobs. Credit expires 6 months from redemption date.',
              tokenPrice: 50000,
              cashValue: '150.00',
              status: 'active',
              featured: false,
              deliveryType: 'service_credit',
              createsInvoiceCredit: true,
              requiresSchedule: true,
              expirationDays: 180,
              promoBadge: null,
              fulfillmentNote: '$150 deposit credit applied toward your handyman job(s). Valid 6 months — covers one long-distance job or two local jobs.',
              adminNotes: 'Apply $150 handyman deposit credit. Usable for 1 long-distance job or 2 local jobs. Expires 6 months from redemption. Reference redemption ID.',
            },
            {
              name: 'Tiny Junk Removal ≤ 300 lbs (Local)',
              categoryId: catId,
              shortDesc: 'One local small-load junk haul, up to ~300 lbs',
              fullDesc: 'Redeem 60,000 JCMOVES for one local small-load junk removal job — up to approximately 300 lbs. Excludes refrigerators, mattresses, TVs, and tires. Admin confirms the load details before scheduling.',
              tokenPrice: 60000,
              cashValue: '150.00',
              status: 'active',
              featured: false,
              deliveryType: 'service_credit',
              requiresApproval: true,
              requiresSchedule: true,
              expirationDays: 365,
              promoBadge: null,
              fulfillmentNote: 'Admin will confirm your junk load details before scheduling. Excludes refrigerators, mattresses, TVs, and tires. Local area only.',
              adminNotes: 'Small junk removal, max ~300 lbs. CONFIRM load contents before scheduling — no fridges, mattresses, TVs, or tires. Local only. Admin approval required.',
            },
          ];

          for (const item of newItems) {
            const [existing] = await db.select({ id: rewardItems.id })
              .from(rewardItems)
              .where(eq(rewardItems.name, item.name));
            if (!existing) {
              await db.insert(rewardItems).values(item);
              console.log(`✅ Inserted new reward item: ${item.name}`);
            } else {
              console.log(`ℹ️  Reward item already exists, skipping: ${item.name}`);
            }
          }
        } else {
          console.warn('⚠️  Service Credits category not found — skipping new item migration');
        }

        console.log('✅ Reward shop migration complete');

        // Normalize any legacy items whose token_price is not a multiple of 500
        // (rounds up to the nearest 500-increment so redemptions don't hard-fail)
        const { pool: normPool } = await import('./db');
        await normPool.query(`
          UPDATE reward_items
          SET token_price = CEIL(token_price::numeric / 500) * 500,
              sale_price_tokens = CASE
                WHEN sale_price_tokens IS NOT NULL AND sale_price_tokens > 0
                     AND MOD(sale_price_tokens, 500) != 0
                THEN CEIL(sale_price_tokens::numeric / 500) * 500
                ELSE sale_price_tokens
              END,
              updated_at = NOW()
          WHERE (token_price > 0 AND MOD(token_price, 500) != 0)
             OR (sale_price_tokens IS NOT NULL AND sale_price_tokens > 0 AND MOD(sale_price_tokens, 500) != 0)
        `);
      } catch (err) {
        console.error('⚠️  Reward shop migration error (non-fatal):', err);
      }
    })();

    // ── Daily Lawn Care Re-book Reminder Sweep ──────────────────────────────
    // Off by default. Set ENABLE_REBOOK_REMINDER_EMAILS=true to enable.
    if (process.env.ENABLE_REBOOK_REMINDER_EMAILS === "true") {
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const runSweep = async () => {
        try {
          const { runRebookReminderSweep } = await import("./services/lawnCareRebookReminder");
          const result = await runRebookReminderSweep();
          console.log(`[rebook-reminder] sweep complete — attempted=${result.attempted} sent=${result.sent} failed=${result.failed}`);
          if (result.failures.length) {
            console.warn(`[rebook-reminder] failures:`, result.failures);
          }
        } catch (err) {
          console.error("[rebook-reminder] sweep error:", err);
        }
      };
      // Run once 60s after boot, then every 24h.
      setTimeout(runSweep, 60_000);
      setInterval(runSweep, ONE_DAY_MS);
      console.log("✅ Lawn care re-book reminder sweep scheduled (daily)");
    } else {
      console.log("ℹ️  Lawn care re-book reminder sweep disabled (set ENABLE_REBOOK_REMINDER_EMAILS=true to enable)");
    }

    // Serve static files from attached_assets directory with proper video support
    app.use('/attached_assets', express.static(path.resolve(process.cwd(), 'attached_assets'), {
      setHeaders: (res, filePath) => {
        // Set proper MIME types and caching for video files
        if (filePath.endsWith('.mp4')) {
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        } else if (filePath.endsWith('.webm')) {
          res.setHeader('Content-Type', 'video/webm');
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
      }
    }));

    // Serve video files from workspace root with proper MIME types
    app.get('/*.mp4', (req, res) => {
      const videoPath = path.resolve(process.cwd(), req.path.substring(1));
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.sendFile(videoPath);
    });

    // Serve specific static HTML files from client/public (dev) or dist/public (prod)
    app.get('/structure-review.html', (_req, res) => {
      const devPath = path.resolve(process.cwd(), 'client/public/structure-review.html');
      const prodPath = path.resolve(process.cwd(), 'dist/public/structure-review.html');
      const filePath = fs.existsSync(devPath) ? devPath : prodPath;
      res.setHeader('Content-Type', 'text/html');
      res.sendFile(filePath);
    });

    // Setup Vite for development or serve static files for production
    if (app.get("env") === "development") {
      console.log('Setting up Vite development server...');
      await setupVite(app, server);
      console.log('Vite development server configured successfully');
    } else {
      console.log('Configuring static file serving for production...');
      serveStatic(app);
      console.log('Static file serving configured successfully');
    }

    // Error handling middleware should be last to catch all errors
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      // If headers are already sent, pass to default Express error handler
      if (res.headersSent) {
        return next(err);
      }

      const status = err.status || err.statusCode || 500;
      
      // Sanitize error messages for production 5xx errors
      let message: string;
      if (status >= 500 && process.env.NODE_ENV === "production") {
        message = "Internal Server Error";
      } else {
        message = err.message || "Internal Server Error";
      }

      // Log the error for debugging and monitoring
      console.error(`Error ${status} on ${req.method} ${req.path}:`, err.message);
      
      // In development, log the full stack trace
      if (process.env.NODE_ENV === "development") {
        console.error("Full error stack:", err.stack);
      }

      res.status(status).json({ message });
    });

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    console.log(`Starting server on port ${port}...`);
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      console.log('✅ JC ON THE MOVE application started successfully');
      log(`serving on port ${port}`);
    });

  } catch (error) {
    console.error('❌ Failed to initialize JC ON THE MOVE application:');
    console.error('Error details:', error);
    
    // In deployment, log detailed error but continue gracefully
    if (process.env.NODE_ENV === 'production') {
      console.error('Application startup failed in production. Check configuration.');
      console.error('Common issues: Invalid environment variables, database connection, or service configurations');
    }
    
    // Don't exit in development for better debugging
    if (process.env.NODE_ENV !== 'development') {
      console.error('Exiting due to startup failure...');
      process.exit(1);
    }
  }
})();
