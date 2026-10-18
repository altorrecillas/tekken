"""Procedural hair-card generator: grows strands over the scalp and builds textured alpha cards."""
import numpy as np
import cv2
from scipy.spatial import cKDTree

ATLAS_W, ATLAS_H, NVAR = 1024, 1024, 8
# a list to collect every strand grow_bob makes (paths, angles), for inspecting a hairstyle from a script
DEBUG = None


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def strand_atlas(seed=0, curly=False, roots_v0=False, root_fade=0.0):
    """RGBA atlas: NVAR vertical card variants side by side. White-ish strands, alpha tapered at the tip.
    The strands are drawn from the top row down, and textures load with flipY, so in the first atlases (hair_cards.png,
    hair_cards_curly.png) a card's root (v=0) gets the strands' faded tips and its tip the dense roots: the first
    quarter of every card is almost transparent. roots_v0 flips the image so the dense roots sit at v=0 as intended
    (the *_r.png atlases). root_fade: the share of the card's length, from its root, over which the strands fade in
    (the *_s.png atlases: dense hair whose cards do not draw a hard line along the hairline)."""
    rng = np.random.default_rng(seed)
    img = np.zeros((ATLAS_H, ATLAS_W, 4), np.float32)
    cw = ATLAS_W // NVAR
    for v in range(NVAR):
        x0 = v * cw
        n = rng.integers(28, 46)
        layer = np.zeros((ATLAS_H, cw, 2), np.float32)
        for s in range(n):
            xs = rng.uniform(0.12, 0.88) * cw
            length = rng.uniform(0.72, 1.0) * ATLAS_H
            amp = rng.uniform(1.5, 6.0) * (3.0 if curly else 1.0)
            freq = rng.uniform(1.0, 3.0) * (4.0 if curly else 1.0)
            ph = rng.uniform(0, 6.28)
            val = rng.uniform(0.55, 1.0)
            wid = rng.uniform(1.0, 2.2)
            ys = np.arange(0, int(length), 2)
            xs_ = xs + np.sin(ys / ATLAS_H * freq * 6.28 + ph) * amp + (ys / ATLAS_H) * rng.uniform(-8, 8)
            pts = np.stack([xs_, ys], 1).astype(np.float32)
            tmp = np.zeros((ATLAS_H, cw), np.float32)
            cv2.polylines(tmp, [np.round(pts * 4).astype(np.int32)], False, 1.0, max(1, int(wid)), cv2.LINE_AA, shift=2)
            taper = np.clip(1.25 - np.arange(ATLAS_H) / max(length, 1), 0, 1)[:, None]
            if root_fade > 0:
                y_ = np.arange(ATLAS_H) / (root_fade * ATLAS_H)
                taper = taper * (np.clip(y_, 0, 1) ** 2 * (3 - 2 * np.clip(y_, 0, 1)))[:, None]
            a = tmp * taper
            layer[..., 0] = np.maximum(layer[..., 0], a)
            layer[..., 1] = np.where(a > layer[..., 1] * 0.5, val, layer[..., 1])
        alpha = np.clip(layer[..., 0] * 1.4, 0, 1)
        col = np.clip(layer[..., 1] * 0.85 + 0.15, 0, 1)
        img[:, x0:x0 + cw, 0] = col
        img[:, x0:x0 + cw, 1] = col
        img[:, x0:x0 + cw, 2] = col
        img[:, x0:x0 + cw, 3] = alpha
    out = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    if roots_v0:
        # v=0 at the root (bottom of the image in GL convention -> row H-1)
        out = np.ascontiguousarray(out[::-1])
    return cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA)


def area_sample(P, tris, weights_v, n, rng):
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1) * 0.5
    w = area * weights_v[tris].mean(1)
    w = np.clip(w, 0, None)
    if w.sum() <= 0:
        return None, None
    ti = rng.choice(len(tris), size=n, p=w / w.sum())
    r1, r2 = rng.random(n), rng.random(n)
    s = np.sqrt(r1)
    u, v = 1 - s, s * (1 - r2)
    wv = s * r2
    pts = a[ti] * u[:, None] + b[ti] * v[:, None] + c[ti] * wv[:, None]
    return pts, ti


