# Deploying BalVahini

Single domain, single Nginx config.

```
yourdomain.com            → React build (static)
yourdomain.com/api        → Node on 127.0.0.1:4000
yourdomain.com/socket.io  → same Node process (websockets)
yourdomain.com/uploads    → same Node process (files on disk)
```

Substitute your real domain wherever `YOUR_DOMAIN` appears below. It occurs in
exactly three places: `deploy/nginx.conf` (`server_name`), the `.env`
(`APP_URL` and `CORS_ORIGIN`), and the certbot command.

## Where the generic SOP differs for this project

Five things, each of which would have broken something:

1. **Folders are `backend/` and `frontend/`** — matching the SOP.
2. **The API is TypeScript.** There is no `server.js` to start — build first, then
   PM2 runs `dist/server.js`.
3. **Port is 4000**, not 5000. Change `PORT` in `.env` if you prefer 5000, but
   then change `nginx.conf` to match — the two must agree.
4. **`VITE_API_BASE_URL` does not exist here.** The web app already calls `/api`
   relatively, so there is nothing to configure and no way to accidentally ship
   `localhost:4000` to production.
5. **Nginx needs three extra things** the generic config lacks:
   `client_max_body_size 10m` (uploads are 5 MB, Nginx defaults to 1 MB → every
   upload 413s), a `/uploads/` location (or every logo and document 404s), and a
   long `proxy_read_timeout` on `/socket.io/` (a parked bus sends nothing for
   minutes and the default 60s drops the socket).

**HTTPS is not optional.** `navigator.geolocation` is refused on plain HTTP, so
without a certificate the driver's phone never reports a position and live
tracking is dead. Do step 7.

**Ports to open:** only 22, 80 and 443. Mongo (27017) and Redis (6379) must stay
bound to 127.0.0.1 — they have no authentication in this setup, and exposing
either one hands over every school's data.

---

## 1. Server prep

```bash
sudo apt update && sudo apt install -y nginx git curl
```

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
```

```bash
sudo npm install -g pm2
```

## 2. MongoDB and Redis

Both are required. Redis is what makes OTPs, rate limits and the live socket
work across more than one process — and it is cheap insurance even on one.

```bash
sudo apt install -y redis-server && sudo systemctl enable --now redis-server
```

For MongoDB use either a managed cluster (Atlas — recommended, you get backups)
or install it locally:

```bash
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb.gpg --dearmor && echo "deb [signed-by=/usr/share/keyrings/mongodb.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb.list && sudo apt update && sudo apt install -y mongodb-org && sudo systemctl enable --now mongod
```

## 3. Clone

```bash
cd ~ && git clone <your-repo-url> balvahini && cd balvahini
```

## 4. Backend

```bash
cd ~/balvahini/backend && npm ci && cp .env.example .env && nano .env
```

Minimum for production:

```ini
NODE_ENV=production
PORT=4000
MONGO_URL=mongodb://127.0.0.1:27017/balvahini
REDIS_URL=redis://127.0.0.1:6379

# The server refuses to boot in production if this is left at the default.
JWT_SECRET=<paste a long random string>

APP_URL=https://YOUR_DOMAIN
CORS_ORIGIN=https://YOUR_DOMAIN

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Generate the secret with `openssl rand -base64 48`.

```bash
npm run build && npm run seed && pm2 start dist/server.js --name balvahini-api && pm2 save
```

Run `npm run seed` **once**, on first deploy only — it wipes every collection.
It prints the demo logins; change those passwords before going live.

Survive a reboot:

```bash
pm2 startup
```

## 5. Frontend

```bash
cd ~/balvahini/frontend && npm ci && npm run build && sudo mkdir -p /var/www/balvahini && sudo cp -r dist/. /var/www/balvahini/
```

No env file needed — the app calls `/api` relatively.

## 6. Nginx

```bash
sudo cp ~/balvahini/deploy/nginx.conf /etc/nginx/sites-available/balvahini.conf && sudo ln -sf /etc/nginx/sites-available/balvahini.conf /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx
```

