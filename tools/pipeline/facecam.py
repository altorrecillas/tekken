"""Perspective-camera face fitting: PnP pose + focal search, Gauss-Newton morph fitting, RBF residuals."""
import os
import numpy as np
import cv2
from scipy.interpolate import RBFInterpolator
from scipy.optimize import lsq_linear
from scipy.sparse import csr_matrix
from scipy.spatial import cKDTree
import mhlib as M
from facefit import (corr, photo_landmarks, face_target_files, FACE_OVAL, LIPS_IN, LIPS_OUT, L_EYE, R_EYE)

JAW_GAIN = 2.0
FLIP = np.array([1.0, -1.0, -1.0])  # MakeHuman (y up, z to viewer) -> OpenCV camera (y down, z forward)
UNIT = 10.0  # dm -> cm


class PhotoCam:
    def __init__(self, photo):
        self.P2, self.P3, self.W, self.H = photo_landmarks(photo)
        self.f = None
        self.rv = None
        self.tv = None

    def K(self, f=None):
        f = f or self.f
        return np.array([[f, 0, self.W / 2], [0, f, self.H / 2], [0, 0, 1.0]])

    def _pnp(self, X, img, f, guess=None):
        o = (X * UNIT * FLIP).astype(np.float64)
        K = self.K(f)
        if guess is not None:
            ok, rv, tv = cv2.solvePnP(o, img, K, None, rvec=guess[0].copy(), tvec=guess[1].copy(), useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE)
        else:
            ok, rv, tv = cv2.solvePnP(o, img, K, None, flags=cv2.SOLVEPNP_EPNP)
            ok, rv, tv = cv2.solvePnP(o, img, K, None, rvec=rv, tvec=tv, useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE)
        pr, _ = cv2.projectPoints(o, rv, tv, K, None)
        e = np.linalg.norm(pr[:, 0] - img, axis=1).mean()
        return e, rv, tv

    def solve(self, Lm, idx, search_f=False):
        img = self.P2[idx].astype(np.float64)
        if search_f or self.f is None:
            best = None
            mx = max(self.W, self.H)
            for fm in [0.6, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0, 5.0, 8.0, 14.0]:
                e, rv, tv = self._pnp(Lm, img, fm * mx)
                if best is None or e < best[0] - 1e-6:
                    best = (e, fm * mx, rv, tv)
            # refine f with golden section around the best grid value
            lo, hi = best[1] / 1.35, best[1] * 1.35
            for _ in range(14):
                m1, m2 = lo + (hi - lo) * 0.382, lo + (hi - lo) * 0.618
                e1 = self._pnp(Lm, img, m1, (best[2], best[3]))[0]
                e2 = self._pnp(Lm, img, m2, (best[2], best[3]))[0]
                if e1 < e2: hi = m2
                else: lo = m1
            f = (lo + hi) / 2
            e, rv, tv = self._pnp(Lm, img, f, (best[2], best[3]))
            self.f, self.rv, self.tv = f, rv, tv
            return e
        e, self.rv, self.tv = self._pnp(Lm, img, self.f, (self.rv, self.tv))
        return e

    def cam_points(self, X):
        R, _ = cv2.Rodrigues(self.rv)
        return (X * UNIT * FLIP) @ R.T + self.tv.ravel()

    def project(self, X):
        C = self.cam_points(X)
        px = C[:, :2] / C[:, 2:3] * self.f + np.array([self.W / 2, self.H / 2])
        return px, C[:, 2]

    def jacobians(self, X):
        """d(pixel)/d(model dm) for each point: (N, 2, 3)."""
        R, _ = cv2.Rodrigues(self.rv)
        C = self.cam_points(X)
        Mc = R * FLIP[None, :] * UNIT  # camera cm per model dm
        J = np.zeros((len(X), 2, 3))
        z = C[:, 2]
        for k in range(2):
            J[:, k, :] = (self.f / z)[:, None] * Mc[k][None, :] - (self.f * C[:, k] / z ** 2)[:, None] * Mc[2][None, :]
        return J


def landmark_basis(V, idx):
    c = corr()['corr']
    rows, cols, vals = [], [], []
    for r, i in enumerate(idx):
        for v, w in zip(c[i]['v'], c[i]['w']):
            rows.append(r); cols.append(v); vals.append(w)
    return csr_matrix((vals, (rows, cols)), shape=(len(idx), len(V)))


