#!/bin/bash
# =============================================================================
# PV Monitor – installationsskript för Debian Stable (Beelink Mini S)
# Kör som root:  sudo ./install.sh
#
# Förutsätter att grafiklagret redan är installerat enligt manualen:
#   sudo apt install -y xorg openbox chromium lightdm unclutter git nodejs npm curl
# =============================================================================
set -euo pipefail

APP_DIR="/opt/pvmonitor"
KIOSK_USER="kiosk"
KIOSK_HOME="/home/${KIOSK_USER}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Detta skript måste köras som root (sudo ./install.sh)." >&2
  exit 1
fi

echo "==> 1/8  Kontrollerar beroenden"
for bin in node npm curl git; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "Saknar '$bin'. Installera med: apt install -y nodejs npm curl git" >&2
    exit 1
  }
done

echo "==> 2/8  Skapar kiosk-användare vid behov"
if ! id "$KIOSK_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$KIOSK_USER"
fi

echo "==> 3/8  Placerar applikationen i ${APP_DIR}"
# Skriptet ligger i <repo>/deploy – repo-roten är en nivå upp.
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ "$REPO_ROOT" != "$APP_DIR" ]]; then
  mkdir -p "$APP_DIR"
  cp -a "${REPO_ROOT}/." "$APP_DIR/"
fi

echo "==> 4/8  Backend – npm install"
cd "${APP_DIR}/backend"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "    Skapade backend/.env från exempel – kontrollera värdena."
fi
# Lås ner .env – kan innehålla känsliga uppgifter
chmod 600 .env
npm install --no-audit --no-fund

echo "==> 5/8  Frontend – npm install + build"
cd "${APP_DIR}/frontend"
npm install --no-audit --no-fund
npm run build

echo "==> 6/8  Sätter ägarskap till ${KIOSK_USER}"
chown -R "${KIOSK_USER}:${KIOSK_USER}" "$APP_DIR"

echo "==> 7/8  Installerar systemd-tjänster"
install -m 644 "${SCRIPT_DIR}/pv-backend.service" /etc/systemd/system/pv-backend.service
install -m 644 "${SCRIPT_DIR}/pv-frontend.service" /etc/systemd/system/pv-frontend.service
systemctl daemon-reload
systemctl enable pv-backend.service pv-frontend.service
systemctl restart pv-backend.service pv-frontend.service

echo "==> 8/8  Konfigurerar kiosk (LightDM + Openbox + watchdog)"

# LightDM autologin
install -m 644 "${SCRIPT_DIR}/lightdm.conf" /etc/lightdm/lightdm.conf

# Openbox autostart
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" "${KIOSK_HOME}/.config/openbox"
install -m 755 -o "$KIOSK_USER" -g "$KIOSK_USER" \
  "${SCRIPT_DIR}/openbox-autostart.sh" "${KIOSK_HOME}/.config/openbox/autostart"

# Hårdvaru-watchdog (systemd)
if ! grep -q "RuntimeWatchdogSec=14" /etc/systemd/system.conf; then
  {
    echo ""
    echo "# PV Monitor – hårdvaru-watchdog"
    echo "RuntimeWatchdogSec=14"
    echo "RebootWatchdogSec=2min"
  } >>/etc/systemd/system.conf
fi

# Journald – skydda disken (volatil logg)
mkdir -p /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/pvmonitor.conf <<'EOF'
[Journal]
Storage=volatile
RuntimeMaxUse=30M
EOF

echo ""
echo "============================================================"
echo " Klart. Kontrollera backend/config/inverters.json (IP:er)"
echo " och backend/.env innan produktion."
echo ""
echo " Status:   systemctl status pv-backend pv-frontend"
echo " API-test: curl http://localhost:3000/api/health"
echo " Starta om för att aktivera kiosk-läget:  reboot"
echo "============================================================"
