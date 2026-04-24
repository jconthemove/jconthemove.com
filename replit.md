# Overview

This full-stack application is a comprehensive platform for moving and junk removal services, designed to streamline operations for "JC ON THE MOVE". It allows customers to request quotes for various services and provides businesses with a powerful operations dashboard for managing leads, assigning jobs, and tracking finances. The platform integrates a custom Solana blockchain solution for treasury management, featuring real-time monitoring and analytics. Key capabilities include automated notifications, role-based authentication, and a modern, responsive user interface. The project aims to enhance efficiency, customer engagement, and financial transparency for moving and junk removal businesses.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite.
- **Routing**: Wouter for client-side routing.
- **UI Components**: shadcn/ui built on Radix UI.
- **Styling**: Tailwind CSS with CSS variables.
- **State Management**: TanStack Query for server state.
- **Forms**: React Hook Form with Zod validation.
- **UI/UX Decisions**: Mobile-first design with orange (#E86329) + cream (#F5F0EB) color palette. Customer experience features a bottom tab bar (Home, Jobs, Post, Rewards, Profile), splash screen, clean onboarding flow, and card-based job feed. Admin/employee views retain the existing TeamHub/Dashboard interface with header navigation. Dark mode toggle supported throughout.
- **Unified Add-Lead System**: `BookingChatbot` with `variant="employee"` powers all service intake — online booking, customer home, hub "Add Lead" tab, and `employee-add-job` page all use the same 12-service tile grid with service-specific structured questionnaires. Employee variant includes photo upload step and posts to `/api/leads/employee`.
- **Mobile-First Customer Flow**: Splash page → Onboarding (name, email, phone) → Home feed with job cards → Post a Job (multi-step) → Rewards tab → Profile tab. Bottom tab bar replaces header for customer role.
- **Role-Based Routing**: Customers get the new mobile-first experience (`CustomerApp` with `BottomTabBar`). Employees/admins land on existing TeamHub/Dashboard with `Header` navigation.

## Backend Architecture
- **Server**: Express.js with TypeScript.
- **Database ORM**: Drizzle ORM with PostgreSQL.
- **Session Management**: Express sessions with PostgreSQL store.
- **API Design**: RESTful API with robust error handling and logging.
- **Authentication**: Custom email/password authentication with bcrypt hashing and session fixation protection. Implements role-based access control (Admin, Employee, Customer) and status-based access for route protection.
- **Database Schema**: Manages leads, contacts, users, job statuses, employee assignments, and mining sessions.
- **Email Integration**: SendGrid for transactional emails and automated notifications.
- **Solana Blockchain Integration**: Treasury management, JCMOVES token transfers, real-time balance verification, and reconciliation.
- **Reward Systems**: Implements a comprehensive system for JCMOVES token rewards for various activities including lead creation, job completion, referrals, shop listings, and purchases.
- **Staking System**: Tiers of JCMOVES token staking with varying APRs and lockup periods, designed for long-term sustainability with dynamic APR adjustments based on treasury health.
- **Nominee System**: Up to 3 active nominees, each receiving an equal share of 1% of every JCMOVES transaction platform-wide. Tim Mewbourn's family is seeded as first nominee. DB table `nominees`, service at `server/services/nominees.ts`. Admin can add/toggle nominees via the "Nominate" tab in the floating heart dialog. API routes: `GET/POST /api/nominees`, `PATCH /api/nominees/:id`.
- **10% Platform Generosity Fund**: Separate internal wallet account (`platform-generosity-fund`) receives 10% of every JCMOVES credit/debit platform-wide. Fully separate from Nicolasa's 1% fund. Log table `generosity_fund_log`. Admin stats at `GET /api/generosity-fund`.
- **Nicolasa 1% Fund**: Mom's internal wallet (`nicolasa-jackson-generosity`) receives 1% of every JCMOVES transaction. Direct love donations via the ❤️ floating heart button.
- **Circular Guard**: Internal wallets (Nicolasa, Generosity Fund, nominees) are excluded from triggering further fund contributions to prevent infinite loops. Guard uses `INTERNAL_WALLET_IDS` set + `nominee-` prefix check.
- **JCMOVES Rewards Marketplace**: Full CMS-driven token redemption marketplace. Customers browse and redeem earned JCMOVES for service credits, gift cards, and local deals. Admin catalog manager at `/admin/marketplace`. Tables: `reward_categories`, `reward_items`, `reward_redemptions`, `reward_entitlements`, `spin_results`, `gift_card_inventory`, `invoice_credits`, `service_credit_balances`. Auto-seeded with 6 categories and 21 starter items.
- **Marketplace Logic Flags**: Every reward item has fulfillment behavior flags — `is_instant`, `requires_approval`, `requires_schedule`, `creates_invoice_credit`, `creates_service_credit`, `creates_spin_credit`, `uses_mystery_pool`, `is_bundle`, `fulfillment_note`. Used to auto-route each redemption type to the correct flow.
- **Redemption Lifecycle**: Full status system — `pending` → `pending_approval` → `approved` → `redeemed_pending_schedule` → `scheduled` → `fulfilled` / `completed` → `refunded` / `denied`. Admin queue shows correct action buttons per status.
- **Progressive Jackpot Spin Wheel**: Full rebuild of spin wheel. 11-prize table (250=30%, 500=20%, 750=13%, 1000=8%, 100=10%, 50=5%, Nada=5%, Mystery=1%, 25% Off Coupon=1%, Coffee Gift Card=2%, 10% Off Coupon=5%). Direct spin costs 100 JCMOVES (deducted from wallet); marketplace entry spins are free. Mini jackpot (starts 5K, +2/spin, 0.05% win) and Major jackpot (starts 50K, +5/spin, 0.001% win) grow with every spin and reset on win. Coupon prizes auto-generate promo codes with **365-day expiry** stored in `promo_codes`. Mystery prizes pay a server-side weighted token bonus. All results logged to `spin_results` with `prize_type`, `jackpot_type_won`, `jackpot_amount_won`, `coupon_code` columns. DB tables: `jackpots`, `spin_config`. Admin tab at `/admin/marketplace` → Spin Wheel: view/reset jackpots, toggle wheel on/off, edit spin cost. Featured card in Rewards Marketplace shows live jackpot meters + last jackpot winner.
- **Service & Invoice Credits**: Labor credit redemptions create `service_credit_balances` records (minutes). Invoice credit items create `invoice_credits` records ($). Both tracked separately from main redemption.
- **Marketplace Artwork**: All 21 reward items have AI-generated premium dark-theme card images in `/client/public/rewards/*.png`.
- **JCMOVES Loyalty Tier System**: 4-tier program (Bronze/Silver/Gold/VIP) with escalating token earn rates. Formula: `tokens = job_price × tokensPerDollar` (50/60/75/100 per tier). Tiers unlock at $0/$1,000/$2,500/$5,000 lifetime spend. `loyalty_tier` and `total_completed_spend` columns added to users table. All 3 job completion reward paths updated. Utility in `client/src/lib/loyalty.ts` and `server/constants.ts`.
- **Earnings Simulator**: Dialog on Rewards Marketplace showing token projections at all tiers for any entered job price, with quick presets ($100/$250/$500/$1,000).
- **Push Notifications**: Full Web Push pipeline using VAPID keys. Service worker handles push events and notification clicks. `notificationService` (server) sends push via `web-push` library. Fires on: mining session auto-claim (server-side), manual claim, job completion rewards, new reward events. Client-side `useMiningNotifications` hook polls mining status and reward history every 60–90 seconds and fires local notifications when tokens become claimable or new rewards arrive. VAPID keys stored as shared env vars. Subscription stored in `users.pushSubscription` (JSONB). `NotificationPrompt` component requests permission + subscribes on grant; silently re-subscribes if already granted.
- **Token Estimate on Booking**: "Book a Job" form has optional budget input with live JCMOVES preview. Post-submission confirmation banner shows estimated tokens earned and links to marketplace.
- **AI Crew Assignment Assistant**: Algorithm for suggesting optimal employee job assignments based on various factors.
- **Compliance**: Mandatory age verification (18+) and Terms of Service acceptance.

## Deployment Architecture
- **Build System**: ESBuild for production bundling.
- **Environment Variables**: Managed for database, SendGrid, session secrets, and Solana RPC URL.
- **Database Migrations**: Drizzle Kit for schema management.
- **Media Storage**: Replit Object Storage for large media files.
- **Mobile App Deployment**: Utilizes Capacitor for hybrid mobile app wrapping for Android.

# External Dependencies

## Database
- **Neon Database**: Serverless PostgreSQL.

## Email Service
- **SendGrid**: Email delivery service.

## UI Components
- **Radix UI**: Primitive component library.
- **Lucide React**: Icon library.
- **shadcn/ui**: Pre-built component system.

## Blockchain Integration
- **Solana Blockchain**: For JCMOVES token and treasury.
- **DexScreener API**: For live JCMOVES token pricing.

## JCMOVES USD wallet — INVARIANT
JCMOVES USD lives in `wallet_accounts.cash_balance`. It may ONLY be incremented
when a real customer payment has been RECEIVED:
- Square `invoice.payment_made` / `invoice.paid` webhook → `creditJcMovesUsd`
- Square `payment.created` COMPLETED webhook → `creditJcMovesUsdFromPrepaid`
- Admin "Mark as Paid" on a lead (manual confirmation of cash/check)
- Square invoice sync (only after Square confirms `paid`)
- Bundle add-on grants disbursed via `services/bundleBilling.ts` — pending → granted
  on `invoice.payment_made` (or registration reconcile of already-paid grants)
- Refund of customer's previously-paid funds (e.g. jewelry reservation expiry)

Free engagement rewards (daily check-in, ratings, achievements, referrals) must
mint **JCMOVES tokens** from the treasury, never JCMOVES USD. The reward record
may store a `cashValue` field for analytics/display, but it must NOT be added to
`cash_balance`. See the inline comment on `walletAccounts.cashBalance` in
`shared/schema.ts` for the canonical rule.

## Unified Daily Rewards Engine
There is exactly one daily check-in code path: `server/services/daily-rewards.ts`
(`dailyRewardsService.checkIn`). It powers `POST /api/gamification/checkin`,
which is hit by the Earn Tasks button, the mobile lead manager, and the spin
wheel. It combines fraud detection (IP + device fingerprint + risk score logged
to `fraud_logs`), Eastern-day streak tracking, treasury-funded JCMOVES
distribution, wallet credit (tokens only — `cash_balance` is never touched),
points / employee-stats updates, and the 7-day-streak achievement.
Token payout = `$0.25 USD × tokenStreakMultiplier(streak) ÷ current JCMOVES
price`, where `tokenStreakMultiplier` is `1 + 0.1 × (streak − 1)` capped at
`2.5x`. Points keep the existing `1.1^n` curve capped at `3.0x`. Two services
used to exist; the legacy `server/services/daily-checkin.ts` has been removed.

## Mobile App Framework
- **Capacitor**: Hybrid mobile app wrapping.

## Service Catalog — Crew Pricing Notes (Painting & Flooring)
Both `painting` and `flooring` live in `service_catalog` as **quote-mode** rows
(no rack price). The booking wizard surfaces only the suggested-min/max as a
"starting at" hint; the crew always firms up the final number off-platform after
the booking-chatbot questionnaire is reviewed. Guardrails seeded in
`server/services/bookingCatalogSeed.ts`:

- **Painting** — suggested range **$300–$3,500**.
  - Interior single accent wall / small bedroom: ~$300–$600.
  - Standard interior room (12×12, 1 coat over similar color): ~$450–$750.
  - Whole-condo / 2-bed interior repaint: ~$1,500–$2,500.
  - Full-house exterior repaint: ~$2,500–$3,500+ (escalate above range as needed).
  - Add-ons that should bump the quote: ceilings, trim/doors, primer required,
    heavy prep / patching, two-color or accent walls, popcorn or textured walls,
    second-story exterior. The chatbot collects all of these in
    `paintingAddons` / `paintingPrep` / `paintingMaterials` etc.

- **Flooring** — suggested range **$400–$5,000**.
  - Single small room install (LVP/laminate, ≤150 sqft, no removal): ~$400–$800.
  - Standard 2-bed install with old-floor removal & haul-away: ~$1,500–$3,000.
  - Whole-house LVP/laminate replacement: ~$3,500–$5,000+ (escalate above range).
  - Add-ons that should bump the quote: removing existing floor, hauling away
    debris, transition trim/quarter-round, subfloor leveling, hardwood refinish
    vs. install, tile (labor-heavy). The chatbot collects these in
    `flooringOldRemoval` / `flooringHaulAway` / `flooringTrim` /
    `flooringMaterials`.

Quote-mode means the wizard's discount engine still applies any matching bundle
(no bundle currently includes painting or flooring), but the per-line subtotal
is whatever the crew lands on — there is no `defaultPrice × quantity` math.

### Editable rule files (Task #211)
The booking wizard now turns the BookingChatbot questionnaire answers into a
soft estimate before the crew calls back, instead of dropping a `TBD`/$0
line. Rules are *deliberately* split out into hand-editable TS so ops can tune
the numbers without touching wizard code:

- `server/services/quoteRules/painting.ts` exports `PAINTING_RULES` and
  `estimatePainting(answers, fallback)`. Reads `paintingType` (interior /
  exterior / both), `paintingRoomCount`, `paintingRoomSize`, `paintingAddons`,
  `paintingPrep`, `paintingSurface`, `paintingMaterials`. Computes
  `(roomBase × rooms) + addons` then multiplies by prep/surface/type factors
  and clamps to the catalog suggested-min/max so we never quote outside the
  guardrails above.
- `server/services/quoteRules/flooring.ts` exports `FLOORING_RULES` and
  `estimateFlooring(answers, fallback)`, plus a forgiving `parseRoomsSqft`
  that pulls `~400 sq ft` (or `2 rooms`) out of the chatbot's free-text
  answer. Per-sqft tier depends on product (laminate/LVP/hardwood/tile),
  then adds flat fees for old-floor removal, haul-away, premium materials and
  transition trim. Has a `MIN_JOB_FEE = $350` floor and the same suggested-
  min/max clamp.

Both helpers are tolerant of the chatbot's emoji prefixes (`🏠 Interior`,
`🪵 Hardwood`, etc.) and return the catalog suggested-min when no chatbot
answers are present, so unanswered legacy bookings still see a sane number.

Wiring:
1. `server/services/pricingEngine.ts → quoteService()` recognises
   `serviceCode === "painting" | "flooring"` and routes through the rule file
   (re-exporting `estimatePainting` / `estimateFlooring`).
2. `server/routes/bookings.ts → resolveItems()` overrides `unitPrice` on
   painting/flooring lines using `item.details` + the catalog
   suggested-min/max as the fallback band.
3. `client/src/components/MultiBookingFlow.tsx` exposes `formatLinePrice()` +
   `ESTIMATE_SERVICE_CODES`; both `book.tsx` (review/confirmation) and the
   inline editor / sticky summary show "$X (est)" with an "Estimate — crew
   confirms" caption instead of the legacy `TBD` for these two services.

To re-tune: edit the `PAINTING_RULES` / `FLOORING_RULES` objects (room base,
addon prices, multipliers) — no schema changes or migrations needed; the
wizard picks up the new numbers on next request.