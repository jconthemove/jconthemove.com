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
- **UI/UX Decisions**: Modern, responsive design with dark mode toggle. Features include live price cards, a unified mining dashboard, and a consolidated "IN GOD WE TRUST" admin dashboard with tabbed navigation. Emphasizes intuitive navigation and visual prominence for key features.

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
- **JCMOVES Rewards Marketplace**: Full CMS-driven token redemption marketplace. Customers browse and redeem earned JCMOVES for service credits, gift cards, and local deals. Admin catalog manager at `/admin/marketplace`. Tables: `reward_categories`, `reward_items`, `reward_redemptions`, `reward_entitlements`, `spin_results`, `gift_card_inventory`, `invoice_credits`, `service_credit_balances`. Auto-seeded with 6 categories and 21 starter items.
- **Marketplace Logic Flags**: Every reward item has fulfillment behavior flags — `is_instant`, `requires_approval`, `requires_schedule`, `creates_invoice_credit`, `creates_service_credit`, `creates_spin_credit`, `uses_mystery_pool`, `is_bundle`, `fulfillment_note`. Used to auto-route each redemption type to the correct flow.
- **Redemption Lifecycle**: Full status system — `pending` → `pending_approval` → `approved` → `redeemed_pending_schedule` → `scheduled` → `fulfilled` / `completed` → `refunded` / `denied`. Admin queue shows correct action buttons per status.
- **Prize Wheel & Mystery Box**: Spin wheel auto-launches after Spin Wheel Entry redemption. Server-decided prize (tamper-proof). Mystery box uses weighted pool resolved server-side. All results logged to `spin_results`.
- **Service & Invoice Credits**: Labor credit redemptions create `service_credit_balances` records (minutes). Invoice credit items create `invoice_credits` records ($). Both tracked separately from main redemption.
- **Marketplace Artwork**: All 21 reward items have AI-generated premium dark-theme card images in `/client/public/rewards/*.png`.
- **JCMOVES Loyalty Tier System**: 4-tier program (Bronze/Silver/Gold/VIP) with escalating token earn rates. Formula: `tokens = job_price × tokensPerDollar` (50/60/75/100 per tier). Tiers unlock at $0/$1,000/$2,500/$5,000 lifetime spend. `loyalty_tier` and `total_completed_spend` columns added to users table. All 3 job completion reward paths updated. Utility in `client/src/lib/loyalty.ts` and `server/constants.ts`.
- **Earnings Simulator**: Dialog on Rewards Marketplace showing token projections at all tiers for any entered job price, with quick presets ($100/$250/$500/$1,000).
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

## Mobile App Framework
- **Capacitor**: Hybrid mobile app wrapping.