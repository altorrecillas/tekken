"""Outfit definitions per fighter, recreated from their photos."""
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from garments import cover_top, cover_bottom, cover_socks, socks_offset, Decal, smoothstep
from headtex import fbm

FONT_DIR = '/usr/share/fonts/truetype/noto/'
# where a top's neckline sits (the smoothed neck-weight field's value along it, garments.cover_top): a crew neck at the
# base of the neck, a zip jacket a little higher up it. (The first builds cut 0.42 - 0.55: a wide, low scoop that bared
# the collarbones and read as a shirt two sizes too big; together with the cloth standing off the skin at the
# shirt's own distance it looked like a thick ring. make_shell's neck_snug lays the band on the neck)
CREW = 0.62
ZIP_NECK = 0.7


def font(name, size):
    for n in (name, 'NotoSans-Black.ttf', 'NotoSans-Bold.ttf'):
        try:
            return ImageFont.truetype(FONT_DIR + n, size)
        except OSError:
            continue
    return ImageFont.load_default()


def pil_to_bgra(im):
    a = np.array(im.convert('RGBA'))
    return cv2.cvtColor(a, cv2.COLOR_RGBA2BGRA)


def text_img(text, w, h, fnt, fill=(255, 255, 255, 255), bg=(0, 0, 0, 0), stroke=0, stroke_fill=None, italic=0.0):
    im = Image.new('RGBA', (w, h), bg)
    d = ImageDraw.Draw(im)
    bb = d.textbbox((0, 0), text, font=fnt, stroke_width=stroke)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((w - tw) / 2 - bb[0], (h - th) / 2 - bb[1]), text, font=fnt, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    if italic:
        im = im.transform(im.size, Image.AFFINE, (1, italic, -italic * h / 2, 0, 1, 0), Image.BICUBIC)
    return im


def bib_img(number, name, sponsor='CURSA', color=(214, 30, 40)):
    W, H = 600, 420
    im = Image.new('RGBA', (W, H), (250, 250, 248, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 92], fill=color + (255,))
    f1 = font('NotoSans-CondensedBlack.ttf', 64)
    d.text((W / 2, 46), sponsor, font=f1, fill=(255, 255, 255, 255), anchor='mm')
    f2 = font('NotoSans-CondensedBlack.ttf', 200)
    d.text((W / 2, 225), str(number), font=f2, fill=(15, 15, 18, 255), anchor='mm')
    f3 = font('NotoSans-CondensedBold.ttf', 50)
    d.text((W / 2, 360), name, font=f3, fill=(30, 30, 30, 255), anchor='mm')
    d.rectangle([0, H - 14, W, H], fill=color + (255,))
    for (x, y) in ((22, 22), (W - 22, 22), (22, H - 22), (W - 22, H - 22)):  # safety pins
        d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(170, 170, 175, 255), outline=(90, 90, 95, 255), width=3)
    return pil_to_bgra(im)


