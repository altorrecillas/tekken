import sys, numpy as np, cv2
import mhlib as M
from facefit import *
from people import PEOPLE
for pid in ['alejandro', 'arnau', 'camilo', 'rafa', 'zapponi', 'dani', 'noemi']:
    P = PEOPLE[pid]
    B = M.base()
    V = M.apply_targets(B['v'], M.macro_weights(P['body']))
    P2, P3, W, H = photo_landmarks(P['photo'])
    idx, Lm = mh_landmarks(V)
    obj = (Lm * 10.0).astype(np.float64)  # cm
    obj[:, 1] *= 1; 
    img = P2[idx].astype(np.float64)
    res = []
    for fmul in [0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0, 5.0, 10.0]:
        f = fmul * max(W, H)
        K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
        # MH: y up, z towards camera; OpenCV camera: y down, z forward -> flip y and z of the model
        o = obj * np.array([1, -1, -1])
        ok, rv, tv = cv2.solvePnP(o, img, K, None, flags=cv2.SOLVEPNP_ITERATIVE)
        pr, _ = cv2.projectPoints(o, rv, tv, K, None)
        e = np.linalg.norm(pr[:, 0] - img, axis=1).mean()
        res.append((fmul, e, float(tv[2][0])))
    best = min(res, key=lambda r: r[1])
    fw = np.ptp(P2[FACE_OVAL, 0])
    print(pid.ljust(10), 'face px %d' % fw, ' '.join(f'{a}:{b:.1f}' for a, b, _ in res), '| best f=%.1fxmax dist=%.0fcm' % (best[0], best[2]))
