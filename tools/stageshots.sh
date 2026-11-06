#!/bin/bash
# The stage select's pictures (assets/stages/<stage>.webp): each stage alone (?nofighters=1), as the fight camera
# sees it when the first round starts, at high quality, 960x540 WebP.
# usage: GAME_ROOT=<game folder> bash tools/stageshots.sh [stages...]   (run from a folder with playwright and shot.mjs,
#        like the other capture tools; software GL takes some minutes per stage)
G=${GAME_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
TMP=${TMPDIR:-/tmp}/stageshots; mkdir -p "$TMP" "$G/assets/stages"
STAGES=${*:-porche terrace street festival neon}
for s in $STAGES; do
  GAME_ROOT=$G timeout 1200 node shot.mjs "index.html?demo=1&p1=alejandro&p2=rafa&stage=$s&nofighters=1&readyon=fight&readyat=20&q=high&nodynres=1" "$TMP/$s.png" 1280 720 1100000 >/dev/null 2>&1
  ffmpeg -v error -y -i "$TMP/$s.png" -vf scale=960:540:flags=lanczos -c:v libwebp -quality 78 "$G/assets/stages/$s.webp" && echo "$s: $(stat -c %s "$G/assets/stages/$s.webp") bytes"
done
