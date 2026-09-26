"""Garments as skinned offset shells of the body mesh + procedural fabric textures in the body UV atlas."""
import numpy as np
import cv2
import raster as R
from headtex import fbm, fbm3, normal_from_height, dilate_fill
from facefit import smoothstep

ATLAS = 2048
ARM_BONES = ('upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02', 'wrist', 'finger', 'metacarpal')
LEG_BONES = ('upperleg01', 'upperleg02', 'lowerleg01', 'lowerleg02', 'foot', 'toe')
NECK_BONES = ('neck01', 'neck02', 'neck03', 'head', 'jaw', 'special', 'oris', 'levator', 'risorius', 'temporalis',
              'oculi', 'orbicularis', 'eye', 'tongue')


def seg_param(p, a, b):
    ab = b - a
    t = ((p - a) @ ab) / (ab @ ab)
    return t, np.linalg.norm(p - (a + np.clip(t, 0, 1)[:, None] * ab), axis=1)


class BodyCtx:
    def __init__(self, V, tris, tuv, VT, W, bones, nbody=13380):
        self.V = V
        self.tris = tris
        self.tuv = tuv
        self.VT = VT
        self.W = W
        self.bn = [b['name'] for b in bones]
        self.J = {b['name']: b for b in bones}
        self.n = nbody
        self.N = R.vertex_normals(V, tris)
        Vb = V[:nbody]
        Wb = W[:nbody]

        def group(prefixes):
            cols = [i for i, n in enumerate(self.bn) if n.split('.')[0].rstrip('0123456789-') in prefixes or n.split('.')[0] in prefixes
                    or any(n.startswith(p) for p in prefixes)]
            return Wb[:, cols].sum(1)
        self.armness = group(ARM_BONES)
        self.legness = group(LEG_BONES)
        self.neckness = group(NECK_BONES)
        self.shoulderness = group(('shoulder01', 'clavicle'))
        # limb parameters
        self.arm = np.full(nbody, -1.0)
        self.leg = np.full(nbody, -1.0)
        for side, sgn in (('L', 1), ('R', -1)):
            sel = np.where(Vb[:, 0] * sgn > 0)[0]
            S = self.J[f'upperarm01.{side}']['head']; E = self.J[f'lowerarm01.{side}']['head']; Wr = self.J[f'wrist.{side}']['head']
            t1, d1 = seg_param(Vb[sel], S, E)
            t2, d2 = seg_param(Vb[sel], E, Wr)
            self.arm[sel] = np.where(d1 < d2, t1, 1 + t2)
            Hh = self.J[f'upperleg01.{side}']['head']; K = self.J[f'lowerleg01.{side}']['head']; A = self.J[f'foot.{side}']['head']
            t1, d1 = seg_param(Vb[sel], Hh, K)
            t2, d2 = seg_param(Vb[sel], K, A)
            self.leg[sel] = np.where(d1 < d2, t1, 1 + t2)
        self.y = Vb[:, 1]
        # useful heights
        self.y_hip = (self.J['upperleg01.L']['head'][1])
        self.y_root = self.J['root']['head'][1]
        self.y_navel = self.J['spine04']['head'][1] - 0.1
        self.y_chest = self.J['spine02']['head'][1]
        self.y_neck = self.J['neck01']['head'][1]
        self.y_armpit = (self.J['upperarm01.L']['head'][1] + self.J['spine02']['head'][1]) / 2
        self._atlas = None

    # ---------------------------------------------------------------- atlas texel geometry
    def atlas(self, face_sel=None, xform=None, size=ATLAS):
        key = (None if face_sel is None else int(face_sel.sum()), xform, size)
        if not hasattr(self, '_atlas_cache'):
            self._atlas_cache = {}
        if key in self._atlas_cache:
            return self._atlas_cache[key]
        tris = self.tris if face_sel is None else self.tris[face_sel]
        tuv = self.tuv if face_sel is None else self.tuv[face_sel]
        VT = self.VT
        if xform is not None:
            ox, oy, sc = xform
            VT = np.stack([(VT[:, 0] - ox) * sc, (VT[:, 1] - oy) * sc], 1)
        uvp = np.stack([VT[:, 0] * size, (1 - VT[:, 1]) * size], 1)
        ids = R.raster_ids(uvp, np.zeros(len(uvp)), tuv, size, size)
        ys, xs, k, bc = R.barycentric(ids, uvp, tuv)
        tv = tris[k]
        pos = np.zeros((size, size, 3), np.float32)
        pos[ys, xs] = (self.V[tv] * bc[:, :, None]).sum(1)
        nrm = np.zeros((size, size, 3), np.float32)
        n = (self.N[tv] * bc[:, :, None]).sum(1)
        nrm[ys, xs] = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)
        valid = np.zeros((size, size), bool)
        valid[ys, xs] = True

        def interp(vals):
            m = np.zeros((size, size), np.float32)
            m[ys, xs] = (vals[tv] * bc).sum(1)
            return m
        full = lambda a: np.concatenate([a, np.zeros(len(self.V) - len(a))])
        A = dict(pos=pos, nrm=nrm, valid=valid, arm=interp(full(self.arm)), leg=interp(full(self.leg)),
                 armness=interp(full(self.armness)), legness=interp(full(self.legness)),
                 neckness=interp(full(self.neckness)), tri=(ys, xs, k, bc), tris=tris, size=size)
        self._atlas_cache[key] = A
        return A


