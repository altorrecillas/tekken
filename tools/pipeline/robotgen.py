"""Orión, the android: a fighter who is not one of the user's friends but a machine (an original design, no film's).

Built from the MakeHuman base like the others (the same skeleton, joints and skin weights, so every system of the game
works on him: the rig, the hits, the finishing moves that cut, burst or soak a body), but not a man: a dark synthetic
undersuit (a woven hexagonal fibre over artificial muscle) under segmented silver plates (each its own shell off the
body with a thick edge, its panel seams and rivets laid out in 3D so they run on across the texture's islands), a chrome
faceplate for a head (dark eye sockets, red eyes that glow, a grille for a mouth, vents on the cheeks, an audio module
for each ear) under a skull cap, and "RyC" stamped in relief on the chest plate.

usage: python3 robotgen.py [--debug]   (writes assets/chars/orion; GAME_DIR overrides; needs the MakeHuman data next to
       the pipeline, as buildchar.py does)"""
import os, sys
import numpy as np
import cv2
import mhlib as M
import raster as R
from common import body_tris, uv_islands, obj_tris, OUT
from facefit import head_uv, HTW, HTH, HEAD_U0, HEAD_V0, HEAD_V1
from headtex import dilate_fill, normal_from_height
from buildchar import Exporter, to_m, split_verts, UNIT, GAME

PID = 'orion'
BODY = dict(gender=1, age=0.5, muscle=0.92, weight=0.5, height=0.6, proportions=0.9, caucasian=1, african=0, asian=0)
MODS = {'measure/measure-upperarm-length': 0.5, 'torso/torso-vshape': 0.6, 'torso/torso-muscle-pectoral': 0.45, 'torso/torso-muscle-dorsi': 0.5,
        'neck/neck-scale-horiz': 0.5, 'neck/neck-scale-depth': 0.35, 'head/head-square': 0.75, 'stomach/stomach-pregnant': -0.5}
NB = 13380      # body vertices of the base mesh
TW = 2048       # body texture size
rng = np.random.default_rng(1980)


def smooth_normals(N, tris, n, iters=6):
    """vertex normals averaged with their neighbours (a shell pushed out along raw normals crosses itself in creases)"""
    from scipy.sparse import coo_matrix
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    A = coo_matrix((np.ones(len(e) * 2), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))), shape=(n, n)).tocsr()
    deg = np.asarray(A.sum(1)).ravel() + 1e-9
    out = N.copy()
    for _ in range(iters):
        out = 0.5 * out + 0.5 * (A @ out) / deg[:, None]
        out /= np.linalg.norm(out, axis=1, keepdims=True) + 1e-9
    return out


def mesh_adjacency(tris, n):
    from scipy.sparse import coo_matrix
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    A = coo_matrix((np.ones(len(e) * 2), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))), shape=(n, n)).tocsr()
    A.data[:] = 1
    return A, np.asarray(A.sum(1)).ravel() + 1e-9


def plate_mesh(f, off, V, Ns, tris, tuv, uvs, W, rim=0.75, Vsrc=None):
    """one plate: the part of the body where the field f (per vertex) is above 0, cut along its zero line inside the
    triangles (a smooth outline, not the triangles' steps), pushed out by `off` (dm) along the smoothed normals, its
    edge turned down towards the body (`rim`: how far, a share of off) so that it reads as a thick piece.
    Vsrc: the surface it is made over (default the body: a boot over a smoothed foot). Returns (pos, nrm, uv, tris,
    weights) in dm, or None"""
    Vs = V if Vsrc is None else Vsrc
    F = f[tris]
    ins = F > 0
    nin = ins.sum(1)
    keys, rows = {}, []          # render vertex key -> index; rows: (pos, nrm, uv, w, topo key)
    def vert(key, topo, p, n, u, w):
        k = keys.get(key)
        if k is None:
            k = keys[key] = len(rows); rows.append((p, n, u, w, topo))
        return k
    out_t = []
    for t in np.where(nin > 0)[0]:
        vs, us = tris[t], tuv[t]
        poly = []
        for i in range(3):
            j = (i + 1) % 3
            a_, b_ = vs[i], vs[j]
            if ins[t, i]:
                poly.append(vert(('v', a_, us[i]), ('v', a_), Vs[a_], Ns[a_], uvs[us[i]], W[a_]))
            if ins[t, i] != ins[t, j]:
                fa, fb = F[t, i], F[t, j]
                tt = fa / (fa - fb)
                lo, hi = (a_, b_) if a_ < b_ else (b_, a_)
                tl = tt if a_ < b_ else 1 - tt
                ua, ub = (us[i], us[j]) if a_ < b_ else (us[j], us[i])
                n_ = Ns[lo] * (1 - tl) + Ns[hi] * tl
                poly.append(vert(('e', lo, hi, ua, ub), ('e', lo, hi), Vs[lo] * (1 - tl) + Vs[hi] * tl, n_ / (np.linalg.norm(n_) + 1e-9),
                                 uvs[ua] * (1 - tl) + uvs[ub] * tl, W[lo] * (1 - tl) + W[hi] * tl))
        for k in range(1, len(poly) - 1):
            out_t.append([poly[0], poly[k], poly[k + 1]])
    if not out_t:
        return None
    T = np.array(out_t)
    base = np.array([r[0] for r in rows]); nrm = np.array([r[1] for r in rows]); uv = np.array([r[2] for r in rows]); Wv = np.array([r[3] for r in rows])
    topo = [r[4] for r in rows]
    top = base + nrm * off
    # the outline: edges used by one face (by surface point, not by uv), with the face's own winding
    tid = {}
    tk = np.array([tid.setdefault(k, len(tid)) for k in topo])
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    et = tk[e]
    kk = np.sort(et, 1); kk = kk[:, 0].astype(np.int64) * 10000000 + kk[:, 1]
    _, first, cnt = np.unique(kk, return_index=True, return_counts=True)
    bnd = e[first[cnt == 1]]
    nb = len(top)
    rp, ru, rw, rt = [], [], [], []
    for a_, b_ in bnd:
        lo_a, lo_b = base[a_] + nrm[a_] * off * (1 - rim), base[b_] + nrm[b_] * off * (1 - rim)
        bi_ = nb + len(rp)
        rp += [top[a_], top[b_], lo_b, lo_a]; ru += [uv[a_], uv[b_], uv[b_], uv[a_]]; rw += [Wv[a_], Wv[b_], Wv[b_], Wv[a_]]
        rt += [[bi_ + 1, bi_, bi_ + 3], [bi_ + 1, bi_ + 3, bi_ + 2]]
    P = np.concatenate([top, np.array(rp).reshape(-1, 3)]); UV = np.concatenate([uv, np.array(ru).reshape(-1, 2)])
    WW = np.concatenate([Wv, np.array(rw).reshape(-1, W.shape[1])]); TT = np.concatenate([T, np.array(rt, int).reshape(-1, 3)])
    return P, R.vertex_normals(P, TT), UV, TT, WW


