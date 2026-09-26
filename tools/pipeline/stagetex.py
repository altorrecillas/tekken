"""Procedural PBR textures for the stages (tileable)."""
import os, sys
import numpy as np
import cv2

GAME = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def tile_noise(n, scale, seed, octaves=4):
    """Tileable fbm via summing periodic resized random grids."""
    rng = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0.0
    s = scale
    for o in range(octaves):
        g = max(2, int(n / s))
        r = rng.standard_normal((g, g)).astype(np.float32)
        # tileable upsample: wrap-pad then resize and crop
        rp = np.pad(r, 2, mode='wrap')
        big = cv2.resize(rp, ((g + 4) * n // g, (g + 4) * n // g), interpolation=cv2.INTER_CUBIC)
        off = 2 * n // g
        out += amp * big[off:off + n, off:off + n]
        tot += amp; amp *= 0.5; s /= 2
    return out / tot


def normal_map(h, strength):
    h = h.astype(np.float32)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 2 + (np.roll(np.roll(h, -1, 1), 1, 0) - np.roll(np.roll(h, 1, 1), 1, 0)) + (np.roll(np.roll(h, -1, 1), -1, 0) - np.roll(np.roll(h, 1, 1), -1, 0))
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 2 + (np.roll(np.roll(h, -1, 0), 1, 1) - np.roll(np.roll(h, 1, 0), 1, 1)) + (np.roll(np.roll(h, -1, 0), -1, 1) - np.roll(np.roll(h, 1, 0), -1, 1))
    n = np.dstack([-gx * strength, gy * strength, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return np.clip((n * 0.5 + 0.5)[..., ::-1] * 255, 0, 255).astype(np.uint8)


def save(name, alb, nrm, rough, ao=None, q=90, size=None):
    d = os.path.join(GAME, 'assets/stage')
    os.makedirs(d, exist_ok=True)
    def w(n, im):
        if size: im = cv2.resize(im, (size, size), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(d, n), im, [cv2.IMWRITE_JPEG_QUALITY, q])
    w(f'{name}_a.jpg', np.clip(alb, 0, 255).astype(np.uint8))
    w(f'{name}_n.jpg', nrm)
    # ORM packing: R = AO, G = roughness, B = metal(0)
    ao_ = np.ones_like(rough) if ao is None else ao
    orm = np.dstack([np.zeros_like(rough), np.clip(rough, 0, 1), np.clip(ao_, 0, 1)]) * 255  # BGR: B=metal, G=rough, R=ao
    w(f'{name}_orm.jpg', orm.astype(np.uint8))


def terracotta(n=2048, tiles=6, seed=1):
    rng = np.random.default_rng(seed)
    ts = n / tiles
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    tx = np.floor(xx / ts).astype(int); ty = np.floor(yy / ts).astype(int)
    fx = (xx % ts) / ts; fy = (yy % ts) / ts
    grout_w = 0.035
    edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy))
    tile_mask = np.clip((edge - grout_w * 0.5) / 0.012, 0, 1)
    bevel = np.clip((edge - grout_w * 0.5) / 0.05, 0, 1) ** 0.6
    # per tile colour
    base = np.array([66, 92, 150], np.float32)  # BGR terracotta (slightly desaturated)
    tcol = np.zeros((tiles, tiles, 3), np.float32)
    for i in range(tiles):
        for j in range(tiles):
            v = rng.normal(0, 1, 3)
            tcol[i, j] = base * (1 + v[0] * 0.07) + np.array([v[1] * 6, v[2] * 7, v[2] * 10])
    col = tcol[ty % tiles, tx % tiles]
    n1 = tile_noise(n, 256, seed + 1)[..., None]
    n2 = tile_noise(n, 24, seed + 2, 3)[..., None]
    n3 = tile_noise(n, 6, seed + 3, 2)[..., None]
    col = col * (1 + n1 * 0.12 + n2 * 0.06 + n3 * 0.05)
    # darker, burnt spots and lighter wear
    spots = np.clip(tile_noise(n, 40, seed + 4, 3) * 2 - 1.2, 0, 1)[..., None]
    col = col * (1 - spots * 0.25)
    wear = np.clip(tile_noise(n, 300, seed + 5, 3) * 1.5 - 0.6, 0, 1)[..., None]
    col = col * (1 - wear * 0.1) + np.array([150, 160, 170]) * wear * 0.08
    grout = np.array([69, 78, 94], np.float32) * (1 + n2 * 0.1) * (0.85 + 0.15 * n1)
    dirt = np.clip(1 - edge / 0.06, 0, 1)[..., None]
    col = col * (1 - dirt * 0.12)
    alb = col * tile_mask[..., None] + grout * (1 - tile_mask[..., None])
    h = bevel * 0.6 + n2[..., 0] * 0.08 + n3[..., 0] * 0.05 - (1 - tile_mask) * 0.3
    rough = 0.72 + n2[..., 0] * 0.05 + (1 - tile_mask) * 0.2 - wear[..., 0] * 0.1
    ao = 0.75 + 0.25 * np.clip(edge / 0.06, 0, 1)
    save('terracotta', alb, normal_map(h, 6.0), rough, ao)


def stucco(n=1024, seed=7):
    n1 = tile_noise(n, 128, seed)
    n2 = tile_noise(n, 12, seed + 1, 3)
    n3 = tile_noise(n, 3, seed + 2, 2)
    base = np.array([226, 232, 236], np.float32)
    alb = base[None, None] * (1 + n1[..., None] * 0.04 + n2[..., None] * 0.025)[..., :]
    stains = np.clip(tile_noise(n, 200, seed + 3) * 1.4 - 0.5, 0, 1)
    alb = alb * (1 - stains[..., None] * np.array([0.08, 0.06, 0.03]))
    h = n2 * 0.4 + n3 * 0.25
    save('stucco', alb, normal_map(h, 3.5), 0.88 + n2 * 0.04, 0.95 + n1 * 0.05)


def pool_tiles(n=1024, seed=11):
    """Small blue mosaic tiles (2.5 cm) with grout."""
    tiles = 32
    ts = n / tiles
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    tx = np.floor(xx / ts).astype(int); ty = np.floor(yy / ts).astype(int)
    fx = (xx % ts) / ts; fy = (yy % ts) / ts
    edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy))
    m = np.clip((edge - 0.05) / 0.03, 0, 1)
    pal = np.array([[190, 140, 40], [210, 160, 60], [170, 120, 30], [220, 180, 90], [200, 150, 50]], np.float32)
    idx = rng.integers(0, len(pal), (tiles, tiles))
    col = pal[idx[ty % tiles, tx % tiles]] * (1 + rng.normal(0, 0.05, (tiles, tiles))[ty % tiles, tx % tiles][..., None])
    grout = np.array([225, 225, 220], np.float32)
    alb = col * m[..., None] + grout * (1 - m[..., None])
    h = np.clip(edge / 0.12, 0, 1) ** 0.5 - (1 - m) * 0.3
    save('pooltile', alb, normal_map(h, 5.0), 0.15 + (1 - m) * 0.6, 0.85 + 0.15 * m)


