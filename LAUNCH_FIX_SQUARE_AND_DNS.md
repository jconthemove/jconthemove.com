# Launch Fix: Square Token And Bare Domain

## Square Token

The app creates Square invoices with these production environment variables:

- `SQUARE_ENVIRONMENT=production`
- `SQUARE_ACCESS_TOKEN=<Production access token from Square Developer Console>`
- `SQUARE_WEBHOOK_URL=https://www.jconthemove.com/api/webhooks/square`
- `SQUARE_WEBHOOK_SIGNATURE_KEY=<Signature key from the Square webhook subscription>`

Important: a Sandbox token only works with `SQUARE_ENVIRONMENT=sandbox`. A Production token only works with `SQUARE_ENVIRONMENT=production`.

### Steps

1. Open the Square Developer Console.
2. Open the JC ON THE MOVE application.
3. Go to **Credentials**.
4. Switch the top environment selector to **Production**.
5. Copy the **Production access token**.
6. In the live host environment variables, update `SQUARE_ACCESS_TOKEN`.
7. Set `SQUARE_ENVIRONMENT=production`.
8. Restart/redeploy the live app.
9. Open `/admin/launch-checklist` and run the Square check.

The Square launch check now performs a real auth probe by listing Square locations, so it catches bad or mismatched tokens instead of only checking that a token exists.

## Square Webhook

Use this webhook notification URL:

```text
https://www.jconthemove.com/api/webhooks/square
```

After creating or editing the Square webhook subscription, copy its signature key into:

```text
SQUARE_WEBHOOK_SIGNATURE_KEY=<Square webhook signature key>
SQUARE_WEBHOOK_URL=https://www.jconthemove.com/api/webhooks/square
```

Recommended Square invoice/payment events:

- `invoice.payment_made`
- `invoice.paid`
- `payment.created`
- `payment.updated`

## Bare Domain DNS

Current public DNS state:

- `www.jconthemove.com` points to `w8c3lfzj.up.railway.app`
- `jconthemove.com` points to Cloudflare IPs

That means the bare domain is stopping at Cloudflare instead of cleanly reaching the app. The fastest safe fix is to redirect the bare domain to the working `www` host.

### Cloudflare Redirect Fix

1. Open Cloudflare.
2. Select `jconthemove.com`.
3. Go to **Rules** -> **Redirect Rules**.
4. Create a rule:
   - Rule name: `Redirect apex to www`
   - If incoming requests match: hostname equals `jconthemove.com`
   - Target URL: `https://www.jconthemove.com${uri.path}`
   - Status code: `301`
   - Preserve query string: enabled
5. Deploy the rule.

The app also redirects `jconthemove.com` to `www.jconthemove.com` if the request reaches the app, but right now Cloudflare must be fixed first because the request is not reliably reaching the app.

