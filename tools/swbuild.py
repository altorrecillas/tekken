"""The game kept on the phone (sw.js, the service worker): written from the files as they are now, with a short hash of
each one, so that
  - the second time the game opens it comes from the phone at once, and it plays with no connection (all but the
    online mode) with everything it has already used;
  - when a new version is published only the files that changed are downloaded again (a file whose hash changed is
    dropped from the phone's copy and fetched the next time it is needed).
The shell (the page, the code, the fonts, the icons, the portraits, the stage pictures, the menu sounds) is stored
as soon as the worker is installed; everything else (fighters, stages, music, voices) the first time it is used.
subir_a_github.sh runs this before each upload; js/engine/offline.js registers the worker (only on the published
site: on a development server the files are always fresh).
usage: python3 tools/swbuild.py"""
import hashlib, json, os, re

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# what is served to the game (paths relative to the game's folder)
ROOTS = ['index.html', 'manifest.webmanifest', 'js', 'vendor', 'assets']
SKIP = re.compile(r'(^|/)(\.|_sin_usar/)|\.(py|md|blend|psd|xcf)$|(^|/)assets/chars/[^/]+/mesh\.bin$')
# stored at once, on install
SHELL_EXTRA = re.compile(r'^(assets/fonts/.*\.woff2|assets/icons/.*|assets/portraits/.*|assets/stages/.*|assets/sfx/ui_.*)$')


def files():
    out = []
    for r in ROOTS:
        p = os.path.join(GAME, r)
        if os.path.isfile(p):
            out.append(r)
            continue
        for d, _, fs in os.walk(p):
            for f in fs:
                rel = os.path.relpath(os.path.join(d, f), GAME).replace(os.sep, '/')
                if not SKIP.search(rel):
                    out.append(rel)
    return sorted(out)


def short_hash(path):
    h = hashlib.sha1()
    with open(os.path.join(GAME, path), 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()[:10]


def main():
    fs = files()
    hashes = {f: short_hash(f) for f in fs}
    html = open(os.path.join(GAME, 'index.html'), encoding='utf-8').read()
    pre = re.findall(r'<link rel="modulepreload" href="([^"]+)"', html)
    shell = sorted({'index.html', 'manifest.webmanifest', 'js/main.js', *[p for p in pre if p in hashes], *[f for f in fs if SHELL_EXTRA.match(f)]})
    version = re.search(r"GAME_VERSION = '([^']+)'", open(os.path.join(GAME, 'js/version.js')).read()).group(1)
    tpl = open(os.path.join(GAME, 'tools/sw_template.js'), encoding='utf-8').read()
    out = (tpl.replace('/*VERSION*/', json.dumps(version)).replace('/*SHELL*/', json.dumps(shell, separators=(',', ':')))
           .replace('/*HASH*/', json.dumps(hashes, separators=(',', ':'))))
    open(os.path.join(GAME, 'sw.js'), 'w', encoding='utf-8').write(out)
    size = sum(os.path.getsize(os.path.join(GAME, f)) for f in shell)
    print(f'sw.js: version {version}, {len(fs)} files hashed, shell of {len(shell)} files ({size / 1048576:.1f} MB) stored on install')


if __name__ == '__main__':
    main()
