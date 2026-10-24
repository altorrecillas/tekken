"""Fills the empty texture round a fighter's UV islands with the islands' own colours, so that no seam shows a line.
A texture is sampled from its smaller mipmaps as soon as a surface is a little away or seen at an angle, and there
every texel near a seam mixes in what lies outside the island: in the body texture that was a beige background a few
texels beyond the islands' edge (a light line along every seam of the hands and arms in a close-up), and its normal
map, worked out from that colour, had a ridge all round each island (a raised line along the seams).
The empty texels are filled by push-pull: the islands' colours averaged down to a 1-texel image and spread back up,
each level taking the coarser one's average where it has nothing of its own (smooth, endless, no streaks). The
skin's normal map loses the ridge the background made (bodytex.py's formula on the colour before and after the fill
tells it apart from the skin's own detail, which stays). The smooth fill also makes the files much smaller (the
noisy background was most of the body texture). The head's textures are
filled the same way, their relief losing its ridge too.
The garments' textures are filled too (their relief comes from the fabric, not from the colour: only filled).
usage: python3 uvpad.py <char dir> [more char dirs...]
       (writes the fighter's JPEGs in place, with each one's own quantization tables; running it again changes
       nothing visible, only re-encodes)"""
import os, sys

import numpy as np
import cv2
from PIL import Image, JpegImagePlugin

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshfmt
from raster import raster_uv_ids


def pushpull_fill(img, valid):
    """img float32 (H, W[, C]); the texels where valid is False get the islands' colours spread smoothly outward"""
    sq = img.ndim == 2
    c = (img[..., None] if sq else img).astype(np.float32)
    w = valid.astype(np.float32)
    levels = []
    cc, ww = c * w[..., None], w
    while min(ww.shape) > 1:
        levels.append((cc, ww))
        h2, w2 = ww.shape[0] // 2, ww.shape[1] // 2
        cc = cc[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, -1).sum((1, 3))
        ww = ww[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).sum((1, 3))
    avg = cc / np.maximum(ww, 1e-6)[..., None]
    for cc, ww in reversed(levels):
        up = cv2.resize(avg, (ww.shape[1], ww.shape[0]), interpolation=cv2.INTER_LINEAR)
        if up.ndim == 2:
            up = up[..., None]
        own = cc / np.maximum(ww, 1e-6)[..., None]
        # a texel partly covered at this level keeps its own average, blended in by how much of it is covered
        t = np.clip(ww, 0, 1)[..., None]
        avg = own * t + up * (1 - t)
    out = np.where(valid[..., None], c, avg)
    return out[..., 0] if sq else out


def coverage(parts, meta, names, W, H):
    m = np.zeros((H, W), bool)
    for p, pm in zip(parts, meta['parts']):
        if pm['name'] not in names:
            continue
        uv = p['uv'].astype(np.float64)
        px = np.stack([uv[:, 0] * W, (1 - uv[:, 1]) * H], 1)
        m |= raster_uv_ids(px, p['index'].reshape(-1, 3), W, H) >= 0
    # a texel touched by a triangle's edge counts as inside (the rasterizer leaves the edges' half texels out)
    return cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0


def save_keep(path, bgr):
    """JPEG with the file's own quantization tables and subsampling (no size change, no extra loss)"""
    src = Image.open(path)
    qt, sub = src.quantization, JpegImagePlugin.get_sampling(src)
    rgb = Image.fromarray(np.clip(np.round(bgr[..., ::-1] if bgr.ndim == 3 else bgr), 0, 255).astype(np.uint8))
    rgb.save(path, qtables=qt, **({'subsampling': max(sub, 0)} if rgb.mode != 'L' else {}))


def pad_char(cdir):
    meta, parts = meshfmt.load(cdir)
    byname = {}
    for pm in meta['parts']:
        for k in ('map', 'normalMap', 'roughMap'):
            f = pm['mat'].get(k)
            if f and not f.startswith('../'):
                byname.setdefault(f, set()).add(pm['name'])
    # every JPEG of the fighter's own (the shared ones and the shoes, painted by nbshoes.py with their own bleed, are
    # left alone); the skin's and the head's normal maps are handled with their colour
    own = sorted(f for f in byname if f.endswith('.jpg') and not f.startswith('shoes'))
    for f in [x for x in own if x not in ('skin_n.jpg', 'head_n.jpg')]:
        path = os.path.join(cdir, f)
        if not os.path.exists(path):
            continue
        img = cv2.imread(path, cv2.IMREAD_UNCHANGED).astype(np.float32)
        H, W = img.shape[:2]
        valid = coverage(parts, meta, byname[f], W, H)
        out = pushpull_fill(img, valid)
        save_keep(path, out)
        print(f'  {f}: {W}x{H}, {100 * (1 - valid.mean()):.0f}% filled')
        # the relief that bodytex.py / buildchar.py worked out from this colour: (normal map, pre-blur, high-pass
        # radius, strength)
        rel = {'skin.jpg': ('skin_n.jpg', 0.8, 3.0, 1.2), 'head.jpg': ('head_n.jpg', 0.0, 2.5, 4.0)}.get(f)
        npath = rel and os.path.join(cdir, rel[0])
        if rel and os.path.exists(npath):
            # the skin's relief was worked out from its colour with the background in it (bodytex.py): the same
            # formula on the colour before and after the fill gives the ridge the background made, which is taken
            # off the relief as it is (its own detail is kept); then its empty texels are filled too
            n = cv2.imread(npath).astype(np.float32)[..., ::-1] / 127.5 - 1      # x, y, z
            size = (n.shape[1], n.shape[0])
            before = relief(img, rel[1], rel[2], rel[3], size)
            after = relief(out, rel[1], rel[2], rel[3], size)
            xy = n[..., :2] - (before[..., :2] - after[..., :2])
            z = np.sqrt(np.clip(1 - (xy ** 2).sum(-1), 0.05, 1))
            n = np.dstack([xy, z]); n /= np.linalg.norm(n, axis=2, keepdims=True)
            nh, nw = n.shape[:2]
            nvalid = cv2.resize(valid.astype(np.uint8), (nw, nh), interpolation=cv2.INTER_AREA) > 0
            n = pushpull_fill(n.astype(np.float32), nvalid)
            n /= np.linalg.norm(n, axis=2, keepdims=True)
            save_keep(npath, ((n * 0.5 + 0.5) * 255)[..., ::-1])
            print(f'  {rel[0]}: the islands\' edge ridge taken off, filled')


def relief(col, pre, radius, strength, size):
    """the pipeline's relief from a colour texture (luminance high-pass), as unit normals (x, y, z) at size"""
    L = cv2.cvtColor(np.clip(col, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    if pre:
        L = cv2.GaussianBlur(L, (0, 0), pre)
    h = L - cv2.GaussianBlur(L, (0, 0), radius)
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) * strength
    gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) * strength
    n = np.dstack([-gx, gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n if (n.shape[1], n.shape[0]) == size else cv2.resize(n, size, interpolation=cv2.INTER_AREA)


if __name__ == '__main__':
    for d in sys.argv[1:]:
        print(d)
        pad_char(d)
