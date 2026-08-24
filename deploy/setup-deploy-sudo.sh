#!/bin/bash
# =============================================================================
# PV Monitor – engångsinstallation av avgränsad deploy-sudo.
#
# Ger en driftanvändare (default: smartsource) rätt att köra ENBART
# deploy-skriptet utan lösenord – inget annat sudo öppnas.
#
# Körs som root en gång:
#   su -c '/opt/pvmonitor/deploy/setup-deploy-sudo.sh'
# =============================================================================
set -euo pipefail

DEPLOY_USER="${1:-smartsource}"
SRC="/opt/pvmonitor/deploy/update.sh"
BIN="/usr/local/sbin/pvmonitor-update"
SUDOERS="/etc/sudoers.d/pvmonitor-deploy"

if [[ $EUID -ne 0 ]]; then
  echo "Detta skript måste köras som root." >&2
  exit 1
fi

if [[ ! -f "$SRC" ]]; then
  echo "Saknar $SRC – kör 'git -C /opt/pvmonitor pull' först." >&2
  exit 1
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "Användaren '$DEPLOY_USER' finns inte." >&2
  exit 1
fi

echo "==> Installerar deploy-skriptet som root-ägt: $BIN"
# Root-ägt och ej skrivbart av andra – krav för säker NOPASSWD-sudo.
install -m 755 -o root -g root "$SRC" "$BIN"

echo "==> Skriver sudoers-regel: $SUDOERS"
cat >"$SUDOERS" <<EOF
# PV Monitor – låt $DEPLOY_USER köra deploy utan lösenord, inget annat.
$DEPLOY_USER ALL=(root) NOPASSWD: $BIN
EOF
chmod 440 "$SUDOERS"

echo "==> Validerar sudoers-syntax"
visudo -c -f "$SUDOERS"

echo ""
echo "Klart. '$DEPLOY_USER' kan nu driftsätta utan lösenord:"
echo "   ssh $DEPLOY_USER@<server> 'sudo pvmonitor-update'"
echo ""
echo "Obs: om deploy/update.sh ändras i repot, kör detta skript igen"
echo "för att uppdatera den root-ägda kopian i $BIN."
