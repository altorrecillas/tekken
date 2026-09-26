# Street View screenshot -> clean stage textures for the "El Porche" stage.
# 1. clean the photo: person, "(c) Google" watermarks, the street number, the tree trunk and the lamp pole (they become
#    3D objects), 2. crop the ground-floor facade, the arcade's back wall and its graffiti side wall.
import cv2, numpy as np, os
# usage: python3 tools/porche_prep.py (reads escenario.jpg in the game folder, writes assets/stage/porche_*.jpg)
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
im = cv2.imread(G + '/escenario.jpg').astype(np.float32)
H, W = im.shape[:2]

def shift_fill(img, x0, x1, y0, y1, dx, feather=6):
    """fill [x0,x1)x[y0,y1) with the pixels dx to the side (texture continues), soft vertical seams"""
    src = img[y0:y1, x0 + dx:x1 + dx].copy()
    w = x1 - x0
    a = np.ones((y1 - y0, w, 1), np.float32)
    for i in range(min(feather, w // 2)):
        k = (i + 1) / (feather + 1)
        a[:, i] *= k; a[:, w - 1 - i] *= k
    img[y0:y1, x0:x1] = img[y0:y1, x0:x1] * (1 - a) + src * a

def inpaint(img, rects, r=5):
    m = np.zeros(img.shape[:2], np.uint8)
    for x0, y0, x1, y1 in rects: m[y0:y1, x0:x1] = 255
    out = cv2.inpaint(np.clip(img, 0, 255).astype(np.uint8), m, r, cv2.INPAINT_TELEA)
    return out.astype(np.float32)

# the boy standing in the arcade: floor, barrier and back room continue from the left
shift_fill(im, 980, 1040, 492, 664, 66)
# tree trunk: the dark doorway continues from the left, the glass-block panel from the right
shift_fill(im, 1524, 1570, 283, 662, -52, feather=4)
shift_fill(im, 1570, 1616, 283, 662, 52, feather=4)
# lamp pole in front of the graffiti shutter
shift_fill(im, 2010, 2040, 283, 662, -34, feather=4)
shift_fill(im, 2040, 2070, 283, 662, 34, feather=4)
# "(c) 2024 Google" watermarks: semi-transparent light text; only its own pixels are repainted (a whole-box inpaint
# smears the column and the doorway behind it)
def text_mask(img, x0, y0, x1, y1, thr=10):
    g = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    roi = g[y0:y1, x0:x1]
    bg = cv2.medianBlur(np.clip(roi, 0, 255).astype(np.uint8), 15).astype(np.float32)
    m = ((roi - bg) > thr).astype(np.uint8) * 255
    m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=2)
    full = np.zeros(g.shape, np.uint8); full[y0:y1, x0:x1] = m
    return full
wm = text_mask(im, 850, 405, 1026, 441) | text_mask(im, 1532, 463, 1752, 507) | text_mask(im, 1750, 408, 1822, 440, thr=6)
im = cv2.inpaint(np.clip(im, 0, 255).astype(np.uint8), wm, 3, cv2.INPAINT_TELEA).astype(np.float32)
# seams of the fills and the painted street number (plain stone around it): diffusion inpainting
im = inpaint(im, [(1748, 406, 1824, 442),
                  (976, 488, 984, 664), (1036, 488, 1044, 664), (1520, 283, 1528, 662), (1566, 283, 1574, 662), (1612, 283, 1620, 662),
                  (2006, 283, 2014, 662), (2036, 283, 2044, 662), (2066, 283, 2074, 662)], r=4)

# ground floor facade: canopy underside line to the pavement line, both buildings (the black screen border cut off)
GF = im[318:640, 0:2118]
cv2.imwrite(G + '/assets/stage/porche_gf.jpg', np.clip(GF, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
# arcade back wall (the far end: back room, parking barrier), between the far ceiling and far floor lines
BACK = im[392:590, 740:1334].copy()
# the centre column stands at the facade line (a 3D pillar in the stage): behind it the barrier and the back room continue
shift_fill(BACK, 166, 250, 0, BACK.shape[0], 84, feather=8)
cv2.imwrite(G + '/assets/stage/porche_back.jpg', np.clip(BACK, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
# arcade left side wall (graffiti), seen in perspective: unwarp the trapezoid to a rectangle (entrance on the left)
src = np.float32([[555, 345], [742, 392], [742, 590], [555, 655]])
dw, dh = 900, 480
dst = np.float32([[0, 0], [dw, 0], [dw, dh], [0, dh]])
M = cv2.getPerspectiveTransform(src, dst)
SIDE = cv2.warpPerspective(im, M, (dw, dh), flags=cv2.INTER_CUBIC)
cv2.imwrite(G + '/assets/stage/porche_side.jpg', np.clip(SIDE, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
print('gf', GF.shape, 'back', BACK.shape, 'side', SIDE.shape)