def grow_hair(V, N, tris, cover, frame, style, seed=1):
    """
    V, N: head vertices/normals (dm), tris: head triangles, cover: per-vertex scalp coverage [0..1].
    style: dict(n=roots, length=(top, side, back) dm, width dm, comb='fringe'|'back'|'curly', lift=dm, layers)
    Returns positions (dm), uvs, AO (per-vertex), tangents, tris.
    """
    rng = np.random.default_rng(seed)
    scalp_v = np.where(cover > 0.05)[0]
    tree = cKDTree(V[scalp_v])
    C = frame.C
    out_p, out_uv, out_ao, out_t, out_i = [], [], [], [], []
    base = 0
    crown = C + np.array([0, 0.75, -0.55])
    brow_y = style.get('stop_y', None)
    for layer, (n, lscale, off0, ao0, wscale) in enumerate(style.get('layers', [(style['n'], 0.8, 0.02, 0.35, 1.0), (int(style['n'] * 0.6), 1.0, 0.05, 0.6, 1.0)])):
        roots, ti = area_sample(V, tris, cover, n, rng)
        if roots is None:
            continue
        for r in roots:
            d0, k0 = tree.query(r)
            nrm = N[scalp_v[k0]]
            el, az = frame.angles(r[None])
            el, az = float(el[0]), float(az[0])
            a = abs(az)
            # regional length: top / sides / back
            top, side, back = style['length']
            if a < 60: L = top * (1 - 0.3 * max(0, (a - 30) / 30))
            elif a < 120: L = side + (top - side) * max(0, (el - 25) / 30)
            else: L = back + (top - back) * max(0, (el - 30) / 30)
            L = max(0.05, L * lscale * rng.uniform(0.8, 1.1))
            # comb direction on the tangent plane
            if style['comb'] == 'fringe':
                g = r - crown
            elif style['comb'] == 'back':
                # swept back with a little lift at the front (quiff); sides/back flow down-back
                if a < 70 and el > 20:
                    g = np.array([0.25 * np.sign(r[0] - C[0] + 1e-6) + style.get('part', 0.0), style.get('quiff', 0.12), -1.0])
                else:
                    g = r - (C + np.array([0, 1.3, 0.35]))
            elif style['comb'] == 'side':
                g = np.array([-1.0, -0.15, -0.35]) if el > 30 else r - (C + np.array([0, 1.2, 0]))
            else:  # curly / messy
                g = r - (C + np.array([0, 1.0, 0])) + rng.normal(0, 0.6, 3)
            g = g - nrm * (g @ nrm)
            gn = np.linalg.norm(g)
            dirv = g / gn if gn > 1e-6 else np.cross(nrm, [1, 0, 0])
            segs = 5
            pts = [r + nrm * off0 * 0.5]
            p = pts[0].copy()
            my_stop = None if brow_y is None else brow_y + rng.uniform(-0.06, 0.16)
            # hairline: every strand stops at its own height (a single clamp height reads as a bowl cut)
            face_stop = style['face_top'] + rng.uniform(0.0, style.get('face_jitter', 0.15)) if style.get('no_face', False) else None
            stopped = False
            for s_ in range(segs):
                if stopped:
                    # collapse the remaining segments at the tip (alpha taper hides them)
                    pts.append(p + dirv * 0.004 * (s_ + 1))
                    continue
                step = L / segs
                # gravity for longer strands, curl for curly styles
                dirv = dirv + np.array([0, -1, 0]) * style.get('gravity', 0.15) * (s_ / segs)
                if style['comb'] == 'curly':
                    dirv = dirv + np.cross(nrm, dirv) * rng.normal(0, style.get('curl', 0.9))  # (lower: wavy rather than frizzy)
                dirv /= np.linalg.norm(dirv)
                p = p + dirv * step
                if face_stop is not None and a < 75 and p[1] < face_stop:
                    p[1] = face_stop; stopped = True
                if my_stop is not None and a < 70 and p[1] < my_stop:
                    # fringe stops around the eyebrows (ragged cut)
                    p[1] = my_stop
                    stopped = True
                # keep near the skull: project to the scalp and push out to the layer offset
                d_, k_ = tree.query(p)
                q = V[scalp_v[k_]]; qn = N[scalp_v[k_]]
                side_k = 1.0 if a < 55 else style.get('side_lift', 0.45)
                h = off0 + style.get('lift', 0.08) * side_k * ((s_ + 1) / segs) ** 0.7
                dist = (p - q) @ qn
                if dist < h:
                    p = p + qn * (h - dist)
                pts.append(p.copy())
            pts = np.array(pts)
            # card: width perpendicular to strand, tangent to the scalp
            w = style['width'] * wscale * rng.uniform(0.8, 1.2)
            var = rng.integers(0, NVAR)
            u0, u1 = var / NVAR + 0.004, (var + 1) / NVAR - 0.004
            flip = rng.random() < 0.5
            for i, q in enumerate(pts):
                tdir = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
                tdir /= np.linalg.norm(tdir) + 1e-9
                d_, k_ = tree.query(q)
                qn = N[scalp_v[k_]]
                side = np.cross(tdir, qn)
                side /= np.linalg.norm(side) + 1e-9
                taper = 1.0 - 0.35 * i / (len(pts) - 1)
                vv = i / (len(pts) - 1)
                out_p += [q - side * w * taper / 2, q + side * w * taper / 2]
                out_uv += [[u1 if flip else u0, vv], [u0 if flip else u1, vv]]
                ao = ao0 + (1 - ao0) * (vv ** 0.7)
                out_ao += [ao, ao]
                out_t += [tdir, tdir]
            for i in range(len(pts) - 1):
                a_ = base + i * 2
                out_i += [[a_, a_ + 1, a_ + 2], [a_ + 1, a_ + 3, a_ + 2]]
            base += len(pts) * 2
    # baby hairs: short, fine strands scattered along the hairline soften the edge of the hair mass
    nb = style.get('baby', 140)
    edge = np.clip(cover * (1 - cover) * 4, 0, 1)
    if nb > 0 and edge.max() > 0.05:
        roots, _ = area_sample(V, tris, edge, nb, rng)
        if roots is not None:
            out = (out_p, out_uv, out_ao, out_t, out_i)
            for r in roots:
                d0, k0 = tree.query(r)
                nrm = N[scalp_v[k0]]
                # same flow as the main strands (swept back hair must not grow down onto the forehead)
                if style['comb'] == 'back':
                    g = np.array([0.25 * np.sign(r[0] - C[0] + 1e-6), 0.35, -1.0])
                elif style['comb'] == 'fringe':
                    g = r - (C + np.array([0, 0.75, -0.55]))
                else:
                    # curly / short: wisps lift up and back off the hairline (radial growth from above the crown
                    # points them down onto the forehead, where they read as dark dashes on the skin)
                    g = np.array([0.2 * np.sign(r[0] - C[0] + 1e-6), 1.0, -0.45]) + rng.normal(0, 0.35, 3)
                g = g - nrm * (g @ nrm); g /= np.linalg.norm(g) + 1e-9
                L = rng.uniform(0.07, 0.14)
                pts = np.array([r + nrm * 0.005 + g * L * t + nrm * 0.008 * t for t in np.linspace(0, 1, 3)])
                base = _card(out, base, pts, style['width'] * 0.45, rng.integers(0, NVAR), 0.7, lambda q, nrm=nrm: nrm, rng.random() < 0.5, taper=0.7)
    return (np.array(out_p, np.float32), np.array(out_uv, np.float32), np.array(out_ao, np.float32),
            np.array(out_t, np.float32), np.array(out_i, np.int64))


