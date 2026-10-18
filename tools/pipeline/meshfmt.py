"""The fighters' mesh files (assets/chars/<id>/mesh.json + mesh.bin + mesh.bin.gz), in either format:
  1: every attribute a raw typed array [offset, count]: float32 positions, normals, uvs, weights, colours, tangents;
     uint16 bone indices; uint32 triangle indices (what buildchar.py's Exporter writes);
  2: quantized (mesh.json "format": 2), each attribute {o: byte offset, n: count, t: type, q: [offset..., scale...],
     c: constant}: positions int16 over their bounding box, normals int16 (int8 on the hair cards), uvs uint16, bone
     indices uint8, weights uint8 (rows summing exactly 255), colours uint8 over their range, tangents int8 with w
     dropped, triangle indices uint16 where the part has under 65536 vertices, the hair's bone indices and weights a
     constant. Decoded to the format-1 types on load (js/charloader.js): nothing downstream changes, the download is a
     third (positions to 1/65535 of the figure, about 0.03 mm; normals to 0.002 rad).
load(dir) -> (meta, parts) with numpy arrays whichever the format; save(dir, meta, parts, quantized=True).
usage: python3 meshfmt.py <char dir>...   (converts a fighter's files to format 2 in place, checking the result)"""
import gzip, json, os, shutil, sys

import numpy as np