# -------------------------------------------------------------------- coverage rules
def close_mask(ctx, c, iters=4, frac=0.55, region=None):
    """Morphological closing on the mesh: fill slits / notches (vertices mostly surrounded by covered faces)."""
    tris, n = ctx.tris, ctx.n
    c = c.copy()
    for _ in range(iters):
        cf = np.zeros(len(ctx.V)); cf[:n] = c
        fv = cf[tris].mean(1)
        s_ = np.zeros(len(ctx.V)); cnt = np.zeros(len(ctx.V))
        np.add.at(s_, tris.ravel(), np.repeat(fv, 3)); np.add.at(cnt, tris.ravel(), 1)
        add = (~c) & (s_[:n] / np.maximum(cnt[:n], 1) >= frac)
        if region is not None:
            add &= region
        if not add.any():
            break
        c |= add
    return c


def smooth_field(ctx, f, iters=12):
    """Laplacian smoothing of a per-vertex field over the body mesh."""
    tris, n = ctx.tris, ctx.n
    g = np.zeros(len(ctx.V)); g[:n] = f
    cnt = np.zeros(len(ctx.V)); np.add.at(cnt, tris.ravel(), 1)
    for _ in range(iters):
        fv = g[tris].mean(1)
        acc = np.zeros(len(ctx.V)); np.add.at(acc, tris.ravel(), np.repeat(fv, 3))
        g = 0.5 * g + 0.5 * acc / np.maximum(cnt, 1)
    return g[:n]


def cover_top(ctx, sleeve=0.45, hem=None, neck=0.42, armhole=None, collar_drop=0.0):
    """Upper garment coverage per body vertex."""
    hem = ctx.y_hip + 0.15 if hem is None else hem
    torso = (ctx.armness < 0.5) & (ctx.legness < 0.5)
    # the raw neck weights have a V down the sternum; a smoothed field gives a round crew neckline
    neckf = smooth_field(ctx, ctx.neckness, 14)
    c = torso & (ctx.y >= hem) & (neckf < neck)
    c |= (ctx.armness >= 0.5) & (ctx.arm <= sleeve)
    c |= (ctx.legness >= 0.5) & (ctx.y >= hem) & (ctx.leg < 0.2)
    if armhole is not None:  # tank top: remove shoulder cap / armpit area
        c &= ~((ctx.armness + ctx.shoulderness * 0.9) > armhole) | (ctx.y < ctx.y_armpit - 0.9)
        c &= ~(ctx.armness >= 0.35)
    if collar_drop > 0:  # scoop neck at the front
        V = ctx.V[:ctx.n]
        front = V[:, 2] > 0.3
        c &= ~(front & (ctx.y > ctx.y_neck - collar_drop) & (np.abs(V[:, 0]) < 1.1))
    # the neck weight field leaves a thin V slit down the sternum and small gaps at the shoulders: close them
    c = close_mask(ctx, c, iters=4, frac=0.55, region=(ctx.y > ctx.y_neck - 1.4) & (ctx.armness < 0.6))
    return c


def cover_bottom(ctx, length=0.45, waist=None):
    waist = ctx.y_navel - 0.25 if waist is None else waist
    torso = (ctx.armness < 0.5)
    c = torso & (ctx.y <= waist) & (ctx.legness < 0.5)
    c |= (ctx.legness >= 0.5) & (ctx.leg <= length) & (ctx.y <= waist)
    return c


def cover_socks(ctx, top=1.55, bottom=2.04):
    # the sock continues a little into the shoe; see socks_offset: it is skin tight there so it cannot poke through
    return (ctx.legness >= 0.5) & (ctx.leg >= top) & (ctx.leg <= bottom)


def socks_offset(ctx, off=0.016):
    """Knit thickness on the shin, fading to skin tight before the shoe upper so the sock never pokes through it."""
    return off * np.clip((1.8 - ctx.leg) / 0.1, 0.0, 1.0) + 0.002


# -------------------------------------------------------------------- shell construction
def boundary_edges(faces):
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    key = np.sort(e, 1)
    uk, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    b = cnt[inv.ravel()] == 1
    return e[b]  # oriented edges


