# JC ON THE MOVE Self-Hosting Runbook

Use this path to bring up a self-hosted staging copy while Replit stays live.
Do not move DNS for `jconthemove.com` until staging passes the checks below.

## Target Setup

- Ubuntu 22.04 or 24.04 VPS
- Docker Engine + Docker Compose plugin
- Domain pointed to the VPS, starting with `staging.jconthemove.com`
- PostgreSQL from the included container for staging, or a managed PostgreSQL URL for production
- Caddy for automatic HTTPS

## 1. Prepare The Server

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in after adding your user to the `docker` group.

## 2. Clone And Configure

```bash
sudo mkdir -p /opt/jconthemove
sudo chown "$USER":"$USER" /opt/jconthemove
cd /opt/jconthemove
git clone https://github.com/JCONTHEMOVE/JCONTHEMOVE.COM.git .
cp .env.example .env
nano .env
```

Minimum edits in `.env`:

- `SITE_DOMAIN=staging.jconthemove.com`
- `APP_URL=https://staging.jconthemove.com`
- `SESSION_SECRET=<random long secret>`
- `POSTGRES_PASSWORD=<strong password>`
- `DATABASE_URL=postgresql://jconthemove:<same password>@db:5432/jconthemove`
- `SQUARE_ACCESS_TOKEN=<your token>`
- `SQUARE_ENVIRONMENT=sandbox` for staging, `production` only after payment testing

If you set or change any `VITE_*` values, rebuild the image because Vite bakes those into the frontend bundle.

## 3. First Build And Database Sync

```bash
docker compose build
docker compose up -d db
docker compose run --rm app npm run db:push
docker compose up -d
```

Check logs:

```bash
docker compose logs -f app caddy
```

## 4. Health Checks

```bash
curl http://127.0.0.1:5000/health
curl https://staging.jconthemove.com/health
curl https://staging.jconthemove.com/api/health
```

Expected:

- `/health` responds while the app process is alive
- `/api/health` shows `status: "ready"` after DB and required env are good
- `missingRequired` is empty

## 5. App Smoke Test

Before touching production DNS, test:

- `/`
- `/book`
- `/services`
- `/network/matt`
- `/crew`
- `/crew/reviews`
- `/admin`
- login/logout
- booking submission
- photo upload
- Square sandbox payment flow
- customer approval flow
- payout calculation preview and payout status update

Keep the payout rule intact: cash payouts are not automatic unless the job has reached the approved/finalized state required by the payout UI.

## 6. Update The Self-Hosted Site

```bash
cd /opt/jconthemove
git pull origin main
docker compose build app
docker compose up -d app
docker compose logs -f app
```

If the schema changed:

```bash
docker compose run --rm app npm run db:push
docker compose up -d app
```

## 7. Backups

Create a backup directory:

```bash
mkdir -p /opt/jconthemove/backups
```

Manual database backup:

```bash
docker compose exec -T db pg_dump -U jconthemove jconthemove | gzip > /opt/jconthemove/backups/jconthemove-$(date +%F-%H%M).sql.gz
```

Restore only into a fresh/known database:

```bash
gunzip -c /opt/jconthemove/backups/backup-file.sql.gz | docker compose exec -T db psql -U jconthemove jconthemove
```

## 8. Cut Over Production DNS

After staging passes:

1. Lower DNS TTL for `jconthemove.com` and `www.jconthemove.com`.
2. Change `.env`:
   - `SITE_DOMAIN=jconthemove.com`
   - `APP_URL=https://jconthemove.com`
   - update Google OAuth redirect URI if used
   - switch Square to production only after payment tests
3. Restart:

```bash
docker compose up -d
```

4. Point DNS `A` records to the VPS IP.
5. Verify:

```bash
curl https://jconthemove.com/health
curl https://jconthemove.com/api/health
```

Keep Replit available until the self-hosted site has handled real traffic cleanly for at least a day.

## 9. Rollback

If the VPS has an issue during cutover, point DNS back to Replit/Railway and keep investigating on staging. Do not delete the old deployment until backups, login, booking, payments, and admin flows are proven on the new host.
