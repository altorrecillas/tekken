"""The download diet for textures: the fighters' and the stages' JPEG maps served as WebP (about 40 % smaller for the
same look). The JPEGs stay as the pipeline's sources; this writes a .webp next to each and points the game at it.
  - fighters (assets/chars/<id>/): every map named in mesh.json except the face's (head*.jpg: the likeness is judged on
    it, close up), and a fighter's own iris (eye.png, alpha kept), each converted and its name in mesh.json changed to the .webp. Run it again after
    tools/pipeline/buildchar.py rebuilds a fighter (the rebuild writes .jpg names).
  - stages (assets/stage/*.jpg): all converted; the stages' loaders ask for the .webp (js/stage/*.js `tex`).
  Normal / roughness / ORM maps at quality 90, colour maps at 86. A few maps are also made smaller where their size
  bought nothing (SHRINK: Orión's suit weave was a 3 MB 2048 px normal map of 4 px cells, noise to JPEG and WebP alike).
usage: python3 tools/webpassets.py [ids or 'stage' ...]   (nothing: every fighter and the stages)   needs Pillow"""
import glob, json, os, sys

from PIL import Image

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SHRINK = {'orion/synth_n.jpg': 1024}
DATA = ('_n.', '_orm.', '_r.', '_n_', '_ao.')


def convert(src, key=None):
    dst = src[:-4] + '.webp'
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return dst, False
    im = Image.open(src)
    if im.mode not in ('RGB', 'L') and not (src.endswith('.png') and im.mode == 'RGBA'):
        im = im.convert('RGB')
    if im.mode == 'RGBA':
        im.save(dst, 'WEBP', quality=88, alpha_quality=90, method=6)
        return dst, True
    if key in SHRINK and max(im.size) > SHRINK[key]:
        k = SHRINK[key] / max(im.size)
        im = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS)
    q = 90 if any(t in os.path.basename(src) for t in DATA) else 86
    im.save(dst, 'WEBP', quality=q, method=6)
    return dst, True


def fighter(d):
    path = os.path.join(d, 'mesh.json')
    m = json.load(open(path))
    cid, before, after, changed = os.path.basename(d.rstrip('/')), 0, 0, False
    for p in m['parts']:
        for k, v in list(p['mat'].items()):
            # (and a fighter's own iris, eye.png: Aleix's blue-grey ones, its alpha kept)
            # (the face's colour stays JPEG: the likeness is judged on it, close up; its relief and roughness maps go to
            # WebP like the rest, 17 % and 75 % smaller)
            if not isinstance(v, str) or '/' in v or not (v.endswith('.jpg') or v == 'eye.png') or v == 'head.jpg':
                continue
            src = os.path.join(d, v)
            if not os.path.exists(src):
                continue
            dst, _ = convert(src, f'{cid}/{v}')
            p['mat'][k] = os.path.basename(dst)
            changed = True
    if changed:
        # (the same compact writing as the pipeline's: one line)
        json.dump(m, open(path, 'w'), ensure_ascii=True, separators=(', ', ': '))
    for p in m['parts']:
        for k, v in p['mat'].items():
            if isinstance(v, str) and '/' not in v and v.endswith(('.webp', '.jpg')) and os.path.exists(os.path.join(d, v)):
                after += os.path.getsize(os.path.join(d, v))
                j = os.path.join(d, v[:-5] + ('.png' if v == 'eye.webp' else '.jpg')) if v.endswith('.webp') else os.path.join(d, v)
                before += os.path.getsize(j) if os.path.exists(j) else 0
    print(f'{cid:10s} maps {before // 1024:6d} KB -> {after // 1024:6d} KB')


def stages():
    before = after = 0
    # (and the crowd's atlas, a PNG with alpha: 1.7 MB -> 0.3 MB)
    for src in sorted(glob.glob(os.path.join(GAME, 'assets/stage/*.jpg'))) + [os.path.join(GAME, 'assets/stage/crowd_atlas.png')]:
        dst, _ = convert(src)
        before += os.path.getsize(src); after += os.path.getsize(dst)
    print(f'stages     maps {before // 1024:6d} KB -> {after // 1024:6d} KB')


if __name__ == '__main__':
    args = sys.argv[1:]
    ids = [a for a in args if a != 'stage'] or ([] if args else [os.path.basename(p.rstrip('/')) for p in sorted(glob.glob(os.path.join(GAME, 'assets/chars/*/')))])
    for i in ids:
        fighter(os.path.join(GAME, 'assets/chars', i))
    if not args or 'stage' in args:
        stages()
