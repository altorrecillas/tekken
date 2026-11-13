"""Does an inner garment show through an outer one, in the rest pose? For every vertex of the inner garment within the
outer one's height range (from 3.5 cm above its hem: the hem's rim turns in towards the skin, and the nearest point
of the rim says nothing about the surface), the distance outside the outer garment's surface along its normal; the
ones out by more than 2 mm are counted and located. A costume build (tools/pipeline/costumepart.py) is checked like
this before it is rendered. The approved fighters give a few vertices of 2-6 mm at the fly, the centre front, where
the nearest-point test is loose and nothing shows: that level is the reference.
usage: python3 pokecheck.py <char dir> <outer part> <inner part>...   (exit 1 if any shows through)"""
import sys

import numpy as np
from scipy.spatial import cKDTree

import meshfmt


def main(d, outer, inners):
    meta, parts = meshfmt.load(d)
    idx = {p['name']: i for i, p in enumerate(meta['parts'])}
    o = parts[idx[outer]]
    op, on = o['position'], o['normal']
    lo, hi = op[:, 1].min(), op[:, 1].max()
    tree = cKDTree(op)
    bad = 0
    for name in inners:
        v = parts[idx[name]]['position']
        sel = (v[:, 1] > lo + 0.035) & (v[:, 1] < hi - 0.03)
        if not sel.any():
            print(f'{name}: nothing under {outer}'); continue
        dist, k = tree.query(v[sel])
        # (only where the outer garment is close: an inner vertex far from it is not under it)
        near = dist < 0.06
        h = ((v[sel] - op[k]) * on[k]).sum(1)
        out = near & (h > 0.002)
        bad += int(out.sum())
        msg = f'{name}: {int(sel.sum())} vertices under {outer}, {int(out.sum())} show through'
        if out.any():
            w = v[sel][out]
            msg += f' (up to {h[out].max() * 1000:.1f} mm; y {w[:, 1].min():.3f}-{w[:, 1].max():.3f}, |x| {np.abs(w[:, 0]).min():.3f}-{np.abs(w[:, 0]).max():.3f})'
        print(msg)
    return bad


if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    sys.exit(1 if main(sys.argv[1], sys.argv[2], sys.argv[3:]) else 0)