def valid_idx():
    c = corr()['corr']
    return np.array([i for i, x in enumerate(c) if x is not None and i < 468])


def neutral_targets(cam, idx, Lm_px_target, desmile=0.0):
    """Close an open / smiling mouth in the face's own frame (eye line = horizontal, so head roll does not skew it).
    The lower lip rises to the upper inner lip, points inside the opening rise proportionally, the chin follows with
    a falloff; with `desmile` the corners also drop to the lip contact line and come in."""
    q = Lm_px_target.copy()
    pos = {int(i): k for k, i in enumerate(idx)}
    if not all(i in pos for i in (13, 14, 61, 291, 33, 263, 152, 1)):
        return q
    ex = q[pos[263]] - q[pos[33]]; ex = ex / np.linalg.norm(ex)
    ey = np.array([-ex[1], ex[0]])
    if ey[1] < 0: ey = -ey  # local v points down the face (image y down)
    o = q[pos[13]].copy()
    U = (q - o) @ ex
    Vv = (q - o) @ ey
    def g(i): return pos[i]
    u_mid = (U[g(61)] + U[g(291)]) / 2
    width = abs(U[g(291)] - U[g(61)])
    v_up, v_lo, v_chin, v_nose = Vv[g(13)], Vv[g(14)], Vv[g(152)], Vv[g(1)]
    open_ = max(0.0, v_lo - v_up)
    if open_ > 0:
        for k in range(len(Vv)):
            v = Vv[k]
            if v <= v_up: continue
            inside = np.clip((v - v_up) / max(open_, 1e-6), 0, 1)       # 0 at the upper lip, 1 at the lower lip
            t = np.clip((v - v_lo) / max(1.0, v_chin - v_lo), 0, 1)       # fade towards the chin
            x_rel = abs(U[k] - u_mid) / max(1.0, width)
            lat = np.clip(1.4 - x_rel, 0.2, 1.0)
            Vv[k] -= open_ * inside * (1.0 - 0.45 * t) * lat
        for i in LIPS_IN:
            if i in pos: Vv[g(i)] = Vv[g(i)] * 0.2 + v_up * 0.8
    if desmile > 0:
        half = width / 2
        for k in range(len(Vv)):
            u, v = U[k] - u_mid, Vv[k]
            if v < v_nose: continue
            side = g(291) if u > 0 else g(61)
            lift = v_up - Vv[side]  # >0 when that corner sits above the lip contact line
            tt = min(abs(u) / max(half, 1.0), 1.0)
            vert = np.exp(-((v - v_up) / (half * 0.9)) ** 2)
            fall = np.exp(-max(0.0, abs(u) / max(half, 1.0) - 1.0) ** 2 * 2.0)
            w_ = vert * fall * desmile
            Vv[k] += lift * tt ** 2 * w_
            U[k] -= np.sign(u) * half * 0.14 * tt ** 1.5 * w_
        # a smile also pushes the lower lids up (squint) and raises the cheeks: let them settle
        face_h = max(1.0, v_chin - Vv[g(33)])
        for upper, lower_ids in ((159, (145, 153, 144, 163, 7, 154, 155)), (386, (374, 380, 373, 390, 249, 381, 382))):
            if upper in pos and lower_ids[0] in pos:
                open_eye = max(1.0, Vv[g(lower_ids[0])] - Vv[g(upper)])
                for i in lower_ids:
                    if i in pos: Vv[g(i)] += open_eye * 0.22 * desmile
        for i in (50, 101, 36, 205, 187, 118, 280, 330, 266, 425, 411, 347):
            if i in pos: Vv[g(i)] += face_h * 0.012 * desmile
    else:
        # soften very wide smiles a little
        for i in (61, 291, 78, 308):
            if i in pos: U[g(i)] = u_mid + (U[g(i)] - u_mid) * 0.93
    return o + np.outer(U, ex) + np.outer(Vv, ey)


