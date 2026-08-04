#!/bin/bash
#
# One-shot VPS setup for BalVahini. Run once on a fresh Ubuntu box, as a user
# with sudo:
#
#   curl -fsSL https://raw.githubusercontent.com/omp10/bvn/main/deploy/bootstrap.sh -o bootstrap.sh
#   bash bootstrap.sh yourdomain.com
#
# Safe to re-run: every step checks before acting, and it never touches the
# database or the uploads folder.
set -euo pipefail

DOMAIN="${1:-}"
REPO="${2:-https://github.com/omp10/bvn.git}"
APP_DIR="$HOME/balvahini"
WEB_ROOT="/var/www/balvahini"
PM2_NAME="balvahini-api"
PORT=4000

if [ -z "$DOMAIN" ]; then
  echo "Usage: bash bootstrap.sh yourdomain.com [git-url]" >&2
  exit 1
fi

say() { printf "\n\033[1;34m==> %s\033[0m\n" "$1"; }

say "1/8  System packages"
sudo apt-get update -qq
sudo apt-get install -y -qq nginx git curl ca-certificates gnupg

say "2/8  Node.js 20 + PM2"
if ! command -v node > /dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
command -v pm2 > /dev/null || sudo npm install -g pm2 --silent
echo "node $(node -v), pm2 $(pm2 -v)"

say "3/8  Redis"
if ! systemctl is-active --quiet redis-server; then
  sudo apt-get install -y -qq redis-server
  sudo systemctl enable --now redis-server
fi
redis-cli ping

say "4/8  MongoDB"
if ! systemctl is-active --quiet mongod; then
  . /etc/os-release
  # Ubuntu 24.04 (noble) has no mongo repo yet; jammy packages work on it.
  CODENAME="$UBUNTU_CODENAME"; [ "$CODENAME" = "noble" ] && CODENAME="jammy"
  curl -fsSL https://pgp.mongodb.com/server-7.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb.gpg --dearmor --yes
  echo "deb [ signed-by=/usr/share/keyrings/mongodb.gpg ] https://repo.mongodb.org/apt/ubuntu $CODENAME/mongodb-org/7.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq mongodb-org
  sudo systemctl enable --now mongod
fi
sleep 2 && mongosh --quiet --eval 'db.adminCommand("ping").ok' 2>/dev/null || echo "(mongo starting)"

say "5/8  Code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi

say "6/8  Backend"
cd "$APP_DIR/backend"
npm ci --silent

if [ ! -f .env ]; then
  # Generated once and kept. Re-running must never rotate this: every issued
  # token would stop verifying and everyone would be signed out.
  SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  cat > .env <<ENV
NODE_ENV=production
PORT=$PORT
MONGO_URL=mongodb://127.0.0.1:27017/balvahini
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=$SECRET
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
APP_URL=https://$DOMAIN
CORS_ORIGIN=https://$DOMAIN
DEV_OTP=123456
OTP_TTL_SECONDS=300
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
ENV
  echo ".env created with a generated JWT_SECRET"
  NEW_INSTALL=yes
else
  echo ".env already exists — left untouched"
  NEW_INSTALL=no
fi

npm run build

say "7/8  Frontend"
cd "$APP_DIR/frontend"
npm ci --silent
npm run build
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT:?}"/*
sudo cp -r dist/. "$WEB_ROOT/"

say "8/8  Nginx + PM2"
sudo sed "s/YOUR_DOMAIN/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" \
  | sudo tee /etc/nginx/sites-available/balvahini.conf > /dev/null
sudo ln -sf /etc/nginx/sites-available/balvahini.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

cd "$APP_DIR/backend"
pm2 describe "$PM2_NAME" > /dev/null 2>&1 \
  && pm2 restart "$PM2_NAME" --update-env \
  || pm2 start dist/server.js --name "$PM2_NAME"
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | grep '^sudo' | bash || true

sleep 3
if curl -fsS "http://127.0.0.1:$PORT/health" > /dev/null; then
  echo "API healthy"
else
  echo "API is NOT healthy — pm2 logs $PM2_NAME --lines 50" >&2
  exit 1
fi

cat <<DONE

────────────────────────────────────────────────────────────
 Setup complete. Two things left, both by hand:

 1. DNS — in Hostinger, add these and delete any existing
    A/CNAME on @ or www first:

       Type  Name  Points to           TTL
       A     @     $(curl -fsS ifconfig.me 2>/dev/null || echo YOUR_VPS_IP)   3600
       A     www   $(curl -fsS ifconfig.me 2>/dev/null || echo YOUR_VPS_IP)   3600

    Wait until this shows your IP:   dig +short $DOMAIN

 2. HTTPS — required, or driver GPS never starts:

       sudo apt install -y certbot python3-certbot-nginx
       sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN

    Choose option 2 (redirect HTTP to HTTPS).
DONE

if [ "$NEW_INSTALL" = "yes" ]; then
  cat <<SEED

 First install detected. To load demo data (WIPES the database):

       cd $APP_DIR/backend && npm run seed

 Skip this if real school data already exists.
SEED
fi

echo "
 Future deploys:   $APP_DIR/deploy/deploy.sh
────────────────────────────────────────────────────────────"
