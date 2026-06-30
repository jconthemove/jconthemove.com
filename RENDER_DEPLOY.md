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

`/health` is the Render liveness probe. It returns quickly during cold starts and includes deploy version/bootstrap status so Render does not kill the service while heavier route and database startup work finishes. `/api/health` remains the strict operator readiness probe; it proves API routes, database, and required environment variables are ready, and returns HTTP `503` when readiness fails.

## Render environment variables

This must be provided for the app to boot correctly:

- `DATABASE_URL`

These should be provided before launch readiness is considered green:

- `SESSION_SECRET`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT`

`SESSION_SECRET` is generated automatically by Render only when the service is created from the Blueprint. If the service already exists or was created manually, set it yourself in Render with a random 32+ character value. If it is missing, the app can still boot with a temporary runtime secret, but users can be logged out after restarts and `/api/health` will stay not-ready.

## Repair an existing stale Render service

If `https://jc-on-the-move.onrender.com/health` returns HTTP `200` but has no `version.shortCommit`, Render is serving an older build.

Run the deploy doctor first:

```bash
npm run render:doctor
```

It checks three things without printing secrets:

- whether live Render is still stale
- whether Render readiness is blocked by missing required env vars
- whether `www.jconthemove.com` is still routed to the old Railway service
- whether the latest GitHub deploy workflow failed before triggering Render
- whether this machine has `RENDER_DEPLOY_HOOK_URL` or `RENDER_API_KEY` + `RENDER_SERVICE_ID`

If `https://jc-on-the-move.onrender.com/api/health` reports missing env vars, fix those in Render first:

- Render dashboard -> `jc-on-the-move` -> `Environment`
- Add or update `SESSION_SECRET`
- Add or update `SQUARE_ACCESS_TOKEN`
- Add or update `SQUARE_ENVIRONMENT`
- Add or update `APP_URL=https://www.jconthemove.com`
- Click `Save Changes`
- Trigger a manual deploy from Render once the env vars are saved

`SESSION_SECRET` and Square variables do not block liveness deploys, but `/api/health`, Square invoice links, and the launch checklist will stay red until `SESSION_SECRET`, `SQUARE_ACCESS_TOKEN`, and `SQUARE_ENVIRONMENT` are set.

Then add one explicit GitHub deploy trigger if you want GitHub to force a Render deploy and wait for the new public commit:

- Preferred: GitHub Actions secret or repository variable `RENDER_DEPLOY_HOOK_URL`
- Fallback: GitHub Actions secrets/variables `RENDER_API_KEY` and `RENDER_SERVICE_ID`

To create the preferred hook:

1. Render dashboard -> `jc-on-the-move` -> `Settings` or `Deploy Hooks`.
2. Create a deploy hook for branch `main`.
3. Copy the full hook URL.
4. GitHub -> `JCONTHEMOVE.COM` -> `Settings` -> `Secrets and variables` -> `Actions`.
5. Add repository secret `RENDER_DEPLOY_HOOK_URL` with the full hook URL. A repository variable also works, but a secret is cleaner.
6. Re-run the failed `Trigger Render Deploy` workflow or push a new commit.

If you also set `RENDER_DEPLOY_HOOK_URL` locally in `.env` or in this shell, you can trigger directly:

```bash
npm run render:trigger
```

The GitHub workflow builds the release first. If a deploy hook or Render API credentials are configured, it triggers Render and waits inline for the public health endpoint to show the pushed commit. If no explicit trigger is configured, the workflow passes after a successful build and lets Render auto-deploy after GitHub checks pass. The separate `Verify Render Deployment` workflow is manual-only so it cannot become another check that Render waits on.

This split avoids the classic deadlock:

- GitHub waits for Render before marking checks green.
- Render waits for GitHub checks to pass before deploying.

If you intentionally want GitHub to fail unless a Render hook/API trigger exists, set repository variable `REQUIRE_RENDER_TRIGGER=true`.

For the strongest launch path, add one of:

- GitHub Actions secret `RENDER_DEPLOY_HOOK_URL`
- GitHub Actions secrets `RENDER_API_KEY` and `RENDER_SERVICE_ID`

If neither trigger is set, the workflow finishes after the build and Render Git auto-deploy can start from the Render dashboard/repo connection. If the live service stays stale after a green GitHub run, add `RENDER_DEPLOY_HOOK_URL` or `RENDER_API_KEY` plus `RENDER_SERVICE_ID`.

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
6. After the first deploy starts, open `https://<your-service>.onrender.com/health`.
7. Confirm it returns HTTP `200` with `status: "alive"` or `status: "ready"` and a `version.shortCommit`.
8. Then open `https://<your-service>.onrender.com/api/health` and confirm strict readiness before launch.

## Auto-deploy fallback

The repo also includes `.github/workflows/render-deploy.yml`. This workflow fires on every push to `main` and builds the app. With a Render hook/API secret or variable it also triggers Render and verifies inline. Without an explicit trigger, it passes after the build so Render services configured to deploy after passing GitHub checks are not blocked. `.github/workflows/render-verify.yml` is kept as a manual workflow for checking the public commit after Render starts.

Preferred trigger:

- `RENDER_DEPLOY_HOOK_URL`

API trigger fallback:

- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`

Add it in GitHub under `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`. Repository variables also work for `RENDER_DEPLOY_HOOK_URL` and `RENDER_SERVICE_ID`, but keep `RENDER_API_KEY` as a secret when possible.

Use an explicit trigger even if Render's Git auto-deploy is enabled. It gives us a second deploy path and makes it easier to tell whether GitHub saw the push.

When neither trigger is set:

1. `Trigger Render Deploy` builds and passes.
2. Render should start from its GitHub auto-deploy connection after checks pass.
3. Run the manual `Verify Render Deployment` workflow or `npm run render:doctor` locally after Render starts.
4. If Render still stays stale, add `RENDER_DEPLOY_HOOK_URL`, or add `RENDER_API_KEY` plus `RENDER_SERVICE_ID`.

## Health check response

Live services return HTTP `200` and `status: "alive"` from `/health`. Ready services return HTTP `200` and `status: "ready"` from `/api/health`. If the database probe fails or a required environment variable is missing, `/api/health` returns HTTP `503` with readiness details. `/health` always returns HTTP `200` for liveness and includes `version` plus `boot` status so you can quickly see which commit is running.

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

Run `npm run verify:production` after DNS changes. It should pass and show a deployed commit from `/health`; then run `/admin/launch-checklist` for the rest of the launch checks.

## Notes

- Render automatically provides `PORT`, and the server already respects it.
- If `APP_URL` is not set, the app now falls back to Render's `RENDER_EXTERNAL_URL` before falling back to `https://jconthemove.com`.
- The app uses an external Postgres URL, so no Render Postgres instance is required unless you want to migrate databases later.
