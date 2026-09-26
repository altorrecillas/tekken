"""Minimal MakeHuman (hm08) pipeline: base mesh, macro targets, skeleton, weights, proxies."""
import json, os, re
import numpy as np

SCR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MHD = os.path.join(SCR, 'mh/makehuman/data')
MHA = os.path.join(SCR, 'mha/base')

_cache = {}


def load_obj(path):
    vs, vts, faces, fuv, fgroup = [], [], [], [], []
    group = None
    groups = []
    with open(path) as f:
        for line in f:
            if line.startswith('v '):
                vs.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                vts.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                group = line.split()[1]
                if group not in groups:
                    groups.append(group)
            elif line.startswith('f '):
                idx = [p.split('/') for p in line.split()[1:]]
                faces.append([int(p[0]) - 1 for p in idx])
                fuv.append([int(p[1]) - 1 if len(p) > 1 and p[1] else -1 for p in idx])
                fgroup.append(groups.index(group) if group else -1)
    return dict(v=np.array(vs, np.float64), vt=np.array(vts, np.float64) if vts else np.zeros((0, 2)),
                f=faces, fuv=fuv, fg=np.array(fgroup), groups=groups)


def base():
    if 'base' not in _cache:
        _cache['base'] = load_obj(os.path.join(MHD, '3dobjs/base.obj'))
    return _cache['base']


def load_target(path):
    if path in _cache:
        return _cache[path]
    idx, d = [], []
    with open(path) as f:
        for line in f:
            if not line.strip() or line[0] == '#':
                continue
            p = line.split()
            idx.append(int(p[0]))
            d.append([float(p[1]), float(p[2]), float(p[3])])
    r = (np.array(idx, np.int64), np.array(d, np.float64).reshape(-1, 3))
    _cache[path] = r
    return r


def _tri(v, lo, mid, hi_names):
    pass


def macro_weights(p):
    """p: gender(0..1), age(0..1, .5=25y), muscle, weight, height, proportions, african, asian, caucasian."""
    g = {'male': p['gender'], 'female': 1 - p['gender']}
    a = p['age']
    if a < 0.5:
        old = 0.0
        baby = max(0.0, 1 - a * 5.333)
        young = max(0.0, (a - 0.1875) * 3.2)
        child = max(0.0, min(1.0, 5.333 * a) - young)
    else:
        child = baby = 0.0
        old = max(0.0, a * 2 - 1)
        young = 1 - old
    ag = {'baby': baby, 'child': child, 'young': young, 'old': old}

    def three(x, lo, av, hi):
        mx = max(0.0, x * 2 - 1)
        mn = max(0.0, 1 - x * 2)
        return {hi: mx, lo: mn, av: 1 - (mx + mn)}
    mu = three(p['muscle'], 'minmuscle', 'averagemuscle', 'maxmuscle')
    we = three(p['weight'], 'minweight', 'averageweight', 'maxweight')
    h = p['height']
    ht = {'maxheight': max(0.0, h * 2 - 1), 'minheight': max(0.0, 1 - h * 2)}
    pr = p.get('proportions', 0.5)
    pp = {'idealproportions': max(0.0, pr * 2 - 1), 'uncommonproportions': max(0.0, 1 - pr * 2)}
    eth = {k: p.get(k, 1 / 3) for k in ('african', 'asian', 'caucasian')}
    out = []
    T = os.path.join(MHD, 'targets/macrodetails')
    for e, ew in eth.items():
        for gn, gw in g.items():
            for an, aw in ag.items():
                w = ew * gw * aw
                if w > 1e-4:
                    out.append((f'{T}/{e}-{gn}-{an}.target', w))
    for gn, gw in g.items():
        for an, aw in ag.items():
            for mn, mw in mu.items():
                for wn, ww in we.items():
                    w = gw * aw * mw * ww
                    if w <= 1e-4:
                        continue
                    out.append((f'{T}/universal-{gn}-{an}-{mn}-{wn}.target', w))
                    for hn, hw in ht.items():
                        if hw * w > 1e-4:
                            out.append((f'{T}/height/{gn}-{an}-{mn}-{wn}-{hn}.target', w * hw))
                    for pn, pw in pp.items():
                        if pw * w > 1e-4:
                            out.append((f'{T}/proportions/{gn}-{an}-{mn}-{wn}-{pn}.target', w * pw))
    return out


def find_target(name):
    """name like 'nose/nose-scale-horiz-incr' (search targets dir)."""
    p = os.path.join(MHD, 'targets', name + '.target')
    if os.path.exists(p):
        return p
    for root, _, files in os.walk(os.path.join(MHD, 'targets')):
        if os.path.basename(name) + '.target' in files:
            return os.path.join(root, os.path.basename(name) + '.target')
    raise FileNotFoundError(name)


def apply_targets(coords, targets):
    c = coords.copy()
    for path, w in targets:
        if not os.path.exists(path):
            continue
        idx, d = load_target(path)
        c[idx] += d * w
    return c


