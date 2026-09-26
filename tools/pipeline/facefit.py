"""Per-person face fitting: morph MakeHuman head to MediaPipe landmarks and bake a photo texture."""
import os, json
import numpy as np
import cv2
from scipy.interpolate import RBFInterpolator
import mhlib as M
import raster as R
from common import *

# MediaPipe topology helpers
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
             149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
L_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
R_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
L_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
R_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
LIPS_OUT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
LIPS_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]

HEAD_U0, HEAD_U1, HEAD_V0, HEAD_V1 = 0.635, 1.0, 0.14, 0.83
HTW, HTH = 1024, 2048  # head texture size


def head_uv(vt):
    return np.stack([(vt[:, 0] - HEAD_U0) / (HEAD_U1 - HEAD_U0), (vt[:, 1] - HEAD_V0) / (HEAD_V1 - HEAD_V0)], 1)


_corr = None


def corr():
    global _corr
    if _corr is None:
        _corr = json.load(open(os.path.join(OUT, 'mh_corr.json')))
    return _corr


def mh_landmarks(V):
    c = corr()['corr']
    idx = [i for i, x in enumerate(c) if x is not None and i < 468]
    P = np.array([(V[c[i]['v']] * np.array(c[i]['w'])[:, None]).sum(0) for i in idx])
    return np.array(idx), P


def poly_mask(shape, pts, feather=0):
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.round(pts).astype(np.int32)], 255)
    m = m.astype(np.float32) / 255
    if feather > 0:
        k = int(feather) * 2 + 1
        m = cv2.GaussianBlur(m, (k, k), feather / 2)
    return m


def remove_glasses(img, lm2, strength=1.0, debug=None, extra_bottom=1.25):
    """Inpaint dark thin frame structures in the eye band. lm2: (478,2) pixel landmarks."""
    H, W = img.shape[:2]
    eye_w = np.linalg.norm(lm2[33] - lm2[133])
    oval = lm2[FACE_OVAL]
    band = np.zeros((H, W), np.uint8)
    cv2.fillPoly(band, [np.round(oval).astype(np.int32)], 255)
    band = cv2.dilate(band, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(eye_w * 0.5) | 1,) * 2))
    ytop = min(lm2[[105, 334, 66, 296, 63, 293]][:, 1]) - 0.12 * eye_w
    ybot = max(lm2[[145, 374]][:, 1]) + extra_bottom * eye_w
    band[:max(0, int(ytop))] = 0
    band[int(min(H, ybot)):] = 0
    # exclusion zones: eyes, brows, nose tip/nostrils, mouth
    excl = np.zeros((H, W), np.uint8)
    for ids, grow in ((L_EYE, 1.12), (R_EYE, 1.12), (L_BROW, 1.05), (R_BROW, 1.05),
                      ([1, 4, 5, 48, 64, 98, 97, 2, 326, 327, 294, 278, 19, 94, 141, 370, 240, 460], 1.0)):
        p = lm2[ids]
        if len(ids) > 12 and ids[0] == 1:
            hull = cv2.convexHull(np.round(p).astype(np.int32))
            cv2.fillConvexPoly(excl, hull, 255)
            continue
        c = p.mean(0)
        p = c + (p - c) * grow
        cv2.fillPoly(excl, [np.round(p).astype(np.int32)], 255)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    gray = lab[..., 0].astype(np.float32)
    masks = []
    for kk in (0.22, 0.4):
        k = max(5, int(eye_w * kk)) | 1
        se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, se)
        vals = bh[(band > 0) & (excl == 0)]
        thr = max(14, np.percentile(vals, 78))
        masks.append(bh > thr)
    m = ((masks[0] | masks[1]) & (band > 0) & (excl == 0)).astype(np.uint8) * 255
    n, labi, stats, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > (eye_w * 0.07) ** 2:
            keep[labi == i] = 255
    d = max(2, int(eye_w * 0.05))
    keep = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * d + 1, 2 * d + 1)))
    keep[excl > 0] = 0
    out = cv2.inpaint(img, keep, max(3, int(eye_w * 0.1)), cv2.INPAINT_TELEA)
    if debug is not None:
        dbg = img.copy()
        dbg[keep > 0] = (0, 0, 255)
        cv2.imwrite(debug, dbg)
    return out, keep


def lab_stats(img_bgr, mask):
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    sel = lab[mask > 0.5]
    return sel.mean(0), sel.std(0)