def open_jaw(V, angle):
    """Linear-blend-skin the rest mesh with the jaw bone rotated by `angle` (radians, positive opens)."""
    bones = M.skeleton(V)
    names = [b['name'] for b in bones]
    W = M.weights(len(V), names)
    jb = [b for b in bones if b['name'] == 'jaw'][0]
    piv = jb['head']
    wj = W[:, names.index('jaw')]
    for extra in ('tongue00', 'tongue01', 'tongue02', 'tongue03', 'tongue04'):
        if extra in names: wj = wj + W[:, names.index(extra)]
    wj = np.clip(wj, 0, 1)
    c, s_ = np.cos(angle), np.sin(angle)
    d = V - piv
    y = d[:, 1] * c - d[:, 2] * s_
    z = d[:, 1] * s_ + d[:, 2] * c
    rot = np.stack([d[:, 0], y, z], 1) + piv
    return V + (rot - V) * wj[:, None]


def fit_face(V, photo, lam=0.0025, iters=6, amount=0.92, neutral=True, verbose=True, anchor_dist=1.3, desmile=0.0):
    """Returns (V_geometry_displacement_applied targets list, disp_geo, disp_tex, cam)."""
    cam = PhotoCam(photo)
    idx = valid_idx()
    if not neutral:
        # measure the lip opening in the photo and open the jaw accordingly before fitting
        Bm0 = landmark_basis(V, idx)
        cam.solve(Bm0 @ V, idx, search_f=True)
        P2 = cam.P2
        open_px = max(0.0, P2[14][1] - P2[13][1])
        z_cm = float(cam.tv[2][0])
        open_dm = open_px * z_cm / cam.f / 10.0
        jaw = [b for b in M.skeleton(V) if b['name'] == 'jaw'][0]
        lip = (Bm0 @ V)[list(idx).index(14)]
        L = np.linalg.norm((lip - jaw['head'])[1:])
        ang = float(np.clip(open_dm / max(L, 0.3) * JAW_GAIN, 0, 0.35))
        if verbose: print(f'  mouth open {open_dm * 10:.1f} cm -> jaw {np.degrees(ang):.1f} deg')
        V = open_jaw(V, ang)
        cam.f = None
    Bm = landmark_basis(V, idx)
    files = face_target_files()
    Acols = []
    for f in files:
        ti, td = M.load_target(f)
        full = np.zeros((len(V), 3)); full[ti] = td
        Acols.append(Bm @ full)
    A = np.stack(Acols, 2)  # (nl, 3, K)
    Lm0 = Bm @ V
    q_full = cam.P2[idx].astype(np.float64)
    q_geo = neutral_targets(cam, idx, q_full, desmile) if neutral else q_full
    # weights: silhouette points less reliable, inner lips excluded when neutralising
    wl = np.ones(len(idx))
    for k, i in enumerate(idx):
        if i in FACE_OVAL: wl[k] = 0.6
    w = np.zeros(len(files))
    cam.solve(Lm0, idx, search_f=True)
    if verbose: print(f'  camera f={cam.f:.0f}px ({cam.f / max(cam.W, cam.H):.2f}x) dist={cam.tv[2][0]:.0f}cm')
    for it in range(iters):
        Lm = Lm0 + np.einsum('nck,k->nc', A, w)
        err = cam.solve(Lm, idx, search_f=(it == 2))
        px, _ = cam.project(Lm)
        J = cam.jacobians(Lm)  # (n,2,3)
        r = (q_geo - px) * wl[:, None]
        # linear system in pixel units: J (A dw) = r
        JA = np.einsum('nij,njk->nik', J, A) * wl[:, None, None]  # (n,2,K)
        Amat = JA.reshape(-1, len(files))
        # scale regularisation to pixel units of this photo
        pxscale = np.abs(Amat).max() + 1e-9
        reg = np.sqrt(lam) * pxscale * 6
        Areg = np.vstack([Amat, reg * np.eye(len(files))])
        breg = np.concatenate([r.ravel() + Amat @ w, reg * np.zeros(len(files))])
        # lip volume in these photos is mostly smile stretch: keep it modest (full volume reads as a pout)
        ub = np.array([0.3 if 'lip-volume-incr' in os.path.basename(f) else 1.0 for f in files])
        res = lsq_linear(Areg, breg, bounds=(np.zeros(len(files)), ub), lsmr_tol='auto', max_iter=400)
        w = res.x
        if verbose: print(f'  it{it}: reproj {err:.2f}px -> ', end='')
    Lm = Lm0 + np.einsum('nck,k->nc', A, w)
    err = cam.solve(Lm, idx)
    if verbose: print(f'{err:.2f}px')
    tg = [(f, float(x) * amount) for f, x in zip(files, w) if x > 0.02]
    Vt = M.apply_targets(V, tg)
    # residual 3D displacements via pseudo-inverse of the projection Jacobian
    Lm = Bm @ Vt
    cam.solve(Lm, idx)
    out = []
    for q in (q_geo, q_full):
        px, _ = cam.project(Lm)
        J = cam.jacobians(Lm)
        D = np.zeros((len(idx), 3))
        for k in range(len(idx)):
            D[k] = np.linalg.pinv(J[k]) @ (q[k] - px[k])
        out.append(D)
    Dg, Df = out
    # RBF with anchors far from the face
    Vb = Vt[:13380]
    face_c = Lm.mean(0)
    near = np.where(np.linalg.norm(Vb - face_c, axis=1) < 5.0)[0]
    dist, _ = cKDTree(Lm).query(Vb[near])
    anchor = near[dist > anchor_dist]
    rng = np.random.default_rng(0)
    if len(anchor) > 900: anchor = rng.choice(anchor, 900, replace=False)
    pts = np.concatenate([Lm, Vb[anchor]])
    region = np.where(np.linalg.norm(Vt - face_c, axis=1) < 4.5)[0]
    disps = []
    for DD, amt in ((Dg, 0.9), (Df, 1.0)):
        vals = np.concatenate([DD * amt, np.zeros((len(anchor), 3))])
        rbf = RBFInterpolator(pts, vals, kernel='thin_plate_spline', smoothing=0.02)
        disp = np.zeros_like(Vt)
        disp[region] = rbf(Vt[region])
        disps.append(disp)
    if verbose:
        e2 = np.linalg.norm(cam.project(Bm @ (Vt + disps[1]))[0] - q_full, axis=1).mean()
        print(f'  after RBF (texture field) reproj {e2:.2f}px')
    return Vt, tg, disps[0], disps[1], cam


