"""New Balance trainers for the fighters who wear them (the user, 2026-10-23: Alejandro, Rafa and Zapponi). The
MakeHuman shoe textures are photos of other brands' shoes (shoes05 has three stripes, shoes06 a swoosh), so this
paints a new shoe from its 3D shape instead: upper panels, midsole, tread, laces, the N on both sides, and the sock
(the shoe proxy's ankle sleeve is the sock these fighters wear).
Every texel is painted from its point on the shoe (height, distance to the toe, side), not from where it lies in the
texture, so the panels run on across the UV seams. The two shoes share one mirrored UV layout, and a letter painted
once would read backwards on one foot: the left shoe keeps the left half of a texture twice as wide and the right shoe
takes the right half (its UVs are moved once; the part is marked 'uvSplit' in mesh.json, and running this again
repaints without moving them twice).
Writes shoes.jpg (colour), shoes_n.jpg (normal map: the N's edge, stitching, laces, perforations, mesh, tread, the
sock's ribs) and shoes_r.jpg (roughness: leather, suede, mesh, rubber), and points the shoes material at them.
usage: python3 nbshoes.py <char dir> <design> [--preview out.png]
  designs: court_white (white leather court shoe, navy N), freshfoam_lime (lime running shoe, outlined N),
  574_grey (grey suede and mesh, white N). --preview writes side and top views of the result and touches nothing."""
import os, sys, json

import numpy as np
import cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshfmt
from raster import raster_uv_ids, barycentric, vertex_normals

SS = 2          # supersampling: painted at twice the size, then averaged down (smooth edges)
RES = 1024      # texels per shoe (the texture is 2 * RES wide)


def srgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


DESIGNS = {
    # Alejandro's photo: white leather court trainers, a black heel tab, white sole, grey laces, white socks
    'court_white': dict(
        upper='leather', base='#efeeea', overlay='#f3f2ee', overlay_kind='leather', toecap='perf',
        collar='#f1f0ec', heeltab='#1b1b1d', heelcounter=True, mudguard=False, eyestay='#f3f2ee',
        n_fill='#1e2a4a', n_line=None, n_stitch='#2b385c', n_h=0.048, n_y=0.38,
        mid='#f2f1ec', mid_stitch=True, mid_heel=0.023, mid_fore=0.020, toe_bumper=0.004,
        sole='#d9d5cc', tread='herring', laces='#9ea3aa', laces_fleck='#2a2c30', stitch='#bdbab2',
        lining='#2a2a2c', sock='#ededeb', label='#1e2a4a'),
    # Rafa's photo: lime running shoes (a Fresh Foam), white midsole, darker outlined N, black socks
    'freshfoam_lime': dict(
        upper='mesh', base='#a8f03e', overlay='#a0e63a', overlay_kind='mesh', toecap='bumper',
        collar='#a4ec3c', heeltab='#9ce236', heelcounter=False, mudguard=False, eyestay='#9ee438',
        n_fill=None, n_line='#355d61', n_stitch=None, n_h=0.050, n_stroke=0.0032,
        mid='#f1f1ee', mid_stitch=False, mid_heel=0.032, mid_fore=0.023, toe_bumper=0.003, mid_hex=True,
        sole='#5d6466', tread='hex', laces='#b0f04a', laces_fleck=None, stitch='#88b82a',
        lining='#2b3a1e', sock='#1c1c1e', label='#3e6467'),
    # no photo of Zapponi's feet: the classic grey 574 (suede overlays on mesh, white N with a silver edge)
    '574_grey': dict(
        upper='mesh', base='#a9acaf', overlay='#7f8286', overlay_kind='suede', toecap='suede',
        collar='#8a8d91', heeltab='#5f6266', heelcounter=True, mudguard=True, eyestay='#7f8286',
        n_fill='#f1f0ec', n_line='#55595e', n_stitch='#d0d0cf', n_h=0.046,
        mid='#dcd9d2', mid_stitch=False, mid_heel=0.028, mid_fore=0.020, toe_bumper=0.002,
        sole='#3a3b3d', tread='hex', laces='#b5b7b9', laces_fleck=None, stitch='#686b6f',
        lining='#55585c', sock='#cfd0d1', label='#2a2c30'),
}


