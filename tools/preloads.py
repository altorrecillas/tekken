"""Writes the <link rel="modulepreload"> list of index.html (between its modulepreload markers): every module the
game imports statically from js/main.js, so that the browser fetches them all at once at the start instead of
discovering them one level of imports at a time (a round trip per level, seconds on a phone).
Run it after adding, removing or renaming a module: python3 tools/preloads.py"""
import os, re

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
IMPORTMAP = {'three': 'vendor/three/build/three.module.js'}


def resolve(spec, frm):
    if spec in IMPORTMAP:
        return IMPORTMAP[spec]
    if spec.startswith('three/addons/'):
        return 'vendor/three/jsm/' + spec[len('three/addons/'):]
    if spec.startswith('.'):
        return os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    return None


def graph(entry):
    seen, order = set(), []

    def walk(f):
        if f in seen or not os.path.exists(os.path.join(GAME, f)):
            return
        seen.add(f)
        src = open(os.path.join(GAME, f), encoding='utf-8').read()
        # static imports and re-exports only (dynamic import() loads on demand)
        for m in re.finditer(r'^\s*(?:import|export)\s[^;]*?from\s+[\'"]([^\'"]+)[\'"]|^\s*import\s+[\'"]([^\'"]+)[\'"]', src, re.M):
            r = resolve(m.group(1) or m.group(2), f)
            if r:
                walk(r)
        order.append(f)
    walk(entry)
    return order


if __name__ == '__main__':
    mods = graph('js/main.js')
    # the biggest first: three.js is most of the bytes and the bottom of the import chain
    mods.sort(key=lambda f: -os.path.getsize(os.path.join(GAME, f)))
    html_path = os.path.join(GAME, 'index.html')
    html = open(html_path, encoding='utf-8').read()
    a, b = '<!-- modulepreload:begin -->', '<!-- modulepreload:end -->'
    links = '\n'.join(f'<link rel="modulepreload" href="{m}">' for m in mods)
    i, j = html.index(a) + len(a), html.index(b)
    html = html[:i] + '\n' + links + '\n' + html[j:]
    open(html_path, 'w', encoding='utf-8').write(html)
    print(f'{len(mods)} modules preloaded')