def make_boot(V, W, bn, side, foot_idx, uv_box, ank_y, nseg=28, nrings=26):
    """an armoured boot round a foot: a tube of rounded-box sections from the heel to a closed toe cap, as wide and as
    high as the foot under it in each slice (and a margin), its shaft up over the ankle; skinned to the foot bone at the
    back and to the toes' at the front (so it bends with them); uvs from the nearest point of the foot (dm in, dm out)"""
    P = V[foot_idx]
    up = np.array([0.0, 1.0, 0.0])
    heel = P[np.argmin(P[:, 2])]; toe = P[np.argmax(P[:, 2])]
    fwd = toe - heel; fwd[1] = 0; L = np.linalg.norm(fwd); fwd /= L
    lat = np.cross(up, fwd)
    rel = P - heel
    t = rel @ fwd / L; u = rel @ lat; h = P[:, 1]
    ground = P[:, 1].min()
    bins = np.linspace(0, 1, nrings)
    half_w, top, mid = [], [], []
    for b in bins:
        sel = np.abs(t - b) < 0.09
        if not sel.any():
            sel = np.argsort(np.abs(t - b))[:6]
        half_w.append((u[sel].max() - u[sel].min()) / 2 + 0.06)
        mid.append((u[sel].max() + u[sel].min()) / 2)
        top.append(h[sel].max() + 0.07)
    half_w = np.array(half_w); top = np.array(top); mid = np.array(mid)
    # (smooth the profile; the shaft rises over the ankle at the back; the toe rounds off)
    k = np.ones(5) / 5
    half_w = np.convolve(np.pad(half_w, 2, mode='edge'), k, 'valid'); top = np.convolve(np.pad(top, 2, mode='edge'), k, 'valid'); mid = np.convolve(np.pad(mid, 2, mode='edge'), k, 'valid')
    shaft = ank_y + 0.35
    top = np.maximum(top, np.where(bins < 0.42, shaft - (shaft - top) * np.clip(bins / 0.42, 0, 1) ** 2, -np.inf))
    cap = np.clip((bins - 0.82) / 0.18, 0, 1)
    half_w *= np.sqrt(1 - cap ** 2 * 0.85)
    sole = ground - 0.03
    verts, uvp, weights = [], [], []
    toes = [i for i, n in enumerate(bn) if n.startswith('toe') and n.endswith('.' + side) and n.endswith(f'-1.{side}')]
    fb = bn.index(f'foot.{side}')
    # (uvs: a flat projection into a clean stretch of the plates' texture, uv_box = (u0, v0, scale per dm))
    def uvq(q):
        d_ = q - heel
        return [uv_box[0] + (d_ @ fwd + (d_ @ lat) * 0.6) * uv_box[2], uv_box[1] + (q[1] - ground) * uv_box[2]]
    for i, b in enumerate(bins):
        c = heel + fwd * (b * L + 0.04 * (1 - b)) + lat * mid[i]
        ht = (top[i] - sole) * (1 - 0.5 * cap[i] ** 2)
        for j in range(nseg):
            a = j / nseg * 2 * np.pi
            ca, sa = np.cos(a), np.sin(a)
            ex_ = 0.45
            xx = np.sign(ca) * np.abs(ca) ** ex_ * half_w[i]
            yy = sole + (0.5 + 0.5 * np.sign(sa) * np.abs(sa) ** ex_) * ht
            q = np.array([c[0], 0.0, c[2]]) + lat * xx
            q[1] = yy
            verts.append(q)
            uvp.append(uvq(q))
            wrow = np.zeros(W.shape[1])
            kt = np.clip((b - 0.62) / 0.25, 0, 1)
            wrow[fb] = 1 - kt
            for tb in toes:
                wrow[tb] += kt / max(1, len(toes))
            weights.append(wrow)
    # (the toe closed: one last point at the tip; the heel closed: one at the back)
    tip = heel + fwd * (L + 0.08) + lat * mid[-1]; tip[1] = sole + (top[-1] - sole) * 0.25
    back = heel - fwd * 0.05 + lat * mid[0]; back[1] = sole + (top[0] - sole) * 0.4
    for q, wsrc in ((tip, weights[-1]), (back, weights[0])):
        verts.append(q); uvp.append(uvq(q)); weights.append(wsrc)
    T = []
    for i in range(nrings - 1):
        for j in range(nseg):
            a0 = i * nseg + j; a1 = i * nseg + (j + 1) % nseg; b0 = a0 + nseg; b1 = a1 + nseg
            T += [[a0, b0, b1], [a0, b1, a1]]
    it, ib = len(verts) - 2, len(verts) - 1
    last = (nrings - 1) * nseg
    for j in range(nseg):
        T.append([last + j, it, last + (j + 1) % nseg])
        T.append([ib, j, (j + 1) % nseg])
    Vt = np.array(verts); T = np.array(T)
    # (outward winding: flip if the normals point in)
    n0 = R.vertex_normals(Vt, T)
    cen = Vt.mean(0)
    if ((Vt - cen) * n0).sum() < 0:
        T = T[:, ::-1]
    return Vt, R.vertex_normals(Vt, T), np.array(uvp), T, np.array(weights)


