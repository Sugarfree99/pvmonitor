#!/bin/bash
# Openbox autostart för kiosk-användaren.
# Kopieras till /home/kiosk/.config/openbox/autostart av install.sh.

# 1. Tvinga fram fast upplösning om skärmen sover vid boot (EDID-synk)
xrandr --output HDMI-1 --mode 1920x1080 --rate 60.00 2>/dev/null || true

# 2. Stäng av skärmsläckare och energisparläge
xset s off
xset -dpms
xset s noblank

# 3. Dölj muspekaren efter 2 sekunders inaktivitet
unclutter -idle 2 &

# 4. Rensa Chromium-tillstånd efter en oväntad avstängning/strömavbrott
CHROME_DIR="$HOME/.config/chromium"
# 4a. Ta bort låsfiler – annars kan Chromium vägra starta ("profilen används")
rm -f "$CHROME_DIR/SingletonLock" "$CHROME_DIR/SingletonCookie" \
  "$CHROME_DIR/SingletonSocket" 2>/dev/null || true
# 4b. Återställ kraschflaggor så ingen "Återställ sidor?"-ruta visas
CHROME_PREF="$CHROME_DIR/Default/Preferences"
if [ -f "$CHROME_PREF" ]; then
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/g' "$CHROME_PREF"
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/g' "$CHROME_PREF"
fi

# 5. Vänta på att lokala backend-API:et svarar innan webbläsaren drar igång
until $(curl --output /dev/null --silent --head --fail http://localhost:3000/api/health); do
  sleep 1
done

# Vänta även in frontendens preview-server
until $(curl --output /dev/null --silent --head --fail http://localhost:5173); do
  sleep 1
done

# 6. Starta Chromium i fullständigt dolt kiosk-läge mot det lokala gränssnittet.
#    Loopen ser till att skärmen aldrig blir svart – dör Chromium startar den om.
CHROME_FLAGS="--kiosk --no-first-run --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --disable-restore-session-state \
  --hide-crash-restore-bubble --no-default-browser-check \
  --disable-notifications --disable-translate --disable-pinch \
  --overscroll-history-navigation=0 --password-store=basic \
  --disable-component-update --check-for-update-interval=31536000 \
  --disable-features=TranslateUI,Translate,InfiniteSessionRestore"

while true; do
  # Nolla kraschflaggorna även inför varje omstart av loopen
  if [ -f "$CHROME_PREF" ]; then
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/g' "$CHROME_PREF"
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/g' "$CHROME_PREF"
  fi
  chromium $CHROME_FLAGS http://localhost:5173
  sleep 2
done
