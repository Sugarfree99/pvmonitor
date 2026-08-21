#!/bin/bash
# Openbox autostart för kiosk-användaren (Firefox ESR).
# Kopieras till /home/kiosk/.config/openbox/autostart av install.sh.
#
# OBS: Debians Chromium 151 (trixie) kraschar vid start pga trasig crashpad-
# integration (SIGTRAP), därför används Firefox ESR som kiosk-webbläsare.

# 1. Tvinga fram fast upplösning om skärmen sover vid boot (EDID-synk)
xrandr --output HDMI-1 --mode 1920x1080 --rate 60.00 2>/dev/null || true

# 2. Stäng av skärmsläckare och energisparläge
xset s off
xset -dpms
xset s noblank

# 3. Dölj muspekaren efter 2 sekunders inaktivitet
unclutter -idle 2 &

# 4. Förbered en dedikerad Firefox-profil med tysta, robusta inställningar.
PROFILE="$HOME/.mozilla/pvkiosk"
mkdir -p "$PROFILE"
cat > "$PROFILE/user.js" <<'EOF'
// Ingen "Återställ session"-ruta efter oväntad avstängning/strömavbrott
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.max_resumed_crashes", 0);
user_pref("toolkit.startup.max_resumed_crashes", -1);
// Inga uppstarts-/välkomst-/uppdaterings-/standardwebbläsar-rutor
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("browser.aboutConfig.showWarning", false);
user_pref("app.update.enabled", false);
user_pref("app.update.auto", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.warnOnQuit", false);
user_pref("browser.newtabpage.enabled", false);
user_pref("full-screen-api.warning.timeout", 0);
EOF

# 5. Vänta på att lokala backend-API:et svarar innan webbläsaren drar igång
until $(curl --output /dev/null --silent --head --fail http://localhost:3000/api/health); do
  sleep 1
done

# Vänta även in frontendens preview-server
until $(curl --output /dev/null --silent --head --fail http://localhost:5173); do
  sleep 1
done

# 6. Starta Firefox i kiosk-läge mot det lokala gränssnittet.
#    Loopen ser till att skärmen aldrig blir svart – dör Firefox startar den om.
#    Före varje start rensas låsfiler och sessionshistorik så inga rutor visas.
while true; do
  rm -f "$PROFILE/lock" "$PROFILE/.parentlock" 2>/dev/null || true
  rm -f "$PROFILE"/sessionstore.jsonlz4 2>/dev/null || true
  rm -rf "$PROFILE"/sessionstore-backups 2>/dev/null || true
  firefox-esr --kiosk --profile "$PROFILE" http://localhost:5173
  sleep 2
done
