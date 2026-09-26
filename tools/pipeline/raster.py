"""Tiny software rasterizer (painter's algorithm ID buffer + barycentrics) built on OpenCV."""
import numpy as np
import cv2


def raster_ids(p2, depth, tris, W, H, order='far_first'):
    """p2: (N,2) pixel coords, depth: (N,) larger = closer to viewer. Returns int32 id image (-1 = empty)."""
    img = np.zeros((H, W, 3), np.uint8)
    z = depth[tris].mean(1)
    idx = np.argsort(z)  # far (small) first
    P = np.round(p2 * 16).astype(np.int32)
    for t in idx:
        i = t + 1
        col = (int(i & 255), int((i >> 8) & 255), int((i >> 16) & 255))
        cv2.fillConvexPoly(img, P[tris[t]], col, lineType=cv2.LINE_8, shift=4)
    ids = img[..., 0].astype(np.int32) | (img[..., 1].astype(np.int32) << 8) | (img[..., 2].astype(np.int32) << 16)
    return ids - 1


def raster_uv_ids(uv_px, tris, W, H):
    """Rasterize in texture space (no depth), returns id image."""
    return raster_ids(uv_px, np.zeros(len(uv_px)), tris, W, H)


def barycentric(ids, p2, tris):
    H, W = ids.shape
    ys, xs = np.nonzero(ids >= 0)
    t = ids[ys, xs]
    a, b, c = p2[tris[t, 0]], p2[tris[t, 1]], p2[tris[t, 2]]
    px = np.stack([xs + 0.5, ys + 0.5], 1)
    v0, v1, v2 = b - a, c - a, px - a
    d00 = (v0 * v0).sum(1); d01 = (v0 * v1).sum(1); d11 = (v1 * v1).sum(1)
    d20 = (v2 * v0).sum(1); d21 = (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01
    den[np.abs(den) < 1e-12] = 1e-12
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    u = 1 - v - w
    bc = np.clip(np.stack([u, v, w], 1), 0, 1)
    bc /= bc.sum(1, keepdims=True)
    return ys, xs, t, bc


def sample(img, uv_px):
    """Bilinear sample img at float pixel coords (N,2) -> (N,C)."""
    m = uv_px.astype(np.float32)
    n = len(m)
    cols = 2048
    rows = (n + cols - 1) // cols
    pad = rows * cols - n
    mx = np.concatenate([m[:, 0], np.zeros(pad, np.float32)]).reshape(rows, cols)
    my = np.concatenate([m[:, 1], np.zeros(pad, np.float32)]).reshape(rows, cols)
    out = cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return out.reshape(rows * cols, -1)[:n]


def tri_normals(v, tris):
    n = np.cross(v[tris[:, 1]] - v[tris[:, 0]], v[tris[:, 2]] - v[tris[:, 0]])
    return n


def vertex_normals(v, tris):
    fn = tri_normals(v, tris)
    vn = np.zeros_like(v)
    for k in range(3):
        np.add.at(vn, tris[:, k], fn)
    l = np.linalg.norm(vn, axis=1, keepdims=True)
    l[l == 0] = 1
    return vn / l
