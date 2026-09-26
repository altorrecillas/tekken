#!/usr/bin/env python3
"""Contact sheet of the capsule body model from tools/posedump.mjs: one row per view (side, front of the attacker,
top), one column per frame. Attacker blue, victim red, torso volumes darker, the floor as a line.
usage: python3 posesheet.py dump.json out.png [frames: k1,k2,...] [views: side,front,top]"""
import json, sys, math
from PIL import Image, ImageDraw, ImageFont

dump = json.load(open(sys.argv[1]))
out = sys.argv[2]
sel = [int(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 and sys.argv[3] not in ('', 'all') else None
views = sys.argv[4].split(',') if len(sys.argv) > 4 else ['side', 'front', 'top']
frames = [f for f in dump['frames'] if sel is None or f['k'] in sel]
if sel is None and len(frames) > 12:
    step = len(frames) / 12
    frames = [frames[int(i * step)] for i in range(12)]
CW, CH = 240, 300
W, H = CW * len(frames), CH * len(views) + 24
img = Image.new('RGB', (W, H), (24, 25, 30))
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 12)
except Exception:
    font = ImageFont.load_default()
COL = [((90, 150, 255), (40, 80, 170)), ((255, 110, 90), (170, 60, 50))]
TORSO = {'hips', 'belly', 'chest', 'upper', 'neck', 'head'}
# order: far limbs first so the near side reads on top
ORDER = ['thigh.R', 'shin.R', 'foot.R', 'uarm.R', 'farm.R', 'hand.R', 'hips', 'belly', 'chest', 'upper', 'neck', 'head',
         'thigh.L', 'shin.L', 'foot.L', 'uarm.L', 'farm.L', 'hand.L']


def proj(v, view, cx, cy, sc):
    x, y, z = v
    if view == 'side':    # camera at -z (screen right = +x world, fighters face along x)
        return cx + x * sc, cy - y * sc
    if view == 'front':   # looking along -x from the victim's side: the attacker's front, screen right = +z
        return cx - z * sc, cy - y * sc
    return cx + x * sc, cy - z * sc  # top: x right, z up


def draw_capsule(A, B, r, view, cx, cy, sc, fill, outline):
    ax, ay = proj(A, view, cx, cy, sc)
    bx, by = proj(B, view, cx, cy, sc)
    rr = max(1.5, r * sc)
    dx, dy = bx - ax, by - ay
    l = math.hypot(dx, dy)
    if l > 1e-3:
        nx, ny = -dy / l * rr, dx / l * rr
        d.polygon([(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)], fill=fill, outline=outline)
    d.ellipse([ax - rr, ay - rr, ax + rr, ay + rr], fill=fill, outline=outline)
    d.ellipse([bx - rr, by - rr, bx + rr, by + rr], fill=fill, outline=outline)


main = img
for ci, fr in enumerate(frames):
    # frame centre: midway between the two fighters' hips, so wide throws stay inside their cell
    hx = [f['segs']['hips']['A'] for f in fr['f'] if 'hips' in f['segs']]
    mx = sum(h[0] for h in hx) / len(hx) if hx else 0
    mz = sum(h[2] for h in hx) / len(hx) if hx else 0
    for vi, view in enumerate(views):
        x0, y0 = ci * CW, 24 + vi * CH
        cell = Image.new('RGB', (CW, CH), (24, 25, 30))
        d = ImageDraw.Draw(cell)
        d.rectangle([0, 0, CW - 1, CH - 1], outline=(50, 52, 60))
        sc = 105 if view != 'top' else 95
        cx = CW / 2 - (mx * sc if view in ('side', 'top') else -mz * sc)
        cy = CH - 22 if view != 'top' else CH / 2 + mz * sc
        if view != 'top':
            d.line([4, cy, CW - 4, cy], fill=(90, 92, 100))
        for fi, f in enumerate(fr['f']):
            base, dark = COL[fi]
            segs = f['segs']
            for n in ORDER:
                if n not in segs:
                    continue
                s = segs[n]
                r = s['r']
                if s.get('rx'):
                    r = (s['rx'] + s['rz']) / 2
                fill = dark if n in TORSO else base
                draw_capsule(s['A'], s['B'], r, view, cx, cy, sc, fill, (15, 15, 18))
        if vi == 0:
            v = fr['f'][1]
            d.text((4, 3), f"{v['st'][:6]}:{v['clip'] or ''}"[:30], fill=(255, 160, 150), font=font)
        d.text((CW - 44, 3), view, fill=(140, 140, 150), font=font)
        main.paste(cell, (x0, y0))
    a = fr['f'][0]
    lab = f"k{fr['k']} {a['st'][:5]}:{a['mf']}" + (' HS' if fr['hs'] else '')
    ImageDraw.Draw(main).text((ci * CW + 4, 4), lab, fill=(230, 230, 230), font=font)
img.save(out)
print(out, img.size)