def color_transfer(img_bgr, src_stats, dst_stats, amount=(1, 1, 1)):
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    ms, ss = src_stats
    md, sd = dst_stats
    for c in range(3):
        a = amount[c]
        scale = (sd[c] / max(ss[c], 1e-3)) ** 0.5  # soften contrast change
        lab[..., c] = (lab[..., c] - ms[c]) * (1 + (scale - 1) * a) + ms[c] + (md[c] - ms[c]) * a
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


def pyr_blend(a, b, mask, levels=6):
    """Multi-band blend: result = a*mask + b*(1-mask). a,b float32 HxWx3, mask HxW float."""
    ga = [a]; gb = [b]; gm = [mask]
    for i in range(levels):
        ga.append(cv2.pyrDown(ga[-1])); gb.append(cv2.pyrDown(gb[-1])); gm.append(cv2.pyrDown(gm[-1]))
    la, lb = [], []
    for i in range(levels):
        sz = (ga[i].shape[1], ga[i].shape[0])
        la.append(ga[i] - cv2.pyrUp(ga[i + 1], dstsize=sz))
        lb.append(gb[i] - cv2.pyrUp(gb[i + 1], dstsize=sz))
    la.append(ga[-1]); lb.append(gb[-1])
    out = None
    for i in range(levels, -1, -1):
        m = gm[i][..., None]
        l = la[i] * m + lb[i] * (1 - m)
        if out is None:
            out = l
        else:
            out = cv2.pyrUp(out, dstsize=(l.shape[1], l.shape[0])) + l
    return out


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def photo_landmarks(photo):
    d = json.load(open(os.path.join(TOOLS, 'landmarks.json')))[photo]
    L = np.array(d['faces'][0]['lm'])
    W, H = d['w'], d['h']
    P2 = L[:, :2] * [W, H]
    P3 = np.stack([L[:, 0] * W, -L[:, 1] * H, -L[:, 2] * W], 1)
    return P2, P3, W, H


def fit_geometry(V, photo, depth_scale=0.45, amount=0.85, head_mask=None, verbose=True, anchor_dist=1.3):
    """Return (displacement for all verts (N,3) damped for geometry, full displacement for texture mapping, s,R,t)."""
    P2, P3, W, H = photo_landmarks(photo)
    idx, Lm = mh_landmarks(V)
    Pp = P3[idx]
    # align using stable inner-face points (exclude oval silhouette)
    inner = np.array([i not in FACE_OVAL for i in idx])
    s, Rm, t = umeyama(Lm[inner], Pp[inner])
    D = ((Pp - t) @ Rm) / s - Lm  # R^T (P - t)/s  (row-vector form)
    if verbose:
        err = np.linalg.norm(D, axis=1)
        print(f'  align scale={s:.2f} mean residual {err.mean():.3f} dm, max {err.max():.3f}')
    Dg = D.copy()
    Dg[:, 2] *= depth_scale
    # anchors: vertices far from any landmark keep their position
    from scipy.spatial import cKDTree
    face_c = Lm.mean(0)
    Vb = V[:13380]
    near = np.where(np.linalg.norm(Vb - face_c, axis=1) < 5.0)[0]
    dist, _ = cKDTree(Lm).query(Vb[near])
    anchor = near[dist > anchor_dist]
    rng = np.random.default_rng(0)
    if len(anchor) > 900:
        anchor = rng.choice(anchor, 900, replace=False)
    pts = np.concatenate([Lm, Vb[anchor]])
    region = np.where(np.linalg.norm(V - face_c, axis=1) < 4.5)[0]
    out = []
    for DD in (Dg * amount, D):
        vals = np.concatenate([DD, np.zeros((len(anchor), 3))])
        rbf = RBFInterpolator(pts, vals, kernel='thin_plate_spline', smoothing=0.02)
        disp = np.zeros_like(V)
        disp[region] = rbf(V[region])
        out.append(disp)
    return out[0], out[1], (s, Rm, t), (P2, W, H)