def snap_boundary(ctx, V, bverts, snap):
    """Move garment boundary vertices onto the nearest exact cut line (straight hems)."""
    V = V.copy()
    for v in bverts:
        if v >= ctx.n:
            continue
        p = V[v]
        side = 'L' if p[0] > 0 else 'R'
        cands = []
        if snap.get('leg') is not None and ctx.legness[v] >= 0.3:
            t = snap['leg']
            a, b = (ctx.J[f'upperleg01.{side}']['head'], ctx.J[f'lowerleg01.{side}']['head']) if t <= 1 else \
                   (ctx.J[f'lowerleg01.{side}']['head'], ctx.J[f'foot.{side}']['head'])
            cur = ctx.leg[v] if t <= 1 else ctx.leg[v] - 1
            tt = t if t <= 1 else t - 1
            cands.append(((b - a) * (tt - cur), 0.7))
        if snap.get('arm') is not None and ctx.armness[v] >= 0.3:
            t = snap['arm']
            a, b = (ctx.J[f'upperarm01.{side}']['head'], ctx.J[f'lowerarm01.{side}']['head']) if t <= 1 else \
                   (ctx.J[f'lowerarm01.{side}']['head'], ctx.J[f'wrist.{side}']['head'])
            cur = ctx.arm[v] if t <= 1 else ctx.arm[v] - 1
            tt = t if t <= 1 else t - 1
            cands.append(((b - a) * (tt - cur), 0.7))
        for key in ('y_low', 'y_high'):
            if snap.get(key) is not None and ctx.neckness[v] < 0.2:
                cands.append((np.array([0.0, snap[key] - p[1], 0.0]), 0.35))
        if not cands:
            continue
        best, lim = min(cands, key=lambda d: np.linalg.norm(d[0]))
        if np.linalg.norm(best) < lim:
            V[v] = p + best
    return V


def taubin(P, faces, pin, iters=10, lam=0.5, mu=-0.53):
    """Volume-preserving smoothing of the vertices used by `faces` (pinned vertices stay)."""
    from scipy.sparse import coo_matrix
    n = len(P)
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    e = np.unique(np.concatenate([e, e[:, ::-1]]), axis=0)
    A = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    deg = np.asarray(A.sum(1)).ravel()
    active = (deg > 0) & ~pin
    Q = P.copy()
    for _ in range(iters):
        for f in (lam, mu):
            avg = (A @ Q) / np.maximum(deg, 1)[:, None]
            Q[active] += f * (avg[active] - Q[active])
    return Q