ATTRS = ('position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'index', 'color', 'tangent')
COMP = dict(position=3, normal=3, uv=2, skinIndex=4, skinWeight=4, index=1, color=3, tangent=4)
F1 = dict(position=np.float32, normal=np.float32, uv=np.float32, skinIndex=np.uint16, skinWeight=np.float32, index=np.uint32, color=np.float32, tangent=np.float32)
TYPES = dict(f32=np.float32, i16=np.int16, i8=np.int8, u16=np.uint16, u8=np.uint8, u32=np.uint32)


def _decode(bin_, d, name):
    """one attribute of either format as a numpy array of the format-1 type, shape (count / comps, comps)"""
    k = COMP[name]
    if isinstance(d, list):
        o, n = d
        return np.frombuffer(bin_, F1[name], n, o).reshape(-1, k).copy()
    if 'c' in d:
        return np.tile(np.array(d['c'], F1[name]), (d['n'] // len(d['c']), 1)).reshape(-1, k)
    a = np.frombuffer(bin_, TYPES[d['t']], d['n'], d['o']).astype(np.float64)
    kk = d.get('k', k)  # components stored (a tangent's w is dropped)
    a = a.reshape(-1, kk)
    if 'q' in d:
        q = np.array(d['q'], np.float64)
        a = q[:kk] + a * q[kk:]
    if kk < k:
        a = np.concatenate([a, np.ones((len(a), k - kk))], 1)
    return a.astype(F1[name])


def load(dirpath):
    meta = json.load(open(os.path.join(dirpath, 'mesh.json')))
    bin_ = open(os.path.join(dirpath, 'mesh.bin'), 'rb').read()
    parts = []
    for p in meta['parts']:
        arrs = {k: _decode(bin_, p[k], k) for k in ATTRS if k in p}
        parts.append(arrs)
    return meta, parts


class _Writer:
    def __init__(self):
        self.blobs, self.off = [], 0

    def add(self, a):
        b = np.ascontiguousarray(a).tobytes()
        pad = (-len(b)) % 4
        o = self.off
        self.blobs.append(b + b'\0' * pad)
        self.off += len(b) + pad
        return o

    def data(self):
        return b''.join(self.blobs)


def _quant(a, t, lo=None, hi=None):
    """values -> integers of type t over [lo, hi] per component: (ints, [offset..., scale...])"""
    info = np.iinfo(TYPES[t])
    lo = a.min(0) if lo is None else np.asarray(lo, np.float64)
    hi = a.max(0) if hi is None else np.asarray(hi, np.float64)
    span = np.maximum(hi - lo, 1e-12)
    scale = span / (info.max - info.min)
    ints = np.clip(np.round((a - lo) / scale) + info.min, info.min, info.max).astype(TYPES[t])
    off = lo - info.min * scale
    return ints, [float(x) for x in off] + [float(x) for x in scale]


def _encode(w, name, a, hair):
    n = int(a.size)
    if name == 'index':
        t = 'u16' if a.max() < 65536 else 'u32'
        return dict(o=w.add(a.astype(TYPES[t])), n=n, t=t)
    if name in ('skinIndex', 'skinWeight') and len(a) and (a == a[0]).all():
        return dict(c=[float(x) if name == 'skinWeight' else int(x) for x in a[0]], n=n)
    if name == 'skinIndex':
        assert a.max() < 256
        return dict(o=w.add(a.astype(np.uint8)), n=n, t='u8')
    if name == 'skinWeight':
        # rows of four bytes summing exactly 255 (the largest weight takes the rounding)
        s = a.sum(1, keepdims=True); s[s == 0] = 1
        b = np.round(a / s * 255).astype(np.int32)
        b[np.arange(len(b)), b.argmax(1)] += 255 - b.sum(1)
        return dict(o=w.add(b.astype(np.uint8)), n=n, t='u8', q=[0, 0, 0, 0] + [1 / 255] * 4)
    if name == 'position':
        ints, q = _quant(a.astype(np.float64), 'i16')
        return dict(o=w.add(ints), n=n, t='i16', q=q)
    if name == 'normal':
        t = 'i8' if hair else 'i16'
        ints, q = _quant(a.astype(np.float64), t, lo=[-1, -1, -1], hi=[1, 1, 1])
        return dict(o=w.add(ints), n=n, t=t, q=q)
    if name == 'uv':
        ints, q = _quant(a.astype(np.float64), 'u16')
        return dict(o=w.add(ints), n=n, t='u16', q=q)
    if name == 'color':
        ints, q = _quant(a.astype(np.float64), 'u8', lo=[0, 0, 0])
        return dict(o=w.add(ints), n=n, t='u8', q=q)
    if name == 'tangent':
        assert np.allclose(a[:, 3], 1)
        ints, q = _quant(a[:, :3].astype(np.float64), 'i8', lo=[-1, -1, -1], hi=[1, 1, 1])
        return dict(o=w.add(ints), n=int(ints.size), t='i8', q=q, k=3)  # (n: the values stored)
    raise ValueError(name)


def save(dirpath, meta, parts, quantized=True):
    w = _Writer()
    meta = dict(meta)
    newparts = []
    for p, arrs in zip(meta['parts'], parts):
        p = {k: v for k, v in p.items() if k not in ATTRS}
        hair = p['mat'].get('type') == 'haircards'
        for k in ATTRS:
            if k not in arrs:
                continue
            a = arrs[k]
            if quantized:
                p[k] = _encode(w, k, a, hair)
            else:
                p[k] = [w.add(a.astype(F1[k])), int(a.size)]
        newparts.append(p)
    meta['parts'] = newparts
    if quantized:
        meta['format'] = 2
    else:
        meta.pop('format', None)
    data = w.data()
    open(os.path.join(dirpath, 'mesh.bin'), 'wb').write(data)
    with open(os.path.join(dirpath, 'mesh.bin'), 'rb') as fi, gzip.GzipFile(os.path.join(dirpath, 'mesh.bin.gz'), 'wb', compresslevel=9, mtime=0) as fo:
        shutil.copyfileobj(fi, fo)
    json.dump(meta, open(os.path.join(dirpath, 'mesh.json'), 'w'))


def convert(dirpath):
    """a fighter's files to format 2, in place; the largest error of each attribute printed"""
    before = os.path.getsize(os.path.join(dirpath, 'mesh.bin.gz'))
    meta, parts = load(dirpath)
    if meta.get('format') == 2:
        print(dirpath, 'already format 2')
        return
    save(dirpath, meta, parts, quantized=True)
    meta2, parts2 = load(dirpath)
    worst = {}
    for a, b in zip(parts, parts2):
        for k in a:
            d = np.abs(a[k].astype(np.float64) - b[k].astype(np.float64)).max() if len(a[k]) else 0
            worst[k] = max(worst.get(k, 0), float(d))
    after = os.path.getsize(os.path.join(dirpath, 'mesh.bin.gz'))
    print(f'{dirpath}: {before / 1048576:.2f} MB -> {after / 1048576:.2f} MB gz;  largest errors: ' +
          ', '.join(f'{k} {v:.5f}' for k, v in worst.items()))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for d in sys.argv[1:]:
        convert(d)
