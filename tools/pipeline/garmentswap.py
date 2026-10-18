"""Puts rebuilt garments into an approved fighter: the garment parts and their textures come from the new build, and
so does the body's triangle list (which faces the garments hide); everything else stays the approved build's: the
head and the body's vertices (one shared array: the neck seam stays closed), hair, beard, eyes, shoes, the other
garments and every other texture. A rebuild re-fits the face from the photo (it moves a fraction of a millimetre),
re-rolls the hair's random strands and the garments' wrinkle noise, and may pick up pipeline changes made since
the fighter was approved; changing a shirt must not change the fighter.
usage: python3 garmentswap.py <approved char dir> <new build char dir> <out dir> <garment part> [more parts...]
       (e.g. assets/chars/alejandro /tmp/build/assets/chars/alejandro /tmp/out/alejandro shirt collar buttons;
       out dir may be the approved dir itself; mesh files are written quantized, see meshfmt.py)"""
import os, shutil, sys

import meshfmt

# a garment part's textures: <part>.jpg, <part>_n.jpg, <part>_r.jpg (whichever exist)
TEX = ('.jpg', '_n.jpg', '_r.jpg', '.png', '_n.png')


def main(old, new, out, names):
    mo, po = meshfmt.load(old)
    mn, pn = meshfmt.load(new)
    io = {p['name']: i for i, p in enumerate(mo['parts'])}
    inew = {p['name']: i for i, p in enumerate(mn['parts'])}
    for n in names + ['body']:
        if n not in inew:
            sys.exit(f'{n}: not in the new build ({", ".join(inew)})')
    meta = dict(mo)
    parts, arrays = [], []
    for p, a in zip(mo['parts'], po):
        n = p['name']
        if n in names:
            parts.append(mn['parts'][inew[n]]); arrays.append(pn[inew[n]])
        elif n == 'body':
            b = {k: v for k, v in a.items()}
            nb = pn[inew['body']]
            if len(nb['position']) != len(b['position']):
                sys.exit(f'body: {len(b["position"])} vertices approved, {len(nb["position"])} in the new build')
            b['index'] = nb['index']
            parts.append(p); arrays.append(b)
            print(f'  body: {len(a["index"]) // 3} -> {len(nb["index"]) // 3} visible triangles')
        else:
            parts.append(p); arrays.append(a)
    # a garment part new to this fighter (a collar on a shirt that had none) goes after the garments it came with
    for n in names:
        if n not in io:
            parts.append(mn['parts'][inew[n]]); arrays.append(pn[inew[n]])
            print(f'  {n}: added')
    meta['parts'] = parts
    if os.path.abspath(out) != os.path.abspath(old):
        os.makedirs(out, exist_ok=True)
        for f in os.listdir(old):
            if not f.startswith('mesh.'):
                shutil.copy2(os.path.join(old, f), os.path.join(out, f))
    for n in names:
        for suf in TEX:
            f = os.path.join(new, n + suf)
            if os.path.exists(f):
                shutil.copy2(f, os.path.join(out, n + suf))
                print(f'  texture {n + suf} from the new build')
    meshfmt.save(out, meta, arrays, quantized=True)
    print(f'{out}: {", ".join(names)} from {new}, the rest from {old}')


if __name__ == '__main__':
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:])
