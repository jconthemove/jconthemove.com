# Self-Hosting Deployment Guide (Node + Express + Vite)

This project now supports a standard production deployment flow:

```bash
npm run build
npm start
```

---

## 1) Runtime Requirements

- **Node.js 20+** (recommended: latest Node 20 LTS)
- **npm 10+**
- **PostgreSQL** reachable by `DATABASE_URL`

---

## 2) Environment Variables

### Required in production

Set these before running `npm start` in production:

- `NODE_ENV=production`
- `PORT` (optional override; defaults to `5000`)
- `DATABASE_URL`
- `SESSION_SECRET`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT` (`sandbox` or `production`)

> In production, startup intentionally fails fast when required payment env vars are missing.

### Optional in development

In development (`npm run dev`), payment env vars are optional so local work can continue without live payment credentials.

### Optional feature env vars

Set these only if those features are enabled in your environment:

- `BTC_WALLET_ADDRESS`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `SENDGRID_API_KEY`
- `COMPANY_EMAIL`
- `VITE_SOLANA_RPC_URL`
- `TREASURY_WALLET_PRIVATE_KEY`
- `TREASURY_WALLET_PUBLIC_KEY`
- `MOONSHOT_TOKEN_ADDRESS`

---

## 3) Production Build + Start

From the project root:

```bash
npm ci
npm run build
npm start
```

What this does:

- `npm run build`
  - builds the Vite client to `dist/public`
  - compiles/bundles the Express TypeScript server to `dist/index.js`
- `npm start`
  - runs compiled server with Node (`node dist/index.js`)
  - serves API + static client assets from the same process

---

## 4) Example Linux systemd Service

Create `/etc/systemd/system/jconthemove.service`:

```ini
[Unit]
Description=JC On The Move
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/JCONTHEMOVE.COM
Environment=NODE_ENV=production
Environment=PORT=5000
EnvironmentFile=/opt/JCONTHEMOVE.COM/.env.production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jconthemove
sudo systemctl status jconthemove
```

---

## 5) Reverse Proxy (Nginx)

Point your domain to the server and proxy to the Node app:

```nginx
server {
  listen 80;
  server_name jconthemove.com www.jconthemove.com;

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

After confirming traffic, add TLS (Let’s Encrypt) and redirect HTTP → HTTPS.

---

## 6) Smoke Test Checklist

After deploy, verify:

- Landing page loads
- Booking flow works end-to-end
- Square payment flow works
- Database writes succeed
- Rewards/JCMOVES pages and redemptions load

---

## 7) Troubleshooting

### Build fails with missing tools/deps
Run:

```bash
npm ci
```

### App refuses to boot in production
Check startup logs for missing required env vars (`SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT`, etc.) and set them in your host environment.

### App boots but no DB connectivity
Validate `DATABASE_URL`, DB firewall/security groups, and SSL requirements for your provider.
