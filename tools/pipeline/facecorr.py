"""Render the neutral MakeHuman head, detect MediaPipe landmarks on it and store surface correspondences."""
import os, json
import numpy as np
import cv2
import mhlib as M
import raster as R
from common import *

B = M.base()
p = dict(gender=1, age=0.5, muscle=0.5, weight=0.5, height=0.5, proportions=0.5, african=0, asian=0, caucasian=1)
V = M.apply_targets(B['v'], M.macro_weights(p))
tris, tuv, _ = body_tris()
VT = B['vt']

skin = cv2.imread(os.path.join(M.MHA, 'skins/textures/young_lightskinned_male_diffuse.png'))
TH, TW = skin.shape[:2]

# eyes proxy
eclo = M.load_mhclo(os.path.join(M.MHD, 'eyes/high-poly/high-poly.mhclo'))
eobj = M.load_obj(eclo['obj'])
EV = M.fit_proxy(eclo, V)
etris, etuv = obj_tris(eobj)
eyetex = cv2.imread(os.path.join(M.MHA, 'eyes/materials/brownlight_eye.png'))

# eyebrows proxy
bclo = M.load_mhclo(os.path.join(M.MHA, 'eyebrows/eyebrow001/eyebrow001.mhclo'))
bobj = M.load_obj(bclo['obj'])
BV = M.fit_proxy(bclo, V)
btris, btuv = obj_tris(bobj)
browtex = cv2.imread(os.path.join(M.MHA, 'eyebrows/eyebrow001/eyebrow001.png'), cv2.IMREAD_UNCHANGED)

# camera: orthographic front view of head
head_v = V[np.unique(tris)]
hy = V[:, 1]
top = V[:13380, 1].max()
cy = top - 1.25  # head centre approx
cx = 0.0
S = 1024
scale = S / 3.2  # 3.2 dm view


def proj(P):
    return np.stack([(P[:, 0] - cx) * scale + S / 2, -(P[:, 1] - cy) * scale + S / 2], 1)


def shade(ids, P2, tr, tv, Vx, VTx, tex, nrm):
    ys, xs, t, bc = R.barycentric(ids, P2, tr)
    uv = (VTx[tv[t]] * bc[:, :, None]).sum(1)
    px = np.stack([uv[:, 0] * tex.shape[1], (1 - uv[:, 1]) * tex.shape[0]], 1)
    col = R.sample(tex, px).astype(np.float32)
    n = (nrm[tr[t]] * bc[:, :, None]).sum(1)
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    L = np.array([0.3, 0.4, 1.0]); L /= np.linalg.norm(L)
    lam = 0.45 + 0.6 * np.clip(n @ L, 0, 1)
    return ys, xs, col, lam


if __name__ == '__main__':
    P2 = proj(V)
    ids = R.raster_ids(P2, V[:, 2], tris, S, S)
    nrm = R.vertex_normals(V, tris)
    img = np.full((S, S, 3), 200, np.float32)
    ys, xs, col, lam = shade(ids, P2, tris, tuv, V, VT, skin, nrm)
    img[ys, xs] = col[:, :3] * lam[:, None]
    # eyes
    EP = proj(EV)
    eids = R.raster_ids(EP, EV[:, 2], etris, S, S)
    ys2, xs2, t2, bc2 = R.barycentric(eids, EP, etris)
    # depth test vs body: only draw eye where eye is in front of body
    bz = np.full((S, S), -1e9)
    yb, xb, tb, bcb = R.barycentric(ids, P2, tris)
    bz[yb, xb] = (V[tris[tb], 2] * bcb).sum(1)
    ez = (EV[etris[t2], 2] * bc2).sum(1)
    ok = ez > bz[ys2, xs2] - 1e-3
    uv = (eobj['vt'][etuv[t2]] * bc2[:, :, None]).sum(1)
    ec = R.sample(eyetex, np.stack([uv[:, 0] * eyetex.shape[1], (1 - uv[:, 1]) * eyetex.shape[0]], 1))
    img[ys2[ok], xs2[ok]] = ec[ok, :3] * 0.9
    # eyebrows (alpha)
    BP = proj(BV)
    bids = R.raster_ids(BP, BV[:, 2], btris, S, S)
    ys3, xs3, t3, bc3 = R.barycentric(bids, BP, btris)
    uv = (bobj['vt'][btuv[t3]] * bc3[:, :, None]).sum(1)
    bcol = R.sample(browtex, np.stack([uv[:, 0] * browtex.shape[1], (1 - uv[:, 1]) * browtex.shape[0]], 1)).astype(np.float32)
    a = bcol[:, 3:4] / 255.0
    img[ys3, xs3] = img[ys3, xs3] * (1 - a) + bcol[:, :3] * 0.6 * a
    img = np.clip(img, 0, 255).astype(np.uint8)
    out_png = os.path.join(TOOLS, 'mh_head_render.png')
    cv2.imwrite(out_png, img)
    lm = run_landmarks([out_png], os.path.join(OUT, 'mh_head_lm.json'))[out_png]
    print('faces', len(lm['faces']))
    L = np.array(lm['faces'][0]['lm'])
    pts = L[:, :2] * S
    # correspondences: body triangle + barycentric for each landmark
    corr = []
    ys, xs, t, bc = R.barycentric(ids, P2, tris)
    tmap = -np.ones((S, S), np.int64); tmap[ys, xs] = np.arange(len(ys))
    for i, (x, y) in enumerate(pts):
        xi, yi = int(x), int(y)
        k = tmap[yi, xi] if 0 <= yi < S and 0 <= xi < S else -1
        if k < 0:
            corr.append(None); continue
        tri = tris[t[k]]
        # exact barycentric at sub-pixel point
        a_, b_, c_ = P2[tri]
        v0, v1, v2 = b_ - a_, c_ - a_, np.array([x, y]) - a_
        d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
        d20, d21 = v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01
        vv = (d11 * d20 - d01 * d21) / den; ww = (d00 * d21 - d01 * d20) / den
        bb = np.clip([1 - vv - ww, vv, ww], 0, 1); bb = bb / bb.sum()
        corr.append(dict(v=tri.tolist(), w=bb.tolist(), z=float(L[i, 2])))
    json.dump(dict(corr=corr, mp=L.tolist(), scale=scale, cx=cx, cy=cy, S=S), open(os.path.join(OUT, 'mh_corr.json'), 'w'))
    dbg = img.copy()
    for x, y in pts:
        cv2.circle(dbg, (int(x), int(y)), 2, (0, 255, 0), -1)
    cv2.imwrite(os.path.join(OUT, 'mh_head_lm.jpg'), dbg)
    print('ok', sum(c is not None for c in corr))
