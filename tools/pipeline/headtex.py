"""Head texture helpers: texel geometry, hairline / beard masks, procedural stubble."""
import numpy as np
import cv2
import raster as R
from facefit import head_uv, HTW, HTH, mh_landmarks, smoothstep


def texel_geometry(Vx, tris, tuv, head_tris, VT, nrm=None):
    huv = head_uv(VT)
    uvp = np.stack([huv[:, 0] * HTW, (1 - huv[:, 1]) * HTH], 1)
    ids = R.raster_ids(uvp, np.zeros(len(uvp)), tuv[head_tris], HTW, HTH)
    ys, xs, k, bc = R.barycentric(ids, uvp, tuv[head_tris])
    tv = tris[head_tris][k]
    pos = np.zeros((HTH, HTW, 3), np.float32)
    pos[ys, xs] = (Vx[tv] * bc[:, :, None]).sum(1)
    if nrm is None:
        nrm = R.vertex_normals(Vx, tris)
    nm = np.zeros((HTH, HTW, 3), np.float32)
    n = (nrm[tv] * bc[:, :, None]).sum(1)
    nm[ys, xs] = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)
    valid = np.zeros((HTH, HTW), bool)
    valid[ys, xs] = True
    return pos, nm, valid


def dilate_fill(img, valid, iters=24):
    """Push colours outward from valid texels to avoid seams under mip-mapping."""
    out = img.copy().astype(np.float32)
    v = valid.astype(np.float32)
    for _ in range(iters):
        blur = cv2.blur(out * v[..., None] if out.ndim == 3 else out * v, (3, 3))
        vb = cv2.blur(v, (3, 3))
        grow = (vb > 0) & (v == 0)
        if out.ndim == 3:
            out[grow] = blur[grow] / vb[grow][:, None]
        else:
            out[grow] = blur[grow] / vb[grow]
        v = np.maximum(v, grow.astype(np.float32))
    return out


class HeadFrame:
    def __init__(self, Vg, head_vidx):
        idx, P = mh_landmarks(Vg)
        self.lm = {int(i): p for i, p in zip(idx, P)}
        eyes = (self.lm[33] + self.lm[263]) / 2
        hv = Vg[head_vidx]
        band = hv[np.abs(hv[:, 1] - eyes[1]) < 0.4]
        zc = (band[:, 2].max() + band[:, 2].min()) / 2
        self.C = np.array([0.0, eyes[1] - 0.1, zc])

    def angles(self, pos):
        d = pos - self.C
        hor = np.sqrt(d[..., 0] ** 2 + d[..., 2] ** 2)
        el = np.degrees(np.arctan2(d[..., 1], hor))
        az = np.degrees(np.arctan2(d[..., 0], d[..., 2]))
        return el, az

    def el_of(self, lmid):
        return float(self.angles(self.lm[lmid][None])[0][0])