def _card(out, base, pts, width, var, ao0, normals_fn, flip=False, taper=0.35):
    """Append one ribbon card along pts to the output lists; returns new base index."""
    out_p, out_uv, out_ao, out_t, out_i = out
    u0, u1 = var / NVAR + 0.004, (var + 1) / NVAR - 0.004
    n = len(pts)
    for i, q in enumerate(pts):
        tdir = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        tdir = tdir / (np.linalg.norm(tdir) + 1e-9)
        qn = normals_fn(q)
        side = np.cross(tdir, qn)
        side /= np.linalg.norm(side) + 1e-9
        w = width * (1.0 - taper * i / max(1, n - 1))
        vv = i / max(1, n - 1)
        out_p += [q - side * w / 2, q + side * w / 2]
        out_uv += [[u1 if flip else u0, vv], [u0 if flip else u1, vv]]
        ao = ao0 + (1 - ao0) * (vv ** 0.7)
        out_ao += [ao, ao]
        out_t += [tdir, tdir]
    for i in range(n - 1):
        a_ = base + i * 2
        out_i += [[a_, a_ + 1, a_ + 2], [a_ + 1, a_ + 3, a_ + 2]]
    return base + n * 2


def grow_topknot(V, N, tris, cover, frame, style, seed=3):
    """Slicked-back top hair gathered into a small samurai knot with a short tail."""
    rng = np.random.default_rng(seed)
    scalp_v = np.where(cover > 0.05)[0]
    allv = np.unique(tris)
    tree = cKDTree(V[allv])
    C = frame.C
    # knot anchor: on the scalp at the back of the crown
    kd = np.array([0.0, np.sin(np.radians(style.get('knot_el', 42))), -np.cos(np.radians(style.get('knot_el', 42)))])
    # find the scalp point along that direction
    cand = V[allv] - C
    cn = cand / np.linalg.norm(cand, axis=1, keepdims=True)
    kidx = allv[np.argmax(cn @ kd)]
    K = V[kidx]; KN = N[kidx]
    def nfn(q):
        d_, k_ = tree.query(q)
        return N[allv[k_]]
    out = ([], [], [], [], [])
    base = 0
    # 1) slicked-back strands from the top region to the knot
    for layer, (n, off0, ao0) in enumerate(style.get('layers', [(style['n'], 0.02, 0.35), (int(style['n'] * 0.5), 0.045, 0.6)])):
        roots, ti = area_sample(V, tris, cover, n, rng)
        if roots is None:
            continue
        for r in roots:
            p = r.copy()
            pts = [p.copy()]
            L = np.linalg.norm(K - r)
            segs = max(3, int(L / 0.18))
            for s_ in range(segs):
                qn = nfn(p)
                g = K - p
                g = g - qn * (g @ qn)
                gl = np.linalg.norm(g)
                if gl < 0.05:
                    break
                step = min(0.18, np.linalg.norm(K - p) / max(1, segs - s_))
                p = p + g / gl * step + rng.normal(0, 0.006, 3)
                d_, k_ = tree.query(p)
                q = V[allv[k_]]; qq = N[allv[k_]]
                h = off0 + 0.01 * s_ / segs
                dist = (p - q) @ qq
                p = p + qq * (h - dist)
                pts.append(p.copy())
            if len(pts) < 3:
                continue
            base = _card(out, base, np.array(pts), style['width'] * rng.uniform(0.8, 1.2), rng.integers(0, NVAR), ao0, nfn, rng.random() < 0.5, taper=0.15)
    # 2) the bun: cards wrapped around a small sphere sitting on the knot point
    br = style.get('bun_r', 0.19)
    Bc = K + KN * br * 0.55
    up = KN
    a1 = np.cross(up, [1.0, 0, 0]); a1 /= np.linalg.norm(a1)
    a2 = np.cross(up, a1)
    for i in range(style.get('bun_cards', 70)):
        # random great circle around the bun centre
        th = rng.uniform(0, np.pi)
        axis = np.cos(th) * a1 + np.sin(th) * a2
        axis = axis * np.cos(rng.uniform(0, 0.9)) + up * np.sin(rng.uniform(-0.9, 0.9))
        axis /= np.linalg.norm(axis)
        e1 = np.cross(axis, [0.3, 1.0, 0.2]); e1 /= np.linalg.norm(e1)
        e2 = np.cross(axis, e1)
        start = rng.uniform(0, 2 * np.pi)
        arc = rng.uniform(2.2, 3.6)
        pts = np.array([Bc + (np.cos(start + t) * e1 + np.sin(start + t) * e2) * br * rng.uniform(0.95, 1.08)
                        for t in np.linspace(0, arc, 7)])
        bn = lambda q, Bc=Bc: (q - Bc) / (np.linalg.norm(q - Bc) + 1e-9)
        base = _card(out, base, pts, style['width'] * 1.3, rng.integers(0, NVAR), 0.3, bn, rng.random() < 0.5, taper=0.1)
    # 3) short tail sticking out backwards/down from the bun
    tail_dir = np.array([0.0, -0.25, -0.97]); tail_dir /= np.linalg.norm(tail_dir)
    for i in range(style.get('tail_cards', 16) * 2):
        spread = rng.normal(0, style.get('tail_spread', 0.22), 3)
        d = tail_dir + spread; d /= np.linalg.norm(d)
        Lt = style.get('tail_len', 0.5) * rng.uniform(0.7, 1.1)
        p0 = Bc + d * br * 0.4
        pts = [p0 + d * Lt * t + np.array([0, -1.0, 0]) * 0.12 * Lt * t * t for t in np.linspace(0, 1, 5)]
        tn = lambda q, p0=p0: np.cross(d, [1.0, 0, 0]) / (np.linalg.norm(np.cross(d, [1.0, 0, 0])) + 1e-9)
        base = _card(out, base, np.array(pts), style['width'] * 1.4, rng.integers(0, NVAR), 0.35, tn, rng.random() < 0.5, taper=0.6)
        # a second, crossed card for volume
        tn2 = lambda q, p0=p0: np.cross(d, [0, 1.0, 0]) / (np.linalg.norm(np.cross(d, [0, 1.0, 0])) + 1e-9)
        base = _card(out, base, np.array(pts), style['width'] * 1.2, rng.integers(0, NVAR), 0.35, tn2, rng.random() < 0.5, taper=0.6)
    op, ouv, oao, ot, oi = out
    band = dict(center=Bc + tail_dir * br * 0.75, axis=tail_dir, radius=br * 0.45, bun_center=Bc, bun_r=br)
    return (np.array(op, np.float32), np.array(ouv, np.float32), np.array(oao, np.float32), np.array(ot, np.float32),
            np.array(oi, np.int64), band)


