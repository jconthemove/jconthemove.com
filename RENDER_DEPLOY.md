# Render Deployment

## Blueprint

This repo includes a Render Blueprint in `render.yaml`.

It creates one Node web service with:

- `buildCommand`: `npm ci && npm run build`
- `startCommand`: `npm run start`
- `healthCheckPath`: `/health`
- `branch`: `main`
- `plan`: `starter`
- `region`: `ohio`

`/health` is the canonical Render/Railway platform probe. `/api/health` is the strict readiness probe for API clients and manual checks, so both paths return identical JSON for app, database, and environment readiness while `/api/health` uses HTTP `503` when readiness fails.

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
7. Confirm `https://<your-service>.onrender.com/api/health` returns the same readiness JSON.

## Auto-deploy fallback

The repo also includes `.github/workflows/render-deploy.yml`. This workflow fires on every push to `main` and calls a Render deploy hook when the GitHub Actions secret below is present:

- `RENDER_DEPLOY_HOOK_URL`

Add it in GitHub under `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`.

Use this even if Render's Git auto-deploy is enabled. It gives us a second, explicit deploy trigger and makes it easier to tell whether GitHub saw the push.

## Health check response

Ready services return HTTP `200` and `status: "ready"`. If the database probe fails or a required environment variable is missing, `/health` still returns HTTP `200` with `status: "not_ready"` for platform liveness, while `/api/health` returns HTTP `503` with the same JSON for strict readiness.

The JSON shape is:

```json
{
  "status": "ready",
  "service": "jc-on-the-move",
  "timestamp": "2026-05-09T00:00:00.000Z",
  "uptimeSeconds": 123,
  "checks": {
    "app": {
      "status": "ready",
      "nodeEnv": "production",
      "port": "10000"
    },
    "db": {
      "status": "ready",
      "connected": true,
      "latencyMs": 12
    },
    "env": {
      "status": "ready",
      "missingRequired": [],
      "required": {
        "DATABASE_URL": "present",
        "SESSION_SECRET": "present",
        "SQUARE_ACCESS_TOKEN": "present",
        "SQUARE_ENVIRONMENT": "present"
      },
      "optional": {
        "APP_URL": "present",
        "MOONSHOT_TOKEN_ADDRESS": "present",
        "TREASURY_WALLET_PRIVATE_KEY": "present",
        "TREASURY_WALLET_PUBLIC_KEY": "present",
        "SENDGRID_API_KEY": "present",
        "COMPANY_EMAIL": "present",
        "VITE_SOLANA_RPC_URL": "present"
      }
    }
  }
}
```

## Custom domain

After the Render service is healthy:

1. Add your custom domain in the Render dashboard.
2. Update `APP_URL` in Render to the final public URL, such as `https://jconthemove.com`.
3. If you use Square webhooks, also update any webhook callback URL to the new Render/custom-domain URL.

If `https://www.jconthemove.com/api/health` includes Railway headers, the public domain is still routed to the old Railway service. In Cloudflare/DNS, remove or disable the Railway target and point:

- `www` to the Render custom-domain target Render gives you.
- The apex/root domain to Render if your DNS supports CNAME flattening/ALIAS, or redirect `jconthemove.com` to `www.jconthemove.com`.

Run `npm run verify:production` after DNS changes. It should pass and show a deployed commit from `/api/health`; then run `/admin/launch-checklist` for the rest of the launch checks.

## Notes

- Render automatically provides `PORT`, and the server already respects it.
- If `APP_URL` is not set, the app now falls back to Render's `RENDER_EXTERNAL_URL` before falling back to `https://jconthemove.com`.
- The app uses an external Postgres URL, so no Render Postgres instance is required unless you want to migrate databases later.
