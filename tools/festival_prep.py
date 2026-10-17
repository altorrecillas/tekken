# Festival photo (escenario1.jpg) -> clean stage textures for the "El Festival" stage.
# The photo is cut into the pieces the stage rebuilds in 3D: the arched stage shell (the sky made transparent), the
# two banner towers (the rum brand on them replaced by PUNOS DE BARRIO), the DJ booth sign, the wooden front of the
# platform, the reed fences, the trees on both sides and the concrete of the square. The people are painted out: the
# woman in white in front of the stage, the guard by the left fence, the man on the right and the people on stage.
# usage: python3 tools/festival_prep.py [debug_dir]   (reads escenario1.jpg in the game folder, writes assets/stage/fest_*)
import cv2, numpy as np, os, sys
from PIL import Image, ImageDraw, ImageFont
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DBG = sys.argv[1] if len(sys.argv) > 1 else None
OUT = os.path.join(G, 'assets/stage')
im = cv2.imread(os.path.join(G, 'escenario1.jpg')).astype(np.float32)
H, W = im.shape[:2]
K = W / 1600.0  # the coordinates below were measured on a 1600 x 900 preview


def P(*v):
    return [int(round(a * K)) for a in v]


def save(name, img, q=90):
    path = os.path.join(OUT, name)
    if name.endswith('.png'):
        cv2.imwrite(path, np.clip(img, 0, 255).astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])
    else:
        cv2.imwrite(path, np.clip(img, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, q])
    print(name, img.shape[1], 'x', img.shape[0], os.path.getsize(path) // 1024, 'KB')


def dbg(name, img):
    if DBG:
        cv2.imwrite(os.path.join(DBG, name), np.clip(img, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 85])


def inpaint(img, mask, r=6):
    return cv2.inpaint(np.clip(img, 0, 255).astype(np.uint8), mask, r, cv2.INPAINT_TELEA).astype(np.float32)


def sky_mask(img):
    """Soft sky matte: bright, bluish pixels connected to the top of the picture."""
    b, g, r = img[..., 0], img[..., 1], img[..., 2]
    lum = 0.11 * b + 0.59 * g + 0.3 * r
    sky = ((lum > 170) & (b - r > 8) & (b > 185)).astype(np.uint8)
    n, lab = cv2.connectedComponents(sky)
    top = np.unique(lab[:3][sky[:3] > 0])
    m = np.isin(lab, top[top > 0]).astype(np.float32)
    # soft edge from the bluishness (a fringe of lighter sky pixels around dark frames)
    soft = np.clip((b - r - 4) / 14, 0, 1) * np.clip((lum - 150) / 40, 0, 1)
    edge = cv2.dilate(m, np.ones((5, 5), np.uint8)) - cv2.erode(m, np.ones((5, 5), np.uint8))
    m = np.where(edge > 0, soft, m)
    return cv2.GaussianBlur(m, (0, 0), 0.8)


def feather_rect(h, w, f):
    a = np.ones((h, w), np.float32)
    for i in range(f):
        k = (i + 1) / (f + 1)
        a[i, :] *= k; a[h - 1 - i, :] *= k; a[:, i] *= k; a[:, w - 1 - i] *= k
    return a


rng = np.random.default_rng(7)

# ---------------------------------------------------------------- the stage shell
# arch, roof lights, LED wall and the "Brisa" letters on top; the sky becomes transparent. Below the LED wall the
# stage floor with the DJs and the crew is repainted as the dark stage (the railings and the DJ booth in front of it
# are 3D objects in the game), the lamp post on the left is a 3D object too, and the banner towers on both sides
# are cut away (3D towers stand there).
SX0, SY0, SX1, SY1 = P(395, 0, 1140, 490)
shell = im[SY0:SY1, SX0:SX1].copy()
sh_h, sh_w = shell.shape[:2]
alpha = 1 - sky_mask(shell)


def S(x, y):  # preview -> shell pixel
    return int(round(x * K)) - SX0, int(round(y * K)) - SY0


# lamp post and its cables against the sky (left of the arch)
x0, y0 = S(402, 52); x1, y1 = S(440, 238)
alpha[y0:y1, x0:x1] = 0
# light-blue sky seen through the gaps between the arch and the towers
b_, g_, r_ = shell[..., 0], shell[..., 1], shell[..., 2]
gap_sky = ((0.11 * b_ + 0.59 * g_ + 0.3 * r_ > 165) & (b_ - r_ > 8)).astype(np.float32)
side = np.zeros_like(gap_sky); side[:, :S(428, 0)[0]] = 1; side[:, S(1098, 0)[0]:] = 1
alpha *= 1 - cv2.GaussianBlur(gap_sky * side, (0, 0), 1.0)
# banner towers on both sides
alpha[:, :S(406, 0)[0]] = 0
alpha[:, S(1121, 0)[0]:] = 0
# the stage behind the railings: black curtains with soft folds, the stage floor, a little blue spill from the wall
def curtain_fill(x0, y0, x1, y1, floor_y, feather):
    y1 = min(y1, sh_h); x1 = min(x1, sh_w)
    hh, ww = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
    gx = xx + x0
    folds = 0.5 + 0.5 * np.sin(gx / 29.0 + np.sin(gx / 37.0) * 1.4)
    curt = np.stack([13 + folds * 10, 11 + folds * 9, 11 + folds * 9], -1)
    fy = floor_y - y0
    spill = np.exp(-((gx - sh_w * 0.5) / (sh_w * 0.22)) ** 2) * np.clip(1 - (yy - fy) / 60, 0, 1)
    floor = np.stack([22 + 0 * xx, 21 + 0 * xx, 21 + 0 * xx], -1) + (spill * 26)[..., None] * np.array([1.0, 0.42, 0.18])
    fill = np.where((yy < fy)[..., None], curt, floor)
    edge = (yy >= fy - 2) & (yy <= fy)
    fill[edge] = (38, 36, 36)
    fill += rng.normal(0, 2.0, fill.shape)
    a = feather_rect(hh, ww, feather)[..., None]
    shell[y0:y1, x0:x1] = shell[y0:y1, x0:x1] * (1 - a) + fill * a


floor_y = S(0, 447)[1]
x0, y0 = S(486, 391); x1, y1 = S(1004, 452)
curtain_fill(x0, y0, x1, y1, floor_y, 22)
x0, y0 = S(404, 426); x1, y1 = S(1123, 495)
curtain_fill(x0, y0, x1, y1, floor_y, 12)
# remaining lamp post pixels in front of the arch's left edge
pm = np.zeros(shell.shape[:2], np.uint8)
x0, y0 = S(410, 236); x1, y1 = S(428, 252)
pm[y0:y1, x0:x1] = 255
shell = inpaint(shell, pm, 4)
# sky colour under the soft edges is replaced by the dark frame colour (no light halo when composited on the 3D sky)
dark = cv2.dilate(np.where(alpha[..., None] > 0.9, shell, 0).astype(np.float32), np.ones((7, 7), np.uint8))
edge = (alpha > 0.02) & (alpha < 0.9)
shell[edge] = shell[edge] * 0.35 + dark[edge] * 0.65
save('fest_shell.jpg', shell, 90)
save('fest_shell_a.png', alpha * 255)
dbg('shell_check.jpg', cv2.resize(shell * alpha[..., None] + np.array([60, 160, 60]) * (1 - alpha[..., None]), None, fx=0.45, fy=0.45))

# ---------------------------------------------------------------- the DJ booth sign
# black front of the DJ booth with the festival's script letters (taken from the big letters on top of the arch,
# where they are clean) and OPEN AIR under them; in the photo the woman's raised hand covers the end of the sign
x0, y0, x1, y1 = P(625, 5, 910, 105)
logo = im[y0:y1, x0:x1]
b, g, r = logo[..., 0], logo[..., 1], logo[..., 2]
lmask = ((0.11 * b + 0.59 * g + 0.3 * r > 120) & (b - r < 14)).astype(np.uint8) * 255
lmask = cv2.morphologyEx(lmask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))  # (the cables)
n, lab, st, _ = cv2.connectedComponentsWithStats(lmask)
keep = np.zeros_like(lmask)
for i in range(1, n):
    if st[i, cv2.CC_STAT_AREA] > 120:
        keep[lab == i] = 255