# ------------------------------------------------------------------ noise (from 3D points: seamless across UV seams)
def value_noise(p, freq, seed):
    """trilinear value noise in [-1, 1] of the points p (N, 3), lattice spacing 1 / freq"""
    rng = np.random.default_rng(seed)
    tab = rng.uniform(-1, 1, 4096).astype(np.float32)
    q = p * freq
    i = np.floor(q).astype(np.int64); f = (q - i).astype(np.float32)
    f = f * f * (3 - 2 * f)

    def h(dx, dy, dz):
        return tab[((i[:, 0] + dx) * 73856093 ^ (i[:, 1] + dy) * 19349663 ^ (i[:, 2] + dz) * 83492791) & 4095]
    x00 = h(0, 0, 0) * (1 - f[:, 0]) + h(1, 0, 0) * f[:, 0]
    x10 = h(0, 1, 0) * (1 - f[:, 0]) + h(1, 1, 0) * f[:, 0]
    x01 = h(0, 0, 1) * (1 - f[:, 0]) + h(1, 0, 1) * f[:, 0]
    x11 = h(0, 1, 1) * (1 - f[:, 0]) + h(1, 1, 1) * f[:, 0]
    y0 = x00 * (1 - f[:, 1]) + x10 * f[:, 1]
    y1 = x01 * (1 - f[:, 1]) + x11 * f[:, 1]
    return y0 * (1 - f[:, 2]) + y1 * f[:, 2]


def fbm(p, freq, seed, octaves=3):
    s, a, t = 0, 1.0, 0
    for k in range(octaves):
        s = s + a * value_noise(p, freq * 2 ** k, seed + k); t += a; a *= 0.5
    return s / t


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ the N
NW = 0.94 + 0.22  # the N's width with its slant, in N heights


def n_polygons():
    """the N as polygons in a unit box (x right, y up), italic. Stems, then the diagonal from top left to bottom right"""
    w, st, dg = 0.94, 0.27, 0.42
    polys = [[(0, 0), (st, 0), (st, 1), (0, 1)], [(w - st, 0), (w, 0), (w, 1), (w - st, 1)],
             [(0, 1), (dg, 1), (w, 0), (w - dg, 0)]]
    sl = 0.22  # italic slant
    return [[(x + sl * y, y) for x, y in p] for p in polys]


def n_canvas(px=1200):
    """the N rasterized into a square canvas: signed distance (in units of the N's height, + inside) for fills,
    outlines and the bevel of the normal map"""
    img = np.zeros((px, px), np.uint8)
    pad = 0.2
    sc = px / (NW + 2 * pad)
    for p in n_polygons():
        pts = np.array([[(x + pad) * sc, px - 1 - (y + pad + 0.12) * sc] for x, y in p], np.float64)
        cv2.fillPoly(img, [np.round(pts * 16).astype(np.int32)], 255, lineType=cv2.LINE_8, shift=4)
    inside = cv2.distanceTransform((img > 0).astype(np.uint8), cv2.DIST_L2, 5)
    outside = cv2.distanceTransform((img == 0).astype(np.uint8), cv2.DIST_L2, 5)
    sd = (inside - outside) / sc  # in N heights
    return sd.astype(np.float32), sc, pad


def sample2d(img, x, y):
    """bilinear sample of a 2D float array at pixel coords (arrays of any shape)"""
    sh = x.shape
    cols = 4096
    n = x.size
    rows = (n + cols - 1) // cols
    padn = rows * cols - n
    mx = np.concatenate([x.ravel(), np.full(padn, -1)]).astype(np.float32).reshape(rows, cols)
    my = np.concatenate([y.ravel(), np.full(padn, -1)]).astype(np.float32).reshape(rows, cols)
    out = cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=-1.0)
    return out.ravel()[:n].reshape(sh)


# ------------------------------------------------------------------ the shoe's texels
def islands(tris, nv):
    par = np.arange(nv)

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a
    for t in tris:
        a, b, c = find(t[0]), find(t[1]), find(t[2])
        par[b] = a; par[find(c)] = a
    return np.array([find(t[0]) for t in tris])


def texels(v, uv, tris, R):
    """the covered texels of the left shoe's UV layout at R x R: positions, normals, island, metres per texel"""
    sel = v[tris].mean(1)[:, 0] > 0
    t = tris[sel]
    px = np.stack([uv[:, 0] * R, (1 - uv[:, 1]) * R], 1)
    ids = raster_uv_ids(px, t, R, R)
    ys, xs, ti, bc = barycentric(ids, px, t)
    vn = vertex_normals(v, tris)
    pos = (v[t[ti]] * bc[..., None]).sum(1)
    nor = (vn[t[ti]] * bc[..., None]).sum(1)
    nor /= np.linalg.norm(nor, axis=1, keepdims=True) + 1e-12
    isl = islands(t, len(v))
    # metres per texel of each triangle (square root of the 3D area over the texel area)
    a3 = np.linalg.norm(np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]]), axis=1)
    p2 = px[t]
    e1, e2 = p2[:, 1] - p2[:, 0], p2[:, 2] - p2[:, 0]
    a2 = np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]) + 1e-9
    mpt = np.sqrt(a3 / a2)
    cx = v[np.unique(t)][:, 0].mean()
    return dict(ys=ys, xs=xs, l=pos[:, 0] - cx, y=pos[:, 1], z=pos[:, 2], n=nor, isl=isl[ti], mpt=mpt[ti],
                u=xs / R)


