import os, json, subprocess
import numpy as np
import cv2
import mhlib as M
import raster as R

SCR = M.SCR
TOOLS = os.path.join(SCR, 'tools')
OUT = os.path.join(SCR, 'out')
os.makedirs(OUT, exist_ok=True)


def body_tris():
    """Triangulated body faces: returns (tris (T,3) vertex idx, tuv (T,3) uv idx, quad index per tri)."""
    B = M.base()
    bg = B['groups'].index('body')
    tris, tuv, fid = [], [], []
    for i, f in enumerate(B['f']):
        if B['fg'][i] != bg:
            continue
        u = B['fuv'][i]
        if len(f) == 4:
            tris += [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]
            tuv += [[u[0], u[1], u[2]], [u[0], u[2], u[3]]]
            fid += [i, i]
        else:
            tris.append(f[:3]); tuv.append(u[:3]); fid.append(i)
    return np.array(tris), np.array(tuv), np.array(fid)


def uv_islands():
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    B = M.base()
    rows, cols = [], []
    for u in B['fuv']:
        for a in range(len(u)):
            rows.append(u[a]); cols.append(u[(a + 1) % len(u)])
    n = len(B['vt'])
    g = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n))
    k, lab = connected_components(g, directed=False)
    return lab


def obj_tris(o):
    tris, tuv = [], []
    for f, u in zip(o['f'], o['fuv']):
        for k in range(1, len(f) - 1):
            tris.append([f[0], f[k], f[k + 1]]); tuv.append([u[0], u[k], u[k + 1]])
    return np.array(tris), np.array(tuv)


def run_landmarks(images, out_json):
    rel = [os.path.relpath(p, TOOLS) for p in images]
    subprocess.run(['node', 'lm2.mjs', os.path.relpath(out_json, TOOLS)] + rel, cwd=TOOLS, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    d = json.load(open(out_json))
    return {os.path.join(TOOLS, k): v for k, v in d.items()}


def umeyama(src, dst, with_scale=True):
    """Find s,R,t minimizing |s R src + t - dst|."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    xs, xd = src - mu_s, dst - mu_d
    cov = xd.T @ xs / len(src)
    U, S, Vt = np.linalg.svd(cov)
    D = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:
        D[2, 2] = -1
    Rm = U @ D @ Vt
    var_s = (xs ** 2).sum() / len(src)
    s = np.trace(np.diag(S) @ D) / var_s if with_scale else 1.0
    t = mu_d - s * Rm @ mu_s
    return s, Rm, t