ys, xs = np.where(keep > 0)
keep = keep[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
SW, SH = 1024, 256
sign = np.zeros((SH, SW, 3), np.float32) + (24, 23, 25)
yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32)
sign += (rng.normal(0, 1.6, (SH, SW)) + np.sin(xx * 1.9) * 1.2)[..., None]  # (fabric)
lw = int(SW * 0.53); lh = int(keep.shape[0] * lw / keep.shape[1])
lm = cv2.resize(cv2.GaussianBlur(keep, (0, 0), 2.0), (lw, lh), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
lm = np.clip((lm - 0.35) * 3.5, 0, 1)  # clean edges
ox, oy = int(SW * 0.21), int(SH * 0.08)
lh = min(lh, SH - oy)
sign[oy:oy + lh, ox:ox + lw] = sign[oy:oy + lh, ox:ox + lw] * (1 - lm[:lh, ..., None]) + np.array([236, 236, 234]) * lm[:lh, ..., None]
pil = Image.new('L', (SW, SH), 0)
d = ImageDraw.Draw(pil)
fnt = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 27)
txt = '  '.join('OPEN AIR'.replace(' ', ' '))
d.text((int(SW * 0.6), int(SH * 0.86)), 'O P E N   A I R', font=fnt, fill=255, anchor='mm')
tm = np.array(pil, np.float32)[..., None] / 255
sign = sign * (1 - tm) + np.array([225, 225, 222]) * tm
save('fest_sign.jpg', sign, 90)