def make_shell(ctx, covered, offset, hem_depth=0.7, name='shell', smooth_iters=2, snap=None, relax=0):
    """covered: bool per body vertex; offset: scalar or per-vertex array (dm).
    Returns dict with verts (dm), normals, uv idx, tris, and the body vertex each shell vertex came from."""
    tris, tuv = ctx.tris, ctx.tuv
    cov = np.zeros(len(ctx.V), bool)
    cov[:ctx.n] = covered
    fsel = cov[tris].all(1)
    ft = tris[fsel]
    fu = tuv[fsel]
    off = np.broadcast_to(np.asarray(offset, float), (len(ctx.V),)) if np.ndim(offset) == 0 else np.concatenate([offset, np.zeros(len(ctx.V) - len(offset))])
    # smooth normals for the shell (avoid creases)
    Nn = ctx.N.copy()
    Vsrc = ctx.V
    be0 = boundary_edges(ft)
    if snap and len(be0):
        Vsrc = snap_boundary(ctx, ctx.V, np.unique(be0), snap)
    if len(be0):
        # smooth neckline: fit y(theta) with a low-order Fourier series and project the collar vertices on it
        bv = np.unique(be0)
        bv = bv[bv < ctx.n]
        neck = bv[(ctx.V[bv, 1] > ctx.y_neck - 0.9) & (ctx.armness[bv] < 0.65)]  # include the shoulder tops (no notches)
        neck_loop_set = neck
        if len(neck) > 8:
            if not snap or Vsrc is ctx.V:
                Vsrc = ctx.V.copy()
            c = ctx.J['neck01']['head']
            th = np.arctan2(Vsrc[neck, 0] - c[0], Vsrc[neck, 2] - c[2])
            Aq = np.stack([np.ones_like(th), np.cos(th), np.sin(th), np.cos(2 * th), np.sin(2 * th)], 1)
            coef, *_ = np.linalg.lstsq(Aq, Vsrc[neck, 1], rcond=None)
            yfit = Aq @ coef
            Vsrc[neck, 1] = yfit
            # radial smoothing too (keeps the collar round)
            r = np.hypot(Vsrc[neck, 0] - c[0], Vsrc[neck, 2] - c[2])
            cr, *_ = np.linalg.lstsq(Aq, r, rcond=None)
            rf = Aq @ cr
            k = rf / np.maximum(r, 1e-6)
            Vsrc[neck, 0] = c[0] + (Vsrc[neck, 0] - c[0]) * k
            Vsrc[neck, 2] = c[2] + (Vsrc[neck, 2] - c[2]) * k
    P = Vsrc + Nn * off[:, None]
    if relax > 0 and len(be0):
        # fabric bridges over muscle detail (no shrink-wrapped pecs / abs), edges stay on their cut lines,
        # and the cloth never ends up closer to the skin than 60% of its offset
        pin = np.zeros(len(P), bool); pin[np.unique(be0)] = True
        Q = taubin(P, ft, pin, iters=relax)
        d = ((Q - Vsrc) * Nn).sum(1)
        lo = off * 0.9
        Q = Q + Nn * np.maximum(0.0, lo - d)[:, None]
        P = Q
    # ordered neckline loop (for collars)
    neck_loop = []
    if len(be0):
        bvset = set(np.unique(be0).tolist())
        ns = set([int(v) for v in np.unique(be0) if v < ctx.n and ctx.V[v, 1] > ctx.y_neck - 0.9 and ctx.armness[v] < 0.3])
        adj = {}
        for a_, b_ in be0:
            a_, b_ = int(a_), int(b_)
            if a_ in ns and b_ in ns:
                adj.setdefault(a_, []).append(b_); adj.setdefault(b_, []).append(a_)
        if adj:
            start = next(iter(adj)); prev = None; cur = start
            for _ in range(len(adj) + 2):
                neck_loop.append(cur)
                nxt = [x for x in adj[cur] if x != prev]
                if not nxt: break
                prev, cur = cur, nxt[0]
                if cur == start: break
    # shade the garment with its own (relaxed) surface: the body's normals print the muscles (pecs, abs) onto loose
    # fabric. Area-weighted face normals over the garment faces, oriented like the body normals (outwards)
    Ng = np.zeros_like(P)
    fnrm = np.cross(P[ft[:, 1]] - P[ft[:, 0]], P[ft[:, 2]] - P[ft[:, 0]])
    for k_ in range(3):
        np.add.at(Ng, ft[:, k_], fnrm)
    ln_ = np.linalg.norm(Ng, axis=1, keepdims=True)
    Ng = np.where(ln_ > 1e-12, Ng / np.maximum(ln_, 1e-12), Nn)
    Ng[(Ng * Nn).sum(1) < 0] *= -1
    # outer surface: split by (v, uv)
    key = ft.astype(np.int64) * 100000 + fu
    uk, inv = np.unique(key.ravel(), return_inverse=True)
    vi, ui = uk // 100000, uk % 100000
    out_tris = inv.reshape(ft.shape)
    pos = P[vi]
    nrm = Ng[vi]
    uv0 = ctx.VT[ui]
    lo = uv0.min(0) - 0.004
    span = (uv0.max(0) + 0.004 - lo).max()
    xform = (float(lo[0]), float(lo[1]), float(1.0 / span))
    uv = (uv0 - lo) / span
    src = vi.copy()
    # hem: extrude boundary inward (towards the skin)
    be = boundary_edges(ft)
    if len(be) and hem_depth > 0:
        # map body vertex -> one outer vertex index (for position/uv)
        first = {}
        for i, v in enumerate(vi):
            first.setdefault(v, i)
        bverts = np.unique(be)
        start = len(pos)
        inner_idx = {v: start + k for k, v in enumerate(bverts)}
        # inner rim stays just outside the skin (a buried hem shows the skin through the edge)
        ipos = Vsrc[bverts] + Nn[bverts] * np.maximum(off[bverts] * (1 - hem_depth), 0.005)[:, None]
        # the rim is the fabric's cut edge: shade it as a surface facing off the garment (a rounded hem), not as
        # the underside facing the skin, which renders as a black line where a neckline stands off the neck
        tout = np.zeros((len(ctx.V), 3))
        for a, b in be:
            c = np.cross(P[b] - P[a], Ng[a] + Ng[b])
            tout[a] += c; tout[b] += c
        inrm = tout[bverts]
        inrm /= np.linalg.norm(inrm, axis=1, keepdims=True) + 1e-9
        inrm = inrm - 0.25 * Ng[bverts]
        inrm /= np.linalg.norm(inrm, axis=1, keepdims=True) + 1e-9
        iuv = np.array([uv[first[v]] for v in bverts])
        pos = np.concatenate([pos, ipos])
        nrm = np.concatenate([nrm, inrm])
        uv = np.concatenate([uv, iuv])
        src = np.concatenate([src, bverts])
        rim = []
        for a, b in be:
            oa, ob = first[a], first[b]
            ia, ib = inner_idx[a], inner_idx[b]
            # boundary edge (a->b) is oriented as in its face; rim faces must face outward
            rim.append([ob, oa, ia]); rim.append([ob, ia, ib])
        out_tris = np.concatenate([out_tris, np.array(rim)])
    # body faces to hide: faces entirely inside the garment, 2 rings away from its boundary
    inside = cov.copy()
    bset = np.zeros(len(ctx.V), bool)
    if len(be):
        bset[np.unique(be)] = True
    for _ in range(1):
        grow = bset[tris].any(1)
        bset[tris[grow].ravel()] = True
    hide_faces = np.where((inside & ~bset)[tris].all(1))[0]
    # distance (along the surface) from the garment boundary, for hems/stitching
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra
    e = np.concatenate([ft[:, [0, 1]], ft[:, [1, 2]], ft[:, [2, 0]]])
    w = np.linalg.norm(ctx.V[e[:, 0]] - ctx.V[e[:, 1]], axis=1)
    G = coo_matrix((w, (e[:, 0], e[:, 1])), shape=(len(ctx.V), len(ctx.V))).tocsr()
    hemdist = np.full(len(ctx.V), 10.0)
    if len(be):
        d = dijkstra(G, directed=False, indices=np.unique(be), limit=1.0, min_only=True)
        hemdist = np.minimum(hemdist, np.where(np.isfinite(d), d, 10.0))
    return dict(pos=pos, nrm=nrm, uv=uv, tris=out_tris, src=src, hide=hide_faces, name=name, xform=xform, fsel=fsel, hemdist=hemdist,
                neck_loop=neck_loop, P=P)


