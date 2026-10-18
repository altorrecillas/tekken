"""Keeps parts of an approved build in a new one: copies their arrays from the old mesh into the new mesh.
A rebuild moves the head by a fraction of a millimetre (the photo's landmarks are found again), and that is enough to
send the hair generator's random strands somewhere else: same style, different strands. When only something else was
meant to change (a beard, a texture), the approved hair is put back with this.
usage: python3 keeppart.py <old char dir> <new char dir> hair [other parts...]
(the parts must have the same vertex and index counts in both builds; either mesh format, see meshfmt.py; the new
mesh is written back quantized, format 2, with its mesh.bin.gz)"""
import sys

import numpy as np

import meshfmt


def main(old, new, names):
    mo, po = meshfmt.load(old)
    mn, pn = meshfmt.load(new)
    io = {p['name']: i for i, p in enumerate(mo['parts'])}
    inew = {p['name']: i for i, p in enumerate(mn['parts'])}
    for name in names:
        a, b = po[io[name]], pn[inew[name]]
        if len(a['position']) != len(b['position']) or len(a['index']) != len(b['index']):
            sys.exit(f'{name}: {len(a["position"])} verts / {len(a["index"])} indices before, {len(b["position"])} / {len(b["index"])} now')
        pn[inew[name]] = {k: v.copy() for k, v in a.items()}
        d = np.abs(pn[inew[name]]['position'] - a['position']).max()
        print(f'  {name}: kept from {old} (max position difference now {d:.6f})')
    meshfmt.save(new, mn, pn, quantized=True)


if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