def greek_key(n_w=1024, n_h=128):
    """Greek key (meander) border in dark blue on white, like the pool in the photo."""
    img = np.full((n_h, n_w, 3), (235, 235, 232), np.float32)
    blue = np.array([120, 50, 20], np.float32)
    u = n_h / 8.0
    period = int(u * 8)
    pat = np.zeros((n_h, period), np.uint8)
    # meander drawn on an 8x8 unit grid
    pts = [(1, 7), (1, 1), (7, 1), (7, 5), (3, 5), (3, 3), (5, 3)]
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        cv2.line(pat, (int(x0 * u), int(y0 * u)), (int(x1 * u), int(y1 * u)), 255, max(2, int(u * 0.9)))
    cv2.line(pat, (int(1 * u), int(7 * u)), (period, int(7 * u)), 255, max(2, int(u * 0.9)))
    full = np.tile(pat, (1, n_w // period + 1))[:, :n_w].astype(np.float32) / 255
    img = img * (1 - full[..., None]) + blue * full[..., None]
    img[:int(u * 0.35)] = blue; img[-int(u * 0.35):] = blue
    h = full * 0.1
    save('greekkey', img, normal_map(h, 2.0), 0.2 + full * 0.1, None)


def roof_tiles(n=1024, seed=21):
    """Spanish curved clay roof tiles (canal tiles)."""
    rows, cols = 10, 12
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = (xx / (n / cols)) % 1.0
    cy = (yy / (n / rows)) % 1.0
    ri = np.floor(yy / (n / rows)).astype(int)
    shift = (ri % 2) * 0.0
    arch = np.cos((cx - 0.5) * np.pi) ** 0.7
    over = np.clip(1 - cy * 1.2, 0, 1)
    h = arch * 0.8 + over * 0.2
    rng = np.random.default_rng(seed)
    tint = rng.normal(0, 1, (rows + 1, cols + 1))
    ci = np.floor(xx / (n / cols)).astype(int)
    base = np.array([50, 80, 150], np.float32)
    col = base * (1 + tint[ri % rows, ci % cols][..., None] * 0.08) * (0.65 + 0.35 * arch[..., None])
    n1 = tile_noise(n, 30, seed + 1, 3)
    col *= (1 + n1[..., None] * 0.08)
    moss = np.clip(tile_noise(n, 90, seed + 2) * 2 - 1.2, 0, 1)
    col = col * (1 - moss[..., None] * 0.3) + np.array([40, 70, 60]) * moss[..., None] * 0.3
    ao = 0.55 + 0.45 * arch * (0.6 + 0.4 * (1 - cy))
    save('roof', col * ao[..., None], normal_map(h, 4), 0.75 + n1 * 0.05, ao)


def stone(n=1024, seed=31):
    """Pale limestone coping / balustrade."""
    n1 = tile_noise(n, 180, seed)
    n2 = tile_noise(n, 10, seed + 1, 3)
    n3 = tile_noise(n, 3, seed + 2, 2)
    base = np.array([200, 212, 222], np.float32)
    alb = base * (1 + n1[..., None] * 0.05 + n2[..., None] * 0.04)
    pores = np.clip(-n3 * 3 - 1.8, 0, 1)
    alb *= (1 - pores[..., None] * 0.25)
    h = n2 * 0.3 + n3 * 0.2 - pores * 0.3
    save('stone', alb, normal_map(h, 3), 0.7 + n2 * 0.05, 0.9 + n1 * 0.05)


def facade(n=1024, seed=41):
    """Painted facade (ochre / white) plaster."""
    for name, bgr in (('facade_ochre', (110, 170, 215)), ('facade_white', (225, 228, 232)), ('facade_pink', (170, 175, 225))):
        n1 = tile_noise(n, 160, seed)
        n2 = tile_noise(n, 10, seed + 1, 3)
        alb = np.array(bgr, np.float32) * (1 + n1[..., None] * 0.06 + n2[..., None] * 0.03)
        drip = np.clip(tile_noise(n, 60, seed + 2) * 1.3 - 0.6, 0, 1) * np.linspace(0.3, 1, n)[:, None]
        alb *= (1 - drip[..., None] * 0.12)
        save(name, alb, normal_map(n2 * 0.4, 3), 0.9 + n2 * 0.03, None, size=512)


def wood(n=1024, seed=51):
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) / n
    n1 = tile_noise(n, 60, seed, 3)
    rings = np.sin((xx * 28 + n1 * 3) * np.pi * 2) * 0.5 + 0.5
    base = np.array([60, 95, 140], np.float32)
    alb = base * (0.75 + 0.35 * rings[..., None]) * (1 + tile_noise(n, 8, seed + 1, 2)[..., None] * 0.05)
    planks = ((yy * 8) % 1.0)
    gap = np.clip((np.minimum(planks, 1 - planks) - 0.01) / 0.01, 0, 1)
    alb *= (0.4 + 0.6 * gap[..., None])
    save('wood', alb, normal_map(rings * 0.2 + gap * 0.5, 3), 0.6 + rings * 0.1, 0.6 + 0.4 * gap)


def asphalt(n=2048, seed=61):
    n1 = tile_noise(n, 300, seed)
    n2 = tile_noise(n, 4, seed + 1, 2)
    n3 = tile_noise(n, 30, seed + 2, 3)
    agg = np.clip(n2 * 2.2 - 0.5, 0, 1)
    base = np.array([62, 64, 66], np.float32)
    alb = base * (1 + n1[..., None] * 0.1 + n3[..., None] * 0.05) + agg[..., None] * 40
    h = agg * 0.5 + n3 * 0.2
    save('asphalt', alb, normal_map(h, 6), 0.8 - agg * 0.2 + n1 * 0.05, 0.85 + agg * 0.15)


def pavers(n=1024, seed=71):
    """Sidewalk pavers (grey concrete tiles, 40 cm)."""
    tiles = 5
    ts = n / tiles
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    fx = (xx % ts) / ts; fy = (yy % ts) / ts
    tx = (xx // ts).astype(int); ty = (yy // ts).astype(int)
    edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy))
    m = np.clip((edge - 0.012) / 0.01, 0, 1)
    tint = rng.normal(0, 1, (tiles, tiles))
    base = np.array([150, 152, 150], np.float32)
    n1 = tile_noise(n, 90, seed + 1); n2 = tile_noise(n, 6, seed + 2, 2)
    col = base * (1 + tint[ty % tiles, tx % tiles][..., None] * 0.05 + n1[..., None] * 0.06 + n2[..., None] * 0.05)
    stains = np.clip(tile_noise(n, 140, seed + 3) * 1.6 - 0.8, 0, 1)
    col *= (1 - stains[..., None] * 0.2)
    grout = np.array([95, 98, 98], np.float32)
    alb = col * m[..., None] + grout * (1 - m[..., None])
    h = np.clip(edge / 0.05, 0, 1) ** 0.5 * 0.5 + n2 * 0.1
    save('pavers', alb, normal_map(h, 4), 0.82 + n1 * 0.05, 0.8 + 0.2 * m)