def bake_head_cam(V_tex, tris, tuv, VT, head_tris, photo_img, cam, skin_sample_ids=None, oval_grow=1.0, seg=None, mouth_from_base=False, mouth_scale=(1.18, 1.45), mouth_feather=0.02, flash=0.0):
    """Project the photo into the head texture using the perspective camera."""
    import raster as R
    from facefit import head_uv, HTW, HTH, poly_mask, smoothstep
    Hh, Ww = photo_img.shape[:2]
    qp, depth = cam.project(V_tex)
    qz = -depth  # larger = closer
    zb_ids = R.raster_ids(qp, qz, tris, Ww, Hh)
    ys, xs, tt, bc = R.barycentric(zb_ids, qp, tris)
    zbuf = np.full((Hh, Ww), -1e9, np.float32)
    zbuf[ys, xs] = (qz[tris[tt]] * bc).sum(1)
    Rm, _ = cv2.Rodrigues(cam.rv)
    nrm = R.vertex_normals(V_tex, tris)
    ncam = (nrm * FLIP) @ Rm.T
    # direction from surface point to camera, per vertex
    C = cam.cam_points(V_tex)
    view = -C / np.linalg.norm(C, axis=1, keepdims=True)
    facing_v = (ncam * view).sum(1)
    huv = head_uv(VT)
    uvp = np.stack([huv[:, 0] * HTW, (1 - huv[:, 1]) * HTH], 1)
    uv_ids = R.raster_ids(uvp, np.zeros(len(uvp)), tuv[head_tris], HTW, HTH)
    ys, xs, k, bc = R.barycentric(uv_ids, uvp, tuv[head_tris])
    tri_v = tris[head_tris][k]
    px = (qp[tri_v] * bc[:, :, None]).sum(1)
    pz = (qz[tri_v] * bc).sum(1)
    fz = (facing_v[tri_v] * bc).sum(1)
    col = R.sample(photo_img, px).astype(np.float32)
    if flash > 0:
        # on-camera flash: radiance ~ albedo * (ambient + flash * n.v). Divide that falloff out (in linear light)
        # so the parts of the face turned towards the lens stop reading as a chalky mask
        shade = (1 - flash) + flash * np.clip(fz, 0.05, 1.0)
        col[:, :3] = np.clip(col[:, :3] / (shade ** (1 / 2.2))[:, None], 0, 255)
    xi = np.clip(px[:, 0].astype(int), 0, Ww - 1); yi = np.clip(px[:, 1].astype(int), 0, Hh - 1)
    face_w = np.ptp(cam.P2[FACE_OVAL, 0])
    zr = np.ptp(qz)
    vis = (pz >= zbuf[yi, xi] - 0.012 * zr - 0.5).astype(np.float32)
    facing = smoothstep(0.12, 0.45, fz)
    oval = cam.P2[FACE_OVAL]
    c = oval.mean(0)
    oval = c + (oval - c) * oval_grow
    om = poly_mask(photo_img.shape, oval, feather=face_w * 0.04)
    ov = om[yi, xi]
    w = vis * facing * ov
    if seg is not None:
        # never project hair or background pixels onto the skin
        hair = seg[1].astype(np.float32) / 255
        bg = seg[0].astype(np.float32) / 255
        hair = cv2.dilate(hair, np.ones((5, 5), np.uint8))
        w = w * np.clip(1 - hair[yi, xi] * 1.3, 0, 1) * np.clip(1 - bg[yi, xi] * 1.5, 0, 1)
    from facefit import LIPS_OUT
    lp = cam.P2[LIPS_OUT]
    cc = lp.mean(0)
    lp = cc + (lp - cc) * np.array(mouth_scale if mouth_from_base else (1.12, 1.35))
    mm = poly_mask(photo_img.shape, lp, feather=face_w * (mouth_feather if mouth_from_base else 0.015))
    mouth_w = mm[yi, xi].astype(np.float32)
    if mouth_from_base:
        w = w * (1 - mouth_w)
    photo_tex = np.zeros((HTH, HTW, 3), np.float32)
    wt = np.zeros((HTH, HTW), np.float32)
    mouth_tex = np.zeros((HTH, HTW), np.float32)
    mouth_tex[ys, xs] = mouth_w
    photo_tex[ys, xs] = col[:, :3]
    wt[ys, xs] = w
    covered = np.zeros((HTH, HTW), np.uint8); covered[ys, xs] = 255
    skin_mask = np.zeros((HTH, HTW), np.float32)
    if skin_sample_ids is not None:
        sm = np.zeros((Hh, Ww), np.float32)
        for poly in skin_sample_ids:
            sm = np.maximum(sm, poly_mask(photo_img.shape, cam.P2[poly]))
        skin_mask[ys, xs] = sm[yi, xi] * (w > 0.9)
    return photo_tex, wt, covered, skin_mask, (ys, xs, px, mouth_tex)