def bake_head(V_tex, Vgeo, tris, tuv, VT, head_tris, photo_img, P2, sRt, base_head_tex, verbose=True,
              skin_sample_ids=None, delight=0.7, oval_grow=1.0):
    """Bake photo into head texture (HTH x HTW) using per-vertex photo coords."""
    s, Rm, t = sRt
    Hh, Ww = photo_img.shape[:2]
    # photo coords for all verts (texture-mapping geometry)
    Q = s * (V_tex @ Rm.T) + t  # photo 3D (x, -y, z)
    qx, qy, qz = Q[:, 0], -Q[:, 1], Q[:, 2]
    qp = np.stack([qx, qy], 1)
    # z-buffer in photo space
    zb_ids = R.raster_ids(qp, qz, tris, Ww, Hh)
    ys, xs, tt, bc = R.barycentric(zb_ids, qp, tris)
    zbuf = np.full((Hh, Ww), -1e9, np.float32)
    zbuf[ys, xs] = (qz[tris[tt]] * bc).sum(1)
    # normals in photo space
    nrm = R.vertex_normals(V_tex, tris)
    nq = nrm @ Rm.T
    # texture-space raster of head triangles
    huv = head_uv(VT)
    uvp = np.stack([huv[:, 0] * HTW, (1 - huv[:, 1]) * HTH], 1)
    ht = head_tris
    uv_ids = R.raster_ids(uvp, np.zeros(len(uvp)), tuv[ht], HTW, HTH)
    ys, xs, k, bc = R.barycentric(uv_ids, uvp, tuv[ht])
    tri_v = tris[ht][k]
    px = (qp[tri_v] * bc[:, :, None]).sum(1)
    pz = (qz[tri_v] * bc).sum(1)
    nz = (nq[tri_v, 2] * bc).sum(1)
    col = R.sample(photo_img, px).astype(np.float32)
    # visibility
    xi = np.clip(px[:, 0].astype(int), 0, Ww - 1); yi = np.clip(px[:, 1].astype(int), 0, Hh - 1)
    face_w = np.ptp(P2[FACE_OVAL, 0])
    vis = (pz >= zbuf[yi, xi] - 0.03 * face_w).astype(np.float32)
    facing = smoothstep(0.12, 0.45, nz)
    # face oval mask in photo space (slightly shrunk / feathered)
    oval = P2[FACE_OVAL]
    c = oval.mean(0)
    oval = c + (oval - c) * oval_grow
    om = poly_mask(photo_img.shape, oval, feather=face_w * 0.04)
    ov = om[yi, xi]
    w = vis * facing * ov
    photo_tex = np.zeros((HTH, HTW, 3), np.float32)
    wt = np.zeros((HTH, HTW), np.float32)
    photo_tex[ys, xs] = col[:, :3]
    wt[ys, xs] = w
    covered = np.zeros((HTH, HTW), np.uint8)
    covered[ys, xs] = 255
    # skin-sample mask (photo space polygon ids) -> texture space
    skin_mask = np.zeros((HTH, HTW), np.float32)
    if skin_sample_ids is not None:
        sm = np.zeros((Hh, Ww), np.float32)
        for poly in skin_sample_ids:
            sm = np.maximum(sm, poly_mask(photo_img.shape, P2[poly]))
        skin_mask[ys, xs] = sm[yi, xi] * (w > 0.9)
    return photo_tex, wt, covered, skin_mask, (ys, xs, px)


def face_target_files():
    import glob
    files = []
    for d in ('head', 'chin', 'cheek', 'forehead', 'nose', 'mouth', 'eyes', 'eyebrows'):
        for f in sorted(glob.glob(os.path.join(M.MHD, 'targets', d, '*.target'))):
            b = os.path.basename(f)
            # global head size / age morphs are not observable from one photo (they trade off against the camera
            # distance): leaving them in let the fit shrink whole heads (Camilo, Zapponi ~9 heads tall)
            if b.startswith('head-trans') or b.startswith('head-angle') or b.startswith('head-scale') or b.startswith('head-age'):
                continue
            # mouth depth is not observable from a frontal photo either: a smile pushed the fitted lips forward
            # into a pout (Camilo, Zapponi)
            if b.startswith('mouth-trans-forward') or b.startswith('mouth-trans-backward') or b.startswith('mouth-scale-depth'):
                continue
            files.append(f)
    return files