# -------------------------------------------------------------------- fabric textures
def fabric_maps(ctx, covered, color, seed=0, knit=1.0, fold=1.0, rough=0.8, hem_color=None, decals=(), extra=None,
                shell=None, pique=0.0, rib_cuffs=0.0):
    """Colour / normal / roughness maps for a garment (in its own rescaled UV space)."""
    A = ctx.atlas(shell['fsel'], shell['xform']) if shell is not None else ctx.atlas()
    valid = A['valid']
    # coverage in texel space: interpolate covered flags
    ys, xs, k, bc = A['tri']
    cov = np.zeros(len(ctx.V)); cov[:ctx.n] = covered
    cm = np.zeros((ATLAS, ATLAS), np.float32)
    cm[ys, xs] = (cov[A['tris'][k]] * bc).sum(1)
    col = np.zeros((ATLAS, ATLAS, 3), np.float32)
    col[:] = np.array(color, np.float32)[::-1] * 255  # RGB->BGR
    n1 = fbm((ATLAS, ATLAS), (128, 32, 8), seed)
    col *= (1 + n1[..., None] * 0.04)
    height = np.zeros((ATLAS, ATLAS), np.float32)
    yy, xx = np.mgrid[0:ATLAS, 0:ATLAS].astype(np.float32)
    # cloth folds from anisotropic 3D noise: vertical drapes + compression folds around joints
    if fold > 0:
        pos = A['pos']
        vm = valid & (cm > 0.01)
        p = pos[vm].astype(np.float64)
        drape = fbm3(p * np.array([2.2, 0.45, 2.2]), 3, seed)
        horiz = fbm3(p * np.array([0.9, 2.6, 0.9]), 3, seed + 11)
        joint = np.zeros(len(p))
        for jn in ('lowerarm01.L', 'lowerarm01.R', 'upperarm01.L', 'upperarm01.R', 'upperleg01.L', 'upperleg01.R',
                   'lowerleg01.L', 'lowerleg01.R', 'spine04', 'spine05'):
            j = ctx.J[jn]['head']
            d = np.linalg.norm(p - j, axis=1)
            joint = np.maximum(joint, smoothstep(1.3, 0.15, d))
        hgt = drape * 0.8 + horiz * (0.25 + joint * 1.1)
        # sharpen the ridges a little (cloth folds are rounded ridges with soft valleys)
        hgt = np.sign(hgt) * np.abs(hgt) ** 0.8
        height[vm] += fold * hgt.astype(np.float32) * 2.2
    # hems: darker stitched band near garment boundary
    hd = shell['hemdist'] if shell is not None else np.full(len(ctx.V), 10.0)
    edge = np.full((A['size'], A['size']), 10.0, np.float32)
    edge[ys, xs] = (hd[A['tris'][k]] * bc).sum(1)
    # graph distances along mesh edges give jagged iso-lines: smooth the field (normalised by coverage)
    vm_ = valid.astype(np.float32)
    edge = cv2.GaussianBlur(np.minimum(edge, 1.0) * vm_, (0, 0), 6) / np.maximum(cv2.GaussianBlur(vm_, (0, 0), 6), 1e-4)
    edge = np.where(valid, edge, 10.0)
    hem = smoothstep(0.26, 0.18, edge) * valid
    stitch = smoothstep(0.018, 0.0, np.abs(edge - 0.2)) * (0.5 + 0.5 * np.sign(np.sin(xx * 1.1 + yy * 1.1))) * valid
    col *= (1 - hem[..., None] * 0.08 - stitch[..., None] * 0.06)
    height += hem * 0.6 - stitch * 0.15
    if pique > 0:
        # pique knit: small honeycomb-like cells
        cell = (np.sin(xx * 2.1) * np.sin(yy * 2.1 + np.sin(xx * 1.05) * 1.3))
        height += pique * 0.35 * cell * valid
        col *= (1 + pique * 0.035 * cell[..., None])
    if rib_cuffs > 0 and shell is not None:
        pos = A['pos']
        for side in ('L', 'R'):
            a = ctx.J[f'upperarm01.{side}']['head']; b = ctx.J[f'lowerarm01.{side}']['head']
            ax = (b - a) / np.linalg.norm(b - a)
            e1 = np.cross(ax, [0, 0, 1.0]); e1 /= np.linalg.norm(e1); e2 = np.cross(ax, e1)
            d = pos - a
            ang = np.arctan2(d @ e2, d @ e1)
            armside = (A['armness'] > 0.45) & ((pos[..., 0] > 0) == (side == 'L'))
            band = (edge < 0.2) & armside & valid
            rib = np.sin(ang * 70)
            height[band] += rib_cuffs * 0.8 * rib[band]
            col[band] *= (1 + 0.04 * rib[band])[:, None]
    for d in decals:
        d.apply(ctx, col, height, A)
    if extra is not None:
        extra(ctx, col, height, A)
    col = dilate_fill(np.clip(col, 0, 255), valid, 8)
    height = cv2.GaussianBlur(height, (0, 0), 2.0)
    height = dilate_fill(height, valid, 8)
    nmap = normal_from_height(height, strength=1.15)
    nmap = cv2.resize(nmap, (1024, 1024), interpolation=cv2.INTER_AREA)
    rmap = np.clip((rough + n1 * 0.05) * 255, 0, 255).astype(np.uint8)
    rmap = cv2.resize(rmap, (1024, 1024), interpolation=cv2.INTER_AREA)
    return col.astype(np.uint8), nmap, rmap


