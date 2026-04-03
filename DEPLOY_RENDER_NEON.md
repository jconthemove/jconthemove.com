# Render + Neon Deployment Guide

This project is ready to deploy as a single Node web service on Render with a Neon Postgres database.

## Recommended stack

- App host: Render Web Service
- Database: Neon Postgres
- Domain: `jconthemove.com` and `www.jconthemove.com`

## Why this setup fits

- The app already builds into a single server:
  - `npm run build`
  - `npm run start`
- Sessions are already stored in Postgres through `connect-pg-simple`
- Render can run the Node server and serve the built Vite frontend from the same service

## Important note before deploy

This repo still includes Replit-specific object storage integration in:

- `server/objectStorage.ts`
- `/public-objects/*` routes in `server/routes.ts`

That means image/video uploads that depend on Replit object storage may not work on Render until object storage is migrated to another provider such as:

- Cloudflare R2
- AWS S3
- Google Cloud Storage with service credentials

Core app hosting, login, leads, dashboard, and database-backed features can still be deployed separately from that storage migration.

## Render settings

Use these values in Render:

- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/health`

This repo also includes a `render.yaml` file with the same settings.

## Neon setup

1. Create a Neon project.
2. Copy the pooled connection string.
3. In Render, add it as:
   - `DATABASE_URL`

## Required environment variables

At minimum, set these in Render:

- `DATABASE_URL`
- `SESSION_SECRET`
- `NODE_ENV=production`

You will likely also need the same production service secrets you already use elsewhere, depending on which features you want active:

- `SENDGRID_API_KEY`
- `COMPANY_EMAIL`
- `TWILIO_*`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT`
- `SQUARE_WEBHOOK_SIGNATURE_KEY`
- any wallet/rewards/crypto service secrets already used in production

Do not copy local `.env` files into the repo. Set secrets only in the Render dashboard.

## Domain setup

In Render:

1. Open the web service.
2. Add custom domains:
   - `jconthemove.com`
   - `www.jconthemove.com`
3. Update DNS where your domain is managed using the records Render gives you.

## First deploy checklist

1. Push this repo to GitHub.
2. Create the Neon database.
3. Create a Render web service from the GitHub repo.
4. Add environment variables in Render.
5. Deploy.
6. Open `/health` and confirm a healthy response.
7. Test:
   - homepage
   - login
   - customer lead submission
   - employee dashboard
   - `/api/public/crew-availability`

## Post-deploy priority checks

After the first Render deploy, verify these flows first:

1. Auth session persistence
2. Lead creation and dedupe
3. Worker availability check-in
4. Worker job visibility
5. Homepage availability signal
6. Email/SMS notifications
7. Square invoice/payment flows

## Recommended next migration after hosting

The next infrastructure improvement should be replacing Replit object storage with a provider that works cleanly on Render. That will make uploads and public media delivery production-safe outside Replit.