def profile(z, val, mask, fn, bins):
    """a smooth function of z: fn (min / max) of val per bin, interpolated"""
    c = (bins[:-1] + bins[1:]) / 2
    out = np.full(len(c), np.nan)
    for k in range(len(c)):
        s = mask & (z >= bins[k]) & (z < bins[k + 1])
        if s.any():
            out[k] = fn(val[s])
    ok = ~np.isnan(out)
    out = np.interp(c, c[ok], out[ok])
    out = np.convolve(np.pad(out, 2, mode='edge'), np.ones(5) / 5, mode='valid')
    return lambda q: np.interp(q, c, out)


# ------------------------------------------------------------------ painting
def paint(T, D, reading):
    """colour (sRGB 0..1), height (mm) and roughness of every texel of one shoe. reading = +1 / -1: the direction
    (along +z) in which the N reads on the lateral side of this shoe; the medial side reads the other way"""
    n = len(T['y'])
    l, y, z, N = T['l'], T['y'], T['z'], T['n']
    P = np.stack([l, y, z], 1)
    isl = T['isl']
    ids, cnt = np.unique(isl, return_counts=True)
    meany = {i: y[isl == i].mean() for i in ids}
    meanny = {i: N[isl == i, 1].mean() for i in ids}
    sole_i = min(ids, key=lambda i: meanny[i])
    sock_i = max(ids, key=lambda i: meany[i])
    sole = isl == sole_i
    sock = isl == sock_i
    upper = ~sole & ~sock
    col = np.zeros((n, 3), np.float32); hgt = np.zeros(n, np.float32); rough = np.full(n, 0.7, np.float32)

    bins = np.linspace(-0.06, 0.225, 30)
    ybot = profile(z, y, upper | sole, np.min, bins)
    ytop = profile(z, y, upper, np.max, bins)
    # the top of the vamp: where the upper is highest across each slice (the laces run along it; behind the tongue
    # the opening's lining would pull it sideways, so the line stops there and runs on straight)
    zr = np.linspace(0.065, 0.2, 15)
    lc = []
    for k in range(len(zr) - 1):
        s = upper & (z >= zr[k]) & (z < zr[k + 1]) & (N[:, 1] > 0.5)
        lc.append(np.average(l[s], weights=np.maximum(N[s, 1] - 0.5, 1e-3) ** 4) if s.sum() > 10 else np.nan)
    lc = np.array(lc); okc = ~np.isnan(lc)
    zc = (zr[:-1] + zr[1:]) / 2
    lcen = lambda q: np.interp(q, zc[okc], lc[okc])
    lrel = l - lcen(z)                       # across the vamp from its top line
    side = np.where(l >= lcen(z), 1.0, -1.0)  # +1 lateral, -1 medial
    nside = np.abs(N[:, 0])

    # midsole line: thicker at the heel, wrapping up round the toe
    th = D['mid_fore'] + (D['mid_heel'] - D['mid_fore']) * smooth(0.12, -0.03, z)
    th = th + D['toe_bumper'] * smooth(0.18, 0.215, z)
    yms = ybot(z) + th
    span = np.maximum(ytop(z) - yms, 0.01)
    h = np.clip((y - yms) / span, -1, 2)   # 0 at the midsole, 1 at the top edge of the upper
    mid = upper & (y < yms)
    up = upper & ~mid

    grain = fbm(P, 900, 1, 3)              # fine leather grain
    blot = fbm(P, 60, 7, 2)                # broad tone variation (a real material is never flat)

    # ---- upper base material
    base = srgb(D['base'])
    col[up] = base
    if D['upper'] == 'leather':
        col[up] *= (1 + 0.025 * grain[up] + 0.015 * blot[up])[:, None]
        hgt[up] += 0.03 * grain[up]; rough[up] = 0.42
    else:
        # engineered mesh: a fine hex dot grid, projected from the side and from above, blended by the normal
        def hexgrid(a, b, pitch):
            a = a / pitch; b = b / (pitch * 0.866)
            r = np.round(b); a2 = a - 0.5 * (r % 2)
            d = np.hypot(a2 - np.round(a2), (b - r) * 0.866)
            return d                                     # 0 at a hole's centre
        ws = nside ** 3; wt = np.abs(N[:, 1]) ** 3; wf = np.abs(N[:, 2]) ** 3
        sw = ws + wt + wf + 1e-6
        dd = (hexgrid(z, y, 0.0024) * ws + hexgrid(z, l, 0.0024) * wt + hexgrid(l, y, 0.0024) * wf) / sw
        hole = smooth(0.30, 0.22, dd)
        col[up] *= (1 - 0.12 * hole[up] + 0.02 * blot[up])[:, None]
        hgt[up] += -0.25 * hole[up] + 0.04 * grain[up]; rough[up] = 0.78

    def overlay(mask, color, kind, edge_d=None, stitch_param=None):
        """a panel sewn on top: its colour, a raised edge and a row of stitches 1.6 mm inside its edge"""
        c = srgb(color)
        m = mask & up
        col[m] = c
        if kind == 'suede':
            nap = fbm(P[m], 1800, 3, 2)
            col[m] *= (1 + 0.06 * nap + 0.03 * blot[m])[:, None]; rough[m] = 0.92; hgt[m] += 0.35 + 0.03 * nap
        elif kind == 'leather':
            col[m] *= (1 + 0.025 * grain[m])[:, None]; rough[m] = 0.40; hgt[m] += 0.35 + 0.03 * grain[m]
        else:
            col[m] *= (1 + 0.02 * blot[m])[:, None]; hgt[m] += 0.25
        if edge_d is not None:
            # (edge_d: metres inside the panel's edge) a bevel at the edge, then the stitches
            e = edge_d[m]
            hgt[m] -= 0.3 * smooth(0.0012, 0.0, e)
            if stitch_param is not None and D['stitch']:
                dash = (np.sin(stitch_param[m] / 0.0026 * 2 * np.pi) > -0.1)
                s = (np.abs(e - 0.0016) < 0.0005) & dash
                cs = srgb(D['stitch'])
                col[m] = np.where(s[:, None], cs, col[m]); hgt[m] -= 0.12 * s
                gap = (np.abs(e - 0.0016) < 0.0006) & ~s
                hgt[m] -= 0.08 * gap

    # ---- panels (distances in metres from their edges, + inside)
    hm = span  # metres per unit of h
    eyestay_d = None
    if D['heelcounter']:
        zlim = 0.010 + 0.030 * (1 - np.clip(h, 0, 1)) ** 1.5
        d = np.minimum(zlim - z, (0.80 - h) * hm)
        overlay(d > 0, D['overlay'], D['overlay_kind'], d, y + 0.3 * z)
    if D['mudguard']:
        d = (0.17 - h) * hm
        overlay((d > 0) & (z > -0.0), D['overlay'], D['overlay_kind'], d, z)
    # toe cap
    if D['toecap'] in ('suede', 'perf'):
        d = z - (0.160 + 0.016 * np.clip(h, 0, 1.2))
        if D['toecap'] == 'suede':
            overlay(d > 0, D['overlay'], 'suede', d, y + np.abs(lrel))
        else:
            # a white leather toe with perforations (court shoe), sewn on with one row of stitches
            m = up & (d > 0)
            e = d[m]
            hgt[m] -= 0.25 * smooth(0.0010, 0.0, e)
            dash = np.sin((y[m] + np.abs(lrel[m])) / 0.0026 * 2 * np.pi) > -0.1
            s = (np.abs(e - 0.0016) < 0.00035) & dash
            col[m] = np.where(s[:, None], srgb(D['stitch']), col[m]); hgt[m] -= 0.12 * s
            # perforations: rows across the toe, from above
            pa, pb = z[m] / 0.0042, lrel[m] / 0.0042
            r = np.round(pa); pb2 = pb - 0.5 * (r % 2)
            dd = np.hypot(pa - r, pb2 - np.round(pb2)) * 0.0042
            holes = smooth(0.00075, 0.00045, dd) * smooth(0.003, 0.006, e) * smooth(0.25, 0.5, N[m, 1])
            col[m] *= (1 - 0.45 * holes)[:, None]; hgt[m] -= 0.5 * holes
    elif D['toecap'] == 'bumper':
        d = (0.006 - (y - yms)) * (z > 0.17)
        m = up & (d > 0)
        col[m] = srgb(D['overlay']) * 0.92; hgt[m] += 0.2; rough[m] = 0.6
    # eyestay: the band either side of the laces
    es = up & (z > 0.055) & (z < 0.163) & (np.abs(lrel) > 0.011) & (np.abs(lrel) < 0.024) & (N[:, 1] > 0.25)
    eyestay_d = np.minimum(np.abs(lrel) - 0.011, 0.024 - np.abs(lrel))
    overlay(es, D['eyestay'], D['overlay_kind'], eyestay_d, z)
    # padded collar round the opening, and the heel tab
    cd = ytop(z) - y
    coll = up & (cd < 0.011) & (z < 0.07)
    col[coll] = srgb(D['collar']) * (1 + 0.03 * blot[coll])[:, None]
    hgt[coll] += 0.5 * smooth(0.011, 0.006, cd[coll]); rough[coll] = 0.85
    tab = up & (cd < 0.016) & (z < -0.035)
    col[tab] = srgb(D['heeltab']) * (1 + 0.03 * grain[tab])[:, None]; hgt[tab] += 0.4; rough[tab] = 0.5
    # lining seen over the top edge (inside the opening the back faces are darkened by the material)
    lin = up & (cd < 0.0025) & (z < 0.07)
    col[lin] = srgb(D['lining'])

    # ---- tongue and laces (seen from above, along the vamp's top line)
    tongue = up & (np.abs(lrel) <= 0.011) & (z > 0.04) & (z < 0.163)
    col[tongue] = srgb(D['base']) * 0.93; hgt[tongue] -= 0.3; rough[tongue] = 0.8
    lab = up & (np.abs(lrel) < 0.0075) & (z > 0.052) & (z < 0.068) & (N[:, 1] > 0.0)
    col[lab] = srgb(D['label']); hgt[lab] += 0.15; rough[lab] = 0.6
    # the tongue's woven tag carries a small N
    sd, sc, pad = n_canvas(400)
    # (reading across the shoe from the wearer's view: the tag faces up, its letter upright towards the toe)
    xx = ((-lrel / 0.011 + 0.5 + pad) * sc); yy = (sd.shape[0] - 1 - ((z - 0.0545) / 0.011 + pad + 0.12) * sc)
    tagN = (sample2d(sd, xx, yy) > 0) & lab
    col[tagN] = np.array([0.93, 0.93, 0.92]); hgt[tagN] += 0.1
    # laces: crossing between eyelets 13 mm apart, raised and rounded; at every crossing one lace lies over the
    # other (alternating), shades it at its edge, and each casts a soft contact shadow on the tongue
    ez = np.arange(0.078, 0.160, 0.0135)
    lw = 0.0034
    act = up & (z > 0.07) & (z < 0.166) & (np.abs(lrel) < 0.021)
    a = np.stack([z[act], lrel[act]], 1)
    segs = [(np.array([ez[0], -0.0145]), np.array([ez[0], 0.0145]), 0.0)]   # the bar across the top pair
    for k in range(len(ez) - 1):
        for s0 in (-1, 1):
            over = 0.5 if (k + (s0 > 0)) % 2 else 0.0
            segs.append((np.array([ez[k], s0 * 0.0145]), np.array([ez[k + 1], -s0 * 0.0145]), over))
    top_h = np.zeros(len(a)); top_p = np.zeros(len(a)); top_t = np.zeros(len(a)); top_d = np.zeros(len(a))
    top_lift = np.full(len(a), -1.0); dmin = np.full(len(a), 9.0)
    for p0, p1, lift in segs:
        dvec = p1 - p0; L = np.linalg.norm(dvec); tt = np.clip(((a - p0) @ dvec) / (L * L), 0, 1)
        q = a - (p0 + tt[:, None] * dvec)
        dist = np.linalg.norm(q, axis=1)
        dmin = np.minimum(dmin, dist)
        pr = np.sqrt(np.clip(1 - (dist / lw) ** 2, 0, 1))
        hh = np.where(pr > 0, pr * 1.4 + lift, -1)
        better = hh > top_h - (top_lift < 0) * 9
        better &= pr > 0
        top_h = np.where(better, hh, top_h); top_p = np.where(better, pr, top_p); top_t = np.where(better, tt * L, top_t)
        top_d = np.where(better, (q[:, 0] * -dvec[1] + q[:, 1] * dvec[0]) / L, top_d)
        top_lift = np.where(better, lift, top_lift)
    on = top_lift >= 0
    idx = np.nonzero(act)[0]
    lcol = srgb(D['laces'])
    # a braided lace: fine chevrons along it
    weave = 0.07 * np.sin(2 * np.pi * (top_t / 0.0013 + np.abs(top_d) / 0.0009))
    shade = 0.74 + 0.26 * top_p + weave
    # the lower lace in the shadow of the one crossing over it
    under = on & (top_lift == 0.0)
    near_over = np.zeros(len(a), bool)
    for p0, p1, lift in segs:
        if lift <= 0:
            continue
        dvec = p1 - p0; tt = np.clip(((a - p0) @ dvec) / (dvec @ dvec), 0, 1)
        near_over |= np.linalg.norm(a - (p0 + tt[:, None] * dvec), axis=1) < lw * 1.35
    shade = np.where(under & near_over, shade * 0.72, shade)
    li = idx[on]
    col[li] = lcol * shade[on, None]
    if D['laces_fleck']:
        fl = fbm(P[li], 2500, 11, 1) > 0.55
        col[li] = np.where(fl[:, None], srgb(D['laces_fleck']) * shade[on, None], col[li])
    hgt[li] += top_h[on]; rough[li] = 0.85
    # contact shadow round the laces on the tongue
    cs_ = ~on & (dmin < lw * 1.7)
    col[idx[cs_]] *= (0.80 + 0.20 * smooth(lw, lw * 1.7, dmin[cs_]))[:, None]
    lm = np.zeros(n, bool); lm[li] = True
    # eyelets: small rings in the eyestay
    for zk in ez:
        for s0 in (-1, 1):
            dd = np.hypot(z - zk, lrel - s0 * 0.0155)
            ring = up & (dd < 0.0022) & (dd > 0.0011) & ~lm
            col[ring] *= 0.75; hgt[ring] -= 0.2

    # ---- midsole
    mcol = srgb(D['mid'])
    col[mid] = mcol * (1 + 0.012 * grain[mid] + 0.01 * blot[mid])[:, None]
    rough[mid] = 0.62
    ym = y - ybot(z)
    hgt[mid] += 0.6 * smooth(0.0, 0.0015, (yms - y)[mid])         # the upper's edge sits in the midsole
    # the joint between upper and sole: a dark groove all round
    jn = upper & (np.abs(y - yms) < 0.0007)
    col[jn] *= 0.72; hgt[jn] -= 0.4
    if D['mid_stitch']:
        # cupsole: a stitched band 5 mm under its top edge and fine horizontal grooves below
        e = (yms - y)[mid]
        dash = np.sin((z[mid] + 0.3 * l[mid]) / 0.0028 * 2 * np.pi) > -0.1
        s = (np.abs(e - 0.0045) < 0.0004) & dash
        col[mid] = np.where(s[:, None], srgb('#c9c6be'), col[mid]); hgt[mid] -= 0.15 * s
        gro = (np.sin(ym[mid] / 0.0021 * 2 * np.pi) > 0.85) & (e > 0.008)
        hgt[mid] -= 0.2 * gro; col[mid] *= (1 - 0.05 * gro)[:, None]
    if D.get('mid_hex'):
        # sculpted foam: shallow hexagonal cells along the sidewall
        a2, b2 = z[mid] / 0.0065, ym[mid] / (0.0065 * 0.866)
        r = np.round(b2); a3 = a2 - 0.5 * (r % 2)
        dd = np.hypot(a3 - np.round(a3), (b2 - r) * 0.866)
        cell = smooth(0.42, 0.30, dd) * smooth(0.002, 0.006, ym[mid]) * smooth(0.002, 0.005, (yms - y)[mid])
        hgt[mid] -= 0.35 * cell; col[mid] *= (1 - 0.06 * cell)[:, None]
    # a bit of wear near the ground
    dirt = smooth(0.006, 0.0, ym) * (upper | sole)
    col *= (1 - 0.10 * dirt * (0.6 + 0.4 * blot))[:, None]

    # ---- outsole (seen from below)
    sc_ = srgb(D['sole'])
    col[sole] = sc_ * (1 + 0.04 * grain[sole] + 0.03 * blot[sole])[:, None]
    rough[sole] = 0.75
    zs, ls = z[sole], l[sole]
    if D['tread'] == 'herring':
        q = (zs + np.abs(ls) * 0.9) / 0.0038
        g = np.abs(q - np.round(q)) < 0.18
    else:
        a2, b2 = zs / 0.009, ls / (0.009 * 0.866)
        r = np.round(b2); a3 = a2 - 0.5 * (r % 2)
        g = np.hypot(a3 - np.round(a3), (b2 - r) * 0.866) > 0.40
    hgt[sole] -= 0.8 * g; col[sole] *= (1 - 0.25 * g)[:, None]
    # an N in the arch of the outsole
    sd2, sc2, pad2 = n_canvas(500)
    xs_ = ((-(zs - 0.065) * reading) / 0.03 + 0.5 + pad2) * sc2
    ys_ = sd2.shape[0] - 1 - ((ls - lcen(np.clip(zs, 0.05, 0.19)) * 0) / 0.03 + 0.5 + pad2 + 0.12) * sc2
    so = sample2d(sd2, xs_, ys_)
    soN = so > 0
    col[np.nonzero(sole)[0][soN]] *= 1.25; hgt[np.nonzero(sole)[0][soN]] += 0.4

    # ---- the N on both sides
    sdn, scn, padn = n_canvas(1200)
    Hn = D['n_h']
    for sd_ in (1, -1):  # lateral, medial
        out = N[:, 0] * sd_      # facing out of this side (the lining inside the opening faces the other way)
        m = up & (side == sd_) & (out > 0.12)
        if not m.any():
            continue
        dirr = reading * sd_     # +1: reads towards the toe
        zc0 = 0.063
        yc0 = yms[m] + D.get('n_y', 0.40) * span[m]
        xn = (z[m] - zc0) * dirr / Hn + NW / 2
        yn = (y[m] - yc0) / Hn + 0.5
        X = (xn + padn) * scn; Y = sdn.shape[0] - 1 - (yn + padn + 0.12) * scn
        d = sample2d(sdn, X, Y) * Hn          # metres, + inside
        d = np.where(d < -0.5 * Hn, -1, d)
        fade = smooth(0.12, 0.3, out[m])
        idx = np.nonzero(m)[0]
        if D.get('n_fill'):
            fill = d > 0
            cf = srgb(D['n_fill'])
            col[idx[fill]] = cf * (1 + 0.02 * grain[idx[fill]])[:, None] * fade[fill, None] + col[idx[fill]] * (1 - fade[fill, None])
            hgt[idx[fill]] += (0.55 * smooth(0.0, 0.0012, d[fill])) * fade[fill]
            rough[idx[fill]] = 0.45
            if D.get('n_line'):
                ln = (d > 0) & (d < 0.0014)
                col[idx[ln]] = srgb(D['n_line']) * fade[ln, None] + col[idx[ln]] * (1 - fade[ln, None])
            if D.get('n_stitch'):
                dash = np.sin((z[m] * 0.7 + y[m]) / 0.0024 * 2 * np.pi) > -0.1
                s = (np.abs(d - 0.0011) < 0.0003) & dash & (d > 0)
                col[idx[s]] = srgb(D['n_stitch']); hgt[idx[s]] -= 0.12
        else:
            # an outlined N: a raised band along the letter's edge, the upper showing through
            w = D.get('n_stroke', 0.003)
            ln = (d > 0) & (d < w)
            col[idx[ln]] = srgb(D['n_line']) * fade[ln, None] + col[idx[ln]] * (1 - fade[ln, None])
            hgt[idx[ln]] += 0.35 * fade[ln]; rough[idx[ln]] = 0.5

    # ---- sock: knit ribs round the leg, a tighter cuff at the top
    sk = sock
    rib = np.sin(T['u'][sk] * RES * SS / (2.2 * SS) * 2 * np.pi)
    cuff = smooth(0.192, 0.196, y[sk])
    rib2 = np.sin(T['u'][sk] * RES * SS / (1.4 * SS) * 2 * np.pi)
    r_ = rib * (1 - cuff) + rib2 * cuff
    scol = srgb(D['sock'])
    col[sk] = scol * (1 + 0.05 * r_ + 0.02 * blot[sk])[:, None] * (1 - 0.04 * cuff)[:, None]
    hgt[sk] = 0.25 * r_; rough[sk] = 0.95
    return np.clip(col, 0, 1), hgt, rough