class Decal:
    """Planar projected image (BGRA) onto the garment: centre (dm), right/up axes (dm), facing normal."""

    def __init__(self, img, center, right, up, facing, opacity=1.0, bump=0.0, min_facing=0.25):
        self.img = img
        self.c = np.array(center, np.float32)
        self.r = np.array(right, np.float32)
        self.u = np.array(up, np.float32)
        self.f = np.array(facing, np.float32)
        self.op = opacity
        self.bump = bump
        self.minf = min_facing

    def apply(self, ctx, col, height, A):
        pos, nrm, valid = A['pos'], A['nrm'], A['valid']
        d = pos - self.c
        x = (d @ self.r) / (self.r @ self.r)
        y = (d @ self.u) / (self.u @ self.u)
        face = nrm @ self.f
        m = valid & (np.abs(x) <= 1) & (np.abs(y) <= 1) & (face > self.minf)
        if not m.any():
            return
        h, w = self.img.shape[:2]
        px = ((x[m] + 1) / 2 * (w - 1)).astype(np.float32)
        py = ((1 - (y[m] + 1) / 2) * (h - 1)).astype(np.float32)
        s = R.sample(self.img, np.stack([px, py], 1)).astype(np.float32)
        a = (s[:, 3:4] / 255.0) * self.op * smoothstep(self.minf, self.minf + 0.2, face[m])[:, None]
        col[m] = col[m] * (1 - a) + s[:, :3] * a
        if self.bump:
            height[m] += a[:, 0] * self.bump


def smooth_shell_weights(shell, W, bone_names, iters=12, pelvis_bias=None, ctx=None):
    """Laplacian-smooth the skin weights of a garment shell (removes LBS pinching)."""
    from scipy.sparse import coo_matrix, diags
    src = shell['src']
    Ws = W[src].astype(np.float64)
    # vertices sharing a body vertex (uv seams, hem) must stay identical -> smooth on body-vertex graph
    uniq, inv = np.unique(src, return_inverse=True)
    t = inv[shell['tris']]
    n = len(uniq)
    e = np.concatenate([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]])
    A = coo_matrix((np.ones(len(e) * 2), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))), shape=(n, n)).tocsr()
    A.data[:] = 1
    deg = np.asarray(A.sum(1)).ravel()
    Dinv = diags(1 / np.maximum(deg, 1))
    Wu = np.zeros((n, W.shape[1]))
    np.add.at(Wu, inv, Ws)
    cnt = np.bincount(inv, minlength=n)[:, None]
    Wu /= np.maximum(cnt, 1)
    # keep the hem rows closer to the body (they sit on the skin)
    for _ in range(iters):
        Wu = 0.5 * Wu + 0.5 * (Dinv @ (A @ Wu))
    if pelvis_bias is not None and ctx is not None:
        yb, amt, bones = pelvis_bias
        idx = [bone_names.index(b) for b in bones]
        y = ctx.V[uniq, 1]
        wgt = np.clip((y - (yb - 0.6)) / 0.6, 0, 1) * amt  # near the waistband
        tgt = np.zeros(W.shape[1]); tgt[idx] = 1 / len(idx)
        Wu = Wu * (1 - wgt[:, None]) + tgt[None, :] * wgt[:, None]
    Wu /= np.maximum(Wu.sum(1, keepdims=True), 1e-9)
    return Wu[inv].astype(np.float32)


def follow_top_layer(ctx, shell, Wg, top_W, top_cov, band=0.4):
    """Skin weights of a lower garment (shorts, trousers) where a top covers it. Under the top it takes the top's
    weights, so both layers bend together and the waistband can't poke through the top in high kicks or deep
    crouches; below the top's hem it blends back to its own weights over `band` dm."""
    from scipy.spatial import cKDTree
    src = shell['src']
    under = top_cov[src]
    W = Wg.astype(np.float64).copy()
    W[under] = top_W[src[under]]
    idx = np.flatnonzero(top_cov)
    rest = np.flatnonzero(~under)
    if len(idx) and len(rest):
        d, j = cKDTree(ctx.V[idx]).query(ctx.V[src[rest]])
        near = idx[j]
        below = ctx.V[near, 1] - ctx.V[src[rest], 1]  # how far under the top's hem
        f = np.clip(1 - below / band, 0, 1) * (d < band * 1.5)
        f = f * f * (3 - 2 * f)
        W[rest] = W[rest] * (1 - f[:, None]) + top_W[near] * f[:, None]
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    return W.astype(np.float32)