## 7. DNS in Hostinger, then HTTPS

Hostinger panel → **Domains → your domain → DNS / Nameservers → Manage DNS
records**. Add exactly these two:

| Type | Name | Points to | TTL |
|---|---|---|---|
| `A` | `@` | your VPS IP | 3600 |
| `A` | `www` | your VPS IP | 3600 |

`@` means the bare domain. Do **not** add a CNAME for `www` as well — one record
per name, and an A record here keeps both names identical.

Three things that catch people out:

- **Delete any existing `A` or `CNAME` on `@` or `www` first.** Hostinger ships
  a parking record that points at their own servers; leaving it means your
  domain keeps resolving to a placeholder page and certbot fails.
- **If the domain uses Hostinger's own nameservers**, these records apply
  directly. If you changed nameservers to Cloudflare or anyone else, add the
  records *there* instead — Hostinger's DNS panel is ignored in that case.
- **Cloudflare users: set the proxy to "DNS only" (grey cloud) until certbot has
  issued the certificate.** With the orange cloud on, certbot's HTTP challenge
  hits Cloudflare instead of your box and fails.

Propagation is usually minutes. Wait until this returns your VPS IP:

```bash
dig +short YOUR_DOMAIN
```

*Then*, and only then:

```bash
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN
```

Choose **2 — redirect HTTP to HTTPS**. Certbot renews itself via a systemd timer;
check it with `systemctl list-timers | grep certbot`.

## 8. Deploying changes

```bash
chmod +x ~/balvahini/deploy/deploy.sh
```

From then on, every deploy is:

```bash
~/balvahini/deploy/deploy.sh
```

It pulls, builds **both** projects, publishes the frontend only if both builds
succeeded, restarts the API with `--update-env`, and fails loudly if the health
check does not come back. DNS and Nginx are never touched again.

---

## Uploads — the one piece of state on this box

Files live in `~/balvahini/backend/uploads/`. They are **not** in git and **not**
in the build.

- `deploy.sh` never touches them, so deploying is safe.
- A fresh `git clone` into a new directory leaves them behind. Move them, or
  point `uploads/` at a path outside the repo with a symlink.
- Back them up with the database:

```bash
tar czf ~/backups/uploads-$(date +%F).tar.gz -C ~/balvahini/backend uploads
```

```bash
mongodump --db balvahini --archive=$HOME/backups/db-$(date +%F).gz --gzip
```

Two API instances would need this folder on shared storage (or a move to S3) —
one instance cannot serve a file the other received.

## Checks and fixes

| Symptom | Look at |
|---|---|
| Anything wrong with the API | `pm2 logs balvahini-api --lines 100` |
| 502 Bad Gateway | `pm2 list` — API is down, or `PORT` ≠ the port in nginx.conf |
| Blank page | the build did not copy: `ls /var/www/balvahini` |
| Uploads fail at ~1 MB | `client_max_body_size` missing from nginx.conf |
| Live map never updates | the `/socket.io/` block, or the Upgrade headers |
| Driver never shares GPS | not on HTTPS — geolocation is blocked |
| "subscription expired" for everyone | check the server clock: `timedatectl` |
| Nginx won't reload | `sudo nginx -t` |
| What is listening | `sudo lsof -i -P -n \| grep LISTEN` |

## Before real schools use it

- Change every seeded password, and delete the demo schools.
- Set the Razorpay keys, and point the webhook at
  `https://YOUR_DOMAIN/webhooks/razorpay`.
- Set the server timezone to match the schools: `sudo timedatectl set-timezone
  Asia/Kolkata`. The scheduled jobs (renewal reminders at 08:00, expiry sweep at
  00:15) run on server local time.
- Firewall: `sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`.
  Mongo and Redis must **not** be reachable from the internet — they bind to
  127.0.0.1 by default; keep it that way.
- Turn off root password login: SSH keys plus
  `PermitRootLogin prohibit-password` in `/etc/ssh/sshd_config`.