def raster_maps(V, tris, tuv, sel, uvp, W, H):
    """per texel of the faces sel: the face, its barycentrics, the position; and where there is any"""
    ids = R.raster_ids(uvp, np.zeros(len(uvp)), tuv[sel], W, H)
    ys, xs, k, bc = R.barycentric(ids, uvp, tuv[sel])
    tv = tris[sel][k]
    pos = np.zeros((H, W, 3), np.float32)
    pos[ys, xs] = (V[tv] * bc[:, :, None]).sum(1)
    valid = np.zeros((H, W), bool)
    valid[ys, xs] = True
    face = np.full((H, W), -1, np.int64)
    face[ys, xs] = sel[k]
    return pos, valid, face


def soft_line(d, w):
    """1 on a line at distance 0 (any units), fading out at w"""
    return np.clip(1 - np.abs(d) / w, 0, 1)


def text_mask(text, w=900, h=320, font=cv2.FONT_HERSHEY_DUPLEX):
    c = np.zeros((h, w), np.uint8)
    sc = 1.0
    while True:
        (tw, th), base = cv2.getTextSize(text, font, sc, max(2, int(sc * 3.2)))
        if tw > w * 0.82 or th > h * 0.62:
            break
        sc += 0.1
    (tw, th), base = cv2.getTextSize(text, font, sc, max(2, int(sc * 3.2)))
    cv2.putText(c, text, ((w - tw) // 2, (h + th) // 2 - base // 3), font, sc, 255, max(2, int(sc * 3.2)), cv2.LINE_AA)
    return c.astype(np.float32) / 255


def build(debug=False):
    out = os.path.join(GAME, 'assets/chars', PID)
    os.makedirs(out, exist_ok=True)
    print('==', PID)
    B = M.base()
    VT = B['vt']
    tris, tuv, fid = body_tris()
    lab = uv_islands()
    V = M.apply_targets(B['v'], M.macro_weights(BODY) + M.modifier_targets(MODS))
    # the head's faces: the uv island in the head's part of the atlas
    inbox = (VT[:, 0] > HEAD_U0 + 0.03) & (VT[:, 1] > HEAD_V0 + 0.05) & (VT[:, 1] < HEAD_V1 - 0.05)
    head_label = np.bincount(lab[inbox]).argmax()
    head_tris = np.where(lab[tuv[:, 0]] == head_label)[0]
    body_sel = np.setdiff1d(np.arange(len(tris)), head_tris)
    head_v = np.unique(tris[head_tris])
    print('  head tris', len(head_tris), 'body tris', len(body_sel))
    # the ears shrunk to a stub against the head (a disc of an audio module is painted over each)
    hvv = np.unique(tris[head_tris])
    for sg in (1, -1):
        hs = hvv[(V[hvv, 0] * sg) > 0]
        side_x = np.percentile(np.abs(V[hs, 0]), 93)
        ear = hs[np.abs(V[hs, 0]) > side_x - 0.05]
        if len(ear) < 10:
            continue
        c_ = V[ear].mean(0)
        root = np.array([sg * (side_x - 0.12), c_[1], c_[2]])
        rr_ = np.linalg.norm((V[ear] - c_) * [0.4, 1, 1], axis=1)
        k_ = np.clip(1 - rr_ / 0.75, 0, 1) ** 0.7
        V[ear] = V[ear] + (root + (V[ear] - root) * 0.35 - V[ear]) * k_[:, None]
    bones = M.skeleton(V)
    bn = [b['name'] for b in bones]
    J = {b['name']: b for b in bones}
    W = M.weights(len(V), bn)
    ground = V[:NB, 1].min()
    N = R.vertex_normals(V, tris)
    Ns = smooth_normals(N, tris, len(V))
    bi = {n: i for i, n in enumerate(bn)}
    Wb = W[:NB]
    x, y, z = V[:NB, 0], V[:NB, 1], V[:NB, 2]

    def w(*names):
        return Wb[:, [bi[n] for n in names if n in bi]].sum(1)

    def jy(n):
        return J[n]['head'][1]

    hands = {s: w(*[n for n in bn if n.endswith('.' + s) and (n.startswith('finger') or n.startswith('wrist') or n.startswith('metacarpal'))]) for s in 'LR'}
    feet = {s: w(*[n for n in bn if n.endswith('.' + s) and (n.startswith('foot') or n.startswith('toe'))]) for s in 'LR'}
    arm = {s: w(*[n for n in bn if n.endswith('.' + s) and (n.startswith('upperarm') or n.startswith('lowerarm') or n.startswith('shoulder'))]) for s in 'LR'}
    leg = {s: w(*[n for n in bn if n.endswith('.' + s) and (n.startswith('upperleg') or n.startswith('lowerleg'))]) for s in 'LR'}
    neckw = w('neck01', 'neck02', 'neck03', 'head')
    side = lambda s: (x > 0) if s == 'L' else (x < 0)
    # the trunk's front and back (the spine's line between them)
    zc = np.interp(y, [jy('root'), jy('spine03'), jy('spine01'), jy('neck01')], [J['root']['head'][2], J['spine03']['head'][2], J['spine01']['head'][2], J['neck01']['head'][2]])
    front = z > zc + 0.15
    back = z < zc - 0.15
    limbs = sum(arm.values()) + sum(leg.values()) + sum(hands.values()) + sum(feet.values())
    trunk = (limbs < 0.3) & (neckw < 0.35)
    # gaps between plates are where the dark undersuit shows: plates stop short of each other. Each plate a field over
    # the body's vertices, positive under it (the least of its conditions, each a signed distance in dm or a weight's
    # margin), softened over the mesh so that its outline runs smooth
    A_, deg = mesh_adjacency(tris[body_sel], NB)
    def fmin(*a):
        return np.minimum.reduce([np.broadcast_to(np.asarray(q, float), (NB,)) for q in a])
    def fmax(*a):
        return np.maximum.reduce([np.broadcast_to(np.asarray(q, float), (NB,)) for q in a])
    def soft(f_, it=3):
        for _ in range(it):
            f_ = 0.5 * f_ + 0.5 * (A_ @ f_) / deg
        return f_
    limbs3 = 3 * (0.3 - limbs); neck3 = 3 * (0.35 - neckw)
    zf = (z - zc) - 0.15
    dist = lambda P_: np.linalg.norm(V[:NB] - P_, axis=1)
    plates = []   # (name, field, offset dm)
    y_chest_lo = jy('spine02') - 0.12
    plates.append(('chest', fmin(limbs3, neck3, y - y_chest_lo, (jy('neck01') - 0.15) - y, zf, 1.55 - np.abs(x)), 0.1))
    plates.append(('back', fmin(limbs3, neck3, y - (jy('spine03') + 0.1), (jy('neck01') - 0.25) - y, (zc - z) - 0.15), 0.09))
    # the belly: four plates, a gap down the middle and across
    y_abs_lo = jy('spine04') - 0.35
    yb = (y_chest_lo + y_abs_lo) / 2
    for nm, lo, hi in (('absU', yb + 0.06, y_chest_lo - 0.1), ('absL', y_abs_lo, yb - 0.06)):
        for s_, sg in (('L', 1), ('R', -1)):
            plates.append((f'{nm}{s_}', fmin(limbs3, zf, y - lo, hi - y, x * sg - 0.1, 1.25 - np.abs(x)), 0.07))
    yh = jy('upperleg01.L')
    plates.append(('pelvis', fmin(y - (yh - 0.35), (y_abs_lo - 0.12) - y, 3 * (0.55 - sum(leg.values())), fmax(-zf, np.abs(x) - 0.45, y - (yh + 0.15))), 0.08))
    for s, sg in (('L', 1), ('R', -1)):
        S = J[f'upperarm01.{s}']['head']; E = J[f'lowerarm01.{s}']['head']; Wr = J[f'wrist.{s}']['head']
        xs_ = x * sg
        plates.append((f'shoulder{s}', fmin(xs_, 3 * (w(f'shoulder01.{s}', f'upperarm01.{s}', f'clavicle.{s}') - 0.45), y - (S[1] - 0.55), 3 * (0.1 - hands[s])), 0.13))
        ua = w(f'upperarm02.{s}') + w(f'upperarm01.{s}') * 0.5
        plates.append((f'uarm{s}', fmin(xs_, 3 * (ua - 0.6), (S[1] - 0.65) - y, dist(E) - 0.55), 0.07))
        fa = w(f'lowerarm01.{s}', f'lowerarm02.{s}')
        plates.append((f'farm{s}', fmin(xs_, 3 * (fa - 0.6), dist(E) - 0.5, dist(Wr) - 0.35), 0.08))
        plates.append((f'hand{s}', fmin(xs_, 3 * (hands[s] - 0.55)), 0.025))
        K = J[f'lowerleg01.{s}']['head']; A = J[f'foot.{s}']['head']; Hh = J[f'upperleg01.{s}']['head']
        th = w(f'upperleg01.{s}', f'upperleg02.{s}')
        plates.append((f'thigh{s}', fmin(xs_, 3 * (th - 0.6), (Hh[1] - 0.6) - y, dist(K) - 0.65, z - (K[2] - 0.6)), 0.08))
        plates.append((f'knee{s}', fmin(xs_, 0.78 - np.linalg.norm((V[:NB] - K) * [1, 0.75, 1], axis=1), z - (K[2] - 0.05)), 0.11))
        sh_ = w(f'lowerleg01.{s}', f'lowerleg02.{s}')
        plates.append((f'shin{s}', fmin(xs_, 3 * (sh_ - 0.6), (K[1] - 0.6) - y, y - (A[1] + 0.55), z - (K[2] - 0.75)), 0.08))
        plates.append((f'boot{s}', fmin(xs_, fmax(3 * (feet[s] - 0.45), fmin(3 * (sh_ - 0.3), (A[1] + 0.45) - y))), 0.17))
    plates = [(nm, soft(f_), off) for nm, f_, off in plates]
    # the skull cap: the head's top and back, the face left bare (its own uvs: the head's)
    eyeL, eyeR = J['eye.L']['head'], J['eye.R']['head']
    eye_y = (eyeL[1] + eyeR[1]) / 2
    hv_mask = np.zeros(NB, bool); hv_mask[head_v[head_v < NB]] = True
    hz = J['head']['head'][2]
    skull_f = fmin(np.where(hv_mask, 1.0, -1.0), fmax(y - (eye_y + 0.5), fmin((hz + 0.1) - z, y - (jy('head') - 0.15))), fmax((hz + 0.25) - z, y - (eye_y + 0.55)))
    print('  plates', [(p[0], int((p[1] > 0).sum())) for p in plates])
    # a boot is a solid shape, not a foot with toes: it is made over the foot smoothed (Taubin: no shrinking), and the
    # foot under it is not drawn
    Vboot = V.copy()
    footm = np.zeros(len(V), bool); footm[:NB] = sum(feet.values()) + 0.0 > 0.2
    # (a strong smoothing that melts the toes into one shape; the boot stands further off to stay outside them)
    for _ in range(60):
        avg = np.zeros_like(Vboot); avg[:NB] = (A_ @ Vboot[:NB]) / deg[:, None]
        Vboot[footm] += 0.6 * (avg[footm] - Vboot[footm])
    # (and pushed out along the smoothed shape's own normals: along the foot's, each toe's pointed its own way and the
    # toes came back as bumps)
    Nboot = smooth_normals(R.vertex_normals(Vboot, tris), tris, len(V), 10)
    if debug:
        img = np.full((900, 1200, 3), 30, np.uint8)
        cols = {}
        for i, (nm, f_, _) in enumerate(plates + [('skull', skull_f, 0)]):
            m = f_ > 0
            c = tuple(int(v) for v in rng.integers(60, 255, 3)); cols[nm] = c
            for view, ox in ((0, 0), (1, 600)):
                sel = np.where(m)[0]
                px = (300 + (x[sel] if view == 0 else -x[sel]) * 34 + ox).astype(int)
                py = (880 - (y[sel] - ground) * 34).astype(int)
                vis = (z[sel] > zc[sel] - 0.2) if view == 0 else (z[sel] < zc[sel] + 0.2)
                for a, b in zip(px[vis], py[vis]):
                    cv2.circle(img, (a, b), 1, c, -1)
        cv2.imwrite(os.path.join(OUT, 'orion_plates.png'), img)

    # ---- textures
    uvp = np.stack([VT[:, 0] * TW, (1 - VT[:, 1]) * TW], 1)
    pos, valid, face = raster_maps(V, tris, tuv, body_sel, uvp, TW, TW)
    # which plate each texel's face is under (per face: all three corners)
    tri_plate = np.full(len(tris), -1)
    for i, (nm, f_, _) in enumerate(plates):
        fm = np.zeros(len(V)); fm[:NB] = f_
        tri_plate[(fm[tris].mean(1) > 0) & (tri_plate < 0)] = i
    tp = np.where(face >= 0, tri_plate[np.maximum(face, 0)], -1)
    P = pos
    X, Y, Z = P[..., 0], P[..., 1], P[..., 2]
    # the undersuit: a fine woven hexagonal fibre, darker in its grooves, over long muscle strands
    yy, xx = np.mgrid[0:TW, 0:TW].astype(np.float32)
    s = 7.0
    q = xx / s; r = yy / (s * 0.866)
    rr = np.round(r); qq = np.round(q - (rr % 2) * 0.5)
    dx = q - (qq + (rr % 2) * 0.5); dy = (r - rr) * 0.866
    hexd = np.maximum(np.abs(dx) * 0.866 + np.abs(dy) * 0.5, np.abs(dy))
    weave = np.clip(1 - hexd / 0.5, 0, 1)
    strands = cv2.GaussianBlur(rng.random((TW // 8, TW // 8)).astype(np.float32), (0, 0), 1.2)
    strands = cv2.resize(strands, (TW, TW), interpolation=cv2.INTER_CUBIC)
    sh = 0.35 + 0.65 * weave
    syn = np.dstack([0.05 + 0.03 * sh + 0.03 * strands, 0.055 + 0.032 * sh + 0.03 * strands, 0.065 + 0.035 * sh + 0.03 * strands])
    syn_h = weave * 0.6 + strands * 0.4
    # the plates: brushed silver, a little cooler in the hollows, grime where they meet, polished chamfers along their
    # edges, panel seams laid out in 3D (rows across the trunk and the limbs, the chest's middle), rivets along the edges
    base = np.array([0.64, 0.655, 0.68], np.float32)
    brush = cv2.GaussianBlur(rng.random((TW, TW)).astype(np.float32), (0, 0), sigmaX=3, sigmaY=0.5)
    brush = (brush - brush.mean()) / (brush.std() + 1e-6)
    big = cv2.resize(cv2.GaussianBlur(rng.random((64, 64)).astype(np.float32), (0, 0), 2), (TW, TW), interpolation=cv2.INTER_CUBIC)
    alb = base[None, None] * (0.95 + 0.018 * brush[..., None] + 0.07 * (big[..., None] - 0.5))
    pl = tp >= 0
    # distance inside each plate's outline (texels), for the chamfer and the grime
    edge_d = np.zeros((TW, TW), np.float32)
    for i in range(len(plates)):
        m = (tp == i).astype(np.uint8)
        if m.any():
            d = cv2.distanceTransform(m, cv2.DIST_L2, 5)
            edge_d = np.maximum(edge_d, d)
    chamf = np.clip(1 - edge_d / 7, 0, 1) * pl
    grime = np.clip(1 - edge_d / 26, 0, 1) * pl
    # seams: rows across (every 0.9 dm up the trunk), the chest's middle line, a ring round each limb's plate
    seam = np.zeros((TW, TW), np.float32)
    seam = np.maximum(seam, soft_line(np.mod(Y - ground + 0.45, 0.9) - 0.45, 0.012) * (np.abs(X) < 1.6))
    seam = np.maximum(seam, soft_line(X, 0.012) * (Y > y_chest_lo))
    seam *= pl * (edge_d > 9)
    # rivets: on a band just inside the edges, spaced along it (by 3D position)
    riv = np.zeros((TW, TW), np.float32)
    band = (edge_d > 9) & (edge_d < 13) & pl
    cell = np.floor((X + Y * 1.7 + Z * 0.9) / 0.32)
    pick = (np.mod(cell, 2) == 0) & band
    ys_, xs_ = np.nonzero(pick)
    if len(ys_):
        sel = rng.choice(len(ys_), size=min(len(ys_), 2600), replace=False)
        for yv, xv in zip(ys_[sel], xs_[sel]):
            cv2.circle(riv, (int(xv), int(yv)), 3, 1.0, -1, cv2.LINE_AA)
        riv = cv2.GaussianBlur(riv, (0, 0), 0.8) * band
    alb *= (1 - 0.35 * grime[..., None] * 0.6)
    alb += 0.12 * chamf[..., None]
    alb *= (1 - 0.7 * seam[..., None])
    alb = alb * (1 - riv[..., None] * 0.25) + riv[..., None] * 0.22
    rough = 0.24 + 0.06 * (brush * 0.5 + 0.5) + 0.3 * seam + 0.18 * grime - 0.1 * chamf
    hgt = -seam * 1.0 - 0.6 * np.clip(1 - edge_d / 5, 0, 1) + riv * 0.8
    # "RyC" on the chest: an emblem stamped into the plate (a recessed dark field, a red ring round it) and the letters
    # raised and polished, set square to the body (the texture's directions at that point found from its 3D positions)
    ci = 0
    logo_em = None
    chest = (tp == ci)
    cy_ = jy('spine01') + 0.55
    cand = np.argwhere(chest & (np.abs(X) < 0.08) & (np.abs(Y - cy_) < 0.12))
    if len(cand):
        py0, px0 = cand[np.argmax(Z[cand[:, 0], cand[:, 1]])]
        # texel → body: the local Jacobian, a least-squares fit over the chest's texels round the point
        wy, wx = np.mgrid[-14:15, -14:15]
        ok = chest[np.clip(py0 + wy, 0, TW - 1), np.clip(px0 + wx, 0, TW - 1)]
        Aw = np.stack([wx[ok], wy[ok], np.ones(ok.sum())], 1).astype(np.float64)
        Bw = P[py0 + wy[ok], px0 + wx[ok]][:, :2].astype(np.float64)
        sol = np.linalg.lstsq(Aw, Bw, rcond=None)[0]
        Jm = sol[:2].T                                                   # (world x, y) per (texel x, texel y)
        Ji = np.linalg.inv(Jm)
        Wt, Ht = 2.3, 0.82                                               # dm: the emblem's size
        cw, chh = 900, 320
        T_ = text_mask('RyC', cw, chh)
        # the emblem's field: a rounded box a little bigger than the letters
        field = np.zeros((chh, cw), np.float32)
        cv2.rectangle(field, (30, 22), (cw - 30, chh - 22), 1.0, -1, cv2.LINE_AA)
        field = cv2.GaussianBlur(field, (0, 0), 6)
        ring = np.zeros((chh, cw), np.float32)
        cv2.rectangle(ring, (18, 12), (cw - 18, chh - 12), 1.0, 9, cv2.LINE_AA)
        # canvas pixel (u, v) → world offset ((u/cw - .5) Wt, -(v/chh - .5) Ht) → texel offset via Ji
        A = np.zeros((2, 3), np.float64)
        sx, sy = Wt / cw, -Ht / chh
        A[:, 0] = Ji @ [sx, 0]; A[:, 1] = Ji @ [0, sy]
        A[:, 2] = [px0, py0] - A[:, 0] * cw / 2 - A[:, 1] * chh / 2
        warp = lambda im: cv2.warpAffine(im, A, (TW, TW), flags=cv2.INTER_LINEAR, borderValue=0) * chest
        Tw, Fw, Rw = warp(T_), warp(field), warp(ring)
        # (a recessed black field, the letters neon tubes: a white-hot core, hot pink round it, and their glow on the
        # field; the frame a cyan tube)
        dark = np.array([0.03, 0.03, 0.035], np.float32)
        alb = alb * (1 - Fw[..., None] * 0.92) + dark[None, None] * Fw[..., None] * 0.92
        core = np.clip((Tw - 0.55) / 0.45, 0, 1)
        alb = alb * (1 - Tw[..., None]) + (np.array([1.0, 0.35, 0.65], np.float32) * (1 - core[..., None]) + np.array([1.0, 0.85, 0.93], np.float32) * core[..., None]) * Tw[..., None]
        alb = alb * (1 - Rw[..., None]) + np.array([0.6, 0.95, 1.0], np.float32)[None, None] * Rw[..., None]
        rough = rough * (1 - Fw) + 0.6 * Fw
        rough = rough * (1 - Tw) + 0.1 * Tw
        hgt = hgt - Fw * 0.8 + cv2.GaussianBlur(Tw, (0, 0), 1.5) * 1.2
        logo_em = (Tw, cv2.GaussianBlur(Tw, (0, 0), 7) * Fw, Rw, Fw)
        print('  RyC at texel', px0, py0)
    # neon (his cyberpunk side): thin cyan light strips set into the plates: two down the chest either side of its
    # middle, one under the emblem, rings round the forearms, the upper arms, the thighs and the shins, the belly
    # plates' inner edges
    neon = np.zeros((TW, TW), np.float32)
    idx = {p[0]: i for i, p in enumerate(plates)}
    on = lambda nm: tp == idx[nm]
    neon = np.maximum(neon, soft_line(np.abs(X) - 0.32, 0.016) * on('chest') * (Y < jy('spine01') + 1.6) * (Y > y_chest_lo + 0.25))
    neon = np.maximum(neon, soft_line(Y - (jy('spine01') + 0.12), 0.014) * on('chest') * (np.abs(X) < 0.75))
    for s_ in 'LR':
        E = J[f'lowerarm01.{s_}']['head']; S = J[f'upperarm01.{s_}']['head']; K = J[f'lowerleg01.{s_}']['head']; Hh = J[f'upperleg01.{s_}']['head']
        dE = np.linalg.norm(P - E, axis=2); dK = np.linalg.norm(P - K, axis=2); dS = np.linalg.norm(P - S, axis=2)
        neon = np.maximum(neon, soft_line(dE - 1.45, 0.018) * on(f'farm{s_}'))
        neon = np.maximum(neon, soft_line(dS - 1.25, 0.018) * on(f'uarm{s_}'))
        neon = np.maximum(neon, soft_line(dK - 1.55, 0.02) * on(f'thigh{s_}'))
        neon = np.maximum(neon, soft_line(dK - 1.3, 0.02) * on(f'shin{s_}'))
        for nm in ('absU', 'absL'):
            neon = np.maximum(neon, soft_line(np.abs(X) - 0.2, 0.014) * on(f'{nm}{s_}'))
    neon *= pl
    if logo_em is not None:
        neon *= 1 - np.clip(cv2.GaussianBlur(logo_em[3], (0, 0), 3) * 2.5, 0, 1)
    glow = cv2.GaussianBlur(neon, (0, 0), 2.5)
    alb = alb * (1 - neon[..., None] * 0.6) + np.array([0.75, 0.95, 1.0], np.float32)[None, None] * neon[..., None] * 0.6
    rough = rough * (1 - neon) + 0.1 * neon
    em = np.clip(neon + glow * 0.5, 0, 1)
    cyan = np.array([0.0, 0.85, 1.0], np.float32); pink = np.array([1.0, 0.1, 0.55], np.float32)
    emc = em[..., None] * cyan[None, None]
    if logo_em is not None:
        Tw_, Gw_, Rw_, _ = logo_em
        emc = np.maximum(emc, np.clip(Tw_ * 1.0 + Gw_ * 0.9, 0, 1)[..., None] * pink[None, None])
        emc = np.maximum(emc, np.clip(Rw_ + cv2.GaussianBlur(Rw_, (0, 0), 4) * 0.6, 0, 1)[..., None] * cyan[None, None])
        emc = np.maximum(emc, np.clip((Tw_ - 0.6) / 0.4, 0, 1)[..., None] * np.array([1.0, 0.7, 0.85], np.float32)[None, None])
    cv2.imwrite(os.path.join(out, 'metal_e.jpg'), np.clip(dilate_fill(emc, valid, 6)[..., ::-1] * 255, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    # (outside the plates: the undersuit; padding round the islands for the mip levels)
    metal_valid = pl
    alb_p = dilate_fill(alb, metal_valid & valid, 12)
    syn_p = dilate_fill(syn, valid, 12)
    rgh_p = dilate_fill(np.dstack([rough] * 3), metal_valid & valid, 12)[..., 0]
    hg_p = dilate_fill(np.dstack([hgt] * 3), metal_valid & valid, 12)[..., 0]
    cv2.imwrite(os.path.join(out, 'metal.jpg'), np.clip(alb_p[..., ::-1] * 255, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(os.path.join(out, 'metal_n.jpg'), normal_from_height(cv2.GaussianBlur(hg_p, (0, 0), 0.9), 2.2), [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(os.path.join(out, 'metal_r.jpg'), np.clip(rgh_p * 255, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(os.path.join(out, 'synth.jpg'), np.clip(syn_p[..., ::-1] * 255, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(os.path.join(out, 'synth_n.jpg'), normal_from_height(syn_h.astype(np.float32), 1.6), [cv2.IMWRITE_JPEG_QUALITY, 90])

    # ---- the head: a chrome faceplate
    huv = head_uv(VT)
    huvp = np.stack([huv[:, 0] * HTW, (1 - huv[:, 1]) * HTH], 1)
    hpos, hvalid, hface = raster_maps(V, tris, tuv, head_tris, huvp, HTW, HTH)
    HX, HY, HZ = hpos[..., 0], hpos[..., 1], hpos[..., 2]
    hb = np.array([0.7, 0.715, 0.74], np.float32)
    hbr = cv2.GaussianBlur(rng.random((HTH, HTW)).astype(np.float32), (0, 0), sigmaX=1.2, sigmaY=3)
    hbr = (hbr - hbr.mean()) / (hbr.std() + 1e-6)
    halb = hb[None, None] * (0.96 + 0.012 * hbr[..., None])
    hrough = 0.18 + 0.04 * (hbr * 0.5 + 0.5)
    hh = np.zeros((HTH, HTW), np.float32)
    face_z = J['head']['head'][2]
    mouth = (J['oris01']['head'] + J['oris05']['head']) / 2 if 'oris05' in J else J['oris01']['head']
    ear_x = np.abs(V[head_v, 0]).max() * 0.97
    fr = HZ > face_z + 0.2
    # seams: across the brow, down each cheek from the eye's outer corner to the jaw, round the mouth's plate
    sm = np.zeros((HTH, HTW), np.float32)
    sm = np.maximum(sm, soft_line(HY - (eye_y + 0.42), 0.01) * fr)
    for e in (eyeL, eyeR):
        sx_ = np.sign(e[0])
        cx_ = e[0] + sx_ * 0.33
        sm = np.maximum(sm, soft_line(HX - cx_, 0.01) * (HY < eye_y + 0.42) * (HY > mouth[1] - 0.6) * fr * (np.sign(HX) == sx_))
    mq = ((HX / 0.55) ** 2 + ((HY - (mouth[1] - 0.05)) / 0.32) ** 2)
    sm = np.maximum(sm, soft_line(np.sqrt(mq) - 1, 0.03) * fr)
    # the back of the head: rows of panels
    sm = np.maximum(sm, soft_line(np.mod(HY - ground + 0.3, 0.6) - 0.3, 0.012) * (HZ < face_z - 0.2))
    halb *= (1 - 0.75 * sm[..., None])
    hrough += 0.35 * sm
    hh -= sm * 1.2
    # the eye sockets: dark, deep, a polished lip round them (the red eyes glow in them)
    for e in (eyeL, eyeR):
        dsk = np.sqrt(((HX - e[0]) / 0.27) ** 2 + ((HY - e[1]) / 0.17) ** 2) * fr
        sock = np.clip((1.0 - dsk) / 0.12, 0, 1) * fr
        lip = soft_line(dsk - 1.06, 0.07) * fr
        halb = halb * (1 - sock[..., None]) + np.array([0.02, 0.02, 0.025], np.float32)[None, None] * sock[..., None]
        halb += 0.15 * lip[..., None]
        hrough = hrough * (1 - sock) + 0.6 * sock
        hh -= sock * 1.5
    # the mouth: a grille of horizontal slots inside its plate
    grill = (np.abs(HX) < 0.42) & (np.abs(HY - (mouth[1] - 0.04)) < 0.14) & fr
    slots = (np.mod((HY - mouth[1]) / 0.045, 1.0) < 0.42) & grill
    halb[slots] = [0.03, 0.03, 0.035]
    hrough[slots] = 0.7
    hh[slots] -= 1.0
    # vents on the cheeks: three short slanted slots each side
    for sgn in (1, -1):
        for k in range(3):
            cxv, cyv = sgn * 0.62, mouth[1] + 0.32 - k * 0.12
            dvx = (HX - cxv) * 0.8 - (HY - cyv) * 0.6 * sgn
            dvy = (HX - cxv) * 0.6 * sgn + (HY - cyv) * 0.8
            v_ = (np.abs(dvx) < 0.16) & (np.abs(dvy) < 0.022) & fr & (np.sign(HX) == sgn)
            halb[v_] = [0.03, 0.03, 0.035]; hh[v_] -= 0.8
    # an audio module over each ear: a disc, its ring and its bolt
    for sgn in (1, -1):
        de = np.sqrt((HY - eye_y + 0.15) ** 2 + (HZ - face_z + 0.15) ** 2) * (np.abs(HX) > ear_x - 0.35) * (np.sign(HX) == sgn)
        disc = (de > 0) & (de < 0.42)
        ringm = soft_line(de - 0.42, 0.03) * (de > 0)
        halb[disc] = halb[disc] * 0.7 + np.array([0.3, 0.31, 0.33]) * 0.3
        halb *= (1 - 0.6 * ringm[..., None])
        hh -= ringm * 1.0
        bolt = (de > 0) & (de < 0.07)
        halb[bolt] = [0.85, 0.85, 0.88]; hh[bolt] += 0.8
    # a red indicator strip on the brow's seam, his only colour but the eyes
    strip = (np.abs(HY - (eye_y + 0.52)) < 0.02) & (np.abs(HX) < 0.18) & fr
    halb[strip] = [0.75, 0.05, 0.04]
    halb_p = dilate_fill(halb, hvalid, 16)
    cv2.imwrite(os.path.join(out, 'head.jpg'), np.clip(halb_p[..., ::-1] * 255, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(os.path.join(out, 'head_n.jpg'), normal_from_height(cv2.GaussianBlur(dilate_fill(np.dstack([hh] * 3), hvalid, 16)[..., 0], (0, 0), 1.0), 2.0), [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(os.path.join(out, 'head_r.jpg'), np.clip(dilate_fill(np.dstack([hrough] * 3), hvalid, 16)[..., 0] * 255, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    # the eyes' glow: a bright core in the iris, a darker lens round it
    eg = np.zeros((256, 256, 3), np.float32)
    cv2.circle(eg, (128, 128), 120, (0.05, 0.02, 0.35), -1, cv2.LINE_AA)
    for r_, c_ in ((80, (0.1, 0.1, 0.9)), (46, (0.35, 0.5, 1.0)), (18, (0.8, 0.9, 1.0))):
        cv2.circle(eg, (128, 128), r_, c_, -1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(out, 'eye_glow.png'), np.clip(cv2.GaussianBlur(eg, (0, 0), 3) * 255, 0, 255).astype(np.uint8))

    # ---- the meshes
    ex = Exporter()
    vi, ui, inv = split_verts(tris, tuv)
    uv_out = VT[ui].copy()
    is_head_uv = lab[ui] == head_label
    uv_out[is_head_uv] = head_uv(VT[ui[is_head_uv]])
    sidx, swt = M.top4(W[vi])
    pos = to_m(V[vi], ground)
    # (the feet under the boots are not drawn)
    bootf = np.zeros(len(V)); bootf[:NB] = np.maximum(plates[[p[0] for p in plates].index('bootL')][1], plates[[p[0] for p in plates].index('bootR')][1])
    hide = (bootf[tris] > 0.05).all(1)
    body_keep = body_sel[~hide[body_sel]]
    ex.add_part('body', pos, N[vi], uv_out, sidx, swt, inv[body_keep].ravel(), dict(type='synth', map='synth.jpg', normalMap='synth_n.jpg'))
    ex.add_part('head', pos, N[vi], uv_out, sidx, swt, inv[head_tris].ravel(), dict(type='metal', map='head.jpg', normalMap='head_n.jpg', roughMap='head_r.jpg', head=True))
    allp = []
    # (per body vertex, a uv: for the boots, which take theirs from the foot under them)
    # (the boots' uvs: a flat stretch inside the back plate, clear of its seams)
    ys_b, xs_b = np.nonzero(tp == [p[0] for p in plates].index('back'))
    uv_box = ((np.median(xs_b) - 60) / TW, 1 - (np.median(ys_b) + 40) / TW, 18.0 / TW)
    for nm, f_, off in plates:
        if nm.startswith('boot'):
            fi = np.where(feet[nm[-1]] > 0.45)[0]
            r = make_boot(V, W, bn, nm[-1], fi, uv_box, J[f'foot.{nm[-1]}']['head'][1])
            allp.append(r)
            continue
        fv = np.full(len(V), -1.0); fv[:NB] = f_
        r = plate_mesh(fv, off, V, Ns, tris[body_sel], tuv[body_sel], VT, W)
        if r is None:
            continue
        Pp, Np, UVp, Tp, Sp = r
        allp.append((Pp, Np, UVp, Tp, Sp))
    # (all the body's plates in one part: one draw)
    Pp = np.concatenate([a[0] for a in allp]); Np = np.concatenate([a[1] for a in allp]); UVp = np.concatenate([a[2] for a in allp]); Wp_ = np.concatenate([a[4] for a in allp])
    off_ = np.cumsum([0] + [len(a[0]) for a in allp])[:-1]
    Tp = np.concatenate([a[3] + o for a, o in zip(allp, off_)])
    psi, psw = M.top4(Wp_)
    ex.add_part('armor', to_m(Pp, ground), Np, UVp, psi, psw, Tp.ravel(), dict(type='metal', map='metal.jpg', normalMap='metal_n.jpg', roughMap='metal_r.jpg', emissiveMap='metal_e.jpg', emissive=[1.0, 1.0, 1.0], emissiveIntensity=2.2))
    print('  armor', len(Pp), 'verts', len(Tp), 'tris')
    sf = np.full(len(V), -1.0); sf[:NB] = soft(skull_f, 2)
    r = plate_mesh(sf, 0.05, V, Ns, tris[head_tris], tuv[head_tris], head_uv(VT), W, rim=0.85)
    if r is not None:
        Pp, Np, UVp, Tp, Wsk = r
        psi, psw = M.top4(Wsk)
        ex.add_part('skull', to_m(Pp, ground), Np, UVp, psi, psw, Tp.ravel(), dict(type='metal', map='head.jpg', normalMap='head_n.jpg', roughMap='head_r.jpg'))
    # the eyes: the eyeballs glowing red in their sockets (no cornea, no lashes, no teeth: a machine)
    clo = M.load_mhclo(os.path.join(M.MHD, 'eyes/high-poly/high-poly.mhclo'))
    o = M.load_obj(clo['obj'])
    pv = M.fit_proxy(clo, V)
    ptris, ptuv = obj_tris(o)
    u_, v_ = o['vt'][ptuv[:, 0], 0], o['vt'][ptuv[:, 0], 1]
    keep = ~((u_ > 0.85) & (v_ < 0.15))
    pvi, pui, pinv = split_verts(ptris[keep], ptuv[keep])
    Wp = M.proxy_weights(clo, W)
    si, sw = M.top4(Wp[pvi])
    pn = R.vertex_normals(pv, ptris)
    ex.add_part('eyes', to_m(pv[pvi], ground), pn[pvi], o['vt'][pui], si, sw, pinv.ravel(), dict(type='glow', map='eye_glow.png', color=[1.0, 0.08, 0.04]))
    extra = dict(
        id=PID, display='ORIÓN', robot=True,
        bones=[dict(name=b['name'], parent=(bn.index(b['parent']) if b['parent'] else -1),
                    head=(to_m(b['head'][None], ground)[0]).round(5).tolist(), tail=(to_m(b['tail'][None], ground)[0]).round(5).tolist()) for b in bones],
        glasses=None, height=float((V[:NB, 1].max() - ground) * UNIT),
    )
    ex.write(os.path.join(out, 'mesh.json'), os.path.join(out, 'mesh.bin'), extra)
    import meshfmt
    meta_, parts_ = meshfmt.load(out)
    meshfmt.save(out, meta_, parts_, quantized=True)
    print('  exported', os.path.getsize(os.path.join(out, 'mesh.bin.gz')) // 1024, 'KB gz; height', round(extra['height'], 3))


if __name__ == '__main__':
    build(debug='--debug' in sys.argv)
