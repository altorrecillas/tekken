"""Working copy of noemi.jpg for the face fit: the headset's microphone boom and cable over the jaw are painted out."""
import cv2, numpy as np, sys, os
GAME, TOOLS = sys.argv[1], sys.argv[2]
im = cv2.imread(os.path.join(GAME, 'noemi.jpg'))
H, W = im.shape[:2]
X0, Y0 = 824, 1626  # traced on a 2x zoom of the jaw (zoomed px -> full resolution)
def full(pts): return np.array([(X0 + x / 2, Y0 + y / 2) for x, y in pts], np.int32)
boom = full([(55, 75), (110, 130), (265, 265), (350, 350), (420, 420), (475, 462), (540, 488), (620, 493), (700, 478)])
cable = full([(195, 262), (250, 350), (300, 420), (350, 500), (400, 570), (450, 640), (500, 700), (550, 762), (600, 830), (650, 900), (705, 968)])
mask = np.zeros((H, W), np.uint8)
cv2.polylines(mask, [boom], False, 255, 26)
cv2.circle(mask, tuple(boom[-1]), 16, 255, -1)
cv2.polylines(mask, [cable], False, 255, 15)
out = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA)
# the inpainted strip is smoother than the skin around it: give it back the local grain
rng = np.random.default_rng(1)
grain = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 0.8) * 3.0
m = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 2)[..., None]
out = np.clip(out.astype(np.float32) + grain[..., None] * m, 0, 255).astype(np.uint8)
os.makedirs(os.path.join(TOOLS, 'photos'), exist_ok=True)
cv2.imwrite(os.path.join(TOOLS, 'photos', 'noemi.jpg'), out, [cv2.IMWRITE_JPEG_QUALITY, 96])
a, b = im[1550:2150, 760:1360].copy(), out[1550:2150, 760:1360]
a[mask[1550:2150, 760:1360] > 0] //= 2
cv2.imwrite(os.path.join(TOOLS, 'probe', 'noemi_clean.jpg'), np.hstack([a, b]), [cv2.IMWRITE_JPEG_QUALITY, 90])
print('ok', W, H)