def modifier_targets(mods):
    """mods: {'nose/nose-scale-horiz': 0.3, ...} -> uses -incr/-decr, -up/-down... auto."""
    out = []
    pairs = [('incr', 'decr'), ('up', 'down'), ('out', 'in'), ('forward', 'backward'), ('convex', 'concave'),
             ('max', 'min'), ('open', 'close'), ('compress', 'uncompress')]
    for name, val in mods.items():
        if '|' in name:  # explicit "file|file2"
            hi, lo = name.split('|')
            out.append((find_target(hi if val > 0 else lo), abs(val)))
            continue
        done = False
        for hi, lo in pairs:
            try:
                out.append((find_target(f'{name}-{hi if val > 0 else lo}'), abs(val)))
                done = True
                break
            except FileNotFoundError:
                continue
        if not done:
            out.append((find_target(name), val))
    return out


def skeleton(coords):
    sk = json.load(open(os.path.join(MHD, 'rigs/default.mhskel')))
    J = {k: coords[v].mean(0) for k, v in sk['joints'].items()}
    bones = []
    order = []
    names = list(sk['bones'].keys())
    # topological order
    placed = set()
    while len(order) < len(names):
        for n in names:
            if n in placed:
                continue
            par = sk['bones'][n]['parent']
            if par is None or par in placed:
                order.append(n)
                placed.add(n)
    for n in order:
        b = sk['bones'][n]
        bones.append(dict(name=n, parent=b['parent'], head=J[b['head']], tail=J[b['tail']]))
    return bones


def weights(nverts, bone_names):
    w = json.load(open(os.path.join(MHD, 'rigs/default_weights.mhw')))['weights']
    bi = {n: i for i, n in enumerate(bone_names)}
    W = np.zeros((nverts, len(bone_names)), np.float32)
    for b, lst in w.items():
        if b not in bi:
            continue
        for v, x in lst:
            if v < nverts:
                W[v, bi[b]] += x
    return W


def top4(W):
    idx = np.argsort(-W, axis=1)[:, :4]
    ww = np.take_along_axis(W, idx, 1)
    s = ww.sum(1, keepdims=True)
    s[s == 0] = 1
    ww = ww / s
    return idx.astype(np.uint16), ww.astype(np.float32)


def load_mhclo(path):
    d = dict(ref=[], w=[], off=[], scale=[None, None, None], delete=[], obj=None, name=None, material=None)
    mode = None
    base_dir = os.path.dirname(path)
    with open(path) as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith('#'):
                continue
            p = s.split()
            if p[0] == 'verts':
                mode = 'verts'
                continue
            if p[0] == 'delete_verts':
                mode = 'delete'
                continue
            if mode == 'verts' and re.match(r'^-?\d', p[0]):
                if len(p) == 1:
                    d['ref'].append([int(p[0])] * 3)
                    d['w'].append([1, 0, 0])
                    d['off'].append([0, 0, 0])
                else:
                    d['ref'].append([int(x) for x in p[:3]])
                    d['w'].append([float(x) for x in p[3:6]])
                    d['off'].append([float(x) for x in p[6:9]])
                continue
            if mode == 'delete' and re.match(r'^\d', p[0]):
                i = 0
                while i < len(p):
                    if i + 2 < len(p) and p[i + 1] == '-':
                        d['delete'].extend(range(int(p[i]), int(p[i + 2]) + 1))
                        i += 3
                    else:
                        d['delete'].append(int(p[i]))
                        i += 1
                continue
            if p[0] == 'obj_file':
                d['obj'] = os.path.join(base_dir, p[1])
            elif p[0] in ('x_scale', 'y_scale', 'z_scale'):
                d['scale']['xyz'.index(p[0][0])] = (int(p[1]), int(p[2]), float(p[3]))
            elif p[0] == 'name':
                d['name'] = p[1]
            elif p[0] == 'material':
                d['material'] = os.path.join(base_dir, p[1])
    d['ref'] = np.array(d['ref'])
    d['w'] = np.array(d['w'])
    d['off'] = np.array(d['off'])
    return d


def fit_proxy(clo, coords):
    m = np.identity(3)
    if all(s is not None for s in clo['scale']):
        for n in range(3):
            a, b, den = clo['scale'][n]
            m[n, n] = abs(coords[a][n] - coords[b][n]) / den
    r, w = clo['ref'], clo['w']
    return (coords[r[:, 0]] * w[:, 0, None] + coords[r[:, 1]] * w[:, 1, None] + coords[r[:, 2]] * w[:, 2, None]
            + clo['off'] @ m.T)


def proxy_weights(clo, Wbody):
    r, w = clo['ref'], clo['w']
    W = Wbody[r[:, 0]] * w[:, 0, None] + Wbody[r[:, 1]] * w[:, 1, None] + Wbody[r[:, 2]] * w[:, 2, None]
    return W


def load_mhmat(path):
    out = {}
    if not path or not os.path.exists(path):
        return out
    for line in open(path):
        p = line.strip().split(None, 1)
        if len(p) == 2 and not p[0].startswith('#'):
            out[p[0]] = p[1]
    return out
