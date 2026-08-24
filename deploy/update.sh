#!/bin/bash
# =============================================================================
# PV Monitor – uppdatera från GitHub och starta om tjänsterna.
#
# Körs som root. Efter engångsinstallationen (deploy/setup-deploy-sudo.sh)
# kan 'smartsource' köra detta utan lösenord via:  sudo pvmonitor-update
# =============================================================================
set -euo pipefail

APP_DIR="/opt/pvmonitor"
KIOSK_USER="kiosk"

if [[ $EUID -ne 0 ]]; then
  echo "Detta skript måste köras som root (sudo pvmonitor-update)." >&2
  exit 1
fi

echo "==> 1/5  Hämtar senaste koden (git pull)"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
git -C "$APP_DIR" pull --ff-only

echo "==> 2/5  Backend – npm install"
cd "${APP_DIR}/backend"
npm install --no-audit --no-fund

echo "==> 3/5  Frontend – npm install + build"
cd "${APP_DIR}/frontend"
npm install --no-audit --no-fund
npm run build

echo "==> 4/5  Ägarskap till ${KIOSK_USER}"
chown -R "${KIOSK_USER}:${KIOSK_USER}" "$APP_DIR"

echo "==> 5/5  Startar om tjänster"
systemctl restart pv-backend.service pv-frontend.service

echo ""
echo "Klart. Status:"
systemctl --no-pager --lines=0 status pv-backend.service pv-frontend.service || true
