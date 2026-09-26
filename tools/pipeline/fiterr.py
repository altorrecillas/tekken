import sys, numpy as np
import mhlib as M
from facefit import *
from people import PEOPLE
pid = sys.argv[1]
P = PEOPLE[pid]
B = M.base()
V = M.apply_targets(B['v'], M.macro_weights(P['body']) + M.modifier_targets(P.get('mods', {})))
def report(V, tag):
    P2, P3, W, H = photo_landmarks(P['photo'])
    idx, Lm = mh_landmarks(V)
    inner = np.array([i not in FACE_OVAL for i in idx])
    s, Rm, t = umeyama(Lm[inner], P3[idx][inner])
    proj = s * (Lm @ Rm.T) + t
    err = (proj - P3[idx])[:, :2] / s  # in dm, 2D
    groups = dict(oval=FACE_OVAL, brows=L_BROW + R_BROW, eyes=L_EYE + R_EYE, lips=LIPS_OUT, nose=[1, 2, 4, 5, 6, 19, 94, 98, 327, 168, 197, 195])
    pos = {int(i): k for k, i in enumerate(idx)}
    out = []
    for g, ids in groups.items():
        e = np.array([err[pos[i]] for i in ids if i in pos])
        out.append(f'{g}:{np.linalg.norm(e,axis=1).mean()*10:.1f}mm')
    # width/height ratios
    def w(a, b, pts): return np.linalg.norm(pts[pos[a], :2] - pts[pos[b], :2])
    ph = P3[idx] ; mh = proj
    ratio = lambda a, b: w(a, b, mh) / w(a, b, ph)
    print(tag, ' '.join(out), '| faceW %.2f jawW %.2f faceH %.2f noseL %.2f mouthW %.2f eyeW %.2f' % (ratio(234, 454), ratio(172, 397), ratio(10, 152), ratio(168, 2), ratio(61, 291), ratio(33, 133)))
report(V, 'before')
ftg = fit_targets(V, P['photo'], lam=P.get('fit_lam', 0.004), verbose=False)
V2 = M.apply_targets(V, [(f, w * P.get('fit_amount', 0.9)) for f, w in ftg])
report(V2, 'targets')
dg, df, sRt, _ = fit_geometry(V2, P['photo'], depth_scale=P.get('depth_scale', 0.45), verbose=False)
report(V2 + dg, 'final')