# ---------------------------------------------------------------- the banner towers
# front banners: the rum brand (RON CACIQUE, white serif capitals reading upwards) is painted over with the colours
# around it and PUNOS DE BARRIO written in its place, small line + big line like the original; side banners are
# unwarped from their perspective
BW, BH = 256, 1400


def rectify(quad, w, h):
    src = np.float32([[x * K, y * K] for x, y in quad])
    dst = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    return cv2.warpPerspective(im, cv2.getPerspectiveTransform(src, dst), (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def repaint_text(img, y0, y1):
    """Remove the white lettering between rows y0..y1 of a banner: letters are unsaturated pixels brighter than the
    banner around them; they are inpainted from the gradient around them and get the print's grain back."""
    b, g, r = img[..., 0], img[..., 1], img[..., 2]
    lum = 0.11 * b + 0.59 * g + 0.3 * r
    sat = img.max(2) - img.min(2)
    bg = cv2.medianBlur(np.clip(lum, 0, 255).astype(np.uint8), 61).astype(np.float32)
    m = ((sat < 48) & (lum - bg > 14)).astype(np.uint8)
    m[:, :20] = 0; m[:, img.shape[1] - 16:] = 0; m[:y0] = 0; m[y1:] = 0
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) * 255
    out = inpaint(img, m, 9)
    mm = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 2)[..., None]
    return out + rng.normal(0, 3.0, out.shape) * mm