def make_collar(ctx, shell, W, stand=0.3, leaf=0.42, gap=0.16, tip=0.3, npts=72, out_push=0.02):
    """Fold-over polo collar built on a smoothed, resampled neckline loop."""
    loop = shell['neck_loop']
    if len(loop) < 6:
        return None
    P = shell['P']
    c = ctx.J['neck01']['head'].copy()
    up = ctx.J['neck03']['head'] - ctx.J['neck01']['head']; up /= np.linalg.norm(up)
    # angle-sorted loop -> periodic smooth radius / height as functions of the angle
    pts = np.array([P[v] for v in loop])
    th = np.arctan2(pts[:, 0] - c[0], pts[:, 2] - c[2])
    o = np.argsort(th); th = th[o]; pts = pts[o]; vids = np.array(loop)[o]
    r = np.hypot(pts[:, 0] - c[0], pts[:, 2] - c[2])
    Aq = lambda t: np.stack([np.ones_like(t), np.cos(t), np.sin(t), np.cos(2 * t), np.sin(2 * t), np.cos(3 * t), np.sin(3 * t)], 1)
    cr, *_ = np.linalg.lstsq(Aq(th), r, rcond=None)
    cy, *_ = np.linalg.lstsq(Aq(th), pts[:, 1], rcond=None)
    # sample from +gap around the back to -gap (front opening at theta = 0)
    ts = np.linspace(gap, 2 * np.pi - gap, npts)
    tw = np.arctan2(np.sin(ts), np.cos(ts))
    rr = Aq(tw) @ cr + out_push
    yy = Aq(tw) @ cy
    from scipy.spatial import cKDTree
    tree = cKDTree(pts)
    # the leaf must stay outside the (relaxed) shirt it rests on: lift points along the shirt normal to a small gap
    spos, snrm = shell['pos'], shell['nrm']
    stree = cKDTree(spos)

    def clear_of_shirt(p, gap=0.02):
        _, k = stree.query(p)
        h = float((p - spos[k]) @ snrm[k])
        return p + snrm[k] * max(0.0, gap - h)
    verts, uvs, srcv = [], [], []
    for i, t in enumerate(tw):
        out = np.array([np.sin(t), 0.0, np.cos(t)])
        B = np.array([c[0] + np.sin(t) * rr[i], yy[i], c[2] + np.cos(t) * rr[i]])
        front = np.cos(t) * 0.5 + 0.5  # 1 at the front, 0 at the back
        hs = stand * (1 - 0.3 * front)
        S = B + up * hs + out * 0.008
        lw = leaf * (1 + 0.25 * front)
        # the leaf folds over the stand and rests on the garment, slightly away from it
        M1 = S + out * lw * 0.18 + up * 0.02
        F = S + out * lw * 0.55 - up * lw * 0.82
        ends = max(0.0, 1 - min(i, npts - 1 - i) / 5.0)
        F = F + (np.array([0, -0.7, 0.25]) * tip + out * -0.05) * ends ** 1.5
        M1 = clear_of_shirt(M1, 0.015); F = clear_of_shirt(F, 0.02)
        d, k = tree.query(B)
        for p, v in ((B, 0.0), (S, 0.3), (M1, 0.42), (F, 1.0)):
            verts.append(p); uvs.append([i / (npts - 1), v]); srcv.append(vids[k])
    cols = 4
    idx = []
    for i in range(npts - 1):
        for kk in range(cols - 1):
            a_ = i * cols + kk; b_ = (i + 1) * cols + kk
            idx += [[a_, b_, b_ + 1], [a_, b_ + 1, a_ + 1]]
    verts = np.array(verts); idx = np.array(idx)
    body = np.arange(ctx.n)
    btree = cKDTree(ctx.V[body])
    Wc = []
    for p, sv, uv in zip(verts, srcv, uvs):
        d, k = btree.query(p)
        t = uv[1]
        Wc.append(W[sv] * (1 - t * 0.6) + W[body[k]] * t * 0.6)
    nrm = R.vertex_normals(verts, idx)
    return dict(pos=verts, uv=np.array(uvs, np.float32), tris=idx, W=np.array(Wc), nrm=nrm)


def surface_point(ctx, x, y, zsign=1.0):
    """Closest body vertex to a front/back point at height y and lateral x; returns (vertex, position, normal)."""
    Vb = ctx.V[:ctx.n]
    cand = np.where((np.abs(Vb[:, 1] - y) < 0.12) & (np.sign(Vb[:, 2]) == np.sign(zsign)) & (ctx.armness < 0.3))[0]
    k = cand[np.argmin(np.abs(Vb[cand, 0] - x) + np.abs(Vb[cand, 1] - y))]
    return k, Vb[k], ctx.N[k]


