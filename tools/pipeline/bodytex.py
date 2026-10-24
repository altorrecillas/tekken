"""Body skin texture: colour matched to the face, de-haired, with procedural body hair and tattoos."""
import numpy as np
import cv2
from PIL import Image, ImageDraw
from garments import ATLAS, Decal, smoothstep
from headtex import fbm, normal_from_height, dilate_fill
from facefit import color_transfer
import mhlib as M
import os


def atlas_weight_map(ctx, prefixes):
    A = ctx.atlas()
    ys, xs, k, bc = A['tri']
    cols = [i for i, n in enumerate(ctx.bn) if any(n.startswith(p) for p in prefixes)]
    w = ctx.W[:, cols].sum(1)
    m = np.zeros((ATLAS, ATLAS), np.float32)
    m[ys, xs] = (w[ctx.tris[k]] * bc).sum(1)
    return m


def hair_strokes(density, direction, length, seed, curl=0.0, thickness=1, scale=1.0):
    """Draw hair strokes (coverage map). direction: (H,W,2) unit vectors in texel space or None (random)."""
    H, W = density.shape
    rng = np.random.default_rng(seed)
    n = int(density.sum() * scale)
    if n <= 0:
        return np.zeros((H, W), np.float32)
    flat = density.ravel().astype(np.float64)
    idx = rng.choice(flat.size, size=n, p=flat / flat.sum())
    ys, xs = np.divmod(idx, W)
    img = np.zeros((H, W), np.uint8)
    if direction is None:
        ang = rng.uniform(0, 2 * np.pi, n)
        dx, dy = np.cos(ang), np.sin(ang)
    else:
        d = direction[ys, xs]
        jitter = rng.normal(0, 0.35, n)
        c, s = np.cos(jitter), np.sin(jitter)
        dx = d[:, 0] * c - d[:, 1] * s
        dy = d[:, 0] * s + d[:, 1] * c
    ln = rng.uniform(length[0], length[1], n)
    cv = rng.normal(0, curl, n)
    inten = rng.integers(90, 230, n)
    for x, y, a, b, l, k, it in zip(xs, ys, dx, dy, ln, cv, inten):
        pts = []
        px, py, ax, ay = float(x), float(y), a, b
        for s_ in range(4):
            pts.append((int(px * 4), int(py * 4)))
            px += ax * l / 3; py += ay * l / 3
            ca, sa = np.cos(k), np.sin(k)
            ax, ay = ax * ca - ay * sa, ax * sa + ay * ca
        cv2.polylines(img, [np.array(pts, np.int32)], False, int(it), thickness, cv2.LINE_AA, shift=2)
    return img.astype(np.float32) / 255


def hair_strokes_scaled(prob, direction, length_px, seed, curl=0.0):
    H, W = prob.shape
    rng = np.random.default_rng(seed)
    n = int(prob.sum())
    if n <= 0:
        return np.zeros((H, W), np.float32)
    flat = prob.ravel().astype(np.float64)
    idx = rng.choice(flat.size, size=n, p=flat / flat.sum())
    ys, xs = np.divmod(idx, W)
    d = direction[ys, xs]
    jit = rng.normal(0, 0.4, n)
    c, s_ = np.cos(jit), np.sin(jit)
    dx = d[:, 0] * c - d[:, 1] * s_
    dy = d[:, 0] * s_ + d[:, 1] * c
    ln = np.clip(length_px[ys, xs] * rng.uniform(0.6, 1.2, n), 1.5, 14)
    inten = rng.integers(70, 200, n)
    img = np.zeros((H, W), np.uint8)
    cv = rng.normal(0, curl, n)
    for x, y, a, b, l, k, it in zip(xs, ys, dx, dy, ln, cv, inten):
        p1 = (int((x + a * l * 0.5) * 4), int((y + b * l * 0.5) * 4))
        ca, sa = np.cos(k), np.sin(k)
        a2, b2 = a * ca - b * sa, a * sa + b * ca
        p2 = (int((x + a * l * 0.5 + a2 * l * 0.5) * 4), int((y + b * l * 0.5 + b2 * l * 0.5) * 4))
        cv2.polylines(img, [np.array([(int(x * 4), int(y * 4)), p1, p2], np.int32)], False, int(it), 1, cv2.LINE_AA, shift=2)
    return img.astype(np.float32) / 255


