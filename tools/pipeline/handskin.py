"""Evens out the skin of the hands in a fighter's body texture (assets/chars/<id>/skin.jpg). The MakeHuman base skin
paints the backs of the hands darker and redder than the forearms, with a dark red blotch on every knuckle and the
creases baked in; in a close-up (a guard in front of the face, a victory gesture) the hands read as dirty or
bruised. The hand islands of the texture (found from the mesh: the body triangles weighted to the hand bones) are
brought to the forearm's own tone (the broad colour, through a wide blur) and their blotches toned down (the fine
detail kept at a share of its contrast), feathered into what is around them. (The nails go through it too: in some
textures the brightest texels are on the palms, and kept as they were they stood out as white streaks.)
usage: python3 handskin.py <char dir> [more char dirs...] [--tone 0.65] [--detail 0.5] [--reach 0.25]
       (tone: how far the hands' broad brightness moves to the forearm's - palms are lighter than the backs and
       keep some of it; detail: the share of contrast the fine detail keeps; reach: the least share of skin weight
       on the hand bones a triangle needs to be cleaned - lower reaches further up the wrist, where the base skin
       has a red band round the crease)
       (writes skin.jpg in place; git holds the original)"""
import os, sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, maximum_filter

import meshfmt

HAND = ('wrist.', 'metacarpal', 'finger')
FOREARM = ('lowerarm01.', 'lowerarm02.')


def bone_mask(names, prefixes):
    return np.array([any(n.startswith(p) for p in prefixes) for n in names])


def tri_weight(part, sel):
    """per vertex: the share of its skin weight on the selected bones"""
    si, sw = part['skinIndex'].astype(int), part['skinWeight']
    return (sw * sel[si]).sum(1)


def raster(part, w, W, H, thr):
    """mask of the texels covered by triangles whose three vertices are mostly on the selected bones"""
    uv, idx = part['uv'], part['index'].reshape(-1, 3)
    keep = (w[idx] > thr).all(1)
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    for t in idx[keep]:
        pts = [(uv[k, 0] * W, (1 - uv[k, 1]) * H) for k in t]
        d.polygon(pts, fill=255)
    return np.asarray(img, np.float32) / 255


def main(cdir, tone, detail, reach=0.25):
    meta, parts = meshfmt.load(cdir)
    names = [b['name'] for b in meta['bones']]
    body = next(i for i, p in enumerate(meta['parts']) if p['name'] == 'body')
    part = parts[body]
    path = os.path.join(cdir, meta['parts'][body]['mat']['map'])
    src = Image.open(path)
    # (saved again with the file's own JPEG tables and chroma subsampling: the same quality and size as before)
    qt = getattr(src, 'quantization', None)
    from PIL import JpegImagePlugin
    sub = JpegImagePlugin.get_sampling(src) if src.format == 'JPEG' else 0
    im = src.convert('RGB')
    W, H = im.size
    rgb = np.asarray(im, np.float32) / 255
    hand = raster(part, tri_weight(part, bone_mask(names, HAND)), W, H, reach)
    arm = raster(part, tri_weight(part, bone_mask(names, FOREARM)), W, H, 0.6)
    if hand.sum() < 100 or arm.sum() < 100:
        sys.exit(f'{cdir}: hand or forearm islands not found')
    # the forearm's tone: the median of its texels (linear light)
    lin = rgb ** 2.2
    target = np.median(lin[arm > 0.5], axis=0)
    # the hands get the forearm's colour throughout, with only a little of their own colour variation left (the red
    # blotches and streaks were all colour), and their light and shade: the broad brightness moved towards the
    # forearm's, the fine detail (creases, pores, hairs) kept at a share of its contrast
    def blur(a, r):
        return gaussian_filter(a, r)
    m = hand
    nm = np.maximum(blur(m, 14), 1e-4)
    lum = lin.mean(-1)
    wl = blur(lum * m, 14) / nm
    tl = target.mean()
    broad_l = wl * (tl / np.maximum(wl, 1e-5)) ** tone
    detail_l = np.clip(lum / np.maximum(wl, 1e-5), 0.05, 4.0) ** detail
    own = lin / np.maximum(lum, 1e-5)[..., None]          # the texel's own colour (chroma at unit luminance)
    tcol = target / tl
    col = tcol * (own / tcol) ** 0.2
    out = col * (broad_l * detail_l)[..., None]
    # (out to a few texels past the islands' edges: the padding round an island is what a mipmap blends in at the
    # sides of the fingers)
    feather = blur(maximum_filter(m, 7), 1.5)
    a = feather[..., None]
    res = lin * (1 - a) + out * a
    res = np.clip(res, 0, 1) ** (1 / 2.2)
    out_im = Image.fromarray((res * 255 + 0.5).astype(np.uint8))
    if qt: out_im.save(path, qtables=qt, subsampling=max(sub, 0))
    else: out_im.save(path, quality=88)
    print(f'{path}: hands to the forearm tone {np.round(target ** (1 / 2.2) * 255).astype(int).tolist()}, '
          f'{int((m > 0.5).sum())} texels')


if __name__ == '__main__':
    args = sys.argv[1:]
    opt = lambda k, v: float(args[args.index(k) + 1]) if k in args else v
    tone, detail, reach = opt('--tone', 0.65), opt('--detail', 0.5), opt('--reach', 0.25)
    dirs = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] not in ('--tone', '--detail', '--reach'))]
    if not dirs:
        sys.exit(__doc__)
    for d in dirs:
        main(d, tone, detail, reach)