def bake_proxy_photo(pv_tex, ptris, ptuv, pvt, base_tex, photo_img, cam, mask_ids, grow=1.0, feather=4, facing_min=0.05):
    """Project the photo onto a proxy mesh texture inside a landmark polygon (e.g. teeth inside the inner lips)."""
    import raster as R
    from facefit import poly_mask, smoothstep
    TH, TW = base_tex.shape[:2]
    qp, depth = cam.project(pv_tex)
    Rm, _ = cv2.Rodrigues(cam.rv)
    nrm = R.vertex_normals(pv_tex, ptris)
    ncam = (nrm * FLIP) @ Rm.T
    C = cam.cam_points(pv_tex)
    view = -C / np.linalg.norm(C, axis=1, keepdims=True)
    fac = (ncam * view).sum(1)
    uvp = np.stack([pvt[:, 0] * TW, (1 - pvt[:, 1]) * TH], 1)
    ids = R.raster_ids(uvp, np.zeros(len(uvp)), ptuv, TW, TH)
    ys, xs, k, bc = R.barycentric(ids, uvp, ptuv)
    tv = ptris[k]
    px = (qp[tv] * bc[:, :, None]).sum(1)
    fz = (fac[tv] * bc).sum(1)
    poly = cam.P2[mask_ids]
    c = poly.mean(0)
    poly = c + (poly - c) * grow
    mk = poly_mask(photo_img.shape, poly, feather=feather)
    xi = np.clip(px[:, 0].astype(int), 0, photo_img.shape[1] - 1); yi = np.clip(px[:, 1].astype(int), 0, photo_img.shape[0] - 1)
    w = mk[yi, xi] * smoothstep(facing_min, facing_min + 0.25, fz)
    col = R.sample(photo_img, px).astype(np.float32)[:, :3]
    out = base_tex.astype(np.float32).copy()
    bc3 = out[ys, xs, :3]
    out[ys, xs, :3] = bc3 * (1 - w[:, None]) + col * w[:, None]
    return np.clip(out, 0, 255).astype(np.uint8)