def normal_from_height(Hm, mpt_img, cover):
    """tangent-space normal map (OpenGL: green = +v) from a height map in mm, with the metres per texel"""
    gx = cv2.Sobel(Hm, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(Hm, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    s = np.maximum(mpt_img * 1000.0, 1e-3)      # mm per texel
    nx = -gx / s; ny = gy / s                   # (rows run down the image, v up)
    nz = np.ones_like(nx)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    nm = np.stack([nz / l, ny / l, nx / l], -1)  # BGR for cv2: b = z, g = y, r = x
    nm = (nm * 0.5 + 0.5)
    nm[~cover] = (1.0, 0.5, 0.5)
    return nm


def bleed(img, cover, it=24):
    """fill the empty texels round the islands with their neighbours' colour (no dark seams in the mipmaps)"""
    img = img.copy(); m = cover.copy()
    k = np.ones((3, 3), np.float32)
    for _ in range(it):
        if m.all():
            break
        w = cv2.filter2D(m.astype(np.float32), -1, k, borderType=cv2.BORDER_CONSTANT)
        s = cv2.filter2D(img * m[..., None] if img.ndim == 3 else img * m, -1, k, borderType=cv2.BORDER_CONSTANT)
        new = (w > 0) & ~m
        if img.ndim == 3:
            img[new] = s[new] / w[new][:, None]
        else:
            img[new] = s[new] / w[new]
        m = m | new
    return img


def build(cdir, design, preview=None):
    D = DESIGNS[design]
    meta, parts = meshfmt.load(cdir)
    pi = [p['name'] for p in meta['parts']].index('shoes')
    P = parts[pi]
    v = P['position'].astype(np.float64); uv = P['uv'].astype(np.float64).copy(); tris = P['index'].reshape(-1, 3)
    left = v[:, 0] > 0
    split = bool(meta['parts'][pi].get('uvSplit'))
    if split:  # back to the shared layout
        uv[left, 0] = uv[left, 0] * 2; uv[~left, 0] = (uv[~left, 0] - 0.5) * 2
    R = RES * SS
    T = texels(v, uv, tris, R)
    cover = np.zeros((R, R), bool); cover[T['ys'], T['xs']] = True
    mpt = np.zeros((R, R), np.float32); mpt[T['ys'], T['xs']] = T['mpt']
    mpt = bleed(mpt, cover, 4)
    out_c, out_n, out_r = [], [], []
    # the left shoe (x > 0) faces +x on its lateral side: seen from there the toe points to the viewer's left, so
    # its N reads towards the heel (-z); the right shoe's lateral N reads towards the toe
    for reading in (-1, 1):
        c, hgt, r = paint(T, D, reading)
        C = np.zeros((R, R, 3), np.float32); Hh = np.zeros((R, R), np.float32); Rr = np.zeros((R, R), np.float32)
        C[T['ys'], T['xs']] = c[:, ::-1]; Hh[T['ys'], T['xs']] = hgt; Rr[T['ys'], T['xs']] = r
        Hh = bleed(Hh, cover, 6)
        nm = normal_from_height(cv2.GaussianBlur(Hh, (0, 0), 0.6), mpt / 1.0, cover)
        C = bleed(C, cover); Rr = bleed(Rr, cover)
        down = lambda a: cv2.resize(a, (RES, RES), interpolation=cv2.INTER_AREA)
        out_c.append(down(C)); out_n.append(down(nm)); out_r.append(down(Rr))
    C = np.concatenate(out_c, 1); NM = np.concatenate(out_n, 1); RG = np.concatenate(out_r, 1)
    if preview:
        cv2.imwrite(preview, (np.clip(C, 0, 1) * 255).astype(np.uint8))
        cv2.imwrite(preview.replace('.png', '_n.png'), (np.clip(NM, 0, 1) * 255).astype(np.uint8))
        return C, NM, RG, T
    # (the relief and the roughness at half and a quarter of the size: the shoes are small on screen, and the
    # download stays close to the old single texture's)
    q8 = lambda a: (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
    half = lambda a, k: cv2.resize(a, (a.shape[1] // k, a.shape[0] // k), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(cdir, 'shoes.jpg'), q8(C), [cv2.IMWRITE_JPEG_QUALITY, 88])
    nm = half(NM * 2 - 1, 2); nm /= np.linalg.norm(nm, axis=2, keepdims=True) + 1e-6
    cv2.imwrite(os.path.join(cdir, 'shoes_n.jpg'), q8(nm * 0.5 + 0.5), [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(os.path.join(cdir, 'shoes_r.jpg'), q8(half(RG, 4)), [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not split:
        nu = uv.copy()
        nu[left, 0] = uv[left, 0] * 0.5; nu[~left, 0] = 0.5 + uv[~left, 0] * 0.5
        parts[pi]['uv'] = nu.astype(np.float32)
        meta['parts'][pi]['uvSplit'] = True
    mat = dict(meta['parts'][pi]['mat'])
    mat.pop('roughness', None)
    mat.update(map='shoes.jpg', normalMap='shoes_n.jpg', roughMap='shoes_r.jpg', normalScale=1.0, sheen=0.15)
    meta['parts'][pi]['mat'] = mat
    meshfmt.save(cdir, meta, parts)
    print(f'{cdir}: {design}, uv split {"kept" if split else "now"}')


if __name__ == '__main__':
    a = sys.argv[1:]
    pv = None
    if '--preview' in a:
        k = a.index('--preview'); pv = a[k + 1]; del a[k:k + 2]
    build(a[0], a[1], pv)
