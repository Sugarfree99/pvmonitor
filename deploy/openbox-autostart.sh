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

# 4. Återställ Chromiums kraschfiler för att blockera felmeddelanden efter strömavbrott
CHROME_PREF="$HOME/.config/chromium/Default/Preferences"
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

# 6. Starta Chromium i fullständigt dolt kiosk-läge mot det lokala gränssnittet
chromium --kiosk --no-first-run --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --disable-features=TranslateUI \
  --check-for-update-interval=31536000 http://localhost:5173
