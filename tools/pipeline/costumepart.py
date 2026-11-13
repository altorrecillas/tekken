"""A themed costume's own garments, out of a costume build, as an overlay of the approved fighter
(assets/chars/<id>/<costume>/, js/fight/costumes.js outfit, merged in js/charloader.js loadCharacterData):
  - the costume's garment parts (their vertices, material and textures) from the costume build;
  - the body's triangle list from the costume build (which faces the costume's garments hide: a tank top bares the
    shoulders), applied to the approved body's vertices (the same count; the head and the body share them);
  - the approved parts the costume takes off (hide: a polo's collar under a running tee).
Everything else is the approved fighter's: head, hair, shoes and the garments the costume keeps.
usage: python3 costumepart.py <approved char dir> <costume build char dir> <out dir> <part>... [--hide <part>...]
       (e.g. assets/chars/alejandro /tmp/ga/assets/chars/alejandro assets/chars/alejandro/run shirt shorts --hide collar buttons)
"""
import json, os, shutil, sys

import meshfmt

TEX = ('.jpg', '_n.jpg', '_r.jpg', '.png', '_n.png', '_r.png')


def main(old, new, out, names, hide):
    mo, po = meshfmt.load(old)
    mn, pn = meshfmt.load(new)
    io = {p['name']: i for i, p in enumerate(mo['parts'])}
    inew = {p['name']: i for i, p in enumerate(mn['parts'])}
    for n in names + ['body']:
        if n not in inew:
            sys.exit(f'{n}: not in the costume build ({", ".join(inew)})')
    for n in hide:
        if n not in io:
            sys.exit(f'{n}: not in the approved fighter ({", ".join(io)})')
    ob, nb = po[io['body']], pn[inew['body']]
    if len(ob['position']) != len(nb['position']):
        sys.exit(f'body: {len(ob["position"])} vertices approved, {len(nb["position"])} in the costume build')
    parts, arrays = [], []
    for n in names:
        parts.append(mn['parts'][inew[n]]); arrays.append(pn[inew[n]])
    # the body: only its triangles (the loader keeps the approved vertices)
    parts.append(dict(name='body', mat=mo['parts'][io['body']]['mat'], bodyIndex=True)); arrays.append({'index': nb['index']})
    print(f'  body: {len(ob["index"]) // 3} -> {len(nb["index"]) // 3} visible triangles')
    os.makedirs(out, exist_ok=True)
    meta = dict(format=2, costume=True, of=mo.get('id'), hide=hide, parts=parts)
    meshfmt.save(out, meta, arrays, quantized=True)
    m = json.load(open(os.path.join(out, 'mesh.json')))
    m['costume'] = True
    json.dump(m, open(os.path.join(out, 'mesh.json'), 'w'))
    for n in names:
        for suf in TEX:
            f = os.path.join(new, n + suf)
            if os.path.exists(f):
                shutil.copy2(f, os.path.join(out, n + suf))
                print(f'  texture {n + suf}')
    print(f'{out}: {", ".join(names)} + the body\'s triangles' + (f'; hides {", ".join(hide)}' if hide else ''))


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 4:
        sys.exit(__doc__)
    hide = a[a.index('--hide') + 1:] if '--hide' in a else []
    rest = a[:a.index('--hide')] if '--hide' in a else a
    main(rest[0], rest[1], rest[2], rest[3:], hide)
