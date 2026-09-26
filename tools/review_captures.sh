#!/bin/bash
# full review set: portraits (also refreshes the HUD/select portraits), title, select, fights, impacts, intro, KO, win
# usage: tools/review_captures.sh <outdir>   (needs playwright in tools/node_modules; takes ~1 h with software GL)
cd "$(dirname "$0")"
R=$(realpath -m "${1:-../review}"); mkdir -p $R
G=$(realpath ..)
for p in alejandro arnau camilo rafa zapponi dani; do
  timeout 900 node shot.mjs "viewer.html?id=$p&view=portrait" $R/por_$p.png 450 600 > /dev/null 2>&1
  python3 -c "
import cv2; im=cv2.imread('$R/por_$p.png'); im[0:22,:]=im[30,5]; cv2.imwrite('$G/assets/portraits/$p.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 88])"
done
python3 -c "
import cv2,numpy as np
ims=[cv2.imread('$R/por_'+p+'.png') for p in ['alejandro','arnau','camilo','rafa','zapponi','dani']]
cv2.imwrite('$R/portraits.jpg', np.concatenate(ims,1))"
echo portraits-done
run() { timeout 1500 node shot.mjs "$1" "$2" 1600 900 1400000 2>&1 | grep -E "DEBUG|PAGEERROR|TIMEOUT" | cut -c1-300 > "$2.log"; echo "$2 done"; }
run "index.html?frames=0&q=high&nodynres=1" $R/title.png
run "index.html?frames=0&screen=select&q=high&nodynres=1" $R/select.png
run "index.html?demo=1&p1=alejandro&p2=rafa&simonly=700&q=high&ai=5&nodynres=1&stage=street" $R/fight_street.png
run "index.html?demo=1&p1=camilo&p2=zapponi&simonly=700&q=high&ai=5&nodynres=1&stage=terrace" $R/fight_terrace.png
run "index.html?demo=1&p1=arnau&p2=camilo&simonly=520&q=high&ai=5&nodynres=1&stage=street" $R/fight_street2.png
run "index.html?demo=1&p1=rafa&p2=arnau&simonly=99999&readyon=hit&readyat=250&hitage=2&q=high&ai=5&nodynres=1&stage=street" $R/hit_street.png
run "index.html?demo=1&p1=zapponi&p2=alejandro&simonly=99999&readyon=hit&readyat=400&hitage=3&q=high&ai=5&nodynres=1&stage=terrace" $R/hit_terrace.png
run "index.html?demo=1&p1=alejandro&p2=arnau&simonly=99999&readyon=intro&readyat=55&q=high&nodynres=1&stage=terrace" $R/intro1.png
run "index.html?demo=1&p1=zapponi&p2=rafa&simonly=99999&readyon=intro&readyat=165&q=high&nodynres=1&stage=street" $R/intro2.png
run "index.html?demo=1&p1=camilo&p2=rafa&hp=0.15&simonly=99999&readyon=ko&readyat=90&q=high&ai=5&nodynres=1&stage=terrace" $R/ko_terrace.png
run "index.html?demo=1&p1=arnau&p2=zapponi&hp=0.15&simonly=99999&readyon=ko&readyat=120&q=high&ai=5&nodynres=1&stage=street" $R/ko_street.png
run "index.html?demo=1&p1=rafa&p2=camilo&hp=0.15&simonly=99999&readyon=win&readyat=150&q=high&ai=5&nodynres=1&stage=street" $R/win.png
ls -la $R
echo ALL-DONE