def grow_brows(V, N, tris, frame, n_per=650, length=(0.035, 0.065), width=0.01, seed=21):
    """Short eyebrow hair cards lying on the brow ridge: roots scattered between the lower and upper brow
    landmark edges, strands running from the inner end outwards (upwards at the head of the brow)."""
    rng = np.random.default_rng(seed)
    allv = np.unique(tris)
    tree = cKDTree(V[allv])
    lm = frame.lm
    out = ([], [], [], [], [])
    base = 0
    # upper edge outer->inner, lower edge inner->outer (MediaPipe order)
    brows = [([70, 63, 105, 66, 107], [46, 53, 52, 65, 55]), ([300, 293, 334, 296, 336], [276, 283, 282, 295, 285])]
    for up_ids, lo_ids in brows:
        if not all(i in lm for i in up_ids + lo_ids):
            continue
        # both edges are listed outer -> inner by MediaPipe: flip to inner -> outer
        up = np.array([lm[i] for i in up_ids])[::-1]
        lo = np.array([lm[i] for i in lo_ids])[::-1]
        def along(e, t):
            s = t * (len(e) - 1); i = min(int(s), len(e) - 2); f = s - i
            return e[i] * (1 - f) + e[i + 1] * f
        for _ in range(n_per):
            t = rng.random() ** 0.9
            h = rng.uniform(0.1, 0.9)
            p = along(lo, t) * (1 - h) + along(up, t) * h
            d_, k_ = tree.query(p)
            q = V[allv[k_]]; qn = N[allv[k_]]
            outward = along(up, min(1.0, t + 0.05)) - along(up, max(0.0, t - 0.05))
            outward /= np.linalg.norm(outward) + 1e-9
            upv = along(up, t) - along(lo, t); upv /= np.linalg.norm(upv) + 1e-9
            # inner third grows up and out, the tail lies flat outward
            dirv = outward * (0.55 + 0.45 * t) + upv * (0.75 * (1 - t) + 0.08)
            dirv -= qn * (dirv @ qn); dirv /= np.linalg.norm(dirv) + 1e-9
            L = rng.uniform(*length) * (0.8 + 0.4 * (1 - abs(t - 0.4)))
            root = q + qn * 0.0025
            pts = []
            for s_ in np.linspace(0, 1, 4):
                pp = root + dirv * L * s_
                d2, k2 = tree.query(pp)
                sq, sn = V[allv[k2]], N[allv[k2]]
                pp = pp + sn * ((0.0025 + 0.002 * s_) - (pp - sq) @ sn)   # hug the skin, tips lift slightly
                pts.append(pp)
            nfn = lambda x, qn=qn: qn
            base = _card(out, base, np.array(pts), width * rng.uniform(0.8, 1.2), rng.integers(0, NVAR), 0.55, nfn, rng.random() < 0.5, taper=0.7)
    op, ouv, oao, ot, oi = out
    return (np.array(op, np.float32), np.array(ouv, np.float32), np.array(oao, np.float32), np.array(ot, np.float32), np.array(oi, np.int64))


