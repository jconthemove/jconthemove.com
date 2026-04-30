# Render Deployment

## Blueprint

This repo includes a Render Blueprint in `render.yaml`.

It creates one Node web service with:

- `buildCommand`: `npm ci && npm run build`
- `startCommand`: `npm run start`
- `healthCheckPath`: `/health`
- `plan`: `starter`
- `region`: `ohio`

## Required Render environment variables

These must be provided during the first Blueprint deploy because the app refuses to boot without them:

- `DATABASE_URL`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT`

`SESSION_SECRET` is generated automatically by Render.

## Strongly recommended variables

Set these before going live so customer links, wallet features, email, and maps work correctly:

- `APP_URL`
- `MOONSHOT_TOKEN_ADDRESS`
- `TREASURY_WALLET_PRIVATE_KEY`
- `TREASURY_WALLET_PUBLIC_KEY`
- `VITE_SOLANA_RPC_URL`
- `GOOGLE_MAPS_API_KEY`
- `SENDGRID_API_KEY`
- `COMPANY_EMAIL`
- `COMPANY_PHONE`

Optional feature variables:

- `BTC_WALLET_ADDRESS`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`

## First deploy steps

1. Push this repo to GitHub.
2. In Render, click `New` -> `Blueprint`.
3. Connect the repo and select the branch you want to deploy.
4. When Render prompts for `sync: false` variables, enter at least the required ones above.
5. Deploy the Blueprint.
6. After the first deploy finishes, open `https://<your-service>.onrender.com/health`.

## Custom domain

After the Render service is healthy:

1. Add your custom domain in the Render dashboard.
2. Update `APP_URL` in Render to the final public URL, such as `https://jconthemove.com`.
3. If you use Square webhooks, also update any webhook callback URL to the new Render/custom-domain URL.

## Notes

- Render automatically provides `PORT`, and the server already respects it.
- If `APP_URL` is not set, the app now falls back to Render's `RENDER_EXTERNAL_URL` before falling back to `https://jconthemove.com`.
- The app uses an external Postgres URL, so no Render Postgres instance is required unless you want to migrate databases later.