def road(n=2048, seed=81):
    """Asphalt with subtle tyre wear bands; road paint is done in the shader/decals."""
    n1 = tile_noise(n, 400, seed); n2 = tile_noise(n, 3, seed + 1, 2); n3 = tile_noise(n, 25, seed + 2, 3)
    agg = np.clip(n2 * 2.4 - 0.6, 0, 1)
    base = np.array([58, 60, 62], np.float32)
    # large-scale tone: patched areas and polished darker wheel paths break up the uniform grain
    big = tile_noise(n, 900, seed + 4, 2)
    yy = np.linspace(0, 1, n, endpoint=False)[None, :]
    wheel = (np.exp(-((yy - 0.3) / 0.05) ** 2) + np.exp(-((yy - 0.7) / 0.05) ** 2)) * np.ones((n, 1))
    alb = base * (1 + n1[..., None] * 0.1 + n3[..., None] * 0.04 + big[..., None] * 0.08 - wheel[..., None] * 0.06) + agg[..., None] * 12
    cracks = np.clip(np.abs(tile_noise(n, 120, seed + 3, 3)) < 0.012, 0, 1).astype(np.float32)
    alb *= (1 - cracks[..., None] * 0.35)
    h = agg * 0.35 + n3 * 0.2 - cracks * 0.5
    save('road', alb, normal_map(h, 2.5), 0.78 - agg * 0.08 + n1 * 0.05 - wheel * 0.08, 0.85 + agg * 0.1)


if __name__ == '__main__':
    what = sys.argv[1:] or ['terracotta', 'stucco', 'pool_tiles', 'greek_key', 'roof_tiles', 'stone', 'facade', 'wood', 'asphalt']
    for w in what:
        print('gen', w)
        globals()[w]()