def flames_img(W=1024, H=1024, seed=3):
    """Stylised red/orange/yellow flames rising from the bottom (sports-shirt print)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) / np.float32(H)
    n = fbm((H, W), (160, 60, 20), seed) * 0.8
    tongues = np.sin(xx * 23 + n * 5) * 0.5 + 0.5
    height = 0.35 + 0.45 * tongues ** 2 + n * 0.25
    v = (1 - yy) / np.maximum(height, 0.05)  # 0 at bottom, 1 at flame tip
    m = np.clip((1 - v) * 3, 0, 1)
    inner = np.clip((0.6 - v) * 3, 0, 1)
    core = np.clip((0.3 - v) * 4, 0, 1)
    col = np.zeros((H, W, 4), np.float32)
    col[..., 2] = 220  # R (BGR order)
    col[..., 1] = 30 + inner * 120 + core * 90
    col[..., 0] = 20 + core * 40
    col[..., 3] = m * 255
    # dark outline for a printed look
    edge = (m > 0.05) & (m < 0.35)
    col[edge, :3] = col[edge, :3] * 0.35
    return np.clip(col, 0, 255).astype(np.uint8)


def logo_polo(color=(20, 160, 150)):
    im = Image.new('RGBA', (200, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([40, 40, 150, 80], fill=color + (255,))
    d.polygon([(150, 55), (185, 35), (175, 62)], fill=color + (255,))
    d.rectangle([60, 78, 70, 100], fill=color + (255,)); d.rectangle([120, 78, 130, 100], fill=color + (255,))
    return pil_to_bgra(im)


def swoosh(color=(255, 255, 255)):
    im = Image.new('RGBA', (300, 140), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(10, 90), (60, 125), (290, 30), (70, 95)], fill=color + (255,))
    return pil_to_bgra(im)


class Gear:
    """Hard-surface / strap gear built on the body surface (not a clothing shell)."""

    def __init__(self, name, build, mat):
        self.name = name; self.build = build; self.mat = mat


def vest_gear(ctx):
    from garments import surface_point, patch, strap
    yN, yC, yNav = ctx.y_neck, ctx.y_chest, ctx.y_navel

    def sp(x, y, side):
        k, p, n = surface_point(ctx, x, y, side)
        return p

    def build(ctx, snapper, W):
        parts = []
        # padded back panel
        outline = [(-1.2, yNav + 0.5), (1.2, yNav + 0.5), (1.25, yN - 0.9), (0.9, yN - 0.35), (-0.9, yN - 0.35), (-1.25, yN - 0.9)]
        parts.append(('vest', patch(ctx, snapper, W, outline, 0.28, res=26, zsign=-1.0, puff=0.12)))
        for sx in (1, -1):
            g = [sp(sx * 0.8, yN - 0.45, -1), sp(sx * 0.95, yN - 0.05, -1) + np.array([0, 0.25, 0]),
                 sp(sx * 0.95, yN - 0.05, 1) + np.array([0, 0.25, 0]), sp(sx * 0.9, yC + 0.9, 1), sp(sx * 0.88, yC + 0.2, 1), sp(sx * 0.85, yC - 0.45, 1)]
            parts.append(('vest', strap(ctx, snapper, W, g, 0.5, 0.26, n=44, thick=0.035)))
            parts.append(('vestrefl', strap(ctx, snapper, W, g[2:5], 0.1, 0.305, n=24, thick=0.008)))
            # front bottle / pocket
            pk = [(sx * 0.45, yC - 0.35), (sx * 1.3, yC - 0.35), (sx * 1.3, yC + 0.5), (sx * 0.45, yC + 0.5)]
            pk = [(min(a, b), c) if False else (a, c) for (a, c), b in zip(pk, [0] * 4)]
            parts.append(('vest', patch(ctx, snapper, W, pk, 0.3, res=12, zsign=1.0, puff=0.22)))
            # side strap around the ribs
            g2 = [sp(sx * 1.15, yC - 0.4, 1), sp(sx * 1.6, yC - 0.45, 1) + np.array([sx * 0.15, 0, -0.3]),
                  sp(sx * 1.6, yC - 0.45, -1) + np.array([sx * 0.15, 0, 0.3]), sp(sx * 1.2, yC - 0.4, -1)]
            parts.append(('vest', strap(ctx, snapper, W, g2, 0.3, 0.27, n=30, thick=0.02)))
        return parts
    return Gear('vest', build, dict(type='cloth', color=[0.012, 0.012, 0.014], roughness=0.5, sheen=0.35, sheenColor=[0.25, 0.25, 0.3]))


class G:
    def __init__(self, name, covered, offset, color, rough=0.85, knit=1.0, fold=1.0, decals=(), sheen=0.6,
                 sheen_color=None, hem_depth=0.7, extra=None, normal_scale=1.0, snap=None, collar=None, buttons=None,
                 pique=0.0, rib_cuffs=0.0):
        self.name = name; self.covered = covered; self.offset = offset; self.color = color
        self.rough = rough; self.knit = knit; self.fold = fold; self.decals = list(decals)
        self.sheen = sheen; self.sheen_color = sheen_color or color; self.hem_depth = hem_depth
        self.extra = extra; self.normal_scale = normal_scale; self.snap = snap
        self.collar = collar; self.buttons = buttons; self.pique = pique; self.rib_cuffs = rib_cuffs


def loose(ctx, base, lower_extra=0.0, leg_extra=0.0):
    """Per-vertex offset: tighter on shoulders/chest, looser lower down / on legs."""
    y = ctx.y
    off = base + lower_extra * smoothstep(ctx.y_chest, ctx.y_hip, y)
    off = off + leg_extra * np.clip(ctx.leg, 0, 2) * (ctx.legness > 0.5)
    return off


def front_decal(ctx, img, cx, cy, w, h, facing=(0, 0, 1), **kw):
    return Decal(img, (cx, cy, 0), (w / 2, 0, 0), (0, h / 2, 0), facing, **kw)


def back_decal(ctx, img, cx, cy, w, h, **kw):
    return Decal(img, (cx, cy, 0), (-w / 2, 0, 0), (0, h / 2, 0), (0, 0, -1), **kw)


# ------------------------------------------------------------------------ per fighter
def placket_img(color_bgr):
    W, H = 120, 520
    im = np.zeros((H, W, 4), np.uint8)
    base = np.array(color_bgr, np.float32) * 0.93
    im[:, :, :3] = base.astype(np.uint8); im[:, :, 3] = 255
    s = (np.array(color_bgr) * 0.62).astype(np.uint8).tolist()
    for x in (8, W - 9):
        for y in range(0, H - 10, 10):
            cv2.line(im, (x, y), (x, y + 6), s + [255], 2)
    for x in range(8, W - 8, 10):
        cv2.line(im, (x, H - 12), (x + 6, H - 12), s + [255], 2)
    # soft edge so the placket blends into the knit
    im[:, :3, 3] = 120; im[:, -3:, 3] = 120
    return im


def emblem_img():
    # small generic embroidered emblem (not a real brand): a stylised wave inside a shield
    im = Image.new('RGBA', (220, 240), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(20, 20), (200, 20), (200, 130), (110, 225), (20, 130)], fill=(18, 110, 104, 255))
    d.polygon([(34, 32), (186, 32), (186, 124), (110, 205), (34, 124)], outline=(235, 240, 230, 255), width=6)
    for k in range(3):
        y = 70 + k * 30
        d.arc([50, y - 18, 110, y + 18], 200, 340, fill=(240, 220, 90, 255), width=7)
        d.arc([110, y - 18, 170, y + 18], 20, 160, fill=(240, 220, 90, 255), width=7)
    return pil_to_bgra(im)


def outfit_alejandro(ctx, P):
    """Yellow two-button polo (as in his photo) + raspberry chino shorts."""
    top = cover_top(ctx, sleeve=0.4, hem=ctx.y_hip - 0.22, neck=CREW)
    yellow = (0.97, 0.73, 0.02)
    ybgr = [int(yellow[2] * 255), int(yellow[1] * 255), int(yellow[0] * 255)]
    decals = [front_decal(ctx, placket_img(ybgr), 0.0, ctx.y_neck - 0.72, 0.3, 1.3, min_facing=0.35, bump=0.9),
              front_decal(ctx, emblem_img(), 0.78, ctx.y_neck - 1.55, 0.2, 0.22, min_facing=0.3, bump=0.5)]
    shorts = cover_bottom(ctx, length=0.58, waist=ctx.y_navel - 0.3)
    return [G('shirt', top, loose(ctx, 0.11, 0.12), yellow, rough=0.86, knit=1.0, fold=1.1, decals=decals, sheen=0.55,
              sheen_color=(1.0, 0.85, 0.4), snap=dict(arm=0.4, y_low=ctx.y_hip - 0.22), pique=1.0, rib_cuffs=1.0,
              # (a polo's collar: a 2.5 cm stand, a leaf falling 3.5 - 4.5 cm with short points; the first one, 4.4 cm on a
              # wide neckline, read as a sweater's band)
              collar=dict(stand=0.25, leaf=0.36, gap=0.17, tip=0.2),
              buttons=[dict(y=ctx.y_neck - 0.45), dict(y=ctx.y_neck - 0.95)]),
            G('shorts', shorts, loose(ctx, 0.15, 0, 0.3), (0.72, 0.2, 0.3), rough=0.82, knit=0.6, fold=1.2, sheen=0.35,
              sheen_color=(0.9, 0.5, 0.6), snap=dict(leg=0.58, y_high=ctx.y_navel - 0.3))]


def outfit_alejandro_pool(ctx, P):
    """Shirtless with navy swim shorts (white drawstring) - as in his pool photo."""
    shorts = cover_bottom(ctx, length=0.52, waist=ctx.y_navel - 0.55)
    draw = Image.new('RGBA', (400, 300), (0, 0, 0, 0))
    d = ImageDraw.Draw(draw)
    d.line([(200, 10), (150, 60), (120, 250)], fill=(245, 245, 245, 255), width=14)
    d.line([(200, 10), (250, 60), (290, 240)], fill=(245, 245, 245, 255), width=14)
    d.ellipse([185, 0, 215, 25], fill=(235, 235, 235, 255))
    decals = [front_decal(ctx, pil_to_bgra(draw), 0, ctx.y_navel - 1.0, 1.0, 0.8, bump=0.8)]
    return [G('shorts', shorts, loose(ctx, 0.14, 0, 0.35), (0.06, 0.09, 0.22), rough=0.62, knit=0.4, fold=1.3,
              decals=decals, sheen=0.3, sheen_color=(0.3, 0.35, 0.6), snap=dict(leg=0.52, y_high=ctx.y_navel - 0.55))]


def outfit_alejandro_alt(ctx, P):
    """Yellow polo + red chino shorts."""
    top = cover_top(ctx, sleeve=0.42, hem=ctx.y_hip - 0.3)
    decals = [front_decal(ctx, logo_polo(), 0.75, ctx.y_chest + 0.25, 0.28, 0.17)]
    shorts = cover_bottom(ctx, length=0.55)
    return [G('shirt', top, loose(ctx, 0.12, 0.12), (0.93, 0.72, 0.05), rough=0.85, knit=1.2, decals=decals,
              snap=dict(arm=0.42, y_low=ctx.y_hip - 0.3)),
            G('shorts', shorts, loose(ctx, 0.14, 0, 0.3), (0.75, 0.22, 0.3), rough=0.8, knit=0.6,
              snap=dict(leg=0.55, y_high=ctx.y_navel - 0.25))]


def outfit_arnau(ctx, P):
    """Black zip jacket (long sleeves) + black cargo pants."""
    top = cover_top(ctx, sleeve=1.93, hem=ctx.y_hip - 0.45, neck=ZIP_NECK)
    zip_img = np.zeros((600, 40, 4), np.uint8)
    zip_img[:, 14:26] = (70, 70, 72, 255)
    zip_img[::6, 10:30] = (140, 140, 145, 255)
    logo = text_img('BARRIO', 220, 60, font('NotoSans-Bold.ttf', 30), fill=(170, 20, 25, 255))  # generic mark, no real brands
    decals = [front_decal(ctx, zip_img, 0, (ctx.y_neck + ctx.y_hip) / 2 - 0.05, 0.12, ctx.y_neck - ctx.y_hip + 0.2, bump=1.0),
              front_decal(ctx, pil_to_bgra(logo), -0.7, ctx.y_chest + 0.3, 0.55, 0.15)]
    pants = cover_bottom(ctx, length=1.93)
    pocket = Image.new('RGBA', (200, 240), (0, 0, 0, 0))
    d = ImageDraw.Draw(pocket)
    d.rectangle([10, 30, 190, 230], fill=(26, 27, 25, 255), outline=(12, 12, 12, 255), width=8)
    d.rectangle([4, 10, 196, 70], fill=(30, 31, 29, 255), outline=(12, 12, 12, 255), width=8)
    pk = pil_to_bgra(pocket)
    pdec = [Decal(pk, (sgn * 1.45, ctx.J['lowerleg01.L']['head'][1] + 1.7, 0), (0, 0, 0.45 * sgn), (0, 0.55, 0), (sgn, 0, 0), bump=2.5)
            for sgn in (1, -1)]
    return [G('jacket', top, loose(ctx, 0.2, 0.12), (0.03, 0.03, 0.035), rough=0.72, knit=0.5, fold=1.6,
              decals=decals, sheen=0.5, sheen_color=(0.25, 0.25, 0.28), snap=dict(arm=1.93, y_low=ctx.y_hip - 0.45)),
            G('pants', pants, loose(ctx, 0.16, 0, 0.12), (0.16, 0.17, 0.12), rough=0.9, knit=0.3, fold=1.8,
              decals=pdec, sheen=0.4, sheen_color=(0.2, 0.2, 0.2), snap=dict(leg=1.93, y_high=ctx.y_navel - 0.25))]


def outfit_camilo(ctx, P):
    """Red running tee with race bib + black running shorts + white socks."""
    top = cover_top(ctx, sleeve=0.4, hem=ctx.y_hip - 0.1, neck=CREW)
    bib = bib_img(1127, 'CAMILO', sponsor='10K VALENCIA', color=(25, 90, 200))
    decals = [front_decal(ctx, bib, 0.05, ctx.y_navel + 0.9, 1.5, 1.05, min_facing=0.3, bump=0.3)]
    shorts = cover_bottom(ctx, length=0.3)
    socks = cover_socks(ctx, top=1.62)
    return [G('shirt', top, loose(ctx, 0.12, 0.14), (0.8, 0.05, 0.06), rough=0.7, knit=1.4, fold=1.6, decals=decals, sheen=0.7,
              sheen_color=(1, 0.4, 0.4), snap=dict(arm=0.4, y_low=ctx.y_hip - 0.1)),
            G('shorts', shorts, loose(ctx, 0.12, 0, 0.35), (0.03, 0.03, 0.035), rough=0.82, knit=0.3, fold=1.2, sheen=0.18,
              snap=dict(leg=0.3, y_high=ctx.y_navel - 0.25)),
            G('socks', socks, socks_offset(ctx), (0.93, 0.93, 0.92), rough=0.95, knit=1.5, fold=0.4, hem_depth=0.5, snap=dict(leg=1.62))]


def outfit_rafa(ctx, P):
    """Neon green running tee (VISTA ALEGRE) + black shorts."""
    top = cover_top(ctx, sleeve=0.45, hem=ctx.y_hip - 0.25, neck=CREW)
    txt = text_img('VISTA ALEGRE', 700, 140, font('NotoSans-CondensedBlack.ttf', 110), fill=(20, 40, 30, 255), italic=0.2)
    runner = Image.new('RGBA', (400, 400), (0, 0, 0, 0))
    d = ImageDraw.Draw(runner)
    d.ellipse([60, 60, 340, 340], outline=(20, 60, 45, 255), width=22)
    d.line([(120, 280), (200, 150), (290, 120)], fill=(20, 60, 45, 255), width=26)
    d.line([(200, 150), (170, 90)], fill=(20, 60, 45, 255), width=26)
    d.ellipse([175, 50, 225, 100], fill=(20, 60, 45, 255))
    decals = [front_decal(ctx, pil_to_bgra(txt), 0.2, ctx.y_chest + 0.25, 1.9, 0.38),
              front_decal(ctx, pil_to_bgra(runner), 0.2, ctx.y_chest - 0.8, 1.2, 1.2)]
    shorts = cover_bottom(ctx, length=0.45)
    return [G('shirt', top, loose(ctx, 0.12, 0.2), (0.55, 0.95, 0.12), rough=0.7, knit=1.3, fold=1.6, decals=decals, sheen=0.6,
              sheen_color=(0.8, 1, 0.5), snap=dict(arm=0.45, y_low=ctx.y_hip - 0.25)),
            G('shorts', shorts, loose(ctx, 0.14, 0, 0.3), (0.03, 0.03, 0.035), rough=0.82, knit=0.3, fold=1.2, sheen=0.18,
              snap=dict(leg=0.45, y_high=ctx.y_navel - 0.25))]


def vest_cover(ctx):
    V = ctx.V[:ctx.n]
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    torso = (ctx.armness < 0.35) & (ctx.legness < 0.5) & (ctx.neckness < 0.2)
    back = (z < -0.2) & (y > ctx.y_navel + 0.1) & (y < ctx.y_neck - 0.25) & (np.abs(x) < 1.35)
    straps = (np.abs(np.abs(x) - 0.95) < 0.38) & (y > ctx.y_chest - 1.1) & (y < ctx.y_neck + 0.1)
    band = (np.abs(y - (ctx.y_chest - 0.9)) < 0.22)
    pockets = (z > 0.2) & (np.abs(np.abs(x) - 0.95) < 0.5) & (y > ctx.y_chest - 1.2) & (y < ctx.y_chest + 0.2)
    return torso & (back | straps | band | pockets), pockets & torso


def outfit_zapponi(ctx, P):
    """Navy tee with flame print + black trail running vest + race bib + black shorts."""
    top = cover_top(ctx, sleeve=0.45, hem=ctx.y_hip - 0.2, neck=CREW)
    fl = flames_img()
    bib = bib_img(6264, 'J. ANTONIO', sponsor='TRAIL', color=(20, 20, 24))
    red = np.zeros((64, 64, 4), np.uint8); red[:] = (40, 30, 200, 255)
    decals = [front_decal(ctx, fl, 0, ctx.y_chest + 0.3, 3.4, 2.4, min_facing=-0.2),
              back_decal(ctx, fl, 0, ctx.y_chest + 0.1, 3.4, 2.4, min_facing=-0.2),
              Decal(red, (0, ctx.y_neck + 0.1, 0), (2.6, 0, 0), (0, 0.55, 0), (0, 1, 0), min_facing=0.25),
              front_decal(ctx, bib, 0.0, ctx.y_navel + 0.45, 1.25, 0.9, min_facing=0.3, bump=0.3)]
    shorts = cover_bottom(ctx, length=0.5)
    vest, pockets = vest_cover(ctx)
    vdec = []
    voff = 0.22 + pockets[:ctx.n] * 0.12
    return [G('shirt', top, loose(ctx, 0.12, 0.18), (0.08, 0.12, 0.42), rough=0.72, knit=1.3, fold=1.6, decals=decals, sheen=0.6,
              sheen_color=(0.4, 0.5, 1.0), snap=dict(arm=0.45, y_low=ctx.y_hip - 0.2)),
            G('shorts', shorts, loose(ctx, 0.14, 0, 0.3), (0.025, 0.025, 0.03), rough=0.82, knit=0.3, fold=1.2, sheen=0.18,
              snap=dict(leg=0.5, y_high=ctx.y_navel - 0.25)),
            vest_gear(ctx)]


def run_print_img():
    """Club running-tee print (generic, after the one in his photo): an arch of rays over two runners, CORRE FELIZ, a smile."""
    W, H = 700, 760
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    white = (246, 246, 244, 255)
    cx, cy, r0, r1 = W / 2, 300, 150, 205
    import math
    for k in range(13):
        a0 = math.radians(180 + k * (180 / 13) + 2.5); a1 = math.radians(180 + (k + 1) * (180 / 13) - 2.5)
        pts = [(cx + r0 * math.cos(a0), cy + r0 * math.sin(a0)), (cx + r1 * math.cos(a0), cy + r1 * math.sin(a0)),
               (cx + r1 * math.cos(a1), cy + r1 * math.sin(a1)), (cx + r0 * math.cos(a1), cy + r0 * math.sin(a1))]
        d.polygon(pts, fill=white)
    # two runners inside the arch
    for ox, sc in ((-45, 1.0), (40, 0.92)):
        x0, y0 = cx + ox, cy - 20
        d.ellipse([x0 - 16 * sc, y0 - 105 * sc, x0 + 16 * sc, y0 - 73 * sc], fill=white)
        wdt = int(13 * sc)
        d.line([(x0 + 4 * sc, y0 - 70 * sc), (x0 - 6 * sc, y0 - 10 * sc)], fill=white, width=wdt)          # body
        d.line([(x0 - 6 * sc, y0 - 10 * sc), (x0 - 40 * sc, y0 + 25 * sc)], fill=white, width=wdt)        # back leg
        d.line([(x0 - 6 * sc, y0 - 10 * sc), (x0 + 22 * sc, y0 + 5 * sc), (x0 + 30 * sc, y0 + 35 * sc)], fill=white, width=wdt)  # front leg
        d.line([(x0 + 2 * sc, y0 - 58 * sc), (x0 - 30 * sc, y0 - 35 * sc)], fill=white, width=int(10 * sc))   # arms
        d.line([(x0 + 2 * sc, y0 - 58 * sc), (x0 + 30 * sc, y0 - 45 * sc), (x0 + 42 * sc, y0 - 70 * sc)], fill=white, width=int(10 * sc))
    t = text_img('CORRE FELIZ', W, 150, font('NotoSans-CondensedBold.ttf', 128), fill=white)
    im.alpha_composite(t, (0, 400))
    d.arc([cx - 190, 470, cx + 190, 650], 25, 155, fill=white, width=16)
    return pil_to_bgra(im)


def denim_extra(ctx, col, height, A):
    """Washed denim: diagonal twill, paler wear on the front of the thighs, whiskers at the hips, a few worn scratches."""
    valid = A['valid'].astype(np.float32)
    size = col.shape[0]
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    tw = np.sin((xx + yy) * 1.7)
    height += 0.3 * tw * valid
    col *= (1 + 0.06 * tw[..., None])
    pos, nrm = A['pos'], A['nrm']
    front = np.clip(nrm[..., 2], 0, 1)
    thigh = np.clip(A['leg'], 0, 1) * (A['legness'] > 0.5)
    n1 = fbm((size, size), (96, 24, 6), 7)
    wear = np.clip(front * (0.4 + 0.8 * thigh) + n1 * 0.35, 0, 1)
    col += (wear * 40)[..., None] * np.array([1.0, 0.9, 0.75], np.float32)   # BGR: paler blue where worn
    # whiskers: light horizontal creases over the front of the hips
    hipz = np.exp(-((pos[..., 1] - (ctx.y_hip + 0.05)) / 0.35) ** 2) * front * (thigh < 0.35)
    wh = np.clip(np.sin(pos[..., 1] * 38 + np.sin(pos[..., 0] * 9) * 1.5), 0, 1) ** 6
    col += (hipz * wh * 45)[..., None]
    height -= hipz * wh * 0.8
    # worn scratches (short pale horizontal streaks on the front of the thighs)
    rng = np.random.default_rng(11)
    sc = np.zeros((size, size), np.float32)
    idx = np.argwhere((thigh > 0.25) & (front > 0.6) & (A['valid']))
    for k in rng.choice(len(idx), size=min(len(idx), 12), replace=False) if len(idx) else []:
        y0, x0 = idx[k]
        L = rng.integers(10, 26)
        cv2.line(sc, (int(x0 - L), int(y0)), (int(x0 + L), int(y0 + rng.integers(-2, 3))), 1.0, int(rng.integers(1, 3)))
    sc = cv2.GaussianBlur(sc, (0, 0), 0.8)
    col += (sc * 38)[..., None]
    height -= sc * 0.4


def stitch_img(points, W, H, color=(40, 150, 220)):
    """Contrast (tan) topstitching along a polyline: pairs of dashed lines."""
    im = np.zeros((H, W, 4), np.uint8)
    pts = np.array(points, np.float32)
    for off in (-5, 5):
        seg = []
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            n = b - a; L = np.linalg.norm(n); n = n / max(L, 1e-6); perp = np.array([-n[1], n[0]])
            for t in np.arange(0, L, 9):
                p0 = a + n * t + perp * off; p1 = a + n * min(L, t + 5) + perp * off
                cv2.line(im, tuple(int(v) for v in p0), tuple(int(v) for v in p1), tuple(color) + (255,), 2)
    return im


def outfit_dani(ctx, P):
    """Royal-blue running tee with a white club print (CORRE FELIZ) + washed denim shorts + white ankle socks."""
    top = cover_top(ctx, sleeve=0.42, hem=ctx.y_hip - 0.15, neck=CREW)
    blue = (0.018, 0.1, 0.5)  # royal blue
    half = text_img('½ BCN', 300, 90, font('NotoSans-CondensedBlack.ttf', 70), fill=(246, 246, 244, 255))
    # the print fills most of the front, from the chest down to above the navel
    decals = [front_decal(ctx, run_print_img(), 0.15, ctx.y_chest + 0.15, 2.4, 2.6, min_facing=0.3, bump=0.25),
              front_decal(ctx, pil_to_bgra(half), -0.66, ctx.y_chest + 1.25, 0.75, 0.22, min_facing=0.4, bump=0.2)]
    shorts = cover_bottom(ctx, length=0.66, waist=ctx.y_navel - 0.3)
    fly = stitch_img([(40, 10), (40, 330), (70, 390), (150, 400)], 200, 420)
    sdec = [front_decal(ctx, fly, 0.2, ctx.y_navel - 1.15, 0.36, 0.76, min_facing=0.4, bump=0.8)]
    for sgn in (1, -1):
        pocket = stitch_img([(20, 20), (60, 120), (160, 190), (280, 200)] if sgn > 0 else [(280, 20), (240, 120), (140, 190), (20, 200)], 300, 220)
        sdec.append(front_decal(ctx, pocket, sgn * 0.95, ctx.y_navel - 0.75, 0.62, 0.45, min_facing=0.35, bump=0.8))
    socks = cover_socks(ctx, top=1.94)
    return [G('shirt', top, loose(ctx, 0.11, 0.14), blue, rough=0.66, knit=1.3, fold=1.5, decals=decals, sheen=0.7,
              sheen_color=(0.3, 0.45, 1.0), snap=dict(arm=0.42, y_low=ctx.y_hip - 0.15)),
            G('shorts', shorts, loose(ctx, 0.15, 0, 0.3), (0.36, 0.49, 0.66), rough=0.92, knit=0.15, fold=1.5, decals=sdec,
              sheen=0.12, sheen_color=(0.6, 0.7, 0.85), extra=denim_extra, snap=dict(leg=0.66, y_high=ctx.y_navel - 0.3)),
            G('socks', socks, socks_offset(ctx), (0.97, 0.97, 0.96), rough=0.95, knit=1.2, fold=0.4, hem_depth=0.5, snap=dict(leg=1.94))]


def coat_v(ctx, bottom, half_w, margin=0.0):
    """Body vertices inside the V opening at the front of a coat: from the neck down to `bottom` (dm), half-width
    `half_w` at the neckline narrowing to the point; `margin` widens it (an inner layer that must reach under)."""
    V = ctx.V[:ctx.n]
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    top = ctx.y_neck + 0.2
    f = np.clip((y - bottom) / (top - bottom), 0, 1.2)
    w = half_w * f + margin
    return (z > 0.05) & (y > bottom - margin) & (np.abs(x) < w) & (ctx.armness < 0.4) & (ctx.legness < 0.5)


def pocket_img(w=360, h=300, color=(244, 244, 242), pens=False):
    """Patch pocket of a white coat: double topstitching and a folded top edge (optionally two pens clipped in)."""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if pens:
        for x0, col, cap in ((w * 0.3, (30, 70, 170, 255), (25, 50, 130, 255)), (w * 0.52, (200, 30, 40, 255), (150, 20, 30, 255))):
            d.rounded_rectangle([x0, 0, x0 + 26, h * 0.42], 10, fill=col)
            d.rectangle([x0 + 9, 0, x0 + 17, h * 0.34], fill=(205, 205, 210, 255))  # clip
            d.ellipse([x0 + 4, -6, x0 + 22, 14], fill=cap)
    d.rectangle([8, h * 0.18, w - 8, h - 8], fill=color + (255,))
    st = tuple(int(c * 0.72) for c in color) + (255,)
    for o in (16, 26):
        for x in range(o, w - o, 14):
            d.line([(x, h - o), (x + 7, h - o)], fill=st, width=3)
        for y in range(int(h * 0.18) + 20, h - o, 14):
            d.line([(o, y), (o, y + 7)], fill=st, width=3)
            d.line([(w - o, y), (w - o, y + 7)], fill=st, width=3)
    d.line([(8, h * 0.18 + 30), (w - 8, h * 0.18 + 30)], fill=tuple(int(c * 0.8) for c in color) + (255,), width=4)
    return pil_to_bgra(im)


def name_img(text, color=(26, 60, 140)):
    """Name embroidered on the coat (thread colour, slightly raised)."""
    return pil_to_bgra(text_img(text, 420, 110, font('NotoSans-BoldItalic.ttf', 74), fill=color + (255,)))


def lapel_img(W=700, H=900, color=(244, 244, 242)):
    """Notched lapels and the edges of the V opening, painted over the coat: soft fold shadow along each edge,
    stitching, and the notch where collar and lapel meet."""
    im = np.zeros((H, W, 4), np.uint8)
    base = np.array(color[::-1], np.float32)
    for sgn in (1, -1):
        # lapel edge from the notch (top outer) down to the button point (bottom centre)
        top = (W / 2 + sgn * W * 0.36, H * 0.05)
        bot = (W / 2 + sgn * W * 0.02, H * 0.97)
        fold = (W / 2 + sgn * W * 0.47, H * 0.62)  # roll line of the lapel (outer)
        poly = np.array([top, bot, fold], np.int32)
        cv2.fillPoly(im, [poly], tuple(int(c) for c in base * 0.985) + (255,))
        cv2.line(im, (int(top[0]), int(top[1])), (int(bot[0]), int(bot[1])), tuple(int(c) for c in base * 0.8) + (255,), 6, cv2.LINE_AA)
        cv2.line(im, (int(top[0]), int(top[1])), (int(fold[0]), int(fold[1])), tuple(int(c) for c in base * 0.9) + (200,), 4, cv2.LINE_AA)
        # notch
        n0 = (int(top[0]), int(top[1])); n1 = (int(top[0] + sgn * W * 0.08), int(top[1] + H * 0.06))
        cv2.line(im, n0, n1, tuple(int(c) for c in base * 0.75) + (255,), 5, cv2.LINE_AA)
    im = cv2.GaussianBlur(im, (0, 0), 1.2)
    return im


def outfit_noemi(ctx, P):
    """White coat (hip length, as long as a coat can be on a fighter) open in a V over a pink top + dark jeans."""
    yN, yC, yH = ctx.y_neck, ctx.y_chest, ctx.y_hip
    V = ctx.V[:ctx.n]
    torso = (ctx.armness < 0.3) & (ctx.legness < 0.5) & (ctx.neckness < 0.2)
    apex_y = float(V[torso][np.argmax(V[torso][:, 2]), 1])  # height of the bust's front-most point
    v_bottom, v_half, v_top = yC - 0.75, 0.82, yN + 0.2
    coat = cover_top(ctx, sleeve=1.8, hem=yH - 0.42, neck=0.5) & ~coat_v(ctx, v_bottom, v_half)
    white = (0.93, 0.93, 0.915)
    wbgr = (int(white[2] * 255), int(white[1] * 255), int(white[0] * 255))
    decals = [front_decal(ctx, lapel_img(color=wbgr), 0.0, (yN + v_bottom) / 2 + 0.1, 2.3, yN - v_bottom + 0.55, min_facing=0.2, bump=1.2),
              front_decal(ctx, pocket_img(color=wbgr, pens=True), 0.95, yC - 0.35, 0.62, 0.55, min_facing=0.3, bump=1.4),
              front_decal(ctx, name_img('Noemí'), 0.95, yC + 0.1, 0.62, 0.17, min_facing=0.35, bump=0.6),
              front_decal(ctx, pocket_img(420, 400, color=wbgr), 1.05, yH + 0.12, 0.85, 0.8, min_facing=0.25, bump=1.4),
              front_decal(ctx, pocket_img(420, 400, color=wbgr), -1.05, yH + 0.12, 0.85, 0.8, min_facing=0.25, bump=1.4)]
    inner = coat_v(ctx, v_bottom - 0.1, v_half, margin=0.3) & cover_top(ctx, sleeve=0.2, hem=v_bottom - 0.6, neck=0.62)
    pink = (0.88, 0.5, 0.6)
    pants = cover_bottom(ctx, length=1.93, waist=ctx.y_navel - 0.15)
    jacket = G('jacket', coat, loose(ctx, 0.2, 0.16), white, rough=0.78, knit=0.35, fold=1.5, decals=decals, sheen=0.35,
               sheen_color=(1, 1, 1), snap=dict(arm=1.8, y_low=yH - 0.42, v=(v_bottom, v_half, v_top)), hem_depth=0.8)
    jacket.relax = 30
    jacket.drape = dict(y_top=apex_y + 0.35, y_bottom=yH - 0.6, slope=0.32, side=1.4, radius=1.2)
    top = G('top', inner, 0.07, pink, rough=0.85, knit=1.1, fold=0.8, sheen=0.5, sheen_color=(1.0, 0.7, 0.8), hem_depth=0.5)
    # the knit spans the cleavage instead of following it
    top.drape = dict(y_top=apex_y + 0.5, y_bottom=v_bottom - 0.7, slope=0.4, side=1.0, radius=0.9, z_min=0.0)
    return [jacket, top,
            G('pants', pants, loose(ctx, 0.15, 0, 0.1), (0.07, 0.1, 0.2), rough=0.9, knit=0.2, fold=1.6, extra=denim_extra,
              sheen=0.12, sheen_color=(0.4, 0.5, 0.7), snap=dict(leg=1.93, y_high=ctx.y_navel - 0.15))]

OUTFITS = dict(alejandro=outfit_alejandro, alejandro_pool=outfit_alejandro_pool, alejandro_alt=outfit_alejandro_alt, arnau=outfit_arnau, camilo=outfit_camilo,
               rafa=outfit_rafa, zapponi=outfit_zapponi, dani=outfit_dani, noemi=outfit_noemi)
