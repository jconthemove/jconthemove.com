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
- **JCMOVES Rewards Marketplace**: Full CMS-driven token redemption marketplace. Customers browse and redeem earned JCMOVES for service credits, gift cards, and local deals. Admin catalog manager at `/admin/marketplace` allows creating/editing/hiding items, managing categories, and approving/fulfilling redemptions. Tables: `reward_categories`, `reward_items`, `reward_redemptions`. Auto-seeded with 6 categories and 21 starter items on first run.
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