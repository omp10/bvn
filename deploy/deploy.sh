#!/bin/bash
#
# BalVahini deploy. Run from anywhere:  ~/balvahini/deploy/deploy.sh
#
# set -e matters: without it a failed build still wipes /var/www and copies
# nothing, which takes the site down instead of leaving the last good version up.
set -euo pipefail

APP_DIR="$HOME/balvahini"
WEB_ROOT="/var/www/balvahini"
PM2_NAME="balvahini-api"

echo "==> Pulling"
cd "$APP_DIR"
git pull origin main

echo "==> Building the frontend"
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> Building the backend"
cd "$APP_DIR/backend"
npm ci
npm run build

# Publish the frontend only after both builds succeeded.
echo "==> Publishing the frontend"
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT:?}"/*
sudo cp -r "$APP_DIR/frontend/dist/." "$WEB_ROOT/"

echo "==> Restarting the API"
cd "$APP_DIR/backend"
# --update-env so a changed .env is actually picked up; a plain restart reuses
# the environment the process was first started with.
pm2 restart "$PM2_NAME" --update-env || pm2 start dist/server.js --name "$PM2_NAME"
pm2 save

echo "==> Health check"
sleep 3
if curl -fsS http://127.0.0.1:4000/health > /dev/null; then
  echo "Deployed."
else
  echo "API is NOT healthy — check: pm2 logs $PM2_NAME --lines 50" >&2
  exit 1
fi
