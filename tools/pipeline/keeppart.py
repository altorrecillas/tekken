"""Keeps parts of an approved build in a new one: copies their arrays from the old mesh.bin into the new mesh.bin.
A rebuild moves the head by a fraction of a millimetre (the photo's landmarks are found again), and that is enough to
send the hair generator's random strands somewhere else: same style, different strands. When only something else was
meant to change (a beard, a texture), the approved hair is put back with this.
usage: python3 keeppart.py <old char dir> <new char dir> hair [other parts...]
(the parts must have the same vertex and index counts in both builds; mesh.bin.gz is written again)"""
import gzip, json, os, shutil, sys

import numpy as np

SIZE = dict(color=4, tangent=4, position=4, normal=4, uv=4, skinIndex=2, skinWeight=4, index=4)


def main(old, new, names):
    jo = json.load(open(os.path.join(old, 'mesh.json')))
    jn = json.load(open(os.path.join(new, 'mesh.json')))
    bo = open(os.path.join(old, 'mesh.bin'), 'rb').read()
    bn = bytearray(open(os.path.join(new, 'mesh.bin'), 'rb').read())
    po = {p['name']: p for p in jo['parts']}
    pn = {p['name']: p for p in jn['parts']}
    for name in names:
        a, b = po[name], pn[name]
        if a['vcount'] != b['vcount'] or a['index'][1] != b['index'][1]:
            sys.exit(f'{name}: {a["vcount"]} verts / {a["index"][1]} indices before, {b["vcount"]} / {b["index"][1]} now')
        for k, size in SIZE.items():
            if k not in a:
                continue
            (oa, na), (ob, nb) = a[k], b[k]
            assert na == nb, (name, k)
            bn[ob:ob + nb * size] = bo[oa:oa + na * size]
        d = np.abs(np.frombuffer(bytes(bn), np.float32, b['position'][1], b['position'][0]) - np.frombuffer(bo, np.float32, a['position'][1], a['position'][0])).max()
        print(f'  {name}: kept from {old} (max position difference now {d:.6f})')
    open(os.path.join(new, 'mesh.bin'), 'wb').write(bn)
    with open(os.path.join(new, 'mesh.bin'), 'rb') as fi, gzip.GzipFile(os.path.join(new, 'mesh.bin.gz'), 'wb', compresslevel=9, mtime=0) as fo:
        shutil.copyfileobj(fi, fo)


if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