def fit_targets(V, photo, lam=0.004, depth_w=0.35, iters=3, verbose=True):
    """Fit MakeHuman face targets (morphable model) to the photo landmarks. Returns [(path, weight)]."""
    from scipy.optimize import lsq_linear
    from scipy.sparse import csr_matrix
    P2, P3, W, H = photo_landmarks(photo)
    c = corr()['corr']
    idx = np.array([i for i, x in enumerate(c) if x is not None and i < 468])
    rows, cols, vals = [], [], []
    for r, i in enumerate(idx):
        for v, w in zip(c[i]['v'], c[i]['w']):
            rows.append(r); cols.append(v); vals.append(w)
    Bm = csr_matrix((vals, (rows, cols)), shape=(len(idx), len(V)))
    files = face_target_files()
    cols_A = []
    for f in files:
        ti, td = M.load_target(f)
        full = np.zeros((len(V), 3))
        full[ti] = td
        cols_A.append((Bm @ full).ravel())
    A = np.stack(cols_A, 1)  # (3*nl, K)
    wz = np.tile([1.0, 1.0, depth_w], len(idx))
    inner = np.array([i not in FACE_OVAL for i in idx])
    Lm0 = Bm @ V
    w = np.zeros(len(files))
    Pp = P3[idx]
    for it in range(iters):
        Lm = Lm0 + (A @ w).reshape(-1, 3)
        s, Rm, t = umeyama(Lm[inner], Pp[inner])
        Dt = ((Pp - t) @ Rm) / s - Lm0  # target displacement from the unmorphed landmarks
        Aw = A * wz[:, None]
        bw = Dt.ravel() * wz
        Areg = np.vstack([Aw, np.sqrt(lam) * np.eye(len(files))])
        breg = np.concatenate([bw, np.zeros(len(files))])
        # lip volume is mostly smile stretch in these photos: keep it modest
        ub = np.array([0.3 if 'lip-volume-incr' in os.path.basename(f) else 1.0 for f in files])
        res = lsq_linear(Areg, breg, bounds=(np.zeros(len(files)), ub), lsmr_tol='auto', max_iter=500)
        w = res.x
        if verbose:
            e0 = np.linalg.norm(Dt, axis=1).mean()
            e1 = np.linalg.norm(Dt - (A @ w).reshape(-1, 3), axis=1).mean()
            print(f'  target fit it{it}: residual {e0:.3f} -> {e1:.3f} dm')
    out = [(f, float(x)) for f, x in zip(files, w) if x > 0.02]
    if verbose:
        top = sorted(out, key=lambda x: -x[1])[:12]
        print('  top targets:', ', '.join(f'{os.path.basename(f)[:-7]}={x:.2f}' for f, x in top))
    return out


def eyeball_info(V):
    """Centres and radius of both eyeballs from the helper-eye groups of the base mesh."""
    B = M.base()
    out = []
    for g in ('helper-r-eye', 'helper-l-eye'):
        gi = B['groups'].index(g)
        vs = np.unique(np.concatenate([B['f'][i] for i in np.where(B['fg'] == gi)[0]]))
        P = V[vs]
        c = P.mean(0)
        r = np.linalg.norm(P - c, axis=1).mean()
        out.append((c, r, vs))
    return out


def close_lids(V, upper_deg=8.0, lower_deg=3.0):
    """Slide eyelids over the eyeballs (rotation about each eyeball centre around the x axis)."""
    B = M.base()
    V = V.copy()
    excl = set()
    for g in ('helper-r-eye', 'helper-l-eye'):
        gi = B['groups'].index(g)
        excl.update(np.unique(np.concatenate([B['f'][i] for i in np.where(B['fg'] == gi)[0]])).tolist())
    excl = np.array(sorted(excl))
    mask = np.ones(len(V), bool); mask[excl] = False
    for c, r, _ in eyeball_info(V):
        d = V - c
        dist = np.linalg.norm(d, axis=1)
        front = d[:, 2] > -r * 0.2
        w = np.clip((r * 2.1 - dist) / (r * 0.9), 0, 1) ** 1.5  # full effect near the lid margin
        w *= front * mask
        # angle above/below the eye centre decides upper or lower lid
        el = np.arctan2(d[:, 1], np.maximum(d[:, 2], 1e-4))
        up = el > 0.05
        lo = el < -0.05
        ang = np.where(up, np.radians(upper_deg), np.where(lo, -np.radians(lower_deg), 0.0)) * w  # elevation' = el - ang
        # soften near the corners (lateral)
        lat = np.clip(1 - np.abs(d[:, 0]) / (r * 1.6), 0, 1) ** 0.5
        ang *= lat
        ca, sa = np.cos(ang), np.sin(ang)
        y = d[:, 1] * ca - d[:, 2] * sa
        z = d[:, 1] * sa + d[:, 2] * ca
        sel = w > 0
        V[sel, 1] = c[1] + y[sel]
        V[sel, 2] = c[2] + z[sel]
    return V