def brand_text(img, box, color=(244, 244, 240)):
    """PUNOS DE (small) + BARRIO (big), white serif capitals reading upwards, inside box of the banner image."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    t = Image.new('L', (h, w), 0)  # drawn horizontally, then rotated to read upwards
    d = ImageDraw.Draw(t)
    big = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf', int(w * 0.62))
    small = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf', int(w * 0.24))
    d.text((h * 0.5, w * 0.62), 'BARRIO', font=big, fill=255, anchor='mm')
    d.text((h * 0.5, w * 0.17), 'PUÑOS DE', font=small, fill=255, anchor='mm')
    m = np.array(t.rotate(90, expand=True), np.float32) / 255
    m = cv2.resize(m, (w, h))[..., None]
    img[y0:y1, x0:x1] = img[y0:y1, x0:x1] * (1 - m) + np.array(color[::-1], np.float32) * m
    return img


for side, front in (('l', [(297, 131), (353, 131), (353, 433), (297, 433)]),
                    ('r', [(1172, 129), (1226, 129), (1226, 433), (1172, 433)])):
    fb = repaint_text(rectify(front, BW, BH), 620, 1320)
    # the side banner (towards the stage) carries the same print without lettering
    save(f'fest_bside_{side}.jpg', fb, 85)
    fb = brand_text(fb, (int(0.08 * BW), 700, int(0.92 * BW), 1290))
    save(f'fest_banner_{side}.jpg', fb, 88)


# ---------------------------------------------------------------- the front of the platform
# wooden pallet panels along the front of the stage, with the steps up on the left of the DJ booth; the woman stands
# in front of the middle panels: the slats on her left continue across her
x0, y0, x1, y1 = P(322, 486, 1206, 550)
wood = im[y0:y1, x0:x1].copy()


def WX(x):
    return int(round(x * K)) - x0


# (one replacement strip from clean pieces, blended with the photo only at its two outer ends)
strip = np.concatenate([wood[:, WX(a_ + d_):WX(b_ + d_)] for a_, b_, d_ in ((798, 868, -70), (868, 905, -140), (905, 918, 96))], 1)
xa = WX(798)
w_ = strip.shape[1]
f_ = np.ones((1, w_, 1), np.float32)
for i in range(8):
    f_[:, i] *= (i + 1) / 9; f_[:, w_ - 1 - i] *= (i + 1) / 9
wood[:, xa:xa + w_] = wood[:, xa:xa + w_] * (1 - f_) + strip * f_
# above the middle panels the photo shows the bottom of the DJ booth sign: in the game the booth stands behind the
# edge of the platform, so these rows become the dark edge of the stage floor
ya = int(round(494 * K)) - y0
wood[:ya, WX(672):WX(905)] = wood[ya:ya + 1, WX(672):WX(905)] * 0.0 + np.array([30, 28, 28], np.float32)
save('fest_wood.jpg', wood, 88)

# ---------------------------------------------------------------- reed fence (canizo), tileable
x0, y0, x1, y1 = P(8, 409, 188, 527)
reed = im[y0:y1, x0:x1].copy()
# the green exit sign and the post are not in this stretch; blend the two ends so it repeats without a seam
ov = 40
lft, rgt = reed[:, :ov].copy(), reed[:, -ov:].copy()
ramp = np.linspace(0, 1, ov, dtype=np.float32)[None, :, None]
reed = reed[:, :-ov].copy()
reed[:, :ov] = rgt * (1 - ramp) + lft * ramp
reed = cv2.resize(reed, (512, 512), interpolation=cv2.INTER_AREA)
save('fest_reed.jpg', reed, 88)


# ---------------------------------------------------------------- trees behind the fences (the sky cut away)
def cutout(box, name, remove=()):
    x0, y0, x1, y1 = P(*box)
    c = im[y0:y1, x0:x1].copy()
    # sky behind foliage: bright, pale, smooth (the leaves break it into many pieces, so no connectivity test)
    b_, g_, r_ = c[..., 0], c[..., 1], c[..., 2]
    lum = 0.11 * b_ + 0.59 * g_ + 0.3 * r_
    sat = c.max(2) - c.min(2)
    mu = cv2.GaussianBlur(lum, (0, 0), 3)
    sd = np.sqrt(np.maximum(cv2.GaussianBlur(lum * lum, (0, 0), 3) - mu * mu, 0))
    sky = ((lum > 172) & (sat < 75) & (b_ >= r_ - 2) & (sd < 9)).astype(np.uint8)
    sky = cv2.dilate(sky, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))  # (the pale fringe around the leaves)
    a = 1 - cv2.GaussianBlur(sky.astype(np.float32), (0, 0), 1.0)
    for rx0, ry0, rx1, ry1 in remove:
        a[int(ry0 * K) - y0:int(ry1 * K) - y0, int(rx0 * K) - x0:int(rx1 * K) - x0] = 0
    # sky fringe inside the leaves: darken towards the foliage colour where the matte is soft
    dark = cv2.dilate(np.where(a[..., None] > 0.9, c, 0).astype(np.float32), np.ones((5, 5), np.uint8))
    e = (a > 0.02) & (a < 0.9)
    c[e] = c[e] * 0.4 + dark[e] * 0.6
    c = cv2.resize(c, None, fx=0.6, fy=0.6, interpolation=cv2.INTER_AREA)
    a = cv2.resize(a, None, fx=0.6, fy=0.6, interpolation=cv2.INTER_AREA)
    save(f'{name}.jpg', c, 86)
    save(f'{name}_a.png', a * 255)


# left: the umbrella pines and the tree behind them (above the fence; the purple sign and lamp are cut away)
cutout((0, 212, 296, 412), 'fest_trees_l', remove=((150, 395, 200, 412), (190, 380, 205, 412)))
# right: the tall tree and the low trees beyond the fence (the truss tower and the light are cut away)
cutout((1232, 40, 1562, 440), 'fest_trees_r', remove=((1520, 150, 1562, 440), (1232, 405, 1370, 440)))

# ---------------------------------------------------------------- the concrete of the square
# a 4 x 3 m patch of the square close to the camera, seen from above (camera 1.6 m high, horizon at y 464 of the
# preview, focal length ~1062 px of the preview: a phone's wide lens), made seamless; plus normal and roughness maps
# from its own detail. The date stamp of the photo is painted out first.
x0, y0, x1, y1 = P(1262, 846, 1590, 880)
roi = im[y0:y1, x0:x1]
lumr = 0.11 * roi[..., 0] + 0.59 * roi[..., 1] + 0.3 * roi[..., 2]
bgr_ = cv2.medianBlur(np.clip(lumr, 0, 255).astype(np.uint8), 21).astype(np.float32)
wm = np.zeros(im.shape[:2], np.uint8)
wm[y0:y1, x0:x1] = cv2.dilate(((lumr - bgr_) > 25).astype(np.uint8) * 255, np.ones((5, 5), np.uint8), iterations=2)
im = inpaint(im, wm, 5)
F, HC, YH = 1062.0 * K, 1.6, 464.0 * K


def ground_px(X, Z):
    return W / 2 + F * X / Z, YH + F * HC / Z


TW = 1024
TX0, TX1, TZ0, TZ1 = -2.6, 1.4, 4.1, 7.1  # metres (x right, z away from the camera)
th = int(TW * (TZ1 - TZ0) / (TX1 - TX0))
src = np.float32([ground_px(TX0, TZ1), ground_px(TX1, TZ1), ground_px(TX1, TZ0), ground_px(TX0, TZ0)])
dst = np.float32([[0, 0], [TW, 0], [TW, th], [0, th]])
patch = cv2.warpPerspective(im, cv2.getPerspectiveTransform(src, dst), (TW, th), flags=cv2.INTER_AREA)
# even out the light falloff across the patch (low frequencies to the mean)
lowf = cv2.GaussianBlur(patch, (0, 0), 90)
patch = patch / np.maximum(lowf, 1) * lowf.reshape(-1, 3).mean(0)
# square tile: the patch and its mirror below, then the classic seamless pass (offset by half, cross-faded seams)
tile = np.concatenate([patch, patch[::-1]], 0)[:TW]
off = np.roll(np.roll(tile, TW // 2, 0), TW // 2, 1)
yy, xx = np.mgrid[0:TW, 0:TW].astype(np.float32)
dmin = np.minimum(np.minimum(xx, TW - 1 - xx), np.minimum(yy, TW - 1 - yy))
wt = np.clip(dmin / 160.0, 0, 1)[..., None]
conc = tile * wt + off * (1 - wt)
save('fest_concrete_a.jpg', conc, 88)
lum = cv2.cvtColor(np.clip(conc, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
hp = lum - cv2.GaussianBlur(lum, (0, 0), 3)
gx = cv2.Sobel(hp, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(hp, cv2.CV_32F, 0, 1, ksize=3)
nz = np.ones_like(gx) / 6.0
nn = np.stack([-gx, -gy, nz], -1); nn /= np.linalg.norm(nn, axis=2, keepdims=True)
save('fest_concrete_n.jpg', np.stack([(nn[..., 2] * 0.5 + 0.5), (-nn[..., 1] * 0.5 + 0.5), (nn[..., 0] * 0.5 + 0.5)], -1) * 255, 90)
rough = np.clip(0.86 - (lum - lum.mean()) * 0.6, 0.6, 1.0)
save('fest_concrete_r.jpg', rough * 255, 88)
