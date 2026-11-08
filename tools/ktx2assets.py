#!/usr/bin/env python3
"""GPU-compressed copies of the fighters' textures (KTX2, Basis Universal), and the index the game reads.

A JPEG or WebP is unpacked to full size in the graphics card's memory: a fighter's set (2048 px skin and clothes,
their relief and gloss, the face) takes ~180 MB there with its mipmaps, and two fighters, the stage and the effects
are what makes a phone with little memory lose the WebGL context. A KTX2 stays compressed on the card (the browser
transcodes it to the format the GPU has: ASTC or ETC on phones, BC on computers), 4 to 8 times smaller.

All of them ETC1S: the downloads stay close to the WebP and JPEG ones (UASTC was 4 times bigger). Each texture gets
the settings its role needs (the role is read from the fighters' mesh.json):
  - colour maps: quality 190;
  - the face (head.jpg): quality 255 (41.7 dB against the picture on Aleix's: the likeness lives there);
  - relief (normal maps): linear, tuned for normals (skin: 1 degree of error on average, clothes 1.5);
  - gloss (roughness maps): linear, quality 128;
  - with transparency (hair cards, eyes, eyelashes, teeth): quality 220 (the hair's alpha at 38.6 dB).
Left as they are: the face's relief (in ETC1S its finest details, eyelids and lips, were 17 degrees out: seen in
the close-ups) and the data maps that are not pictures (the beard's density).

The images are flipped upside down before encoding (-y_flip): the game loads its pictures flipped (flipY), and a
compressed texture can't be flipped on upload. assets/ktx2.json lists every texture that has a KTX2 (the game asks
for none that is not there); a texture whose KTX2 is missing or older than its picture is encoded again.

usage: BASISU=<path to basisu> python3 tools/ktx2assets.py [fighters...]   (no arguments: all of them, and shared/)
Run it after buildchar.py and webpassets.py.
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASISU = os.environ.get('BASISU', '/tmp/basis_universal/bin/basisu')
MANIFEST = os.path.join(ROOT, 'assets', 'ktx2.json')

COMMON = ['-ktx2', '-mipmap', '-y_flip']
MODES = {
    'color': ['-q', '190', '-comp_level', '2'],
    'face': ['-q', '255', '-comp_level', '3'],
    'normal': ['-q', '200', '-comp_level', '2', '-linear', '-normal_map'],
    'rough': ['-q', '128', '-comp_level', '2', '-linear'],
    'alpha': ['-q', '220', '-comp_level', '2'],
}
SKIP = {'beard_d.png', 'eye_glow.png'}  # (data maps, not pictures)


def norm(path):
    return os.path.relpath(os.path.normpath(os.path.join(ROOT, path)), ROOT).replace(os.sep, '/')


def roles(fighters):
    """{ picture path (from the game's root): role } for the textures of these fighters"""
    out = {}
    for f in fighters:
        meta = json.load(open(os.path.join(ROOT, 'assets', 'chars', f, 'mesh.json')))
        base = f'assets/chars/{f}/'
        for p in meta['parts']:
            mat = p.get('mat') or {}
            for key, role in (('map', 'color'), ('normalMap', 'normal'), ('roughMap', 'rough'), ('emissiveMap', 'color')):
                name = mat.get(key)
                if not isinstance(name, str) or os.path.basename(name) in SKIP:
                    continue
                if key == 'normalMap' and os.path.basename(name).startswith('head_'):
                    continue  # (the face's relief: see above)
                path = norm(base + name)
                if not os.path.exists(os.path.join(ROOT, path)):
                    continue
                r = role
                if key == 'map':
                    if os.path.basename(path).startswith('head.'):
                        r = 'face'
                    elif Image.open(os.path.join(ROOT, path)).mode in ('RGBA', 'LA', 'P'):
                        r = 'alpha'
                out[path] = r
    return out


def encode(path, role, tmp):
    src = os.path.join(ROOT, path)
    dst = os.path.splitext(src)[0] + '.ktx2'
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return dst, False
    im = Image.open(src)
    im = im.convert('RGBA' if role == 'alpha' else 'RGB')
    png = os.path.join(tmp, 'in.png')
    im.save(png)
    r = subprocess.run([BASISU, *COMMON, *MODES[role], png, '-output_file', dst], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(dst):
        sys.exit(f'basisu failed on {path}:\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}')
    return dst, True


def main():
    if not os.path.exists(BASISU):
        sys.exit(f'basisu not found ({BASISU}): build basis_universal and set BASISU')
    all_f = sorted(d for d in os.listdir(os.path.join(ROOT, 'assets', 'chars')) if os.path.exists(os.path.join(ROOT, 'assets', 'chars', d, 'mesh.json')))
    fighters = sys.argv[1:] or all_f
    table = roles(fighters)
    man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    before = after = 0
    with tempfile.TemporaryDirectory() as tmp:
        for path, role in sorted(table.items()):
            dst, made = encode(path, role, tmp)
            man[path] = os.path.relpath(dst, ROOT).replace(os.sep, '/')
            a, b = os.path.getsize(os.path.join(ROOT, path)), os.path.getsize(dst)
            before += a; after += b
            print(f'{"encoded" if made else "kept   "} {role:6s} {path:48s} {a // 1024:6d} KB -> {b // 1024:6d} KB')
    # (entries whose KTX2 is gone are dropped)
    man = {k: v for k, v in sorted(man.items()) if os.path.exists(os.path.join(ROOT, v))}
    json.dump(man, open(MANIFEST, 'w'), indent=0, sort_keys=True)
    print(f'{len(table)} textures: {before / 1e6:.2f} MB of pictures, {after / 1e6:.2f} MB of KTX2; {MANIFEST} has {len(man)}')


if __name__ == '__main__':
    main()