# ---------------------------------------------------------------- gear built on the body surface
class SurfaceSnap:
    """Snap guide points to the body surface (nearest vertex) and return position/normal/weights."""

    def __init__(self, ctx):
        from scipy.spatial import cKDTree
        self.ctx = ctx
        self.idx = np.arange(ctx.n)
        self.tree = cKDTree(ctx.V[:ctx.n])

    def snap(self, p, off, k=6):
        d, ii = self.tree.query(p, k=k)
        w = 1 / (d + 1e-4); w /= w.sum()
        vs = self.idx[ii]
        pos = (self.ctx.V[vs] * w[:, None]).sum(0)
        n = (self.ctx.N[vs] * w[:, None]).sum(0); n /= np.linalg.norm(n) + 1e-9
        return pos + n * off, n, vs, w


def catmull(points, n):
    P = np.array(points, float)
    P = np.vstack([P[0], P, P[-1]])
    out = []
    segs = len(P) - 3
    for i in range(n):
        t = i / (n - 1) * segs
        k = min(int(t), segs - 1)
        u = t - k
        p0, p1, p2, p3 = P[k], P[k + 1], P[k + 2], P[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    return np.array(out)


def strap(ctx, snapper, W, guide, width, off, n=40, thick=0.03):
    """Ribbon strap following guide points over the body. Returns verts, uv, tris, weights."""
    pts = catmull(guide, n)
    rows = []
    for i, g in enumerate(pts):
        p, nrm, vs, w = snapper.snap(g, off)
        rows.append((p, nrm, (W[vs] * w[:, None]).sum(0)))
    verts, uvs, wts, tris = [], [], [], []
    for i, (p, nrm, ww) in enumerate(rows):
        nxt = rows[min(i + 1, n - 1)][0]; prv = rows[max(i - 1, 0)][0]
        t = nxt - prv; t /= np.linalg.norm(t) + 1e-9
        side = np.cross(t, nrm); side /= np.linalg.norm(side) + 1e-9
        for s_, (a, h) in enumerate(((-0.5, 0), (0.5, 0), (0.5, thick), (-0.5, thick))):
            verts.append(p + side * width * a + nrm * h)
            uvs.append([s_ / 3.0, i / (n - 1)])
            wts.append(ww)
    k = 4
    for i in range(n - 1):
        for s_ in range(4):
            a_ = i * k + s_; b_ = i * k + (s_ + 1) % 4
            c_ = (i + 1) * k + (s_ + 1) % 4; d_ = (i + 1) * k + s_
            tris += [[a_, b_, c_], [a_, c_, d_]]
    return np.array(verts), np.array(uvs, np.float32), np.array(tris), np.array(wts)


def patch(ctx, snapper, W, outline, off, res=24, zsign=-1.0, puff=0.0):
    """Surface patch inside a closed outline (list of (x, y) in dm) on the front (+1) or back (-1) of the body."""
    ol = np.array(outline, float)
    xmin, ymin = ol.min(0); xmax, ymax = ol.max(0)

    def inside_poly(x, y):
        c = False
        n = len(ol)
        for i in range(n):
            x1, y1 = ol[i]; x2, y2 = ol[(i + 1) % n]
            if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1):
                c = not c
        return c
    gx = np.linspace(xmin, xmax, res); gy = np.linspace(ymin, ymax, res)
    Vb = ctx.V[:ctx.n]
    side_sel = np.where(np.sign(Vb[:, 2]) == np.sign(zsign))[0]
    from scipy.spatial import cKDTree
    t2 = cKDTree(Vb[side_sel][:, :2])
    grid = -np.ones((res, res), int)
    verts, uvs, wts = [], [], []
    for j, y in enumerate(gy):
        for i, x in enumerate(gx):
            if not inside_poly(x, y):
                continue
            d, k = t2.query([x, y], k=4)
            vs = side_sel[k]
            w = 1 / (d + 1e-4); w /= w.sum()
            z = (Vb[vs, 2] * w).sum()
            nrm = (ctx.N[vs] * w[:, None]).sum(0); nrm /= np.linalg.norm(nrm) + 1e-9
            # puffed centre (padding)
            u, v = (x - xmin) / (xmax - xmin + 1e-9), (y - ymin) / (ymax - ymin + 1e-9)
            bulge = puff * np.sin(np.pi * u) * np.sin(np.pi * v)
            p = np.array([x, y, z]) + nrm * (off + bulge)
            grid[j, i] = len(verts)
            verts.append(p); uvs.append([u, v]); wts.append((W[vs] * w[:, None]).sum(0))
    tris = []
    for j in range(res - 1):
        for i in range(res - 1):
            a, b, c, d = grid[j, i], grid[j, i + 1], grid[j + 1, i + 1], grid[j + 1, i]
            if min(a, b, c, d) < 0:
                continue
            if zsign > 0: tris += [[a, b, c], [a, c, d]]
            else: tris += [[a, c, b], [a, d, c]]
    return np.array(verts), np.array(uvs, np.float32), np.array(tris), np.array(wts)