def grow_bob(V, N, tris, cover, frame, style, coll_idx=None, seed=5):
    """Curly bob (Noemi): strands combed off a side parting over the top and down past the ears to about the chin,
    full of volume towards the ends, springy curls, the face kept clear.
    Every strand is laid out in spherical coordinates around the head centre: its azimuth travels from the root to the
    end early (the top is combed sideways first), its elevation drops later (then it falls), and its distance from the
    centre never goes below the outer surface of the head, face, neck and shoulders plus the hair's own lift. The outer
    surface is a map of the largest radius seen in each direction (coll_idx: the vertices that count), so the inner
    surfaces of the mouth and the eye sockets never pull a strand inside the head.
    style: part_az (parting, degrees, + = her left), sweep (degrees the top strands travel), spread (end radius from the
    head axis at the sides, dm), back_spread, end_dy (end height above the chin, dm), back_dy (extra height at the nape),
    face_clear (degrees of azimuth kept free of hair below the brows), curl (curl radius, dm), pitch (curl length, dm),
    width (card width, dm), seg (segment length, dm), layers=[(n, length scale, offset, ao, lift, curl scale)]."""
    rng = np.random.default_rng(seed)
    C = frame.C
    lm = frame.lm
    cidx = np.unique(tris) if coll_idx is None else np.asarray(coll_idx)
    # ---- outer surface radius per direction (3 degree cells, wrapped in azimuth): the head and the neck only (seen
    # from the head centre, the shoulders are what lies below-outwards, and would throw the strands out to them)
    chin_y = float(lm[152][1])
    Pc = V[cidx]
    keep = (Pc[:, 1] > chin_y - 0.45) & (np.hypot(Pc[:, 0] - C[0], Pc[:, 2] - C[2]) < 0.95)
    cidx = cidx[keep]
    D = V[cidx] - C
    Rv = np.linalg.norm(D, axis=1)
    az_v = np.degrees(np.arctan2(D[:, 0], D[:, 2]))
    el_v = np.degrees(np.arcsin(np.clip(D[:, 1] / np.maximum(Rv, 1e-9), -1, 1)))
    AZN, ELN, STEP = 120, 60, 3.0
    grid = np.full((ELN, AZN), -1.0)
    ia = (np.floor((az_v + 180) / STEP).astype(int)) % AZN
    ie = np.clip(np.floor((el_v + 90) / STEP).astype(int), 0, ELN - 1)
    np.maximum.at(grid, (ie, ia), Rv)
    def shift(g, i, j):  # neighbour cells: azimuth wraps round, elevation stops at the poles
        g = np.roll(g, j, 1)
        if i > 0: g = np.concatenate([g[:1], g[:-1]], 0)
        elif i < 0: g = np.concatenate([g[1:], g[-1:]], 0)
        return g
    for _ in range(60):  # empty cells take the largest neighbour
        if (grid >= 0).all():
            break
        nb = np.max(np.stack([shift(grid, 0, 1), shift(grid, 0, -1), shift(grid, 1, 0), shift(grid, -1, 0)]), 0)
        grid = np.where(grid < 0, nb, grid)
    grid = np.maximum(grid, 0.3)
    big = np.max(np.stack([shift(grid, i, j) for i in (-1, 0, 1) for j in (-1, 0, 1)]), 0)
    grid = cv2.GaussianBlur(big.astype(np.float32), (0, 0), 0.8, borderType=cv2.BORDER_REPLICATE)

    def rsurf(az, el):
        x = (az + 180) / STEP - 0.5
        y = np.clip((el + 90) / STEP - 0.5, 0, ELN - 1.001)
        x0 = int(np.floor(x)); y0 = int(np.floor(y)); fx = x - x0; fy = y - y0
        x0 %= AZN; x1 = (x0 + 1) % AZN; y1 = min(y0 + 1, ELN - 1)
        return float((grid[y0, x0] * (1 - fx) + grid[y0, x1] * fx) * (1 - fy) + (grid[y1, x0] * (1 - fx) + grid[y1, x1] * fx) * fy)

    def dirv(az, el):
        a, e = np.radians(az), np.radians(el)
        return np.array([np.cos(e) * np.sin(a), np.sin(e), np.cos(e) * np.cos(a)])

    def wrap(a):
        return (a + 180.0) % 360.0 - 180.0

    brow_el = float(frame.angles(lm[105][None])[0][0])
    part = style.get('part_az', 30.0)
    sweep = style.get('sweep', 70.0)
    clear = style.get('face_clear', 58.0)
    out = ([], [], [], [], [])
    base = 0
    # the crown's own layer (curly hair stands up off the top of the head): roots only up there
    el_v2, _ = frame.angles(V)
    crown_cover = cover * smoothstep(30.0, 55.0, el_v2)
    layers = [(L, cover) for L in style['layers']] + [(L, crown_cover) for L in style.get('crown_layers', [])]
    for (n, lscale, off0, ao0, lift, cscale), cov in layers:
        roots, _ = area_sample(V, tris, cov, n, rng)
        if roots is None:
            continue
        for r in roots:
            el, az = frame.angles(r[None])
            el, az = float(el[0]), float(az[0])
            dpart = wrap(az - part)
            top = el > style.get('top_el', 30.0)
            if top and abs(az) < 155:
                side = -1.0 if dpart < 0 else 1.0
                travel = sweep * rng.uniform(0.75, 1.25) * np.clip(1.25 - abs(dpart) / 110, 0.3, 1.0)
                az_e = az + side * travel
            else:
                side = 1.0 if az >= 0 else -1.0
                az_e = az + rng.normal(0, 7)
            if abs(wrap(az_e)) < clear + 14:  # nothing ends in front of the cheeks
                s_ = np.sign(wrap(az_e)) if abs(wrap(az_e)) > 1e-3 else side
                az_e = s_ * (clear + 14 + rng.uniform(0, 18))
            az_e = float(np.clip(wrap(az_e), -179, 179)) if abs(az_e) <= 180 else wrap(az_e)
            back = smoothstep(100, 168, abs(wrap(az_e)))
            y_e = chin_y + style.get('end_dy', 0.05) + style.get('back_dy', 0.3) * back + rng.uniform(-0.14, 0.18)
            spread = style.get('spread', 1.2) * (1 - back) + style.get('back_spread', 0.95) * back
            R_e = spread * rng.uniform(0.88, 1.08)
            E = np.array([C[0] + R_e * np.sin(np.radians(az_e)), y_e, C[2] + R_e * np.cos(np.radians(az_e))])
            E = r + (E - r) * lscale  # the shorter inner layers end higher, closer in
            dE = E - C
            rE = float(np.linalg.norm(dE))
            elE = float(np.degrees(np.arcsin(np.clip(dE[1] / rE, -1, 1))))
            azE = float(np.degrees(np.arctan2(dE[0], dE[2])))
            # the way round: as combed (the sweep direction), otherwise the short way
            daz = wrap(azE - az)
            if top and abs(az) < 155 and np.sign(daz) != side and abs(daz) > 20:
                daz = daz + side * 360.0
            rr = float(np.linalg.norm(r - C))
            arc = np.radians(abs(daz)) * rr * 0.6 + abs(rE * np.sin(np.radians(elE)) - rr * np.sin(np.radians(el))) + 0.3
            nseg = int(np.clip(arc / style.get('seg', 0.14), 8, 14))
            t = np.linspace(0, 1, nseg + 1)
            pts = np.zeros((nseg + 1, 3))
            # the top of the head carries its volume off the scalp from the root on
            topk = smoothstep(22.0, 60.0, el) * style.get('top_lift', 0.12)
            # the hair over the forehead is combed up off it before it sweeps sideways and falls (front_rise: degrees
            # it climbs), and its curls only start once it is past the forehead
            front = float(smoothstep(70.0, 25.0, abs(az)) * smoothstep(62.0, 38.0, el))
            rise = style.get('front_rise', 0.0) * front
            for i, ti in enumerate(t):
                ta = 1 - (1 - ti) ** 2.2
                te = ti ** 1.5
                a = az + daz * ta
                e = el + (elE - el) * te + rise * np.sin(np.pi * min(ti / 0.55, 1.0))
                if e < brow_el + 4 and abs(wrap(a)) < clear:
                    a = (np.sign(wrap(a)) if abs(wrap(a)) > 1e-3 else side) * clear
                h = off0 * 0.5 + topk * 0.35 if i == 0 else off0 + topk + lift * ti ** 0.75
                rad = max(rsurf(a, e) + h, rr + (rE - rr) * smoothstep(0.6, 1.0, ti))
                pts[i] = C + rad * dirv(a, e)
            pts[0] = r + (pts[0] - r) * 0.3  # the root sits on the scalp
            # springy curls: a helix around the strand that opens towards the tip (sideways it shows the curl,
            # outwards it makes the silhouette bumpy)
            amp = style.get('curl', 0.09) * cscale * rng.uniform(0.6, 1.3)
            pitch = style.get('pitch', 0.45) * rng.uniform(0.75, 1.25)
            ph = rng.uniform(0, 2 * np.pi)
            arcl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
            base_pts = pts.copy()
            for i in range(1, len(pts)):
                tdir = base_pts[min(i + 1, len(pts) - 1)] - base_pts[i - 1]
                tdir /= np.linalg.norm(tdir) + 1e-9
                outv = base_pts[i] - C
                outv -= tdir * (outv @ tdir)
                outv /= np.linalg.norm(outv) + 1e-9
                bv = np.cross(tdir, outv)
                ramp = smoothstep(0.08 + 0.3 * front, 0.55 + 0.2 * front, t[i])
                w_ = ph + 2 * np.pi * arcl[i] / pitch
                pts[i] = base_pts[i] + (bv * np.sin(w_) + outv * (0.55 + 0.45 * np.cos(w_))) * amp * ramp
            # cards facing outwards, turned a different way each near the crown: lying flat on top of the head they
            # would vanish edge-on from a fight camera at head height, whichever side it looks from
            tilt = rng.normal(0, 1, 3) * np.array([1.0, 0.0, 1.0]); tilt /= np.linalg.norm(tilt) + 1e-9
            tk = 0.75 * smoothstep(15, 65, el)
            nfn = lambda q, tilt=tilt, tk=tk: (lambda o: o / (np.linalg.norm(o) + 1e-9))((q - C) * np.array([1.0, 0.3, 1.0]) + tilt * tk)
            w = style['width'] * rng.uniform(0.8, 1.3)
            if DEBUG is not None: DEBUG.append(dict(az=az, el=el, azE=azE, elE=elE, daz=daz, top=top, pts=pts.copy(), base=base_pts.copy(), rr=rr, rE=rE))
            base = _card(out, base, pts, w, rng.integers(0, NVAR), ao0, nfn, rng.random() < 0.5, taper=0.35)
    # loose curls along the front hairline: short springy strands, most lifting up and sideways into the swept hair, a
    # few falling onto the forehead (a clean edge over a high forehead reads as a receding hairline). edge_curls: how
    # many, edge_fall: the share that falls, edge_drop: degrees below the cards' root line they grow from (the cards
    # hang half their width below their roots, so the hair's visible edge is lower than the root line)
    ne = style.get('edge_curls', 0)
    if ne > 0:
        _, az_v2 = frame.angles(V)
        edge = np.clip(cover * (1 - cover) * 4, 0, 1) * smoothstep(80.0, 50.0, np.abs(az_v2))
        roots, _ = area_sample(V, tris, edge, ne, rng)
        for r in (roots if roots is not None else []):
            el, az = frame.angles(r[None])
            el, az = float(el[0]), float(az[0])
            drop = style.get('edge_drop', 0.0) * rng.uniform(0.6, 1.2)
            if drop:
                el -= drop
                r = C + rsurf(az, el) * dirv(az, el)
            rr = float(np.linalg.norm(r - C))
            side = -1.0 if wrap(az - part) < 0 else 1.0
            fall = rng.random() < style.get('edge_fall', 0.3)
            L = rng.uniform(0.12, 0.24) * (0.6 if fall else 1.0)
            th = np.radians(rng.uniform(-80, -40) if fall else rng.uniform(15, 70))
            span = np.degrees(L / rr)
            d_az = side * span * np.cos(th) / max(np.cos(np.radians(el)), 0.3)
            d_el = span * np.sin(th)
            n_ = 7
            pts = np.zeros((n_, 3))
            for i in range(n_):
                ti = i / (n_ - 1)
                a, e = az + d_az * ti, el + d_el * ti
                pts[i] = C + max(rsurf(a, e) + 0.015 + 0.05 * ti, rr) * dirv(a, e)
            pts[0] = r + (pts[0] - r) * 0.3
            amp = style.get('curl', 0.09) * rng.uniform(0.3, 0.5)
            pitch = rng.uniform(0.1, 0.15)
            ph = rng.uniform(0, 2 * np.pi)
            base_pts = pts.copy()
            arcl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
            for i in range(1, n_):
                tdir = base_pts[min(i + 1, n_ - 1)] - base_pts[i - 1]
                tdir /= np.linalg.norm(tdir) + 1e-9
                outv = base_pts[i] - C
                outv -= tdir * (outv @ tdir)
                outv /= np.linalg.norm(outv) + 1e-9
                w_ = ph + 2 * np.pi * arcl[i] / pitch
                pts[i] = base_pts[i] + (np.cross(tdir, outv) * np.sin(w_) + outv * (0.55 + 0.45 * np.cos(w_))) * amp * smoothstep(0.1, 0.5, i / (n_ - 1))
            nfn = lambda q: (q - C) / (np.linalg.norm(q - C) + 1e-9)
            base = _card(out, base, pts, style['width'] * rng.uniform(0.4, 0.6), rng.integers(0, NVAR), 0.6, nfn, rng.random() < 0.5, taper=0.5)
    op, ouv, oao, ot, oi = out
    return (np.array(op, np.float32), np.array(ouv, np.float32), np.array(oao, np.float32), np.array(ot, np.float32), np.array(oi, np.int64))
