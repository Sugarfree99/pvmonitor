#!/bin/bash
# Provisionering som körs EN gång som root (via su) på en färsk Debian.
# Installerar sudo + grafik/mjukvarustacken och ger smartsource lösenordsfri
# sudo så att resten av installationen kan automatiseras.
set -e
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y sudo xorg openbox chromium lightdm unclutter git nodejs npm curl ca-certificates

# Lägg smartsource i sudo-gruppen och ge lösenordsfri sudo under driftsättningen.
id smartsource >/dev/null 2>&1 && usermod -aG sudo smartsource || true
echo 'smartsource ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/010-smartsource-deploy
chmod 440 /etc/sudoers.d/010-smartsource-deploy

echo "ROOT_BOOTSTRAP_OK"
echo -n "node: "; node --version || echo "NODE MISSING"
echo -n "npm:  "; npm --version || echo "NPM MISSING"