def build_body_skin(ctx, P, skin_src, st_src_face, tgt, outdir):
    A = ctx.atlas()
    valid = A['valid']
    pos = A['pos']
    nrm = A['nrm']
    handfoot = atlas_weight_map(ctx, ('wrist', 'finger', 'metacarpal', 'foot', 'toe'))
    headm = atlas_weight_map(ctx, ('head', 'jaw', 'neck03', 'special', 'oris', 'levator', 'risorius', 'temporalis',
                                   'oculi', 'orbicularis', 'eye', 'tongue'))
    # colour stats of the body texture on chest/belly skin
    front = (nrm[..., 2] > 0.6) & (pos[..., 1] > ctx.y_navel) & (pos[..., 1] < ctx.y_chest + 0.3) & valid
    lab = cv2.cvtColor(skin_src, cv2.COLOR_BGR2LAB).astype(np.float32)
    st_body = (lab[front].mean(0), lab[front].std(0))
    body_tgt = (np.array(tgt[0]) + np.array([P.get('body_lum', 3), 0, 0]), tgt[1])
    skin = color_transfer(skin_src, st_body, body_tgt).astype(np.float32)
    # remove painted hair strands: replace high frequencies by a median-filtered version (not on hands/feet)
    med = cv2.medianBlur(skin.astype(np.uint8), 7).astype(np.float32)
    fine = skin - cv2.GaussianBlur(skin, (0, 0), 1.0)
    dehair = med + np.clip(fine, -6, 6) * 0.5
    keep = np.clip(handfoot * 1.5 + headm, 0, 1)[..., None]
    keep = cv2.GaussianBlur(keep, (0, 0), 4)[..., None] if keep.ndim == 2 else cv2.GaussianBlur(keep[..., 0], (0, 0), 4)[..., None]
    skin = skin * keep + dehair * (1 - keep)
    # even out large-scale colour blotches (e.g. reddish legs in the source texture)
    labs = cv2.cvtColor(np.clip(skin, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    low = cv2.GaussianBlur(labs, (0, 0), 40)
    even = P.get('skin_even', 0.75)
    # luminance evening spares the hands/feet (their detail), but the chroma evening covers them too: otherwise
    # they keep the source texture's red and read redder than the face
    hb = cv2.GaussianBlur(headm.astype(np.float32), (0, 0), 4)
    for ch, amt in ((0, even * 0.5), (1, even), (2, even)):
        mask = (1 - keep[..., 0]) if ch == 0 else (1 - hb)
        labs[..., ch] = labs[..., ch] - (low[..., ch] - body_tgt[0][ch]) * amt * mask
    skin = cv2.cvtColor(np.clip(labs, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
    # subtle pores / mottling
    n = fbm((ATLAS, ATLAS), (96, 24, 6), 17)[..., None]
    skin *= (1 + n * 0.03)

    # ------------------------------------------------------------ body hair
    hair_col = np.array(P.get('body_hair_color', (40, 32, 28)), np.float32)[::-1]
    y = pos[..., 1]; x = pos[..., 0]; z = pos[..., 2]
    armn = atlas_weight_map(ctx, ('upperarm', 'lowerarm'))
    legn = atlas_weight_map(ctx, ('upperleg', 'lowerleg'))
    dens = np.zeros((ATLAS, ATLAS), np.float32)
    bh = P.get('body_hair', {})
    if bh.get('chest', 0) > 0:
        chest = (nrm[..., 2] > 0.25) & (armn < 0.3) & (legn < 0.3) & (headm < 0.2)
        cm = chest * smoothstep(ctx.y_neck - 0.2, ctx.y_neck - 0.9, y) * smoothstep(ctx.y_navel - 0.3, ctx.y_chest - 0.6, y)
        cm *= smoothstep(1.9, 0.9, np.abs(x))
        trail = chest * smoothstep(0.35, 0.1, np.abs(x)) * smoothstep(ctx.y_hip - 0.2, ctx.y_navel - 0.3, y) * (y < ctx.y_chest)
        dens = np.maximum(dens, cm * bh['chest'] * (0.65 + 0.35 * fbm((ATLAS, ATLAS), (60, 15), 21)))
        dens = np.maximum(dens, trail * bh['chest'] * 0.8)
    if bh.get('arms', 0) > 0:
        fore = armn * smoothstep(0.9, 1.3, A['arm']) * smoothstep(2.05, 1.8, A['arm'])
        dens = np.maximum(dens, fore * bh['arms'] * 0.6)
    if bh.get('legs', 0) > 0:
        lg = legn * smoothstep(0.15, 0.5, A['leg']) * smoothstep(2.02, 1.85, A['leg'])
        dens = np.maximum(dens, lg * bh['legs'] * 0.55)
    dens *= valid * (1 - handfoot)
    if dens.max() > 0:
        # local texel size (dm per pixel) so hair length/density are uniform on the body
        def grad(ch):
            gx = np.abs(np.diff(ch, axis=1, append=ch[:, -1:]))
            gy = np.abs(np.diff(ch, axis=0, append=ch[-1:, :]))
            return gx, gy
        g2 = np.zeros((ATLAS, ATLAS), np.float32)
        for c in range(3):
            gx, gy = grad(pos[..., c])
            g2 += (gx ** 2 + gy ** 2) / 2
        dmpp = np.sqrt(g2)
        dmpp = cv2.medianBlur(np.clip(dmpp, 0, 0.2).astype(np.float32), 5)
        dmpp[~valid] = 0.02
        dmpp = np.clip(dmpp, 0.004, 0.05)
        # hair grows downward along the limbs: texel-space direction of decreasing height
        gy = cv2.Sobel(pos[..., 1], cv2.CV_32F, 0, 1, ksize=3)
        gx = cv2.Sobel(pos[..., 1], cv2.CV_32F, 1, 0, ksize=3)
        g = np.dstack([-gx, -gy])
        dy_img = g / (np.linalg.norm(g, axis=2, keepdims=True) + 1e-6)
        prob = dens * (dmpp ** 2) * 560.0  # strokes per texel ~ density per dm^2 * texel area (sparse: reads as hair, not dirt)
        length_px = 0.09 / dmpp            # ~9 mm hairs
        cov = hair_strokes_scaled(prob, dy_img, length_px, seed=5, curl=0.5)
        cov = np.clip(cov * 0.3 + cv2.GaussianBlur(dens, (0, 0), 3) * 0.03, 0, 1)
        skin = skin * (1 - cov[..., None]) + hair_col * cov[..., None]

    # ------------------------------------------------------------ tattoos
    for t in P.get('tattoos', []):
        img = tattoo_img(t['kind'])
        side = 1 if t['side'] == 'L' else -1
        Sj = ctx.J[f'upperarm01.{t["side"]}']['head']; Ej = ctx.J[f'lowerarm01.{t["side"]}']['head']; Wj = ctx.J[f'wrist.{t["side"]}']['head']
        a = t['at']
        c = Sj + (Ej - Sj) * a if a <= 1 else Ej + (Wj - Ej) * (a - 1)
        axis = (Ej - Sj) if a <= 1 else (Wj - Ej)
        axis = axis / np.linalg.norm(axis)
        facing = np.array(t.get('facing', (0, 0, 1)), np.float32)
        facing = facing - axis * (facing @ axis)
        facing /= np.linalg.norm(facing)
        right = np.cross(axis, facing)
        s = t.get('size', 0.5)
        dec = Decal(img, c, right * s * 0.5 * t.get('aspect', 1.0), -axis * s * 0.5, facing, opacity=0.82, min_facing=0.1)
        height = np.zeros((ATLAS, ATLAS), np.float32)
        dec.apply(ctx, skin, height, A)

    # mouth interior (dark, occluded)
    B = M.base()
    from common import uv_islands
    lab = uv_islands()
    mouth_label = None
    for i in range(len(ctx.tuv)):
        pass
    ys, xs, k, bc = A['tri']
    tl = lab[ctx.tuv[k, 0]]
    # the mouth-interior island is the one whose vertices sit between the lips (behind the face)
    cand = {}
    for l in np.unique(tl):
        sel = tl == l
        p = pos[ys[sel], xs[sel]]
        cand[l] = (sel.sum(), p.mean(0))
    head_y = ctx.J['head']['head'][1]
    for l, (n, c) in cand.items():
        if abs(c[0]) < 0.3 and head_y - 0.9 < c[1] < head_y + 0.2 and n < 60000 and c[2] > 0.2:
            mouth_label = l
    if mouth_label is not None:
        sel = tl == mouth_label
        skin[ys[sel], xs[sel]] *= np.array([0.28, 0.25, 0.35])
    # the whole background filled from the islands (uvpad.py): no light line along the seams in the mipmaps, no ridge
    # round the islands in the relief below, and a much smaller file
    from uvpad import pushpull_fill
    skin = pushpull_fill(np.clip(skin, 0, 255).astype(np.float32), valid)
    L = cv2.cvtColor(skin.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    L = cv2.GaussianBlur(L, (0, 0), 0.8)
    nb = normal_from_height(L - cv2.GaussianBlur(L, (0, 0), 3.0), strength=1.2)
    cv2.imwrite(os.path.join(outdir, 'skin.jpg'), skin.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(os.path.join(outdir, 'skin_n.jpg'), cv2.resize(nb, (1024, 1024), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 90])


def tattoo_img(kind):
    W = H = 400
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ink = (28, 32, 38, 255)
    if kind == '1980':
        from outfits import font
        f = font('NotoSerif-Bold.ttf', 150)
        d.text((W / 2, H / 2), '1980', font=f, fill=ink, anchor='mm')
    elif kind == 'laurel':
        for side in (-1, 1):
            for i in range(7):
                t = i / 6
                cx = W / 2 + side * (70 + 60 * np.sin(t * 2.4))
                cy = 330 - t * 260
                d.ellipse([cx - 22, cy - 11, cx + 22, cy + 11], outline=ink, width=6)
            d.arc([W / 2 - 140 if side < 0 else W / 2 - 10, 60, W / 2 + 10 if side < 0 else W / 2 + 140, 360],
                  90 if side < 0 else 270, 270 if side < 0 else 90, fill=ink, width=5)
    elif kind == 'face':
        d.ellipse([110, 60, 290, 280], outline=ink, width=9)
        d.arc([150, 150, 250, 240], 20, 160, fill=ink, width=7)
        d.ellipse([155, 130, 180, 155], fill=ink); d.ellipse([220, 130, 245, 155], fill=ink)
        d.line([(200, 280), (200, 360)], fill=ink, width=9)
        d.line([(120, 330), (280, 330)], fill=ink, width=9)
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGBA2BGRA)