def fbm(shape, scales=(64, 16, 4), seed=0, amps=(1, 0.5, 0.25)):
    rng = np.random.default_rng(seed)
    H, W = shape
    out = np.zeros(shape, np.float32)
    for s, a in zip(scales, amps):
        n = rng.standard_normal((max(2, H // s), max(2, W // s))).astype(np.float32)
        out += a * cv2.resize(n, (W, H), interpolation=cv2.INTER_CUBIC)
    return out / sum(amps)


def hairline_mask(frame, pos, valid, front_el, temple_el, side_el=16.0, back_el=-40.0, soft=3.0, seed=1):
    el, az = frame.angles(pos)
    a = np.abs(az)
    # piecewise hairline elevation as a function of |azimuth|
    xp = [0, 22, 40, 62, 80, 100, 125, 150, 180]
    fp = [front_el, front_el + (temple_el - front_el) * 0.6, temple_el, (temple_el + side_el) / 2, side_el, side_el - 2,
          -10, back_el + 6, back_el]
    h = np.interp(a, xp, fp)
    jitter = fbm(el.shape, (48, 12, 3), seed) * 2.2
    m = smoothstep(h - soft, h + soft, el + jitter)
    m[~valid] = 0
    return m


def beard_mask(frame, pos, valid, extent=1.0, seed=2, sideburn=True, goatee=0.0, lip_clear=0.34, cheek=0.0, fade=0.08, rise=1.0):
    """Beard region from 3D rules: jaw, chin, under-chin, upper lip, sideburns.
    fade: dm over which the beard thins out towards its upper edge on the cheeks (a full beard of several days has no
    hard line there: at game distance one reads as a mask). rise: how steeply the upper edge climbs from the cheeks to
    the sideburns (1 = up to eye height by the ear)."""
    el, az = frame.angles(pos)
    lm = frame.lm
    mouth_y = (lm[61][1] + lm[291][1]) / 2
    nose_y = lm[2][1]
    chin = lm[152]
    a = np.abs(az)
    y = pos[..., 1]
    z = pos[..., 2]
    # lower face: below a line from nose base (front) to below the cheekbones (sides)
    top_front = nose_y - 0.05
    # (cheek: dm higher up the cheeks, for a fuller beard of several days)
    top_side = (nose_y + mouth_y) / 2 + 0.1 + cheek
    top = np.interp(a, [0, 35, 70, 90], [top_front, top_side, top_side + 0.25 * rise, top_side + 0.6 * rise])
    lower = smoothstep(top + fade, top - fade, y)
    # stop on the neck: under the chin, fade out ~0.55 dm behind/below chin
    neck_fade = smoothstep(chin[1] - 0.95 * extent, chin[1] - 0.35 * extent, y)
    front = smoothstep(-5, 25, 90 - a)  # fade towards the ears
    m = lower * neck_fade * front
    if sideburn:
        sb = smoothstep(84, 74, np.abs(a - 84) + 74) * smoothstep(top_side + 1.1, top_side + 0.6, y) * smoothstep(top_side - 0.2, top_side + 0.2, y)
        m = np.maximum(m, sb * 0.9)
    # clear the lips
    lips_c = (lm[13] + lm[14]) / 2
    lr = np.linalg.norm(lm[61] - lm[291]) / 2
    # beard grows right under the lower lip (smaller lip_clear: a desmiled mouth is thinner than the smiling landmarks)
    dl = np.sqrt(((pos[..., 0] - lips_c[0]) / (lr * 1.05)) ** 2 + ((pos[..., 1] - lips_c[1]) / (lr * lip_clear)) ** 2)
    m *= smoothstep(0.85, 1.1, dl)
    if goatee > 0:
        # goatee: full density on the moustache and chin, light stubble on the cheeks
        gx = np.abs(pos[..., 0] - lips_c[0])
        shape = smoothstep(lr * 1.75, lr * 1.2, gx)
        m *= (1 - goatee) + goatee * (0.28 + 0.72 * shape)
    m *= np.clip(1 + fbm(m.shape, (40, 10), seed) * 0.35, 0, 1)
    m[~valid] = 0
    return np.clip(m, 0, 1)


def stubble(shape, density, seed=0, length=(2, 5), thickness=1, count_scale=1.0):
    """Coverage map of short dark hair strokes; density in [0,1] per texel."""
    H, W = shape
    rng = np.random.default_rng(seed)
    n = int(density.sum() * 0.9 * count_scale)
    if n <= 0:
        return np.zeros(shape, np.float32)
    flat = density.ravel().astype(np.float64)
    p = flat / flat.sum()
    idx = rng.choice(flat.size, size=n, p=p)
    ys, xs = np.divmod(idx, W)
    ang = rng.uniform(0, np.pi, n)
    ln = rng.uniform(length[0], length[1], n)
    img = np.zeros((H, W), np.uint8)
    dx = (np.cos(ang) * ln).astype(np.int32)
    dy = (np.sin(ang) * ln).astype(np.int32)
    inten = rng.integers(120, 255, n)
    for x, y, a, b, c in zip(xs, ys, dx, dy, inten):
        cv2.line(img, (int(x), int(y)), (int(x + a), int(y + b)), int(c), thickness, cv2.LINE_AA)
    return img.astype(np.float32) / 255.0


def normal_from_height(h, strength=2.0):
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3)
    n = np.dstack([-gx * strength, gy * strength, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    # to BGR 8-bit (OpenCV order): R=x, G=y, B=z
    rgb = (n * 0.5 + 0.5) * 255
    return np.clip(rgb[..., ::-1], 0, 255).astype(np.uint8)


def _hash3(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float32) / 65535.0


def noise3(p, seed=0):
    """Smooth value noise in 3D for an (N,3) array -> (N,) in [-1,1]."""
    p = np.asarray(p, np.float64)
    i = np.floor(p).astype(np.int64)
    f = p - i
    u = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
                out = out + w * _hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out * 2 - 1


def fbm3(p, octaves=3, seed=0):
    out = 0; a = 1; tot = 0
    for o in range(octaves):
        out = out + a * noise3(p * (2 ** o), seed + o)
        tot += a; a *= 0.5
    return out / tot
